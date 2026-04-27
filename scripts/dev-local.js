const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const pgBinDir = process.env.PG_BIN_DIR || "/usr/lib/postgresql/17/bin";
const pgDataDir = path.join(repoRoot, ".local-postgres");
const pgLogFile = path.join(pgDataDir, "postgres.log");
const pgPort = Number(process.env.KINDRED_PG_PORT || 55432);
const pgUser = process.env.KINDRED_PG_USER || "kindred";
const databaseName = process.env.KINDRED_PG_DATABASE || "kindredpune";
const databaseUrl =
  process.env.DATABASE_URL || `postgres://${pgUser}@127.0.0.1:${pgPort}/${databaseName}`;

let postgresStartedHere = false;
let appProcess = null;

function binaryPath(name) {
  return path.join(pgBinDir, name);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options
  });

  if (result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    const stdout = (result.stdout || "").trim();
    const details = stderr || stdout || `exit code ${result.status}`;
    throw new Error(`${path.basename(command)} ${args.join(" ")} failed: ${details}`);
  }

  return result.stdout || "";
}

function ensurePgBinaries() {
  const required = ["initdb", "pg_ctl", "psql", "createdb", "pg_isready"];
  for (const name of required) {
    if (!fs.existsSync(binaryPath(name))) {
      throw new Error(`Missing PostgreSQL binary: ${binaryPath(name)}`);
    }
  }
}

function ensureCluster() {
  if (fs.existsSync(path.join(pgDataDir, "PG_VERSION"))) {
    return;
  }

  fs.mkdirSync(pgDataDir, { recursive: true });
  runCommand(binaryPath("initdb"), ["-D", pgDataDir, "-A", "trust", "-U", pgUser]);
}

function startPostgres() {
  const postgresOptions = `-p ${pgPort} -h 127.0.0.1 -k ${pgDataDir}`;
  const startResult = spawnSync(
    binaryPath("pg_ctl"),
    ["-D", pgDataDir, "-l", pgLogFile, "-o", postgresOptions, "start"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  const combinedOutput = `${startResult.stdout || ""}\n${startResult.stderr || ""}`.trim();
  if (startResult.status !== 0 && !combinedOutput.includes("server is running")) {
    throw new Error(combinedOutput || "Failed to start local PostgreSQL.");
  }

  postgresStartedHere = true;
}

function waitForPostgres() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    const result = spawnSync(
      binaryPath("pg_isready"),
      ["-h", "127.0.0.1", "-p", String(pgPort), "-U", pgUser, "-d", "postgres"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    if (result.status === 0) {
      return;
    }
  }

  throw new Error("Local PostgreSQL did not become ready within 15 seconds.");
}

function ensureDatabaseExists() {
  const queryOutput = runCommand(binaryPath("psql"), [
    "-h",
    "127.0.0.1",
    "-p",
    String(pgPort),
    "-U",
    pgUser,
    "-d",
    "postgres",
    "-tAc",
    `SELECT 1 FROM pg_database WHERE datname = '${databaseName.replace(/'/g, "''")}';`
  ]);

  if (queryOutput.trim() === "1") {
    return;
  }

  runCommand(binaryPath("createdb"), [
    "-h",
    "127.0.0.1",
    "-p",
    String(pgPort),
    "-U",
    pgUser,
    databaseName
  ]);
}

function stopPostgres() {
  if (!postgresStartedHere) {
    return;
  }

  spawnSync(binaryPath("pg_ctl"), ["-D", pgDataDir, "stop", "-m", "fast"], {
    cwd: repoRoot,
    stdio: "ignore"
  });
}

function forwardExit(code) {
  stopPostgres();
  process.exit(code);
}

function startApp() {
  appProcess = spawn("node", ["server.js"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DB_LOCATION_MODE: process.env.DB_LOCATION_MODE || "jsonb"
    }
  });

  appProcess.on("exit", (code, signal) => {
    stopPostgres();
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code || 0);
  });
}

function registerSignalHandlers() {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      if (appProcess && !appProcess.killed) {
        appProcess.kill(signal);
        return;
      }
      forwardExit(0);
    });
  }
}

function main() {
  ensurePgBinaries();
  ensureCluster();
  startPostgres();
  waitForPostgres();
  ensureDatabaseExists();
  registerSignalHandlers();

  console.log(
    `Starting KindredPune with local PostgreSQL on 127.0.0.1:${pgPort} (${databaseName})`
  );
  startApp();
}

try {
  main();
} catch (error) {
  console.error(error.message);
  stopPostgres();
  process.exit(1);
}
