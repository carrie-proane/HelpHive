const path = require("path");
const fs = require("fs");
const http = require("http");
const dotenv = require("dotenv");
const express = require("express");
const cors = require("cors");
const fsPromises = require("fs/promises");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const Handlebars = require("handlebars");
const puppeteer = require("puppeteer");
const PDFDocument = require("pdfkit");
const { GoogleGenAI, createPartFromUri, createUserContent } = require("@google/genai");
const twilio = require("twilio");
const Tesseract = require("tesseract.js");
const h3 = require("h3-js");
const { Sequelize, DataTypes, Op } = require("sequelize");
const { WebSocketServer } = require("ws");
const { createClient } = require("redis");
const {
  evaluateTaskStatus,
  updateTrustScore
} = require("./services/trustService");

const ENV_FILE_CANDIDATES = [
  path.join(__dirname, ".env"),
  path.join(__dirname, "..", ".env")
];

const SHOULD_LOAD_LOCAL_ENV_FILES =
  process.env.LOAD_DOTENV !== "false" &&
  !process.env.K_SERVICE &&
  !process.env.GOOGLE_CLOUD_PROJECT;

if (SHOULD_LOAD_LOCAL_ENV_FILES) {
  for (const envFilePath of ENV_FILE_CANDIDATES) {
    if (fs.existsSync(envFilePath)) {
      dotenv.config({ path: envFilePath, override: false });
    }
  }
}

const app = express();
// Use the port provided by Google, otherwise default to 8080
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || process.env.BIND_HOST || "0.0.0.0";
const JWT_SECRET = process.env.JWT_SECRET || "kindred-dev-secret";
const DEFAULT_DATABASE_URL = "postgres://postgres:postgres@127.0.0.1:5432/kindredpune";
const DB_LOCATION_MODE = String(process.env.DB_LOCATION_MODE || "jsonb").trim().toLowerCase();
const USE_POSTGIS = DB_LOCATION_MODE !== "jsonb";
const ROOT_DIR = path.join(__dirname, "..");
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");
const REPORTS_DIR = path.join(__dirname, "generated-reports");
const UPLOAD_DIR = path.join(__dirname, "uploads");
const TEMPLATE_PATH = path.join(__dirname, "templates", "csr-report.hbs");
const SEED_DATA_FILE = path.join(__dirname, "data", "db.json");
const MAX_SURVEY_UPLOAD_FILES = Number(process.env.MAX_SURVEY_UPLOAD_FILES || 10);
const OCR_CONFIDENCE_THRESHOLD = Number(process.env.OCR_CONFIDENCE_THRESHOLD || 0.8);
const OCR_LOW_CONFIDENCE_WORD_THRESHOLD = Number(
  process.env.OCR_LOW_CONFIDENCE_WORD_THRESHOLD || 0.72
);
const OCR_LANGUAGES = process.env.OCR_LANGUAGES || "eng+hin+mar";
const OCR_TESSERACT_PROFILES = [
  { name: "auto-page", pageSegMode: "3" },
  { name: "single-column", pageSegMode: "4" },
  { name: "sparse-handwriting", pageSegMode: "11" },
  { name: "single-block", pageSegMode: "6" },
  { name: "single-line", pageSegMode: "7" },
  { name: "raw-line", pageSegMode: "13" }
];
const OCR_TESSERACT_FALLBACK_PROFILES = OCR_TESSERACT_PROFILES.slice(0, 4);
const OCR_READABLE_HANDWRITING_CONFIDENCE_FLOOR = Number(
  process.env.OCR_READABLE_HANDWRITING_CONFIDENCE_FLOOR || 0.84
);
const OCR_READABLE_HANDWRITING_MIN_RAW_CONFIDENCE = Number(
  process.env.OCR_READABLE_HANDWRITING_MIN_RAW_CONFIDENCE || 0.35
);
const OCR_INDIC_NOTE_MIN_RAW_CONFIDENCE = Number(
  process.env.OCR_INDIC_NOTE_MIN_RAW_CONFIDENCE || 0.22
);
const SILENT_NEED_DECAY_LAMBDA = Number(process.env.SILENT_NEED_DECAY_LAMBDA || 0.08);
const SILENT_NEED_LOOKBACK_DAYS = Number(process.env.SILENT_NEED_LOOKBACK_DAYS || 5);
const GEMINI_MULTIMODAL_MODEL = process.env.GEMINI_MULTIMODAL_MODEL || "gemini-2.5-flash";
const GEMINI_AUDIO_MODEL = process.env.GEMINI_AUDIO_MODEL || "gemini-2.5-flash";
const MAP_REFRESH_CENTER = { lat: 18.5204, lng: 73.8567 };
const DB_CONNECTION_RETRY_ATTEMPTS = Number(process.env.DB_CONNECTION_RETRY_ATTEMPTS || 12);
const DB_CONNECTION_RETRY_DELAY_MS = Number(process.env.DB_CONNECTION_RETRY_DELAY_MS || 2500);
const DB_CONNECTION_TIMEOUT_MS = Number(process.env.DB_CONNECTION_TIMEOUT_MS || 30000);
const DISPATCH_H3_RESOLUTION = Number(process.env.DISPATCH_H3_RESOLUTION || 8);
const DISPATCH_DEFAULT_RADIUS_METERS = Number(process.env.DISPATCH_DEFAULT_RADIUS_METERS || 7500);
const DISPATCH_ROUTE_TIMEOUT_MS = Number(process.env.DISPATCH_ROUTE_TIMEOUT_MS || 800);
const DISPATCH_MAX_ROUTE_CANDIDATES = Number(process.env.DISPATCH_MAX_ROUTE_CANDIDATES || 5);
const DISPATCH_AVERAGE_SPEED_KMPH = Number(process.env.DISPATCH_AVERAGE_SPEED_KMPH || 22);
const ROUTING_ENGINE = String(process.env.ROUTING_ENGINE || "osrm").trim().toLowerCase();
const ROUTING_ENGINE_URL = String(process.env.ROUTING_ENGINE_URL || "").replace(/\/+$/, "");
const ROUTING_ENGINE_API_KEY = process.env.ROUTING_ENGINE_API_KEY || "";
const DISPATCH_REMOTE_ROUTING = process.env.DISPATCH_REMOTE_ROUTING === "true";
const REDIS_URL = process.env.REDIS_URL || (isRunningInDocker() ? "redis://redis:6379" : "redis://127.0.0.1:6379");
const DISPATCH_USE_REDIS = process.env.DISPATCH_USE_REDIS !== "false";
const DISPATCH_REDIS_CONNECT_TIMEOUT_MS = Number(process.env.DISPATCH_REDIS_CONNECT_TIMEOUT_MS || 1000);
const DISPATCH_WS_PATH = process.env.DISPATCH_WS_PATH || "/dispatch/ws";
const DISPATCH_GEO_VOLUNTEERS_KEY = process.env.DISPATCH_GEO_VOLUNTEERS_KEY || "dispatch:geo:volunteers";
const DISPATCH_GEO_TASKS_KEY = process.env.DISPATCH_GEO_TASKS_KEY || "dispatch:geo:tasks";
const DISPATCH_VOLUNTEER_HASH_KEY = process.env.DISPATCH_VOLUNTEER_HASH_KEY || "dispatch:volunteers";
const DISPATCH_TASK_HASH_KEY = process.env.DISPATCH_TASK_HASH_KEY || "dispatch:tasks";
const DISPATCH_SELF_ASSIGN_LIMIT = Number(process.env.DISPATCH_SELF_ASSIGN_LIMIT || 20);
const HELPHIVE_LOGIN_DOMAIN = "@helphive.org";
const LEGACY_LOGIN_DOMAIN = "@kindredpune.org";
const ROLE_PAGE_FILES = [
  "admin-dashboard.html",
  "field-desk.html",
  "my-tasks.html",
  "csr-dashboard.html"
];

function isRunningInDocker() {
  return fs.existsSync("/.dockerenv");
}

function isProductionRuntime() {
  return (
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.K_SERVICE) ||
    Boolean(process.env.GOOGLE_CLOUD_PROJECT)
  );
}

function readFirstEnvValue(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function resolveDatabaseHost() {
  const configuredHost = readFirstEnvValue("PGHOST", "POSTGRES_HOST");

  if (configuredHost) {
    return configuredHost;
  }

  const instanceConnectionName = readFirstEnvValue("INSTANCE_CONNECTION_NAME");
  if (instanceConnectionName) {
    return `/cloudsql/${instanceConnectionName}`;
  }

  if (isRunningInDocker()) {
    return "postgres";
  }

  return "";
}

function buildDatabaseUrlFromParts() {
  const host = resolveDatabaseHost();
  const database = readFirstEnvValue("PGDATABASE", "POSTGRES_DB", "POSTGRES_DATABASE");
  const username = readFirstEnvValue("PGUSER", "POSTGRES_USER");
  const password = readFirstEnvValue("PGPASSWORD", "POSTGRES_PASSWORD");
  const portValue = readFirstEnvValue("PGPORT", "POSTGRES_PORT");
  const portNumber = Number(portValue || 5432);
  const port = Number.isFinite(portNumber) && portNumber > 0 ? String(portNumber) : "5432";

  if (!host || !database || !username) {
    return null;
  }

  if (host.startsWith("/")) {
    return {
      connectionParts: {
        database,
        username,
        password,
        host,
        port
      },
      displayUrl: `postgres://${encodeURIComponent(username)}:****@${host}/${database}`
    };
  }

  const auth = `${encodeURIComponent(username)}:${encodeURIComponent(password)}`;
  return {
    connectionString: `postgres://${auth}@${host}:${port}/${database}`,
    displayUrl: `postgres://${encodeURIComponent(username)}:****@${host}:${port}/${database}`
  };
}

function resolveDatabaseConnection() {
  const configuredUrl = readFirstEnvValue("DATABASE_URL");

  if (configuredUrl) {
    return normalizeDatabaseConnection({ connectionString: configuredUrl });
  }

  const databaseConfigFromParts = buildDatabaseUrlFromParts();
  if (databaseConfigFromParts) {
    return normalizeDatabaseConnection(databaseConfigFromParts);
  }

  if (isProductionRuntime()) {
    throw new Error(
      "Database configuration missing. Set DATABASE_URL or PGHOST/PGDATABASE/PGUSER/PGPASSWORD before starting the production server."
    );
  }

  return normalizeDatabaseConnection({ connectionString: DEFAULT_DATABASE_URL });
}

function normalizeDatabaseConnection(connection) {
  if (connection.connectionString) {
    return normalizeDatabaseConnectionString(connection.connectionString, connection.displayUrl);
  }

  return {
    ...connection,
    host: connection.connectionParts?.host || "",
    displayUrl:
      connection.displayUrl ||
      `postgres://${encodeURIComponent(connection.connectionParts?.username || "unknown")}:****@${connection.connectionParts?.host || "unknown"
      }/${connection.connectionParts?.database || "unknown"}`
  };
}

function normalizeDatabaseConnectionString(rawUrl, displayOverride) {
  const configuredUrl = rawUrl || DEFAULT_DATABASE_URL;

  try {
    const parsed = new URL(configuredUrl);
    const hostLooksLocal = ["localhost", "127.0.0.1", "0.0.0.0"].includes(parsed.hostname);

    if (isRunningInDocker() && hostLooksLocal) {
      parsed.hostname = process.env.POSTGRES_HOST || "postgres";
      return {
        connectionString: parsed.toString(),
        host: parsed.hostname,
        displayUrl: displayOverride || redactDatabaseUrl(parsed.toString())
      };
    }
  } catch (error) {
    console.warn(`Unable to parse DATABASE_URL, using it as-is: ${error.message}`);
  }

  return {
    connectionString: configuredUrl,
    host: safeReadHostname(configuredUrl),
    displayUrl: displayOverride || redactDatabaseUrl(configuredUrl)
  };
}

function safeReadHostname(rawUrl) {
  try {
    return new URL(rawUrl).hostname;
  } catch (error) {
    return "";
  }
}

function redactDatabaseUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.password) {
      parsed.password = "****";
    }
    return parsed.toString();
  } catch (error) {
    return rawUrl;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPublicOrigin(request) {
  const configuredPublicUrl = readFirstEnvValue("BACKEND_PUBLIC_URL", "REPORT_BASE_URL");
  if (configuredPublicUrl) {
    return configuredPublicUrl.replace(/\/+$/, "");
  }

  const forwardedProto = String(request.get("x-forwarded-proto") || "").trim();
  const protocol = forwardedProto || request.protocol || "https";
  const forwardedHost = String(request.get("x-forwarded-host") || "").trim();
  const host = String(forwardedHost || request.get("host") || request.headers.host || request.hostname || "").trim();
  return host ? `${protocol}://${host}` : "";
}

function buildUploadUrl(request, filename) {
  const normalizedFilename = String(filename || "").trim();
  if (!normalizedFilename) {
    return null;
  }

  const relativePath = `/uploads/${encodeURIComponent(normalizedFilename)}`;
  const origin = buildPublicOrigin(request);
  return origin ? `${origin}${relativePath}` : relativePath;
}

function shouldRetryDatabaseConnection(error) {
  const code = error?.original?.code || error?.parent?.code || error?.code;
  const message = String(error?.message || error?.original?.message || error?.parent?.message || "");
  return (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "EHOSTUNREACH" ||
    code === "ETIMEDOUT" ||
    /timeout expired|connection timeout|connect etimedout/i.test(message)
  );
}

function shouldUseDatabaseSsl(databaseConnection) {
  const configuredSsl = readFirstEnvValue("DB_SSL");
  if (configuredSsl) {
    return configuredSsl === "true";
  }

  const pgSslMode = readFirstEnvValue("PGSSLMODE");
  if (pgSslMode) {
    return pgSslMode === "require";
  }

  const host = databaseConnection.host || "";
  const isUnixSocket = host.startsWith("/");
  const isLocalHost = ["localhost", "127.0.0.1", "0.0.0.0", "postgres"].includes(host);

  return isProductionRuntime() && host && !isUnixSocket && !isLocalHost;
}

const DATABASE_CONNECTION = resolveDatabaseConnection();
const DISPLAY_DATABASE_URL = DATABASE_CONNECTION.displayUrl;
const DATABASE_SSL_ENABLED = shouldUseDatabaseSsl(DATABASE_CONNECTION);

const geminiClient = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const twilioClient =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

let redisClient = null;
let redisReady = false;

const sequelizeOptions = {
  dialect: "postgres",
  logging: false,
  dialectOptions: {
    connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
    connectTimeout: DB_CONNECTION_TIMEOUT_MS,
    ...(DATABASE_SSL_ENABLED ? { ssl: { require: true, rejectUnauthorized: false } } : {})
  }
};

const sequelize = DATABASE_CONNECTION.connectionString
  ? new Sequelize(DATABASE_CONNECTION.connectionString, sequelizeOptions)
  : new Sequelize({
    ...DATABASE_CONNECTION.connectionParts,
    ...sequelizeOptions
  });
const LOCATION_DATA_TYPE = USE_POSTGIS ? DataTypes.GEOGRAPHY("POINT", 4326) : DataTypes.JSONB;

const ROLE_ALIASES = {
  volunteer: "volunteer",
  ngo: "ngo",
  ngo_worker: "ngo",
  admin: "admin",
  corporate: "corporate",
  csr_partner: "corporate"
};

const ROLE_LABELS = {
  volunteer: "Volunteer",
  ngo: "NGO Worker",
  admin: "Admin",
  corporate: "Corporate"
};

const TASK_STATUS = {
  OPEN: "open",
  PENDING_REVIEW: "pending_review",
  PENDING_VETTING: "pending_vetting",
  REJECTED: "rejected",
  COMPLETED: "completed",
  PENDING: "pending",
  CONFIRMED: "confirmed",
  AUTO_ACCEPTED: "auto_accepted"
};

const LOCALITY_INDEX = {
  shivajinagar: { name: "Shivajinagar", lat: 18.5314, lng: 73.8446, ngo: "Jeevan Dhara" },
  "kasba peth": { name: "Kasba Peth", lat: 18.5204, lng: 73.8567, ngo: "Jeevan Dhara" },
  kothrud: { name: "Kothrud", lat: 18.5074, lng: 73.8077, ngo: "Nagrik Mitra" },
  yerawada: { name: "Yerawada", lat: 18.5538, lng: 73.8893, ngo: "Jeevan Dhara" },
  hadapsar: { name: "Hadapsar", lat: 18.5089, lng: 73.9259, ngo: "Seva Setu" },
  pimpri: { name: "Pimpri", lat: 18.6298, lng: 73.7997, ngo: "Seva Setu" },
  camp: { name: "Camp", lat: 18.5169, lng: 73.8785, ngo: "Seva Setu" },
  baner: { name: "Baner", lat: 18.559, lng: 73.7868, ngo: "Nagrik Mitra" },
  wakad: { name: "Wakad", lat: 18.5981, lng: 73.7637, ngo: "Seva Setu" }
};

const TYPE_KEYWORDS = {
  water: [
    "water",
    "tanker",
    "refill",
    "purification",
    "drinking water",
    "contaminated well",
    "well water",
    "पाणी",
    "पेयजल",
    "बोरवेल",
    "पाण्याची टंचाई"
  ],
  sanitation: [
    "sanitation",
    "waste",
    "garbage",
    "overflow",
    "drain",
    "toilet",
    "cleaning",
    "कचरा",
    "गटार",
    "सांडपाणी",
    "घाण"
  ],
  volunteer: ["volunteer", "helper", "support staff", "community support", "स्वयंसेवक", "सहाय्यक"],
  medical: [
    "medical",
    "medicine",
    "doctor",
    "clinic",
    "fever",
    "triage",
    "hospital",
    "दवा",
    "औषध",
    "उलटी",
    "दस्त",
    "illness",
    "symptoms"
  ],
  food: ["food", "ration", "meal", "kitchen", "hunger", "groceries", "राशन", "अन्न", "भोजन"],
  shelter: ["shelter", "housing", "roof", "sleeping", "eviction", "आश्रय"],
  education: ["school", "education", "student", "supplies", "शाळा"]
};

const SKILL_MAP = {
  water: ["logistics", "community outreach"],
  sanitation: ["logistics", "community outreach"],
  volunteer: ["logistics", "meal distribution"],
  medical: ["medical", "triage", "community outreach"],
  food: ["meal distribution", "logistics"],
  shelter: ["community outreach", "coordination"],
  education: ["teaching", "community outreach"]
};

const SEVERITY_KEYWORDS = {
  critical: ["critical", "emergency", "urgent help", "immediate", "severe", "no water", "medical emergency"],
  urgent: ["urgent", "today", "soon", "backlog", "shortage", "delay"],
  stable: ["stable", "routine", "regular", "planned", "follow up"]
};

const LOCAL_DEFAULT_LANGUAGES = ["Marathi", "Hindi"];
const HIGH_RISK_TASK_TYPES = new Set(["medical", "water", "sanitation", "shelter"]);
const MEDICAL_TRAINING_LEVELS = ["none", "first_aid", "community_health", "nurse", "doctor"];
const TASK_CONTEXT_BLUEPRINTS = {
  water: {
    category: "infrastructure",
    complementarySkills: ["route planning", "field assessment", "community translation"],
    contextTags: ["water access", "household support", "last-mile delivery"],
    preferredCommunicationStyles: ["community_bridge", "calm_reassuring"],
    minimumMedicalTraining: "none",
    timeWindows: ["morning", "afternoon"]
  },
  sanitation: {
    category: "public_health",
    complementarySkills: ["documentation", "local translation", "route planning"],
    contextTags: ["hygiene", "waste clearing", "resident coordination"],
    preferredCommunicationStyles: ["directive", "community_bridge"],
    minimumMedicalTraining: "none",
    timeWindows: ["morning", "afternoon"]
  },
  volunteer: {
    category: "operations",
    complementarySkills: ["coordination", "team leading", "data collection"],
    contextTags: ["surge support", "shift coverage"],
    preferredCommunicationStyles: ["community_bridge", "directive"],
    minimumMedicalTraining: "none",
    timeWindows: ["evening", "weekend"]
  },
  medical: {
    category: "health",
    complementarySkills: ["local translation", "logistics", "data collection"],
    contextTags: ["health response", "triage", "medication support"],
    preferredCommunicationStyles: ["calm_reassuring", "directive"],
    minimumMedicalTraining: "community_health",
    timeWindows: ["morning", "on_call"]
  },
  food: {
    category: "nutrition",
    complementarySkills: ["inventory tracking", "community translation", "route planning"],
    contextTags: ["meal support", "household delivery"],
    preferredCommunicationStyles: ["community_bridge", "calm_reassuring"],
    minimumMedicalTraining: "none",
    timeWindows: ["morning", "evening", "weekend"]
  },
  shelter: {
    category: "protection",
    complementarySkills: ["case coordination", "documentation", "community translation"],
    contextTags: ["temporary shelter", "family support", "high_stress"],
    preferredCommunicationStyles: ["calm_reassuring", "directive"],
    minimumMedicalTraining: "first_aid",
    timeWindows: ["afternoon", "on_call"]
  },
  education: {
    category: "education",
    complementarySkills: ["digital literacy", "translation", "student coordination"],
    contextTags: ["learning continuity", "supplies support"],
    preferredCommunicationStyles: ["analytical", "community_bridge"],
    minimumMedicalTraining: "none",
    timeWindows: ["morning", "afternoon", "weekend"]
  }
};
const ALERT_EVIDENCE_KEYWORDS = {
  water: ["contaminated", "well", "purification", "diarrhea", "vomiting", "पाणी", "बोरवेल"],
  sanitation: ["garbage", "overflow", "drain", "waste", "कचरा", "गटार"],
  medical: ["fever", "clinic", "medicine", "hospital", "दवा", "उलटी", "दस्त"],
  food: ["ration", "meal", "hunger", "अन्न", "राशन"],
  volunteer: ["volunteer", "helper", "support", "स्वयंसेवक"],
  shelter: ["roof", "sleeping", "eviction", "आश्रय"]
};

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function normalizeRole(role) {
  return ROLE_ALIASES[String(role || "").trim().toLowerCase()] || null;
}

function getLoginEmailCandidates(email = "") {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return [];
  }

  const candidates = new Set([normalizedEmail]);

  if (normalizedEmail.endsWith(HELPHIVE_LOGIN_DOMAIN)) {
    candidates.add(
      `${normalizedEmail.slice(0, -HELPHIVE_LOGIN_DOMAIN.length)}${LEGACY_LOGIN_DOMAIN}`
    );
  }

  if (normalizedEmail.endsWith(LEGACY_LOGIN_DOMAIN)) {
    candidates.add(
      `${normalizedEmail.slice(0, -LEGACY_LOGIN_DOMAIN.length)}${HELPHIVE_LOGIN_DOMAIN}`
    );
  }

  return [...candidates];
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSeverity(value) {
  const candidate = String(value || "").trim().toLowerCase();
  if (["critical", "urgent", "stable"].includes(candidate)) {
    return candidate;
  }
  return "stable";
}

function normalizeTaskStatus(value, fallback = TASK_STATUS.OPEN) {
  const candidate = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return Object.values(TASK_STATUS).includes(candidate) ? candidate : fallback;
}

function shouldRequireReview(confidence, flaggedWords = []) {
  const normalizedConfidence = clampConfidence(confidence, 0);
  return (
    normalizedConfidence < OCR_CONFIDENCE_THRESHOLD || normalizeArray(flaggedWords).length > 0
  );
}

function buildLiveTaskWhere(additionalWhere = {}) {
  return {
    status: TASK_STATUS.OPEN,
    completedAt: null,
    ...additionalWhere
  };
}

const LOW_TRUST_THRESHOLD = 0.4;

function isHighImpactTask({ severity, peopleServed, description }) {
  if (severity === "critical") return true;
  if (Number(peopleServed || 0) >= 50) return true;
  if (String(description || "").toLowerCase().includes("large aid request")) return true;
  return false;
}

function normalizeMedicalTraining(value = "") {
  const candidate = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (MEDICAL_TRAINING_LEVELS.includes(candidate)) {
    return candidate;
  }
  if (["doctor", "physician", "mbbs"].includes(candidate)) {
    return "doctor";
  }
  if (["nurse", "nursing"].includes(candidate)) {
    return "nurse";
  }
  if (["community_health", "health_worker", "anm", "asha"].includes(candidate)) {
    return "community_health";
  }
  if (["first_aid", "emt", "paramedic"].includes(candidate)) {
    return "first_aid";
  }
  return "none";
}

function normalizeCommunicationStyle(value = "") {
  const candidate = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  const allowed = ["community_bridge", "calm_reassuring", "directive", "analytical", "translator"];
  if (allowed.includes(candidate)) {
    return candidate;
  }
  if (candidate.includes("calm") || candidate.includes("reassuring")) {
    return "calm_reassuring";
  }
  if (candidate.includes("direct")) {
    return "directive";
  }
  if (candidate.includes("analysis") || candidate.includes("data")) {
    return "analytical";
  }
  if (candidate.includes("translat")) {
    return "translator";
  }
  return "community_bridge";
}

function titleCase(value = "") {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function medicalTrainingRank(value = "") {
  return MEDICAL_TRAINING_LEVELS.indexOf(normalizeMedicalTraining(value));
}

function normalizeToken(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function medicalTrainingSkillAliases(level = "") {
  const normalized = normalizeMedicalTraining(level);
  if (normalized === "doctor") {
    return ["medical", "triage", "clinical care", "first aid"];
  }
  if (normalized === "nurse") {
    return ["medical", "triage", "patient support", "first aid"];
  }
  if (normalized === "community_health") {
    return ["medical", "triage", "health outreach", "first aid"];
  }
  if (normalized === "first_aid") {
    return ["first aid", "medical support"];
  }
  return [];
}

function availabilitySignals(value = "") {
  const normalized = normalizeToken(value);
  if (!normalized) {
    return [];
  }

  return uniqueValues(
    [
      normalized.includes("morning") ? "morning" : "",
      normalized.includes("afternoon") ? "afternoon" : "",
      normalized.includes("evening") ? "evening" : "",
      normalized.includes("night") ? "night" : "",
      normalized.includes("weekend") ? "weekend" : "",
      normalized.includes("weekday") ? "weekday" : "",
      normalized.includes("full-time") || normalized.includes("business hours") ? "afternoon" : "",
      normalized.includes("full-time") || normalized.includes("on-call") ? "on_call" : ""
    ].filter(Boolean)
  );
}

function buildTaskRoutingProfile(input = {}) {
  const type = normalizeNeedType(input.type, input.description || "");
  const blueprint = TASK_CONTEXT_BLUEPRINTS[type] || TASK_CONTEXT_BLUEPRINTS.volunteer;
  const description = String(input.description || "").trim();
  const severity = normalizeSeverity(input.severity);
  const normalizedDescription = `${description} ${input.locationName || ""}`.toLowerCase();
  const inferredTimeWindows = uniqueValues([
    normalizedDescription.includes("morning") || normalizedDescription.includes("breakfast")
      ? "morning"
      : "",
    normalizedDescription.includes("afternoon") ? "afternoon" : "",
    normalizedDescription.includes("evening") ||
      normalizedDescription.includes("night") ||
      normalizedDescription.includes("dinner")
      ? "evening"
      : "",
    normalizedDescription.includes("weekend") ? "weekend" : "",
    severity === "critical" ? "on_call" : ""
  ]);
  const requiredSkills = uniqueValues([
    ...normalizeArray(input.requiredSkills),
    ...(normalizeArray(input.requiredSkills).length ? [] : SKILL_MAP[type] || ["community outreach"])
  ]);
  const complementarySkills = uniqueValues([
    ...normalizeArray(input.complementarySkills),
    ...blueprint.complementarySkills,
    normalizedDescription.includes("data") || normalizedDescription.includes("survey")
      ? "data collection"
      : "",
    normalizedDescription.includes("translate") || normalizedDescription.includes("language")
      ? "translation"
      : ""
  ]);
  const preferredLanguages = uniqueValues([
    ...normalizeArray(input.preferredLanguages),
    ...normalizeArray(input.languages),
    ...preferredLanguagesForTask({
      description,
      type,
      locationName: input.locationName
    })
  ]);
  const preferredCommunicationStyles = uniqueValues(
    [
      ...normalizeArray(input.preferredCommunicationStyles),
      ...blueprint.preferredCommunicationStyles
    ].map(normalizeCommunicationStyle)
  );
  const contextTags = uniqueValues([
    ...normalizeArray(input.contextTags),
    blueprint.category,
    ...blueprint.contextTags,
    severity === "critical" ? "high_stress" : "",
    type === "medical" ? "health" : ""
  ]);
  const timeWindows = uniqueValues([...normalizeArray(input.timeWindows), ...blueprint.timeWindows, ...inferredTimeWindows]);

  return {
    category: String(input.category || blueprint.category || "operations").trim(),
    requiredSkills,
    complementarySkills,
    preferredLanguages,
    preferredCommunicationStyles,
    contextTags,
    minimumMedicalTraining: normalizeMedicalTraining(
      input.minimumMedicalTraining || blueprint.minimumMedicalTraining
    ),
    timeWindows
  };
}

function getVolunteerSkillCorpus(volunteer = {}) {
  return uniqueValues([
    ...normalizeArray(volunteer.skills),
    ...normalizeArray(volunteer.technicalSkills),
    ...medicalTrainingSkillAliases(volunteer.medicalTraining)
  ]);
}

function pointFromCoordinates(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    type: "Point",
    coordinates: [lng, lat]
  };
}

function pointToCoordinates(point) {
  if (!point || !Array.isArray(point.coordinates) || point.coordinates.length < 2) {
    return { lat: null, lng: null };
  }

  return {
    lat: Number(point.coordinates[1]),
    lng: Number(point.coordinates[0])
  };
}

function inferAudioMimeType(filePath, fallbackMimeType = "") {
  const normalizedFallback = String(fallbackMimeType || "").toLowerCase();
  if (normalizedFallback && normalizedFallback !== "application/octet-stream") {
    return normalizedFallback;
  }

  const extension = path.extname(filePath || "").toLowerCase();
  const mimeByExtension = {
    ".webm": "audio/webm",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
    ".flac": "audio/flac",
    ".aiff": "audio/aiff",
    ".aif": "audio/aiff"
  };

  return mimeByExtension[extension] || "audio/webm";
}

function haversineKm(aLat, aLng, bLat, bLng) {
  if ([aLat, aLng, bLat, bLng].some((value) => !Number.isFinite(Number(value)))) {
    return null;
  }

  const toRadians = (value) => (Number(value) * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(Number(bLat) - Number(aLat));
  const dLng = toRadians(Number(bLng) - Number(aLng));
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const a =
    sinLat * sinLat +
    Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

const spatialIndex = {
  volunteersByCell: new Map(),
  tasksByCell: new Map(),
  volunteerCells: new Map(),
  taskCells: new Map()
};

const volunteerNotificationStreams = new Map();
const volunteerNotificationBacklog = new Map();
const volunteerSocketStreams = new Map();
const volunteerDispatchModes = new Map();
const dispatchWorkQueue = [];
let dispatchWorkScheduled = false;
let dispatchWorkRunning = false;
const appState = {
  databaseReady: false,
  schemaReady: false,
  schemaMaintenanceRunning: false,
  initializationStartedAt: null,
  initializationCompletedAt: null,
  startupError: null
};

function isRedisUsable() {
  return Boolean(redisClient && redisReady);
}

async function connectRedis() {
  if (!DISPATCH_USE_REDIS || !REDIS_URL) {
    return false;
  }

  redisClient = createClient({ url: REDIS_URL });
  redisClient.on("error", (error) => {
    if (redisReady) {
      console.warn(`Redis dispatch index unavailable, using database fallback: ${error.message}`);
    }
    redisReady = false;
  });
  redisClient.on("ready", () => {
    redisReady = true;
  });
  redisClient.on("end", () => {
    redisReady = false;
  });

  try {
    await Promise.race([
      redisClient.connect(),
      delay(DISPATCH_REDIS_CONNECT_TIMEOUT_MS).then(() => {
        throw new Error(`Redis connection timed out after ${DISPATCH_REDIS_CONNECT_TIMEOUT_MS}ms`);
      })
    ]);
    redisReady = true;
    console.log(`Redis dispatch index ready: ${REDIS_URL}`);
    return true;
  } catch (error) {
    redisReady = false;
    try {
      await redisClient.disconnect();
    } catch (disconnectError) {
      // Ignore cleanup errors when Redis was never fully connected.
    }
    redisClient = null;
    console.warn(`Redis dispatch index unavailable, using database fallback: ${error.message}`);
    return false;
  }
}

async function runRedisCommand(command) {
  if (!isRedisUsable()) {
    return null;
  }

  try {
    return await redisClient.sendCommand(command.map((value) => String(value)));
  } catch (error) {
    redisReady = false;
    console.warn(`Redis command failed, using database fallback: ${error.message}`);
    return null;
  }
}

async function geoAddToRedis(key, id, coords) {
  if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
    return false;
  }
  const result = await runRedisCommand(["GEOADD", key, coords.lng, coords.lat, id]);
  return result !== null;
}

async function geoRemoveFromRedis(key, id) {
  await runRedisCommand(["ZREM", key, id]);
}

async function queryRedisGeoRadius(key, coords, radiusMeters, count = 50) {
  if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
    return null;
  }

  const result = await runRedisCommand([
    "GEORADIUS",
    key,
    coords.lng,
    coords.lat,
    radiusMeters,
    "m",
    "WITHDIST",
    "COUNT",
    count,
    "ASC"
  ]);

  if (!Array.isArray(result)) {
    return null;
  }

  return result
    .map((entry) => {
      if (Array.isArray(entry)) {
        return { id: String(entry[0]), distanceMeters: Number(entry[1]) };
      }
      return { id: String(entry), distanceMeters: null };
    })
    .filter((entry) => entry.id);
}

async function indexVolunteerInRedis(volunteer, options = {}) {
  if (!volunteer?.id || !isRedisUsable()) {
    return;
  }

  const coords = options.coords || pointToCoordinates(volunteer.location);
  const isAvailable = options.isAvailable ?? volunteer.isAvailable;
  const payload = {
    id: volunteer.id,
    userId: volunteer.userId,
    isAvailable,
    skills: volunteer.skills || [],
    technicalSkills: volunteer.technicalSkills || [],
    languages: volunteer.languages || [],
    updatedAt: new Date().toISOString()
  };

  try {
    await redisClient.hSet(DISPATCH_VOLUNTEER_HASH_KEY, String(volunteer.id), JSON.stringify(payload));
  } catch (error) {
    redisReady = false;
    console.warn(`Redis volunteer hash update failed: ${error.message}`);
    return;
  }
  if (isAvailable) {
    await geoAddToRedis(DISPATCH_GEO_VOLUNTEERS_KEY, volunteer.id, coords);
  } else {
    await geoRemoveFromRedis(DISPATCH_GEO_VOLUNTEERS_KEY, volunteer.id);
  }
}

async function indexTaskInRedis(task, options = {}) {
  if (!task?.id || !isRedisUsable()) {
    return;
  }

  const coords = options.coords || pointToCoordinates(task.location);
  const isDispatchable =
    options.active ?? (task.status === TASK_STATUS.OPEN && !task.isAssigned && !task.completedAt);
  const payload = {
    id: task.id,
    type: task.type,
    severity: task.severity,
    requiredSkills: task.requiredSkills || [],
    preferredLanguages: task.preferredLanguages || [],
    isDispatchable,
    updatedAt: new Date().toISOString()
  };

  try {
    await redisClient.hSet(DISPATCH_TASK_HASH_KEY, String(task.id), JSON.stringify(payload));
  } catch (error) {
    redisReady = false;
    console.warn(`Redis task hash update failed: ${error.message}`);
    return;
  }
  if (isDispatchable) {
    await geoAddToRedis(DISPATCH_GEO_TASKS_KEY, task.id, coords);
  } else {
    await geoRemoveFromRedis(DISPATCH_GEO_TASKS_KEY, task.id);
  }
}

async function rebuildRedisDispatchIndex() {
  if (!isRedisUsable()) {
    return;
  }

  try {
    await Promise.all([
      redisClient.del(DISPATCH_GEO_VOLUNTEERS_KEY),
      redisClient.del(DISPATCH_GEO_TASKS_KEY),
      redisClient.del(DISPATCH_VOLUNTEER_HASH_KEY),
      redisClient.del(DISPATCH_TASK_HASH_KEY)
    ]);
  } catch (error) {
    redisReady = false;
    console.warn(`Redis dispatch index rebuild failed: ${error.message}`);
    return;
  }

  const [volunteers, tasks] = await Promise.all([
    Volunteer.findAll({ where: { isAvailable: true } }),
    Task.findAll({ where: buildLiveTaskWhere({ isAssigned: false }) })
  ]);

  for (const volunteer of volunteers) {
    await indexVolunteerInRedis(volunteer);
  }
  for (const task of tasks) {
    await indexTaskInRedis(task);
  }
}

function assertValidCoordinates(latitude, longitude, label = "location") {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    const error = new Error(`${label}.lat and ${label}.lng must be valid coordinates.`);
    error.statusCode = 400;
    throw error;
  }

  return { lat, lng };
}

function readLatLngFromBody(body = {}) {
  const nested = body.location && typeof body.location === "object" ? body.location : {};
  const latitude = body.latitude ?? body.lat ?? body.gps_lat ?? nested.latitude ?? nested.lat;
  const longitude = body.longitude ?? body.lng ?? body.gps_lng ?? nested.longitude ?? nested.lng;
  return assertValidCoordinates(latitude, longitude);
}

function cellForCoordinates(latitude, longitude) {
  const { lat, lng } = assertValidCoordinates(latitude, longitude);
  return h3.latLngToCell(lat, lng, DISPATCH_H3_RESOLUTION);
}

function setSpatialMembership({ kind, id, latitude, longitude, active = true }) {
  const idValue = String(id);
  const cellMap = kind === "volunteer" ? spatialIndex.volunteersByCell : spatialIndex.tasksByCell;
  const reverseMap = kind === "volunteer" ? spatialIndex.volunteerCells : spatialIndex.taskCells;
  const previousCell = reverseMap.get(idValue);

  if (previousCell && cellMap.has(previousCell)) {
    cellMap.get(previousCell).delete(idValue);
    if (cellMap.get(previousCell).size === 0) {
      cellMap.delete(previousCell);
    }
  }

  if (!active) {
    reverseMap.delete(idValue);
    return null;
  }

  const cell = cellForCoordinates(latitude, longitude);
  if (!cellMap.has(cell)) {
    cellMap.set(cell, new Set());
  }
  cellMap.get(cell).add(idValue);
  reverseMap.set(idValue, cell);
  return cell;
}

function serializeSpatialIndex() {
  const serializeMap = (map) =>
    [...map.entries()].map(([cell, ids]) => ({
      cell,
      ids: [...ids]
    }));

  return {
    grid: "h3",
    resolution: DISPATCH_H3_RESOLUTION,
    volunteersByCell: serializeMap(spatialIndex.volunteersByCell),
    tasksByCell: serializeMap(spatialIndex.tasksByCell)
  };
}

async function rebuildSpatialIndex() {
  spatialIndex.volunteersByCell.clear();
  spatialIndex.tasksByCell.clear();
  spatialIndex.volunteerCells.clear();
  spatialIndex.taskCells.clear();

  const [volunteers, tasks] = await Promise.all([
    Volunteer.findAll({ where: { isAvailable: true } }),
    Task.findAll({ where: buildLiveTaskWhere() })
  ]);

  for (const volunteer of volunteers) {
    const coords = pointToCoordinates(volunteer.location);
    if (Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
      setSpatialMembership({
        kind: "volunteer",
        id: volunteer.id,
        latitude: coords.lat,
        longitude: coords.lng,
        active: true
      });
    }
  }

  for (const task of tasks) {
    const coords = pointToCoordinates(task.location);
    if (Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
      setSpatialMembership({
        kind: "task",
        id: task.id,
        latitude: coords.lat,
        longitude: coords.lng,
        active: !task.isAssigned
      });
    }
  }
}

function routingFallback(taskCoords, volunteerCoords) {
  const distanceKm = haversineKm(taskCoords.lat, taskCoords.lng, volunteerCoords.lat, volunteerCoords.lng);
  const durationMinutes =
    distanceKm === null
      ? null
      : Math.max(1, (distanceKm / Math.max(DISPATCH_AVERAGE_SPEED_KMPH, 1)) * 60);

  return {
    distanceMeters: distanceKm === null ? null : distanceKm * 1000,
    durationSeconds: durationMinutes === null ? null : durationMinutes * 60,
    provider: "haversine_fallback"
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DISPATCH_ROUTE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function computeRouteEstimate(taskCoords, volunteerCoords, options = {}) {
  if (!options.allowRemote || !DISPATCH_REMOTE_ROUTING || !ROUTING_ENGINE_URL) {
    return routingFallback(taskCoords, volunteerCoords);
  }

  try {
    if (ROUTING_ENGINE === "graphhopper") {
      const url = new URL(`${ROUTING_ENGINE_URL}/route`);
      url.searchParams.append("point", `${volunteerCoords.lat},${volunteerCoords.lng}`);
      url.searchParams.append("point", `${taskCoords.lat},${taskCoords.lng}`);
      url.searchParams.set("profile", "car");
      url.searchParams.set("locale", "en");
      url.searchParams.set("calc_points", "false");
      if (ROUTING_ENGINE_API_KEY) {
        url.searchParams.set("key", ROUTING_ENGINE_API_KEY);
      }

      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        throw new Error(`GraphHopper responded ${response.status}`);
      }
      const payload = await response.json();
      const pathResult = payload.paths?.[0];
      return {
        distanceMeters: Number.isFinite(Number(pathResult?.distance)) ? Number(pathResult.distance) : null,
        durationSeconds: Number.isFinite(Number(pathResult?.time)) ? Number(pathResult.time) / 1000 : null,
        provider: "graphhopper"
      };
    }

    const url = `${ROUTING_ENGINE_URL}/route/v1/driving/${volunteerCoords.lng},${volunteerCoords.lat};${taskCoords.lng},${taskCoords.lat}?overview=false`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      throw new Error(`OSRM responded ${response.status}`);
    }
    const payload = await response.json();
    const route = payload.routes?.[0];
    return {
      distanceMeters: Number.isFinite(Number(route?.distance)) ? Number(route.distance) : null,
      durationSeconds: Number.isFinite(Number(route?.duration)) ? Number(route.duration) : null,
      provider: "osrm"
    };
  } catch (error) {
    console.warn(`Routing engine unavailable, using fallback ETA: ${error.message}`);
    return routingFallback(taskCoords, volunteerCoords);
  }
}

function scoreSkillMatch(requiredSkills = [], volunteer = {}) {
  const required = normalizeArray(requiredSkills);
  if (!required.length) {
    return 1;
  }

  const volunteerSkills = getVolunteerSkillCorpus(volunteer).map(normalizeToken);
  const matched = required.filter((skill) => volunteerSkills.includes(normalizeToken(skill)));
  return matched.length / required.length;
}

function scoreLanguageMatch(requiredLanguages = [], volunteer = {}) {
  const required = normalizeArray(requiredLanguages);
  if (!required.length) {
    return 1;
  }

  const volunteerLanguages = normalizeArray(volunteer.languages).map(normalizeToken);
  const matched = required.filter((language) => volunteerLanguages.includes(normalizeToken(language)));
  return matched.length / required.length;
}

function urgencyToScore(task = {}) {
  const explicit = Number(task.urgencyScore ?? task.metadata?.urgencyScore);
  if (Number.isFinite(explicit)) {
    return Math.max(0, explicit);
  }

  const severityScores = { critical: 1, urgent: 0.7, stable: 0.35 };
  return severityScores[task.severity] ?? 0.5;
}

function volunteerReliabilityScore(volunteer = {}) {
  return Number(volunteer.user?.trustScore ?? volunteer.reliabilityScore ?? 0.5) || 0.5;
}

function dispatchScore({ task, volunteer, route }) {
  const routeTimeSeconds = Math.max(Number(route.durationSeconds || 0), 60);
  const skillMatchLevel = scoreSkillMatch(task.requiredSkills, volunteer);
  const languageMatchLevel = scoreLanguageMatch(
    normalizeArray(task.preferredLanguages).length ? task.preferredLanguages : preferredLanguagesForTask(task),
    volunteer
  );
  const urgencyScore = urgencyToScore(task);
  const reliabilityScore = volunteerReliabilityScore(volunteer);
  const weights = { skill: 5, route: 180, urgency: 2, reliability: 2, language: 2 };
  const score =
    weights.skill * skillMatchLevel +
    weights.route * (1 / routeTimeSeconds) +
    weights.urgency * urgencyScore +
    weights.reliability * reliabilityScore +
    weights.language * languageMatchLevel;

  return {
    score,
    skillMatchLevel,
    languageMatchLevel,
    urgencyScore,
    reliabilityScore,
    routeTimeSeconds,
    routeDistanceMeters: route.distanceMeters,
    routeProvider: route.provider
  };
}

async function findAvailableVolunteersNear(location, radiusMeters = DISPATCH_DEFAULT_RADIUS_METERS, excludeVolunteerIds = []) {
  const coords = assertValidCoordinates(location.lat, location.lng);
  const excluded = new Set(excludeVolunteerIds.map(String));

  const redisMatches = await queryRedisGeoRadius(DISPATCH_GEO_VOLUNTEERS_KEY, coords, radiusMeters, 50);
  if (redisMatches) {
    const ids = redisMatches.map((row) => row.id).filter((id) => !excluded.has(String(id)));
    if (!ids.length) {
      return [];
    }

    const volunteers = await Volunteer.findAll({
      where: { id: { [Op.in]: ids }, isAvailable: true },
      include: [{ model: User, as: "user", where: { role: "volunteer" } }]
    });
    const byId = new Map(volunteers.map((volunteer) => [String(volunteer.id), volunteer]));
    return ids.map((id) => byId.get(String(id))).filter(Boolean);
  }

  if (!USE_POSTGIS) {
    const volunteers = await Volunteer.findAll({
      where: { isAvailable: true },
      include: [{ model: User, as: "user", where: { role: "volunteer" } }]
    });
    return volunteers
      .filter((volunteer) => !excluded.has(String(volunteer.id)))
      .filter((volunteer) => {
        const volunteerCoords = pointToCoordinates(volunteer.location);
        const distanceKm = haversineKm(coords.lat, coords.lng, volunteerCoords.lat, volunteerCoords.lng);
        return distanceKm !== null && distanceKm * 1000 <= radiusMeters;
      });
  }

  const [rows] = await sequelize.query(
    `
      SELECT v.id
      FROM volunteers v
      JOIN users u ON u.id = v.user_id
      WHERE u.role = 'volunteer'
        AND v.is_available = TRUE
        AND v.location IS NOT NULL
        AND ST_DWithin(
          v.location,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          $3
        )
      ORDER BY v.location <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
      LIMIT 50
    `,
    { bind: [coords.lng, coords.lat, radiusMeters] }
  );

  const ids = rows.map((row) => row.id).filter((id) => !excluded.has(String(id)));
  if (!ids.length) {
    return [];
  }

  return Volunteer.findAll({
    where: { id: { [Op.in]: ids } },
    include: [{ model: User, as: "user", where: { role: "volunteer" } }]
  });
}

async function findOpenTasksNear(location, radiusMeters = DISPATCH_DEFAULT_RADIUS_METERS) {
  const coords = assertValidCoordinates(location.lat, location.lng);
  const redisMatches = await queryRedisGeoRadius(DISPATCH_GEO_TASKS_KEY, coords, radiusMeters, 100);

  if (redisMatches) {
    const ids = redisMatches.map((row) => row.id);
    if (!ids.length) {
      return [];
    }
    const tasks = await Task.findAll({
      where: {
        id: { [Op.in]: ids },
        ...buildLiveTaskWhere({ isAssigned: false })
      },
      include: [{ model: User, as: "ngo" }]
    });
    const byId = new Map(tasks.map((task) => [String(task.id), task]));
    return ids.map((id) => byId.get(String(id))).filter(Boolean);
  }

  if (USE_POSTGIS) {
    const [rows] = await sequelize.query(
      `
        SELECT id
        FROM tasks
        WHERE status = $1
          AND completed_at IS NULL
          AND is_assigned = FALSE
          AND location IS NOT NULL
          AND ST_DWithin(
            location,
            ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
            $4
          )
        ORDER BY location <-> ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography
        LIMIT 100
      `,
      { bind: [TASK_STATUS.OPEN, coords.lng, coords.lat, radiusMeters] }
    );
    return rows.length
      ? Task.findAll({
        where: { id: { [Op.in]: rows.map((row) => row.id) } },
        include: [{ model: User, as: "ngo" }]
      })
      : [];
  }

  const tasks = await Task.findAll({
    where: buildLiveTaskWhere({ isAssigned: false }),
    include: [{ model: User, as: "ngo" }]
  });
  return tasks.filter((task) => {
    const taskCoords = pointToCoordinates(task.location);
    const distanceKm = haversineKm(coords.lat, coords.lng, taskCoords.lat, taskCoords.lng);
    return distanceKm !== null && distanceKm * 1000 <= radiusMeters;
  });
}

async function rankCandidatesForTask(task, options = {}) {
  const taskCoords = pointToCoordinates(task.location);
  const radiusMeters = Number(options.radiusMeters || DISPATCH_DEFAULT_RADIUS_METERS);
  const excludedVolunteerIds = options.excludeVolunteerIds || [];
  const candidates = await findAvailableVolunteersNear(taskCoords, radiusMeters, excludedVolunteerIds);
  const fallbackRanked = candidates.map((volunteer) => {
    const volunteerCoords = pointToCoordinates(volunteer.location);
    const route = routingFallback(taskCoords, volunteerCoords);
    const details = dispatchScore({ task, volunteer, route });
    return { volunteer, volunteerCoords, ...details };
  }).sort((left, right) => right.score - left.score);

  if (!DISPATCH_REMOTE_ROUTING || !ROUTING_ENGINE_URL) {
    return fallbackRanked;
  }

  const refined = await Promise.all(
    fallbackRanked.slice(0, DISPATCH_MAX_ROUTE_CANDIDATES).map(async (candidate) => {
      const route = await computeRouteEstimate(taskCoords, candidate.volunteerCoords, {
        allowRemote: true
      });
      const details = dispatchScore({ task, volunteer: candidate.volunteer, route });
      return { volunteer: candidate.volunteer, volunteerCoords: candidate.volunteerCoords, ...details };
    })
  );

  return [
    ...refined,
    ...fallbackRanked.slice(DISPATCH_MAX_ROUTE_CANDIDATES)
  ].sort((left, right) => right.score - left.score);
}

async function rankTasksForVolunteer(volunteer, options = {}) {
  const volunteerCoords = pointToCoordinates(volunteer.location);
  const radiusMeters = Number(options.radiusMeters || DISPATCH_DEFAULT_RADIUS_METERS);
  const tasks = await findOpenTasksNear(volunteerCoords, radiusMeters);
  const fallbackRanked = tasks.map((task) => {
    const skillMatchLevel = scoreSkillMatch(task.requiredSkills, volunteer);
    const languageMatchLevel = scoreLanguageMatch(
      normalizeArray(task.preferredLanguages).length ? task.preferredLanguages : preferredLanguagesForTask(task),
      volunteer
    );
    if (options.requireFilter !== false && skillMatchLevel <= 0 && languageMatchLevel <= 0) {
      return null;
    }

    const taskCoords = pointToCoordinates(task.location);
    const route = routingFallback(taskCoords, volunteerCoords);
    const details = dispatchScore({ task, volunteer, route });
    return { task, taskCoords, ...details };
  }).filter(Boolean).sort((left, right) => right.score - left.score);

  if (!DISPATCH_REMOTE_ROUTING || !ROUTING_ENGINE_URL) {
    return fallbackRanked;
  }

  const refined = await Promise.all(
    fallbackRanked.slice(0, DISPATCH_MAX_ROUTE_CANDIDATES).map(async (candidate) => {
      const route = await computeRouteEstimate(candidate.taskCoords, volunteerCoords, {
        allowRemote: true
      });
      const details = dispatchScore({ task: candidate.task, volunteer, route });
      return { task: candidate.task, taskCoords: candidate.taskCoords, ...details };
    })
  );

  return [
    ...refined,
    ...fallbackRanked.slice(DISPATCH_MAX_ROUTE_CANDIDATES)
  ].sort((left, right) => right.score - left.score);
}

function sendVolunteerNotification(volunteerId, payload) {
  const id = String(volunteerId);
  const event = {
    id: createId("notification"),
    createdAt: new Date().toISOString(),
    ...payload
  };
  const backlog = volunteerNotificationBacklog.get(id) || [];
  backlog.push(event);
  volunteerNotificationBacklog.set(id, backlog.slice(-20));

  for (const response of volunteerNotificationStreams.get(id) || []) {
    response.write(`event: dispatch\n`);
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  sendVolunteerSocketMessage(id, "dispatch", event);
  return event;
}

function sendVolunteerSocketMessage(volunteerId, type, payload = {}) {
  const sockets = volunteerSocketStreams.get(String(volunteerId));
  if (!sockets?.size) {
    return 0;
  }

  const message = JSON.stringify({
    type,
    createdAt: new Date().toISOString(),
    ...payload
  });
  let sent = 0;
  for (const socket of sockets) {
    if (socket.readyState === 1) {
      socket.send(message);
      sent += 1;
    }
  }
  return sent;
}

function normalizeDispatchMode(value = "") {
  const candidate = String(value || "").trim().toLowerCase();
  if (["self_assign", "self-assign", "volunteer_choice", "manual"].includes(candidate)) {
    return "self_assign";
  }
  return "auto_assign";
}

function parseBooleanLike(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "available"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "busy", "offline"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function enqueueDispatchWork(work) {
  dispatchWorkQueue.push({
    id: createId("dispatch_work"),
    createdAt: new Date().toISOString(),
    ...work
  });

  if (!dispatchWorkScheduled) {
    dispatchWorkScheduled = true;
    setImmediate(processDispatchWorkQueue);
  }
}

async function sendSelfAssignTaskList(volunteer, options = {}) {
  const ranked = await rankTasksForVolunteer(volunteer, {
    radiusMeters: options.radiusMeters,
    requireFilter: true
  });
  const entries = ranked.slice(0, DISPATCH_SELF_ASSIGN_LIMIT);

  sendVolunteerNotification(volunteer.id, {
    type: "task_list_update",
    mode: "self_assign",
    tasks: await Promise.all(
      entries.map(async (entry) => ({
        ...(await buildTaskPayload(entry.task, { role: "volunteer", volunteerProfile: volunteer })),
        match: {
          score: Number(entry.score.toFixed(3)),
          skillMatchLevel: Number(entry.skillMatchLevel.toFixed(3)),
          languageMatchLevel: Number(entry.languageMatchLevel.toFixed(3)),
          reliabilityScore: Number(entry.reliabilityScore.toFixed(3)),
          routeTimeSeconds:
            entry.routeTimeSeconds === null ? null : Math.round(entry.routeTimeSeconds),
          routeDistanceMeters:
            entry.routeDistanceMeters === null ? null : Math.round(entry.routeDistanceMeters),
          routeProvider: entry.routeProvider
        }
      }))
    )
  });

  return entries;
}

async function autoAssignBestTaskForVolunteer(volunteer, options = {}) {
  const ranked = await rankTasksForVolunteer(volunteer, {
    radiusMeters: options.radiusMeters,
    requireFilter: true
  });
  const best = ranked[0];
  if (!best) {
    sendVolunteerNotification(volunteer.id, {
      type: "dispatch_idle",
      reason: "No nearby matching open tasks were found."
    });
    return { assigned: false, reason: "No nearby matching open tasks were found." };
  }

  const result = await assignTaskToVolunteer({
    task: best.task,
    rankedCandidate: { volunteer, ...best },
    mode: "auto_assign"
  });
  await indexVolunteerInRedis(volunteer, { isAvailable: false });
  await indexTaskInRedis(best.task, { active: false });

  return {
    assigned: true,
    taskId: best.task.id,
    volunteerId: volunteer.id,
    assignmentId: result.assignment.id,
    score: Number(best.score.toFixed(3))
  };
}

async function recordDispatchOutcome({
  task,
  volunteer = null,
  assignment = null,
  outcome,
  notes = "",
  correction = {}
}) {
  const normalizedOutcome = String(outcome || "").trim().toLowerCase();
  const allowed = new Set(["completed", "cancelled", "canceled", "false", "declined", "accepted"]);
  if (!allowed.has(normalizedOutcome)) {
    const error = new Error("Dispatch outcome must be completed, cancelled, false, declined, or accepted.");
    error.statusCode = 400;
    throw error;
  }

  const storedOutcome = normalizedOutcome === "canceled" ? "cancelled" : normalizedOutcome;
  const outcomeRecord = await DispatchOutcome.create({
    id: createId("dispatch_outcome"),
    taskId: task.id,
    volunteerId: volunteer?.id || assignment?.volunteerId || null,
    assignmentId: assignment?.id || null,
    outcome: storedOutcome,
    notes: String(notes || "").trim(),
    correction: correction && typeof correction === "object" ? correction : {}
  });

  if (storedOutcome === "completed" && volunteer?.userId) {
    await sequelize.query(
      `
        UPDATE users
        SET reports_total = reports_total + 1,
            reports_confirmed = reports_confirmed + 1,
            trust_score = (reports_confirmed + 2)::float / (reports_total + 3)
        WHERE id = $1
      `,
      { bind: [volunteer.userId] }
    );
  }

  if (storedOutcome === "false" && task.ngoId) {
    await sequelize.query(
      `
        UPDATE users
        SET reports_total = reports_total + 1,
            trust_score = (reports_confirmed + 1)::float / (reports_total + 3)
        WHERE id = $1
      `,
      { bind: [task.ngoId] }
    );
  }

  return outcomeRecord;
}

async function processDispatchWorkQueue() {
  dispatchWorkScheduled = false;
  if (dispatchWorkRunning) {
    return;
  }

  dispatchWorkRunning = true;
  try {
    while (dispatchWorkQueue.length) {
      const work = dispatchWorkQueue.shift();
      try {
        if (work.kind === "new_task") {
          const task = await Task.findByPk(work.taskId);
          if (!task || task.status !== TASK_STATUS.OPEN || task.isAssigned || task.completedAt) {
            continue;
          }

          await indexTaskInRedis(task);
          const taskCoords = pointToCoordinates(task.location);
          const rankedVolunteers = await rankCandidatesForTask(task, {
            radiusMeters: work.radiusMeters
          });
          const selfAssignVolunteers = [];
          for (const candidate of rankedVolunteers) {
            const mode =
              work.mode === "self_assign"
                ? "self_assign"
                : volunteerDispatchModes.get(String(candidate.volunteer.id)) || "auto_assign";

            if (mode === "self_assign") {
              selfAssignVolunteers.push(candidate.volunteer);
              continue;
            }

            await assignTaskToVolunteer({
              task,
              rankedCandidate: candidate,
              mode: "auto_assign"
            });
            await indexTaskInRedis(task, { coords: taskCoords, active: false });
            break;
          }

          for (const volunteer of selfAssignVolunteers) {
            await sendSelfAssignTaskList(volunteer, { radiusMeters: work.radiusMeters });
          }
          continue;
        }

        if (work.kind === "volunteer_available") {
          const volunteer = await Volunteer.findByPk(work.volunteerId, {
            include: [{ model: User, as: "user", where: { role: "volunteer" } }]
          });
          if (!volunteer || !volunteer.isAvailable) {
            continue;
          }

          await indexVolunteerInRedis(volunteer);
          const mode = normalizeDispatchMode(work.mode || volunteerDispatchModes.get(String(volunteer.id)));
          if (mode === "self_assign") {
            await sendSelfAssignTaskList(volunteer, { radiusMeters: work.radiusMeters });
          } else {
            await autoAssignBestTaskForVolunteer(volunteer, { radiusMeters: work.radiusMeters });
          }
        }
      } catch (error) {
        console.warn(`Dispatch work item failed: ${error.message}`);
      }
    }
  } finally {
    dispatchWorkRunning = false;
    if (dispatchWorkQueue.length && !dispatchWorkScheduled) {
      dispatchWorkScheduled = true;
      setImmediate(processDispatchWorkQueue);
    }
  }
}

async function assignTaskToVolunteer({ task, rankedCandidate, mode = "auto_assign", transaction = null }) {
  const volunteer = rankedCandidate.volunteer;
  const [assignment] = await Assignment.findOrCreate({
    where: { taskId: task.id, volunteerId: volunteer.id },
    defaults: {
      id: createId("assignment"),
      taskId: task.id,
      volunteerId: volunteer.id,
      assignedAt: new Date(),
      status: mode === "volunteer_choice" ? "active" : "pending",
      matchScore: rankedCandidate.score
    },
    transaction
  });

  await assignment.update(
    {
      status: mode === "volunteer_choice" ? "active" : "pending",
      matchScore: rankedCandidate.score,
      assignedAt: new Date()
    },
    { transaction }
  );

  await task.update(
    {
      isAssigned: true,
      status: mode === "volunteer_choice" ? TASK_STATUS.OPEN : TASK_STATUS.AUTO_ACCEPTED,
      updatedAt: new Date()
    },
    { transaction }
  );

  await volunteer.update({ isAvailable: false }, { transaction });

  const taskCoords = pointToCoordinates(task.location);
  setSpatialMembership({ kind: "task", id: task.id, latitude: taskCoords.lat, longitude: taskCoords.lng, active: false });
  const volunteerCoords = pointToCoordinates(volunteer.location);
  if (Number.isFinite(volunteerCoords.lat) && Number.isFinite(volunteerCoords.lng)) {
    setSpatialMembership({
      kind: "volunteer",
      id: volunteer.id,
      latitude: volunteerCoords.lat,
      longitude: volunteerCoords.lng,
      active: false
    });
  }
  await Promise.all([
    indexTaskInRedis(task, { coords: taskCoords, active: false }),
    indexVolunteerInRedis(volunteer, { coords: volunteerCoords, isAvailable: false })
  ]);

  const notification = sendVolunteerNotification(volunteer.id, {
    type: "task_assigned",
    mode,
    task: {
      id: task.id,
      title: task.title,
      description: task.description,
      requiredSkills: task.requiredSkills || [],
      requiredLanguages: normalizeArray(task.preferredLanguages).length
        ? task.preferredLanguages
        : preferredLanguagesForTask(task),
      urgencyScore: urgencyToScore(task),
      location: taskCoords
    },
    score: Number(rankedCandidate.score.toFixed(3)),
    routeTimeSeconds: rankedCandidate.routeTimeSeconds,
    routeDistanceMeters: rankedCandidate.routeDistanceMeters,
    routeProvider: rankedCandidate.routeProvider
  });

  return { assignment, notification };
}

async function dispatchTask(task, options = {}) {
  const excludedVolunteerIds = new Set(options.excludeVolunteerIds || []);
  const declinedRows = await Assignment.findAll({
    where: {
      taskId: task.id,
      status: { [Op.in]: ["cancelled", "declined"] }
    }
  });
  declinedRows.forEach((assignment) => excludedVolunteerIds.add(assignment.volunteerId));

  const ranked = await rankCandidatesForTask(task, {
    radiusMeters: options.radiusMeters,
    excludeVolunteerIds: [...excludedVolunteerIds]
  });

  if (!ranked.length) {
    return {
      assigned: false,
      candidates: [],
      reason: "No available volunteers were found inside the dispatch radius."
    };
  }

  const best = ranked[0];
  const assignmentResult = await assignTaskToVolunteer({
    task,
    rankedCandidate: best,
    mode: options.mode || "auto_assign"
  });

  return {
    assigned: true,
    volunteerId: best.volunteer.id,
    volunteerUserId: best.volunteer.userId,
    score: Number(best.score.toFixed(3)),
    ranking: ranked.map((candidate) => ({
      volunteerId: candidate.volunteer.id,
      volunteerUserId: candidate.volunteer.userId,
      score: Number(candidate.score.toFixed(3)),
      skillMatchLevel: Number(candidate.skillMatchLevel.toFixed(3)),
      languageMatchLevel: Number(candidate.languageMatchLevel.toFixed(3)),
      reliabilityScore: Number(candidate.reliabilityScore.toFixed(3)),
      routeTimeSeconds: Math.round(candidate.routeTimeSeconds),
      routeDistanceMeters:
        candidate.routeDistanceMeters === null ? null : Math.round(candidate.routeDistanceMeters),
      routeProvider: candidate.routeProvider
    })),
    notification: assignmentResult.notification
  };
}

/*
Dispatch loop:
onNewTask(task):
  candidates = findAvailableVolunteersNear(task.location)
  ranked = rankCandidatesForTask(candidates, task)
  best = ranked[0] // highest hybrid score; partial skill matches remain eligible
  assignTaskToVolunteer(best, task)
  notifyVolunteer(best, task)

Volunteer movement can call dispatchTask for nearby unassigned tasks after updating the
volunteer's H3 cell and PostGIS point. The prototype returns candidate rematch hints
from the location endpoint so a production worker can decide whether to auto-run them.

Volunteer app UI notes:
Auto-assign mode shows an incoming task sheet with task details, ETA, and one-tap
Accept/Decline actions. Volunteer-choice mode shows GET /tasks/nearby results as a
list or map sorted by route distance/urgency; selecting a task calls POST /tasks/{id}/accept.
*/

function buildToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email,
      companyId: user.companyId || null
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function parseAuthorizationToken(request) {
  let token = null;
  const authHeader = request.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else if (request.query && request.query.token) {
    token = request.query.token;
  }

  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

function parseDateFilter(value, boundary = "start") {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (boundary === "start") {
    date.setHours(0, 0, 0, 0);
  } else {
    date.setHours(23, 59, 59, 999);
  }

  return date;
}

function buildDateRange(query = {}, body = {}) {
  return {
    startDate: parseDateFilter(query.startDate || body.startDate, "start"),
    endDate: parseDateFilter(query.endDate || body.endDate, "end")
  };
}

function buildDateWhere(field, startDate, endDate) {
  const conditions = {};

  if (startDate) {
    conditions[Op.gte] = startDate;
  }

  if (endDate) {
    conditions[Op.lte] = endDate;
  }

  if (!Object.keys(conditions).length) {
    return {};
  }

  return { [field]: conditions };
}

function formatTimeAgo(isoValue) {
  const timestamp = new Date(isoValue);
  if (Number.isNaN(timestamp.getTime())) {
    return "Unknown";
  }

  return timestamp.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit"
  });
}

function readTimestamp(record, preferredKey, fallbackKey) {
  if (!record) {
    return null;
  }

  const directValue = record[preferredKey] || record[fallbackKey];
  if (directValue) {
    return directValue instanceof Date ? directValue : new Date(directValue);
  }

  if (typeof record.get === "function") {
    const value =
      record.get(preferredKey) ||
      record.get(fallbackKey) ||
      record.get(preferredKey === "updatedAt" ? "updated_at" : "created_at") ||
      null;
    return value ? (value instanceof Date ? value : new Date(value)) : null;
  }

  return null;
}

function clampConfidence(value, fallback = 0.5) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, parsed));
}

function stripMarkdownCodeFence(text = "") {
  return String(text || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function parseModelJson(text = "", fallback = {}) {
  const candidate = stripMarkdownCodeFence(text);
  if (!candidate) {
    return fallback;
  }

  try {
    return JSON.parse(candidate);
  } catch (error) {
    const match = candidate.match(/\{[\s\S]*\}/);
    if (!match) {
      return fallback;
    }

    try {
      return JSON.parse(match[0]);
    } catch (nestedError) {
      return fallback;
    }
  }
}

function uniqueValues(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizePhoneValue(value = "") {
  return String(value || "")
    .replace(/[^\d+]/g, "")
    .slice(0, 16);
}

function normalizeGovIdLast4(value = "") {
  return String(value || "").replace(/\D/g, "").slice(-4);
}

function normalizeVaccinationStatus(value = "") {
  const candidate = String(value || "")
    .trim()
    .toLowerCase();
  if (["up_to_date", "partial", "unknown", "not_disclosed"].includes(candidate)) {
    return candidate;
  }
  return "unknown";
}

function inferImageMimeType(filePath, fallbackMimeType = "") {
  const normalizedFallback = String(fallbackMimeType || "").toLowerCase();
  if (normalizedFallback.startsWith("image/")) {
    return normalizedFallback;
  }

  const extension = path.extname(filePath || "").toLowerCase();
  const mimeByExtension = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff"
  };

  return mimeByExtension[extension] || "image/jpeg";
}

function detectLanguageHints(text = "") {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return [];
  }

  const detected = [];
  if (/[ऀ-ॿ]/u.test(normalized)) {
    detected.push("Marathi", "Hindi");
  }
  if (/[ఀ-౿]/u.test(normalized)) {
    detected.push("Telugu");
  }
  if (/[ಀ-೿]/u.test(normalized)) {
    detected.push("Kannada");
  }
  if (/[؀-ۿ]/u.test(normalized)) {
    detected.push("Urdu");
  }
  if (/[A-Za-z]/.test(normalized)) {
    detected.push("English");
  }
  return uniqueValues(detected);
}

function extractNumericMentions(text = "") {
  return (String(text || "").match(/\b\d{1,4}\b/g) || [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function hoursSince(value) {
  const timestamp = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return 999;
  }
  return Math.max((Date.now() - timestamp.getTime()) / (1000 * 60 * 60), 0);
}

function severityWeight(severity = "") {
  if (severity === "critical") {
    return 2.4;
  }
  if (severity === "urgent") {
    return 1.5;
  }
  return 1;
}

function computeTimeDecayWeight(value) {
  return Math.exp(-1 * SILENT_NEED_DECAY_LAMBDA * hoursSince(value));
}

function buildVerificationSummary(profile = {}) {
  const missing = [];
  if (!normalizeGovIdLast4(profile.govIdLast4)) {
    missing.push("ID reference");
  }
  if (!String(profile.emergencyContactName || "").trim()) {
    missing.push("emergency contact");
  }
  if (!normalizePhoneValue(profile.emergencyContactPhone)) {
    missing.push("emergency phone");
  }
  if (normalizeVaccinationStatus(profile.vaccinationStatus) === "unknown") {
    missing.push("vaccination status");
  }

  return {
    ready: missing.length === 0,
    missing
  };
}

function requiresBuddy(task = {}) {
  return HIGH_RISK_TASK_TYPES.has(task.type) || task.severity === "critical";
}

function preferredLanguagesForTask(task = {}) {
  const hints = detectLanguageHints(`${task.description || ""} ${task.locationName || ""}`);
  if (!hints.length) {
    return LOCAL_DEFAULT_LANGUAGES;
  }
  return uniqueValues([...LOCAL_DEFAULT_LANGUAGES, ...hints]);
}

function summarizeEvidenceKeywords(text = "", type = "") {
  const normalized = String(text || "").toLowerCase();
  const keywords = ALERT_EVIDENCE_KEYWORDS[type] || [];
  return uniqueValues(keywords.filter((keyword) => normalized.includes(keyword.toLowerCase()))).slice(0, 4);
}

function detectLocation(text = "", fallbackLocationName = "", options = {}) {
  const normalized = String(text || "").toLowerCase();
  const fallback = String(fallbackLocationName || "").toLowerCase();

  for (const [key, value] of Object.entries(LOCALITY_INDEX)) {
    if (normalized.includes(key) || fallback.includes(key)) {
      return value;
    }
  }

  if (options.allowDefault === false) {
    return null;
  }

  return {
    name: fallbackLocationName || "Pune",
    lat: MAP_REFRESH_CENTER.lat,
    lng: MAP_REFRESH_CENTER.lng,
    ngo: "Jeevan Dhara"
  };
}

function inferNeedType(text = "") {
  const normalized = String(text || "").toLowerCase();

  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
      return type;
    }
  }

  return "volunteer";
}

function normalizeNeedType(value = "", fallbackText = "") {
  const candidate = String(value || "").trim().toLowerCase();
  if (!candidate) {
    return inferNeedType(fallbackText);
  }

  if (TYPE_KEYWORDS[candidate]) {
    return candidate;
  }

  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (
      candidate.includes(type) ||
      keywords.some((keyword) => candidate.includes(String(keyword).toLowerCase()))
    ) {
      return type;
    }
  }

  return inferNeedType(`${candidate} ${fallbackText}`);
}

function inferSeverity(text = "") {
  const normalized = String(text || "").toLowerCase();

  for (const [severity, keywords] of Object.entries(SEVERITY_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
      return severity;
    }
  }

  return "urgent";
}

function normalizeSeveritySignal(value = "", fallbackText = "") {
  const candidate = String(value || "").trim().toLowerCase();
  if (["critical", "urgent", "stable"].includes(candidate)) {
    return candidate;
  }
  if (["high", "severe", "emergency", "immediate"].includes(candidate)) {
    return "critical";
  }
  if (["medium", "moderate", "important", "soon"].includes(candidate)) {
    return "urgent";
  }
  if (["low", "routine", "normal"].includes(candidate)) {
    return "stable";
  }
  return inferSeverity(`${candidate} ${fallbackText}`);
}

function inferPeopleServed(type, severity) {
  const base = type === "food" ? 28 : type === "medical" ? 18 : 22;
  const multiplier = severity === "critical" ? 1.5 : severity === "urgent" ? 1.2 : 1;
  return Math.round(base * multiplier);
}

function buildTaskTitle(type, locationName) {
  return `${titleCase(type)} Support - ${locationName}`;
}

function inferPeopleMention(text = "") {
  const values = extractNumericMentions(text);
  if (!values.length) {
    return null;
  }
  return Math.max(...values);
}

function extractNeedSignals(text = "", fallback = {}) {
  const location = detectLocation(text, fallback.locationName);
  const type = normalizeNeedType(fallback.type, text);
  const severity = normalizeSeveritySignal(fallback.severity, text);
  const routingProfile = buildTaskRoutingProfile({
    type,
    severity,
    description: text,
    locationName: location.name,
    requiredSkills: fallback.requiredSkills,
    complementarySkills: fallback.complementarySkills,
    preferredLanguages: fallback.preferredLanguages || fallback.languages,
    preferredCommunicationStyles: fallback.preferredCommunicationStyles,
    contextTags: fallback.contextTags,
    minimumMedicalTraining: fallback.minimumMedicalTraining,
    timeWindows: fallback.timeWindows,
    category: fallback.category
  });
  const evidence = uniqueValues([
    ...normalizeArray(fallback.evidence),
    ...summarizeEvidenceKeywords(text, type)
  ]);
  const peopleMention = fallback.peopleMention || inferPeopleMention(text);

  return {
    type,
    severity,
    locationName: location.name,
    latitude: location.lat,
    longitude: location.lng,
    ngoName: location.ngo,
    title: fallback.title || buildTaskTitle(type, location.name),
    category: routingProfile.category,
    requiredSkills: routingProfile.requiredSkills,
    complementarySkills: routingProfile.complementarySkills,
    evidence,
    preferredLanguages: routingProfile.preferredLanguages,
    preferredCommunicationStyles: routingProfile.preferredCommunicationStyles,
    contextTags: routingProfile.contextTags,
    minimumMedicalTraining: routingProfile.minimumMedicalTraining,
    timeWindows: routingProfile.timeWindows,
    peopleMention
  };
}

function computeMatchScore(task, volunteer, teammates = []) {
  const taskCoords = pointToCoordinates(task.location);
  const volunteerCoords = pointToCoordinates(volunteer.location);
  const routingProfile = buildTaskRoutingProfile({
    type: task.type,
    severity: task.severity,
    description: task.description,
    locationName: task.locationName,
    requiredSkills: task.requiredSkills,
    complementarySkills: task.complementarySkills,
    preferredLanguages: task.preferredLanguages,
    preferredCommunicationStyles: task.preferredCommunicationStyles,
    contextTags: task.contextTags,
    minimumMedicalTraining: task.minimumMedicalTraining,
    timeWindows: task.timeWindows,
    category: task.category
  });
  const taskSkills = normalizeArray(routingProfile.requiredSkills);
  const complementarySkillTargets = normalizeArray(routingProfile.complementarySkills);
  const volunteerSkills = getVolunteerSkillCorpus(volunteer);
  const volunteerLanguages = normalizeArray(volunteer.languages);
  const preferredLanguages = normalizeArray(routingProfile.preferredLanguages);
  const preferredCauses = normalizeArray(volunteer.preferredCauses);
  const preferredCommunicationStyles = normalizeArray(routingProfile.preferredCommunicationStyles);
  const timeWindows = normalizeArray(routingProfile.timeWindows);
  const verification = buildVerificationSummary(volunteer);
  const volunteerAvailability = availabilitySignals(volunteer.availability);
  const currentMedicalRank = medicalTrainingRank(volunteer.medicalTraining);
  const requiredMedicalRank = medicalTrainingRank(routingProfile.minimumMedicalTraining);

  const overlapCount = taskSkills.filter((skill) =>
    volunteerSkills.some((volunteerSkill) => normalizeToken(volunteerSkill) === normalizeToken(skill))
  ).length;
  const languageOverlap = preferredLanguages.filter((language) =>
    volunteerLanguages.some(
      (volunteerLanguage) => normalizeToken(volunteerLanguage) === normalizeToken(language)
    )
  ).length;
  const coveredSkills = new Set(
    teammates
      .flatMap((teammate) => getVolunteerSkillCorpus(teammate))
      .map((skill) => normalizeToken(skill))
  );
  const complementaryCoverage = complementarySkillTargets.filter(
    (skill) =>
      volunteerSkills.some((volunteerSkill) => normalizeToken(volunteerSkill) === normalizeToken(skill)) &&
      !coveredSkills.has(normalizeToken(skill))
  ).length;
  const uniqueSkillContribution = volunteerSkills.filter(
    (skill) => !coveredSkills.has(normalizeToken(skill))
  ).length;
  const causeAlignment = [task.type, routingProfile.category, ...normalizeArray(routingProfile.contextTags)].filter(
    (tag) => preferredCauses.some((cause) => normalizeToken(cause) === normalizeToken(tag))
  ).length;
  const communicationFit = preferredCommunicationStyles.includes(
    normalizeCommunicationStyle(volunteer.communicationStyle)
  )
    ? 1
    : 0;
  const communicationComplement = teammates.length
    ? teammates.every(
      (teammate) =>
        normalizeCommunicationStyle(teammate.communicationStyle) !==
        normalizeCommunicationStyle(volunteer.communicationStyle)
    )
      ? 1
      : 0
    : 0;
  const medicalReadiness = Math.max(currentMedicalRank - requiredMedicalRank, -2);
  const timeWindowOverlap = timeWindows.filter((window) => volunteerAvailability.includes(window)).length;

  const distanceKm = haversineKm(taskCoords.lat, taskCoords.lng, volunteerCoords.lat, volunteerCoords.lng);
  const normalizedDistance = distanceKm === null ? 15 : distanceKm;
  const severityBonus = task.severity === "critical" ? 4 : task.severity === "urgent" ? 2 : 0.5;
  const buddyBonus = requiresBuddy(task) && teammates.length > 0 ? 2 : 0;
  const safetyPenalty = verification.ready ? 0 : verification.missing.length * 1.35;
  const locationBonus = String(volunteer.baseLocation || "")
    .toLowerCase()
    .includes(String(task.locationName || "").toLowerCase())
    ? 1.5
    : 0;
  const healthLanguageBonus =
    task.type === "medical" && languageOverlap > 0 ? languageOverlap * 2.2 : 0;
  const medicalPenalty = currentMedicalRank < requiredMedicalRank ? (requiredMedicalRank - currentMedicalRank) * 4 : 0;
  const totalScore =
    overlapCount * 5 +
    languageOverlap * 3 +
    complementaryCoverage * 3.5 +
    uniqueSkillContribution * 0.4 +
    causeAlignment * 1.8 +
    communicationFit * 1.6 +
    communicationComplement * 1.2 +
    healthLanguageBonus +
    timeWindowOverlap * 1.4 +
    Math.max(medicalReadiness, 0) * 2.5 +
    severityBonus +
    buddyBonus +
    locationBonus -
    normalizedDistance * 0.7 -
    medicalPenalty -
    safetyPenalty;
  const reporterTrustScore = Number(task.ngo?.trustScore ?? task.ngo?.trust_score ?? 0.5);
  const lowTrustPenalty = reporterTrustScore < LOW_TRUST_THRESHOLD ? 8.0 : 0;
  const finalScore = totalScore - lowTrustPenalty;
  const reasons = uniqueValues([
    overlapCount ? `${overlapCount} required skills aligned` : "",
    languageOverlap ? `${languageOverlap} language matches` : "",
    complementaryCoverage ? "covers complementary field skills" : "",
    causeAlignment ? "fits the response context" : "",
    communicationFit ? "communication style matches the task" : "",
    communicationComplement ? "balances the field team communication mix" : "",
    timeWindowOverlap ? "availability lines up with the shift window" : "",
    currentMedicalRank >= requiredMedicalRank && requiredMedicalRank > 0
      ? "medical readiness meets the task threshold"
      : "",
    locationBonus ? "based near the affected ward" : "",
    !verification.ready ? `missing ${verification.missing.join(", ")}` : "safety checks ready"
  ]);

  return {
    overlapCount,
    languageOverlap,
    complementaryCoverage,
    causeAlignment,
    communicationFit,
    timeWindowOverlap,
    medicalReadiness,
    distanceKm,
    score: Number(finalScore.toFixed(2)),
    reasons,
    verification
  };
}

function ensureUploadsDirectory() {
  return fsPromises.mkdir(UPLOAD_DIR, { recursive: true });
}

const uploadStorage = multer.diskStorage({
  destination(request, file, callback) {
    ensureUploadsDirectory()
      .then(() => callback(null, UPLOAD_DIR))
      .catch((error) => callback(error));
  },
  filename(request, file, callback) {
    const extension = path.extname(file.originalname || "") || "";
    callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  }
});

const upload = multer({
  storage: uploadStorage,
  limits: {
    fileSize: 20 * 1024 * 1024
  }
});

const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    passwordHash: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "password_hash"
    },
    role: {
      type: DataTypes.STRING,
      allowNull: false
    },
    companyId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "company_id"
    },
    trustScore: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0.5,
      field: "trust_score"
    },
    reportsTotal: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "reports_total"
    },
    reportsConfirmed: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "reports_confirmed"
    },
    points: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    badges: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: []
    }
  },
  {
    tableName: "users",
    timestamps: false
  }
);

const Volunteer = sequelize.define(
  "Volunteer",
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      field: "user_id"
    },
    skills: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: []
    },
    technicalSkills: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: [],
      field: "technical_skills"
    },
    languages: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: []
    },
    medicalTraining: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "none",
      field: "medical_training"
    },
    communicationStyle: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "community_bridge",
      field: "communication_style"
    },
    preferredCauses: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: [],
      field: "preferred_causes"
    },
    availability: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: ""
    },
    baseLocation: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "base_location"
    },
    govIdLast4: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "gov_id_last4"
    },
    emergencyContactName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "emergency_contact_name"
    },
    emergencyContactPhone: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "emergency_contact_phone"
    },
    vaccinationStatus: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "unknown",
      field: "vaccination_status"
    },
    isAvailable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "is_available"
    },
    location: {
      type: LOCATION_DATA_TYPE,
      allowNull: true
    }
  },
  {
    tableName: "volunteers",
    timestamps: false
  }
);

const Company = sequelize.define(
  "Company",
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    details: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  },
  {
    tableName: "companies",
    timestamps: false
  }
);

const Task = sequelize.define(
  "Task",
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    ngoId: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "ngo_id"
    },
    companyId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "company_id"
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false
    },
    severity: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    source: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: "manual"
    },
    locationName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "location_name"
    },
    requiredSkills: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: [],
      field: "required_skills"
    },
    complementarySkills: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: [],
      field: "complementary_skills"
    },
    preferredLanguages: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: [],
      field: "preferred_languages"
    },
    preferredCommunicationStyles: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: [],
      field: "preferred_communication_styles"
    },
    contextTags: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: [],
      field: "context_tags"
    },
    minimumMedicalTraining: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "none",
      field: "minimum_medical_training"
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "operations"
    },
    timeWindows: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: [],
      field: "time_windows"
    },
    peopleServed: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "people_served"
    },
    location: {
      type: LOCATION_DATA_TYPE,
      allowNull: true
    },
    isAssigned: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "is_assigned"
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: TASK_STATUS.OPEN
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "completed_at"
    },
    rejectedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "rejected_at"
    },
    confirmationCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: "confirmation_count"
    },
    gpsLat: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: "gps_lat"
    },
    gpsLng: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: "gps_lng"
    },
    reportedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "reported_at"
    },
    mediaUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "media_url"
    },
    contentHash: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "content_hash"
    }
  },
  {
    tableName: "tasks",
    createdAt: "created_at",
    updatedAt: "updated_at"
  }
);

const TaskConfirmation = sequelize.define(
  "TaskConfirmation",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    taskId: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "task_id"
    },
    reporterId: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "reporter_id"
    },
    gpsLat: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: "gps_lat"
    },
    gpsLng: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: "gps_lng"
    },
    reportedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "reported_at"
    }
  },
  {
    tableName: "task_confirmations",
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ["task_id", "reporter_id"]
      }
    ]
  }
);

const Assignment = sequelize.define(
  "Assignment",
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    taskId: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "task_id"
    },
    volunteerId: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "volunteer_id"
    },
    assignedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "assigned_at"
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "pending"
    },
    matchScore: {
      type: DataTypes.DECIMAL(10, 3),
      allowNull: false,
      defaultValue: 0,
      field: "match_score"
    }
  },
  {
    tableName: "assignments",
    timestamps: false
  }
);

const DispatchOutcome = sequelize.define(
  "DispatchOutcome",
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    taskId: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "task_id"
    },
    volunteerId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "volunteer_id"
    },
    assignmentId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "assignment_id"
    },
    outcome: {
      type: DataTypes.STRING,
      allowNull: false
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    correction: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    }
  },
  {
    tableName: "dispatch_outcomes",
    createdAt: "created_at",
    updatedAt: false
  }
);

const Contribution = sequelize.define(
  "Contribution",
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    companyId: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "company_id"
    },
    volunteerHours: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      field: "volunteer_hours"
    },
    funds: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false
    },
    date: {
      type: DataTypes.DATE,
      allowNull: false
    }
  },
  {
    tableName: "contributions",
    timestamps: false
  }
);

const CSRReport = sequelize.define(
  "CSRReport",
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    companyId: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "company_id"
    },
    filePath: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: "file_path"
    },
    generatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "generated_at"
    }
  },
  {
    tableName: "csr_reports",
    timestamps: false
  }
);

const Message = sequelize.define(
  "Message",
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    phoneNumber: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "phone_number"
    },
    direction: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "incoming"
    },
    fromUser: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: "from_user"
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    mediaUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "media_url"
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    tableName: "messages",
    timestamps: false
  }
);

const Review = sequelize.define(
  "Review",
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    taskId: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "task_id"
    },
    source: {
      type: DataTypes.STRING,
      allowNull: false
    },
    rawText: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "raw_text"
    },
    confidence: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "pending"
    },
    suggestedType: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "suggested_type"
    },
    suggestedSeverity: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "suggested_severity"
    },
    suggestedLocation: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "suggested_location"
    },
    correctedPayload: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: "corrected_payload"
    }
  },
  {
    tableName: "reviews",
    createdAt: "created_at",
    updatedAt: "updated_at"
  }
);

const IntakeSession = sequelize.define(
  "IntakeSession",
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    phoneNumber: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      field: "phone_number"
    },
    step: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "awaiting_location"
    },
    pendingPayload: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: "pending_payload"
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "user_id"
    },
    lastInboundAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "last_inbound_at"
    }
  },
  {
    tableName: "intake_sessions",
    timestamps: false
  }
);

const SOSAlert = sequelize.define(
  "SOSAlert",
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    volunteerId: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "volunteer_id"
    },
    volunteerName: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "Unknown",
      field: "volunteer_name"
    },
    latitude: {
      type: DataTypes.DOUBLE,
      allowNull: true
    },
    longitude: {
      type: DataTypes.DOUBLE,
      allowNull: true
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "active"
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "resolved_at"
    }
  },
  {
    tableName: "sos_alerts",
    createdAt: "created_at",
    updatedAt: false
  }
);

const TaskFeedback = sequelize.define(
  "TaskFeedback",
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    taskId: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "task_id"
    },
    volunteerId: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "volunteer_id"
    },
    rating: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3
    },
    verified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    comments: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  },
  {
    tableName: "task_feedback",
    createdAt: "created_at",
    updatedAt: false
  }
);

User.hasOne(Volunteer, { foreignKey: "user_id", as: "volunteerProfile" });
Volunteer.belongsTo(User, { foreignKey: "user_id", as: "user" });

User.belongsTo(Company, { foreignKey: "company_id", as: "company" });
Company.hasMany(User, { foreignKey: "company_id", as: "users" });

Task.belongsTo(User, { foreignKey: "ngo_id", as: "ngo" });
User.hasMany(Task, { foreignKey: "ngo_id", as: "ngoTasks" });

Task.belongsTo(Company, { foreignKey: "company_id", as: "company" });
Company.hasMany(Task, { foreignKey: "company_id", as: "tasks" });

TaskConfirmation.belongsTo(Task, { foreignKey: "task_id", as: "task" });
Task.hasMany(TaskConfirmation, { foreignKey: "task_id", as: "confirmations" });

TaskConfirmation.belongsTo(User, { foreignKey: "reporter_id", as: "reporter" });
User.hasMany(TaskConfirmation, { foreignKey: "reporter_id", as: "taskConfirmations" });

Assignment.belongsTo(Task, { foreignKey: "task_id", as: "task" });
Task.hasMany(Assignment, { foreignKey: "task_id", as: "assignments" });

Assignment.belongsTo(Volunteer, { foreignKey: "volunteer_id", as: "volunteer" });
Volunteer.hasMany(Assignment, { foreignKey: "volunteer_id", as: "assignments" });

DispatchOutcome.belongsTo(Task, { foreignKey: "task_id", as: "task" });
Task.hasMany(DispatchOutcome, { foreignKey: "task_id", as: "dispatchOutcomes" });

DispatchOutcome.belongsTo(Volunteer, { foreignKey: "volunteer_id", as: "volunteer" });
Volunteer.hasMany(DispatchOutcome, { foreignKey: "volunteer_id", as: "dispatchOutcomes" });

DispatchOutcome.belongsTo(Assignment, { foreignKey: "assignment_id", as: "assignment" });
Assignment.hasMany(DispatchOutcome, { foreignKey: "assignment_id", as: "outcomes" });

Contribution.belongsTo(Company, { foreignKey: "company_id", as: "company" });
Company.hasMany(Contribution, { foreignKey: "company_id", as: "contributions" });

CSRReport.belongsTo(Company, { foreignKey: "company_id", as: "company" });
Company.hasMany(CSRReport, { foreignKey: "company_id", as: "reports" });

Review.belongsTo(Task, { foreignKey: "task_id", as: "task" });
Task.hasMany(Review, { foreignKey: "task_id", as: "reviews" });

SOSAlert.belongsTo(Volunteer, { foreignKey: "volunteer_id", as: "volunteer" });
Volunteer.hasMany(SOSAlert, { foreignKey: "volunteer_id", as: "sosAlerts" });

TaskFeedback.belongsTo(Task, { foreignKey: "task_id", as: "task" });
Task.hasMany(TaskFeedback, { foreignKey: "task_id", as: "feedback" });

TaskFeedback.belongsTo(Volunteer, { foreignKey: "volunteer_id", as: "volunteer" });
Volunteer.hasMany(TaskFeedback, { foreignKey: "volunteer_id", as: "feedback" });

async function waitForDatabaseConnection() {
  for (let attempt = 1; attempt <= DB_CONNECTION_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await sequelize.authenticate();
      return;
    } catch (error) {
      if (!shouldRetryDatabaseConnection(error) || attempt === DB_CONNECTION_RETRY_ATTEMPTS) {
        throw error;
      }

      console.warn(
        `Database connection attempt ${attempt}/${DB_CONNECTION_RETRY_ATTEMPTS} failed for ${DISPLAY_DATABASE_URL}. Retrying in ${DB_CONNECTION_RETRY_DELAY_MS}ms.`
      );
      await delay(DB_CONNECTION_RETRY_DELAY_MS);
    }
  }
}

async function ensureDatabase() {
  await waitForDatabaseConnection();

  if (USE_POSTGIS) {
    await sequelize.query("CREATE EXTENSION IF NOT EXISTS postgis;");
  }
  await sequelize.sync();
  await sequelize.query(
    "ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS technical_skills TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];"
  );
  await sequelize.query(
    "ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS medical_training VARCHAR(64) NOT NULL DEFAULT 'none';"
  );
  await sequelize.query(
    "ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS communication_style VARCHAR(64) NOT NULL DEFAULT 'community_bridge';"
  );
  await sequelize.query(
    "ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS preferred_causes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];"
  );
  await sequelize.query(
    "ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS gov_id_last4 VARCHAR(4);"
  );
  await sequelize.query(
    "ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(255);"
  );
  await sequelize.query(
    "ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(32);"
  );
  await sequelize.query(
    "ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS vaccination_status VARCHAR(32) NOT NULL DEFAULT 'unknown';"
  );
  await sequelize.query(
    "ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT TRUE;"
  );
  await sequelize.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS trust_score FLOAT NOT NULL DEFAULT 0.5;"
  );
  await sequelize.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS reports_total INT NOT NULL DEFAULT 0;"
  );
  await sequelize.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS reports_confirmed INT NOT NULL DEFAULT 0;"
  );
  await sequelize.query(
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS complementary_skills TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];"
  );
  await sequelize.query(
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS preferred_languages TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];"
  );
  await sequelize.query(
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS preferred_communication_styles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];"
  );
  await sequelize.query(
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS context_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];"
  );
  await sequelize.query(
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS minimum_medical_training VARCHAR(64) NOT NULL DEFAULT 'none';"
  );
  await sequelize.query(
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS category VARCHAR(64) NOT NULL DEFAULT 'operations';"
  );
  await sequelize.query(
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS time_windows TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];"
  );
  await sequelize.query(
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT '${TASK_STATUS.OPEN}';`
  );
  await sequelize.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'tasks_status_check'
          AND conrelid = 'tasks'::regclass
      ) THEN
        ALTER TABLE tasks DROP CONSTRAINT tasks_status_check;
      END IF;
    END $$;
  `);
  await sequelize.query(
    "ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (status IN ('open', 'in_progress', 'completed', 'resolved', 'pending_review', 'pending_vetting', 'pending', 'confirmed', 'rejected', 'auto_accepted')) NOT VALID;"
  ).catch((error) => {
    if (!/already exists/i.test(error.message)) {
      throw error;
    }
  });
  await sequelize.query(
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP WITH TIME ZONE;"
  );
  await sequelize.query(
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS confirmation_count INT NOT NULL DEFAULT 1;"
  );
  await sequelize.query(
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS gps_lat DOUBLE PRECISION;"
  );
  await sequelize.query(
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS gps_lng DOUBLE PRECISION;"
  );
  await sequelize.query(
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();"
  );
  await sequelize.query(
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS media_url TEXT;"
  );
  await sequelize.query(
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS content_hash VARCHAR;"
  );
  await sequelize.query(
    "CREATE TABLE IF NOT EXISTS task_confirmations (id SERIAL PRIMARY KEY, task_id VARCHAR REFERENCES tasks(id) ON DELETE CASCADE, reporter_id VARCHAR REFERENCES users(id) ON DELETE CASCADE, gps_lat DOUBLE PRECISION, gps_lng DOUBLE PRECISION, reported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), UNIQUE(task_id, reporter_id));"
  );
  await sequelize.query(
    "ALTER TABLE assignments ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'pending';"
  );
  await sequelize.query(
    "ALTER TABLE assignments ADD COLUMN IF NOT EXISTS match_score NUMERIC(10, 3) NOT NULL DEFAULT 0;"
  );
  await sequelize.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'assignments_status_check'
          AND conrelid = 'assignments'::regclass
      ) THEN
        ALTER TABLE assignments DROP CONSTRAINT assignments_status_check;
      END IF;
    END $$;
  `);
  await sequelize.query(
    "ALTER TABLE assignments ADD CONSTRAINT assignments_status_check CHECK (status IN ('pending', 'active', 'completed', 'cancelled', 'declined')) NOT VALID;"
  ).catch((error) => {
    if (!/already exists/i.test(error.message)) {
      throw error;
    }
  });
  await sequelize.query(
    "CREATE INDEX IF NOT EXISTS assignments_task_status_idx ON assignments (task_id, status);"
  );
  await sequelize.query(
    "CREATE INDEX IF NOT EXISTS volunteers_available_idx ON volunteers (is_available);"
  );
  await sequelize.query(
    `UPDATE tasks SET status = '${TASK_STATUS.COMPLETED}' WHERE completed_at IS NOT NULL;`
  );
  await sequelize.query(
    `UPDATE tasks SET status = '${TASK_STATUS.PENDING_REVIEW}' WHERE id IN (SELECT task_id FROM reviews WHERE status = 'pending');`
  );
  if (USE_POSTGIS) {
    await sequelize.query("CREATE INDEX IF NOT EXISTS volunteers_location_idx ON volunteers USING GIST (location);");
    await sequelize.query("CREATE INDEX IF NOT EXISTS tasks_location_idx ON tasks USING GIST (location);");
  }
  await sequelize.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS points INT NOT NULL DEFAULT 0;"
  );
  await sequelize.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS badges TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];"
  );
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS sos_alerts (
      id VARCHAR PRIMARY KEY,
      volunteer_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
      volunteer_name VARCHAR NOT NULL DEFAULT 'Unknown',
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      status VARCHAR NOT NULL DEFAULT 'active',
      resolved_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS task_feedback (
      id VARCHAR PRIMARY KEY,
      task_id VARCHAR REFERENCES tasks(id) ON DELETE CASCADE,
      volunteer_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
      rating INT NOT NULL DEFAULT 3,
      verified BOOLEAN NOT NULL DEFAULT TRUE,
      comments TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
}

async function ensureDirectories() {
  await fsPromises.mkdir(REPORTS_DIR, { recursive: true });
  await fsPromises.mkdir(UPLOAD_DIR, { recursive: true });
}

async function seedDatabase() {
  const existingUsers = await User.count();
  if (existingUsers > 0) {
    return;
  }

  const raw = await fsPromises.readFile(SEED_DATA_FILE, "utf8");
  const seed = JSON.parse(raw);

  const companyIdMap = new Map();
  for (const company of seed.companies || []) {
    const created = await Company.create({
      id: company.id,
      name: company.name,
      details:
        company.details ||
        `${company.name} contributes funds and volunteer hours into HelpHive response lanes.`
    });
    companyIdMap.set(company.id, created.id);
  }

  const userIdToVolunteerId = new Map();
  const ngoUsers = [];

  for (const seededUser of seed.users || []) {
    const normalizedRole = normalizeRole(seededUser.role) || "volunteer";

    const createdUser = await User.create({
      id: seededUser.id,
      name: seededUser.name,
      email: seededUser.email.toLowerCase(),
      passwordHash: seededUser.passwordHash,
      role: normalizedRole,
      companyId: seededUser.companyId || null
    });

    const volunteerProfile = await Volunteer.create({
      id: createId("volunteer"),
      userId: createdUser.id,
      skills: normalizeArray(seededUser.skills),
      technicalSkills: normalizeArray(seededUser.technicalSkills),
      languages: normalizeArray(seededUser.languages),
      medicalTraining: normalizeMedicalTraining(seededUser.medicalTraining),
      communicationStyle: normalizeCommunicationStyle(seededUser.communicationStyle),
      preferredCauses: normalizeArray(seededUser.preferredCauses),
      availability: seededUser.availability || "",
      baseLocation: seededUser.baseLocation || "",
      location: pointFromCoordinates(seededUser.latitude, seededUser.longitude)
    });

    userIdToVolunteerId.set(createdUser.id, volunteerProfile.id);

    if (createdUser.role === "ngo" || createdUser.role === "admin") {
      ngoUsers.push(createdUser);
    }
  }

  const fallbackNgo = ngoUsers[0];

  for (const task of seed.tasks || []) {
    const locationSeed =
      detectLocation(task.notes || task.title || task.locationName, task.locationName) ||
      detectLocation(task.locationName);
    const ngoUser = ngoUsers.find((user) => user.name.includes(locationSeed.ngo)) || fallbackNgo;
    const routingProfile = buildTaskRoutingProfile({
      type: task.type,
      severity: task.severity,
      description: task.notes || task.title,
      locationName: task.locationName || locationSeed.name,
      requiredSkills: task.requiredSkills,
      complementarySkills: task.complementarySkills,
      preferredLanguages: task.preferredLanguages,
      preferredCommunicationStyles: task.preferredCommunicationStyles,
      contextTags: task.contextTags,
      minimumMedicalTraining: task.minimumMedicalTraining,
      timeWindows: task.timeWindows,
      category: task.category
    });
    const createdTask = await Task.create({
      id: task.id,
      ngoId: ngoUser ? ngoUser.id : fallbackNgo.id,
      companyId: task.sponsorCompanyId || null,
      title: task.title,
      type: task.type,
      severity: normalizeSeverity(task.severity),
      description: task.notes || task.title,
      source: "seed",
      locationName: task.locationName || locationSeed.name,
      category: routingProfile.category,
      requiredSkills: routingProfile.requiredSkills,
      complementarySkills: routingProfile.complementarySkills,
      preferredLanguages: routingProfile.preferredLanguages,
      preferredCommunicationStyles: routingProfile.preferredCommunicationStyles,
      contextTags: routingProfile.contextTags,
      minimumMedicalTraining: routingProfile.minimumMedicalTraining,
      timeWindows: routingProfile.timeWindows,
      peopleServed: task.status === "completed" ? inferPeopleServed(task.type, task.severity) : 0,
      location: pointFromCoordinates(task.latitude, task.longitude),
      isAssigned: Boolean((task.assignedVolunteerIds || []).length),
      status: normalizeTaskStatus(
        task.status,
        task.completedAt ? TASK_STATUS.COMPLETED : TASK_STATUS.OPEN
      ),
      createdAt: task.createdAt ? new Date(task.createdAt) : new Date(),
      updatedAt: task.updatedAt ? new Date(task.updatedAt) : new Date(),
      completedAt: task.completedAt ? new Date(task.completedAt) : null,
      rejectedAt: task.rejectedAt ? new Date(task.rejectedAt) : null
    });

    for (const volunteerUserId of task.assignedVolunteerIds || []) {
      const volunteerId = userIdToVolunteerId.get(volunteerUserId);
      if (!volunteerId) {
        continue;
      }

      await Assignment.create({
        id: createId("assignment"),
        taskId: createdTask.id,
        volunteerId,
        assignedAt: task.updatedAt ? new Date(task.updatedAt) : new Date()
      });
    }
  }

  for (const [companyId] of companyIdMap.entries()) {
    const companyTasks = await Task.findAll({
      where: {
        companyId,
        completedAt: {
          [Op.not]: null
        }
      }
    });

    if (!companyTasks.length) {
      continue;
    }

    const taskGroups = companyTasks.reduce((accumulator, task) => {
      const month = new Date(task.completedAt || task.updatedAt).toISOString().slice(0, 7);
      const bucket = accumulator.get(month) || [];
      bucket.push(task);
      accumulator.set(month, bucket);
      return accumulator;
    }, new Map());

    for (const [month, tasks] of taskGroups.entries()) {
      const monthDate = new Date(`${month}-15T10:00:00.000Z`);
      const volunteerHours = tasks.length * 6;
      const funds = tasks.length * 25000;
      await Contribution.create({
        id: createId("contribution"),
        companyId,
        volunteerHours,
        funds,
        date: monthDate
      });
    }
  }

  for (const message of seed.messages || []) {
    await Message.create({
      id: message.id,
      phoneNumber: message.from,
      direction: "incoming",
      fromUser: message.from,
      body: message.body,
      mediaUrl: message.mediaUrl,
      timestamp: message.createdAt ? new Date(message.createdAt) : new Date()
    });
  }

  const lowConfidenceTasks = await Task.findAll({
    where: {
      completedAt: null,
      severity: {
        [Op.in]: ["critical", "urgent"]
      }
    },
    limit: 1
  });

  if (lowConfidenceTasks[0]) {
    await lowConfidenceTasks[0].update({
      status: TASK_STATUS.PENDING_REVIEW,
      updatedAt: new Date()
    });

    await Review.create({
      id: createId("review"),
      taskId: lowConfidenceTasks[0].id,
      source: "ocr",
      rawText: "पाणी कमी आहे शिवाजीनगर 14 घरे",
      confidence: 0.74,
      status: "pending",
      suggestedType: lowConfidenceTasks[0].type,
      suggestedSeverity: lowConfidenceTasks[0].severity,
      suggestedLocation: lowConfidenceTasks[0].locationName
    });
  }
}

async function getUserWithProfile(userId) {
  return User.findByPk(userId, {
    include: [
      { model: Volunteer, as: "volunteerProfile" },
      { model: Company, as: "company" }
    ]
  });
}

async function getUserFromRequest(request) {
  const payload = parseAuthorizationToken(request);
  if (!payload?.sub) {
    return null;
  }
  return getUserWithProfile(payload.sub);
}

function serializeUser(user, options = {}) {
  const profile = user?.volunteerProfile || null;
  const coordinates = pointToCoordinates(profile?.location);
  const verification = buildVerificationSummary(profile || {});

  let companyDetails = {};
  if (user?.company?.details) {
    const rawDetails = user.company.details;
    if (typeof rawDetails === "object") {
      companyDetails = rawDetails;
    } else {
      try {
        companyDetails = JSON.parse(rawDetails);
      } catch (e) {
        companyDetails = { description: rawDetails };
      }
    }
  }

  const payload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role] || titleCase(user.role),
    companyId: user.companyId || null,
    companyName: user.company?.name || null,
    companyDetails,
    skills: profile?.skills || [],
    technicalSkills: profile?.technicalSkills || [],
    languages: profile?.languages || [],
    medicalTraining: profile?.medicalTraining || "none",
    communicationStyle: profile?.communicationStyle || "community_bridge",
    preferredCauses: profile?.preferredCauses || [],
    availability: profile?.availability || "",
    baseLocation: profile?.baseLocation || "",
    latitude: coordinates.lat,
    longitude: coordinates.lng,
    verification,
    points: user.points || 0,
    badges: user.badges || [],
    trustScore: Number(user.trustScore || 0).toFixed(2)
  };

  if (options.includePrivate) {
    payload.govIdLast4 = profile?.govIdLast4 || "";
    payload.emergencyContactName = profile?.emergencyContactName || "";
    payload.emergencyContactPhone = profile?.emergencyContactPhone || "";
    payload.vaccinationStatus = profile?.vaccinationStatus || "unknown";
  }

  return payload;
}

async function ensureVolunteerProfileForUser(userId, payload = {}) {
  const existing = await Volunteer.findOne({ where: { userId } });
  const detectedLocation = detectLocation(payload.baseLocation || payload.locationName || "");
  const latitude = payload.latitude ?? detectedLocation.lat;
  const longitude = payload.longitude ?? detectedLocation.lng;

  if (existing) {
    await existing.update({
      skills: payload.skills ? normalizeArray(payload.skills) : existing.skills,
      technicalSkills:
        payload.technicalSkills !== undefined
          ? normalizeArray(payload.technicalSkills)
          : existing.technicalSkills,
      languages: payload.languages ? normalizeArray(payload.languages) : existing.languages,
      medicalTraining:
        payload.medicalTraining !== undefined
          ? normalizeMedicalTraining(payload.medicalTraining)
          : existing.medicalTraining,
      communicationStyle:
        payload.communicationStyle !== undefined
          ? normalizeCommunicationStyle(payload.communicationStyle)
          : existing.communicationStyle,
      preferredCauses:
        payload.preferredCauses !== undefined
          ? normalizeArray(payload.preferredCauses)
          : existing.preferredCauses,
      availability: payload.availability ?? existing.availability,
      baseLocation: payload.baseLocation ?? existing.baseLocation,
      govIdLast4:
        payload.govIdLast4 !== undefined ? normalizeGovIdLast4(payload.govIdLast4) : existing.govIdLast4,
      emergencyContactName:
        payload.emergencyContactName !== undefined
          ? String(payload.emergencyContactName || "").trim()
          : existing.emergencyContactName,
      emergencyContactPhone:
        payload.emergencyContactPhone !== undefined
          ? normalizePhoneValue(payload.emergencyContactPhone)
          : existing.emergencyContactPhone,
      vaccinationStatus:
        payload.vaccinationStatus !== undefined
          ? normalizeVaccinationStatus(payload.vaccinationStatus)
          : existing.vaccinationStatus,
      location:
        payload.latitude !== undefined || payload.longitude !== undefined || payload.baseLocation
          ? pointFromCoordinates(latitude, longitude)
          : existing.location
    });
    return existing;
  }

  return Volunteer.create({
    id: createId("volunteer"),
    userId,
    skills: normalizeArray(payload.skills),
    technicalSkills: normalizeArray(payload.technicalSkills),
    languages: normalizeArray(payload.languages),
    medicalTraining: normalizeMedicalTraining(payload.medicalTraining),
    communicationStyle: normalizeCommunicationStyle(payload.communicationStyle),
    preferredCauses: normalizeArray(payload.preferredCauses),
    availability: payload.availability || "",
    baseLocation: payload.baseLocation || detectedLocation.name,
    govIdLast4: normalizeGovIdLast4(payload.govIdLast4),
    emergencyContactName: String(payload.emergencyContactName || "").trim(),
    emergencyContactPhone: normalizePhoneValue(payload.emergencyContactPhone),
    vaccinationStatus: normalizeVaccinationStatus(payload.vaccinationStatus),
    location: pointFromCoordinates(latitude, longitude)
  });
}

async function buildTaskPayload(task, currentUser = null, options = {}) {
  const { cachedVolunteerProfiles = null } = options;
  const taskWithRelations =
    task.assignments && task.ngo
      ? task
      : await Task.findByPk(task.id, {
        include: [
          { model: User, as: "ngo" },
          {
            model: Assignment,
            as: "assignments",
            include: [
              {
                model: Volunteer,
                as: "volunteer",
                include: [{ model: User, as: "user" }]
              }
            ]
          }
        ]
      });

  const assignedVolunteerProfiles = (taskWithRelations.assignments || [])
    .map((assignment) => assignment.volunteer)
    .filter(Boolean);
  const routingProfile = buildTaskRoutingProfile({
    type: taskWithRelations.type,
    severity: taskWithRelations.severity,
    description: taskWithRelations.description,
    locationName: taskWithRelations.locationName,
    requiredSkills: taskWithRelations.requiredSkills,
    complementarySkills: taskWithRelations.complementarySkills,
    preferredLanguages: taskWithRelations.preferredLanguages,
    preferredCommunicationStyles: taskWithRelations.preferredCommunicationStyles,
    contextTags: taskWithRelations.contextTags,
    minimumMedicalTraining: taskWithRelations.minimumMedicalTraining,
    timeWindows: taskWithRelations.timeWindows,
    category: taskWithRelations.category
  });

  const assignedUsers = assignedVolunteerProfiles
    .filter((profile) => profile.user)
    .map((profile) =>
      serializeUser({
        ...profile.user.get({ plain: true }),
        volunteerProfile: profile.get({ plain: true })
      })
    );

  const assignedVolunteerIds = new Set((taskWithRelations.assignments || []).map((assignment) => assignment.volunteerId));
  const volunteerProfiles = cachedVolunteerProfiles || await Volunteer.findAll({
    include: [{ model: User, as: "user" }],
    where: {},
    order: [["id", "ASC"]]
  });

  const availableSuggestions = volunteerProfiles
    .filter((profile) => profile.user && profile.user.role === "volunteer")
    .filter((profile) => !assignedVolunteerIds.has(profile.id))
    .map((profile) => ({
      profile,
      score: computeMatchScore(taskWithRelations, profile, assignedVolunteerProfiles)
    }))
    .sort((left, right) => right.score.score - left.score.score)
    .slice(0, 2);

  const taskCoords = pointToCoordinates(taskWithRelations.location);
  const currentCoords = pointToCoordinates(currentUser?.volunteerProfile?.location);
  const distanceKm = currentUser
    ? haversineKm(taskCoords.lat, taskCoords.lng, currentCoords.lat, currentCoords.lng)
    : null;
  const currentUserMatch =
    currentUser?.volunteerProfile && currentUser.role === "volunteer"
      ? computeMatchScore(taskWithRelations, currentUser.volunteerProfile, assignedVolunteerProfiles)
      : null;

  return {
    id: taskWithRelations.id,
    title: taskWithRelations.title,
    type: taskWithRelations.type,
    severity: taskWithRelations.severity,
    category: routingProfile.category,
    locationName: taskWithRelations.locationName,
    latitude: taskCoords.lat,
    longitude: taskCoords.lng,
    status:
      taskWithRelations.status === TASK_STATUS.PENDING_REVIEW
        ? TASK_STATUS.PENDING_REVIEW
        : taskWithRelations.status === TASK_STATUS.REJECTED
          ? TASK_STATUS.REJECTED
          : [TASK_STATUS.PENDING, TASK_STATUS.CONFIRMED, TASK_STATUS.AUTO_ACCEPTED].includes(taskWithRelations.status)
            ? taskWithRelations.status
            : taskWithRelations.completedAt || taskWithRelations.status === TASK_STATUS.COMPLETED
              ? TASK_STATUS.COMPLETED
              : taskWithRelations.isAssigned
                ? "in_progress"
                : TASK_STATUS.OPEN,
    requiredSkills: routingProfile.requiredSkills,
    complementarySkills: routingProfile.complementarySkills,
    assignedUsers,
    assignedVolunteerIds: (taskWithRelations.assignments || []).map((assignment) => assignment.volunteerId),
    sponsorCompanyId: taskWithRelations.companyId || null,
    createdAt: taskWithRelations.createdAt,
    updatedAt: taskWithRelations.updatedAt,
    confirmationCount: taskWithRelations.confirmationCount,
    gpsLat: taskWithRelations.gpsLat,
    gpsLng: taskWithRelations.gpsLng,
    contentHash: taskWithRelations.contentHash || null,
    mediaUrl: taskWithRelations.mediaUrl || null,
    reportedAt: taskWithRelations.reportedAt || null,
    completedAt: taskWithRelations.completedAt,
    notes: taskWithRelations.description,
    ngo: taskWithRelations.ngo?.name || "NGO Desk",
    preferredLanguages: routingProfile.preferredLanguages,
    preferredCommunicationStyles: routingProfile.preferredCommunicationStyles,
    contextTags: routingProfile.contextTags,
    minimumMedicalTraining: routingProfile.minimumMedicalTraining,
    timeWindows: routingProfile.timeWindows,
    requiresBuddy: requiresBuddy(taskWithRelations),
    recommendedTeamSize: requiresBuddy(taskWithRelations) ? 2 : 1,
    buddySuggestions: availableSuggestions.map(({ profile }) =>
      serializeUser({ ...profile.user.get({ plain: true }), volunteerProfile: profile.get({ plain: true }) })
    ),
    buddyReasons: availableSuggestions.map(({ score }) => score.reasons).flat(),
    currentUserMatch: currentUserMatch
      ? {
        score: currentUserMatch.score,
        reasons: currentUserMatch.reasons,
        distanceKm:
          currentUserMatch.distanceKm === null
            ? null
            : Number(currentUserMatch.distanceKm.toFixed(1))
      }
      : null,
    distanceKm: distanceKm === null ? null : Number(distanceKm.toFixed(1))
  };
}

async function createTaskRecord({
  ngoUserId,
  companyId = null,
  source = "manual",
  status = TASK_STATUS.OPEN,
  description,
  extractedText = "",
  title,
  type,
  severity,
  locationName,
  latitude,
  longitude,
  requiredSkills = [],
  complementarySkills = [],
  preferredLanguages = [],
  preferredCommunicationStyles = [],
  contextTags = [],
  minimumMedicalTraining = "none",
  category = "",
  timeWindows = [],
  peopleServed = 0,
  gpsLat = null,
  gpsLng = null,
  reportedAt = null,
  mediaUrl = null,
  contentHash = null,
  confirmationCount = 1,
  transaction = null
}) {
  const routingProfile = buildTaskRoutingProfile({
    type,
    severity,
    description,
    locationName,
    requiredSkills,
    complementarySkills,
    preferredLanguages,
    preferredCommunicationStyles,
    contextTags,
    minimumMedicalTraining,
    category,
    timeWindows
  });

  return Task.create({
    id: createId("task"),
    ngoId: ngoUserId,
    companyId,
    title,
    type,
    severity,
    description,
    source,
    locationName,
    category: routingProfile.category,
    requiredSkills: routingProfile.requiredSkills,
    complementarySkills: routingProfile.complementarySkills,
    preferredLanguages: routingProfile.preferredLanguages,
    preferredCommunicationStyles: routingProfile.preferredCommunicationStyles,
    contextTags: routingProfile.contextTags,
    minimumMedicalTraining: routingProfile.minimumMedicalTraining,
    timeWindows: routingProfile.timeWindows,
    peopleServed,
    location: pointFromCoordinates(latitude, longitude),
    isAssigned: false,
    status: normalizeTaskStatus(
      isHighImpactTask({ severity, peopleServed, description }) && status === TASK_STATUS.OPEN
        ? TASK_STATUS.PENDING_VETTING
        : status,
      TASK_STATUS.OPEN
    ),
    rejectedAt: null,
    confirmationCount,
    gpsLat,
    gpsLng,
    reportedAt: reportedAt || new Date(),
    mediaUrl,
    contentHash
  }, { transaction });
}

const BADGE_DEFINITIONS = [
  { id: "first_responder", label: "First Responder", check: (user) => Number(user.reportsConfirmed || 0) >= 1 },
  { id: "pathfinder", label: "Pathfinder", check: (user) => Number(user.points || 0) >= 50 },
  { id: "guardian", label: "Guardian", check: (user) => Number(user.trustScore || user.trust_score || 0) >= 0.9 },
  { id: "elite_rescuer", label: "Elite Rescuer", check: (user) => Number(user.points || 0) >= 300 }
];

async function awardPointsAndBadges(user, pointsToAdd, transaction = null) {
  const newPoints = Number(user.points || 0) + pointsToAdd;
  const currentBadges = normalizeArray(user.badges);
  const updatedUser = { ...user.get ? user.get({ plain: true }) : user, points: newPoints };
  const earnedBadges = BADGE_DEFINITIONS
    .filter((badge) => badge.check(updatedUser) && !currentBadges.includes(badge.label))
    .map((badge) => badge.label);
  const newBadges = [...currentBadges, ...earnedBadges];
  await user.update({ points: newPoints, badges: newBadges }, { transaction });
  return { points: newPoints, badges: newBadges, newBadges: earnedBadges };
}

async function createDispatchTaskFromRequest(body = {}, reporter) {
  const coords = readLatLngFromBody(body);
  const description = String(body.description || body.notes || "").trim();
  const type = normalizeNeedType(body.type || body.category || "", description);
  const severity = normalizeSeverity(body.severity || body.urgency);
  const locationName = String(body.locationName || body.location_name || "Pinned location").trim();
  const requiredSkills = normalizeArray(body.requiredSkills || body.required_skills);
  const requiredLanguages = normalizeArray(body.requiredLanguages || body.required_languages);
  const taskContext = buildTaskRoutingProfile({
    type,
    severity,
    description,
    locationName,
    requiredSkills,
    preferredLanguages: requiredLanguages,
    category: body.category
  });
  const ngoDesk =
    reporter.role === "ngo" || reporter.role === "admin"
      ? reporter
      : (await User.findOne({ where: { role: "ngo" }, order: [["name", "ASC"]] })) ||
      (await User.findOne({ where: { role: "admin" }, order: [["name", "ASC"]] })) ||
      reporter;

  const task = await createTaskRecord({
    ngoUserId: ngoDesk.id,
    source: String(body.source || "dispatch_api"),
    status: TASK_STATUS.OPEN,
    description: description || String(body.title || "Volunteer dispatch task").trim(),
    title: String(body.title || "").trim() || buildTaskTitle(type, locationName),
    type,
    severity,
    locationName,
    latitude: coords.lat,
    longitude: coords.lng,
    requiredSkills: taskContext.requiredSkills,
    complementarySkills: taskContext.complementarySkills,
    preferredLanguages: taskContext.preferredLanguages,
    preferredCommunicationStyles: taskContext.preferredCommunicationStyles,
    contextTags: taskContext.contextTags,
    minimumMedicalTraining: taskContext.minimumMedicalTraining,
    category: taskContext.category,
    timeWindows: taskContext.timeWindows,
    peopleServed: inferPeopleServed(type, severity),
    gpsLat: coords.lat,
    gpsLng: coords.lng,
    reportedAt: body.createdAt ? new Date(body.createdAt) : new Date(),
    confirmationCount: Number(body.confirmationCount || 1) || 1
  });
  const cell = setSpatialMembership({
    kind: "task",
    id: task.id,
    latitude: coords.lat,
    longitude: coords.lng,
    active: true
  });

  return { task, cell };
}

function validateVerificationBody(body = {}) {
  const gpsLat = Number(body.gps_lat);
  const gpsLng = Number(body.gps_lng);
  const deviceTimestamp = String(body.device_timestamp || "").trim();

  if (!Number.isFinite(gpsLat) || !Number.isFinite(gpsLng) || !deviceTimestamp) {
    return {
      error: "gps_lat, gps_lng, and device_timestamp are required.",
      gpsLat,
      gpsLng,
      deviceTimestamp
    };
  }

  if (gpsLat < -90 || gpsLat > 90 || gpsLng < -180 || gpsLng > 180) {
    return {
      error: "gps_lat and gps_lng must be valid coordinates.",
      gpsLat,
      gpsLng,
      deviceTimestamp
    };
  }

  return { gpsLat, gpsLng, deviceTimestamp };
}

function buildContentHash({ reporterId, gpsLat, gpsLng, deviceTimestamp, mediaUrl = "" }) {
  return crypto
    .createHash("sha256")
    .update(`${reporterId}${gpsLat}${gpsLng}${deviceTimestamp}${mediaUrl || ""}`)
    .digest("hex");
}

async function findNearbyTaskForVerification({ category, gpsLat, gpsLng, transaction }) {
  if (!USE_POSTGIS) {
    return null;
  }

  const [matches] = await sequelize.query(
    `
      SELECT id, ngo_id, confirmation_count, status
      FROM tasks
      WHERE category = $1
        AND status IN ($2, $3)
        AND reported_at >= NOW() - INTERVAL '2 hours'
        AND location IS NOT NULL
        AND ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography,
          100
        )
      ORDER BY reported_at DESC
      LIMIT 1
      FOR UPDATE
    `,
    {
      bind: [category, TASK_STATUS.PENDING, TASK_STATUS.CONFIRMED, gpsLng, gpsLat],
      transaction
    }
  );

  return matches[0] || null;
}

async function refreshVerificationStatus(taskId, reporter, transaction) {
  const task = await Task.findByPk(taskId, {
    include: [{ model: User, as: "ngo" }],
    transaction
  });
  if (!task) {
    return null;
  }

  const reporterToUse = task.ngo ? task.ngo : reporter;
  const nextStatus = evaluateTaskStatus(task.get({ plain: true }), reporterToUse.get({ plain: true }));
  await task.update({ status: nextStatus, updatedAt: new Date() }, { transaction });
  return Task.findByPk(taskId, {
    include: [{ model: User, as: "ngo" }],
    transaction
  });
}

async function insertTaskConfirmation({
  taskId,
  reporterId,
  gpsLat,
  gpsLng,
  transaction,
  conflictIsError = false
}) {
  const task = await Task.findByPk(taskId, { transaction });
  if (!task) {
    const error = new Error("Task not found.");
    error.statusCode = 404;
    throw error;
  }

  if (task.ngoId === reporterId) {
    if (conflictIsError) {
      const error = new Error("You have already confirmed this task.");
      error.statusCode = 409;
      throw error;
    }
    return { inserted: false, task };
  }

  const [inserted] = await sequelize.query(
    `
      INSERT INTO task_confirmations (task_id, reporter_id, gps_lat, gps_lng, reported_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (task_id, reporter_id) DO NOTHING
      RETURNING id
    `,
    {
      bind: [taskId, reporterId, gpsLat, gpsLng],
      transaction
    }
  );

  if (!inserted.length) {
    if (conflictIsError) {
      const error = new Error("You have already confirmed this task.");
      error.statusCode = 409;
      throw error;
    }
    return { inserted: false, task };
  }

  await task.increment("confirmationCount", { by: 1, transaction });
  await task.reload({ transaction });
  return { inserted: true, task };
}

async function createOrConfirmVerifiedTask(body, reporter) {
  const validation = validateVerificationBody(body);
  if (validation.error) {
    const error = new Error(validation.error);
    error.statusCode = 400;
    throw error;
  }

  const description = String(body.description || body.notes || "").trim();
  const title = String(body.title || "").trim() || "Community need report";
  const type = normalizeNeedType(body.type || body.category || "", description);
  const severity = normalizeSeverity(body.severity);
  const locationName = String(body.location_name || body.locationName || "Pinned location").trim();
  const mediaUrl = body.media_url ? String(body.media_url).trim() : null;
  const routingProfile = buildTaskRoutingProfile({
    type,
    severity,
    description,
    locationName,
    requiredSkills: body.required_skills || body.requiredSkills,
    category: body.category
  });
  const contentHash = buildContentHash({
    reporterId: reporter.id,
    gpsLat: validation.gpsLat,
    gpsLng: validation.gpsLng,
    deviceTimestamp: validation.deviceTimestamp,
    mediaUrl
  });

  return sequelize.transaction(async (transaction) => {
    const matched = await findNearbyTaskForVerification({
      category: routingProfile.category,
      gpsLat: validation.gpsLat,
      gpsLng: validation.gpsLng,
      transaction
    });

    if (matched) {
      await insertTaskConfirmation({
        taskId: matched.id,
        reporterId: reporter.id,
        gpsLat: validation.gpsLat,
        gpsLng: validation.gpsLng,
        transaction
      });
      return refreshVerificationStatus(matched.id, reporter, transaction);
    }

    const task = await createTaskRecord({
      ngoUserId: reporter.id,
      source: "verified_report",
      status: TASK_STATUS.PENDING,
      description: description || title,
      title,
      type,
      severity,
      locationName,
      latitude: validation.gpsLat,
      longitude: validation.gpsLng,
      requiredSkills: body.required_skills || body.requiredSkills,
      category: routingProfile.category,
      gpsLat: validation.gpsLat,
      gpsLng: validation.gpsLng,
      mediaUrl,
      contentHash,
      confirmationCount: 1,
      transaction
    });

    return refreshVerificationStatus(task.id, reporter, transaction);
  });
}

async function createReviewIfNeeded({
  taskId,
  source,
  rawText,
  rawExtractedText = "",
  cleanedContent = "",
  formattedContent = "",
  hasTable = false,
  confidence,
  suggestedType,
  suggestedSeverity,
  suggestedLocation,
  flaggedWords = [],
  evidence = [],
  pipeline = {},
  languages = [],
  imageUrl = null,
  imageUrls = []
}) {
  const normalizedConfidence = clampConfidence(confidence, 0);
  const requiresReview = shouldRequireReview(normalizedConfidence, flaggedWords);

  if (!requiresReview) {
    return null;
  }

  return Review.create({
    id: createId("review"),
    taskId,
    source,
    rawText,
    confidence: Number(normalizedConfidence.toFixed(2)),
    suggestedType,
    suggestedSeverity,
    suggestedLocation,
    status: "pending",
    correctedPayload: {
      flaggedWords: uniqueValues(normalizeArray(flaggedWords)),
      evidence: uniqueValues(normalizeArray(evidence)),
      pipeline,
      languages: uniqueValues(normalizeArray(languages)),
      imageUrl: imageUrl || null,
      imageUrls: uniqueValues(normalizeArray(imageUrls)),
      rawExtractedText: String(rawExtractedText || "").trim(),
      cleaned_content: String(cleanedContent || "").trim(),
      formattedContent: String(formattedContent || rawText || "").trim(),
      hasTable: Boolean(hasTable),
      trainingStatus: "pending_annotation"
    }
  });
}

async function loadOpenTasksWithRelations() {
  return Task.findAll({
    where: buildLiveTaskWhere(),
    include: [
      { model: User, as: "ngo" },
      {
        model: Assignment,
        as: "assignments",
        include: [
          {
            model: Volunteer,
            as: "volunteer",
            include: [{ model: User, as: "user" }]
          }
        ]
      }
    ],
    order: sequelize.literal('"Task"."updated_at" DESC')
  });
}

async function buildOverview() {
  const tasks = await loadOpenTasksWithRelations();
  const uniqueLocations = new Set(tasks.map((task) => task.locationName));
  const matchedCount = tasks.filter((task) => (task.assignments || []).length > 0).length;
  const activeVolunteers = await Volunteer.count({
    include: [
      {
        model: User,
        as: "user",
        where: { role: "volunteer" }
      }
    ]
  });
  const responseMinutes =
    tasks.reduce((total, task) => {
      const started = readTimestamp(task, "createdAt", "updatedAt");
      const updated = readTimestamp(task, "updatedAt", "createdAt") || started;
      if (!started || !updated) {
        return total + 10;
      }
      return total + Math.max((updated.getTime() - started.getTime()) / 60000, 10);
    }, 0) / Math.max(tasks.length, 1);

  return {
    wardsLive: uniqueLocations.size || 1,
    openNeeds: tasks.length,
    criticalClusters: (await buildAlerts()).filter((alert) => alert.severity === "critical").length,
    responseCycle: `${Math.round(responseMinutes)} min`,
    volunteerReadiness: `${Math.round((matchedCount / Math.max(tasks.length, 1)) * 100)}%`,
    activeVolunteers
  };
}

function buildSilentNeedAlertsFromTasks(tasks = []) {
  const groups = new Map();

  tasks.forEach((task) => {
    const updatedAt = readTimestamp(task, "updatedAt", "createdAt");
    if (!updatedAt || hoursSince(updatedAt) > SILENT_NEED_LOOKBACK_DAYS * 24) {
      return;
    }

    const key = `${task.type}::${String(task.locationName || "pune").toLowerCase()}`;
    const bucket = groups.get(key) || [];
    bucket.push(task);
    groups.set(key, bucket);
  });

  return [...groups.values()]
    .map((group) => {
      const sample = group[0];
      const coords = pointToCoordinates(sample.location);
      const weightedCount = group.reduce((sum, task) => {
        const updatedAt = readTimestamp(task, "updatedAt", "createdAt");
        return sum + severityWeight(task.severity) * computeTimeDecayWeight(updatedAt);
      }, 0);
      const peopleMentioned = group.reduce((sum, task) => {
        const detected = inferPeopleMention(task.description || "");
        return sum + (detected || 0);
      }, 0);
      const evidenceKeywords = uniqueValues(
        group.flatMap((task) => summarizeEvidenceKeywords(task.description || "", task.type))
      ).slice(0, 5);
      const criticalMentions = group.filter((task) => task.severity === "critical").length;
      const evidence = uniqueValues([
        `${group.length} reports within roughly 3 km over the last ${SILENT_NEED_LOOKBACK_DAYS} days`,
        peopleMentioned
          ? `${peopleMentioned} people or households explicitly referenced in these reports`
          : "",
        evidenceKeywords.length ? `Repeated keywords: ${evidenceKeywords.join(", ")}` : "",
        criticalMentions ? `${criticalMentions} of these reports were marked critical` : ""
      ]).slice(0, 4);
      const meetsThreshold = weightedCount >= 2.3 || criticalMentions > 0;

      if (!meetsThreshold) {
        return null;
      }

      return {
        id: `alert-${sample.type}-${sample.locationName}`.replace(/\s+/g, "-").toLowerCase(),
        type: sample.type,
        severity: weightedCount >= 4.2 || criticalMentions > 0 ? "critical" : "urgent",
        title: `${titleCase(sample.type)} pressure rising in ${sample.locationName}`,
        locationName: sample.locationName,
        latitude: coords.lat,
        longitude: coords.lng,
        evidenceCount: group.length,
        weightedCount: Number(weightedCount.toFixed(2)),
        explanation: evidence[0] || `${titleCase(sample.type)} reports are clustering in ${sample.locationName}.`,
        evidence
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.weightedCount - left.weightedCount)
    .slice(0, 8);
}

async function buildAlerts() {
  const tasks = await Task.findAll({
    where: buildLiveTaskWhere(),
    order: sequelize.literal('"Task"."updated_at" DESC')
  });

  return buildSilentNeedAlertsFromTasks(tasks);
}

async function buildReviewQueue() {
  const reviews = await Review.findAll({
    where: {
      status: "pending"
    },
    include: [{ model: Task, as: "task" }],
    order: sequelize.literal('"Review"."created_at" DESC')
  });

  return reviews
    .filter((review) => review.task && review.task.status === TASK_STATUS.PENDING_REVIEW)
    .map((review) => ({
      id: review.id,
      taskId: review.taskId,
      source: review.source,
      title: review.task.title,
      description: review.task.description,
      severity: review.task.severity,
      locationName: review.task.locationName,
      confidence: Number(review.confidence),
      rawText: review.rawText || "",
      raw_content: review.correctedPayload?.rawExtractedText || review.rawText || "",
      rawExtractedText: review.correctedPayload?.rawExtractedText || "",
      cleanedContent: review.correctedPayload?.cleaned_content || "",
      cleaned_content: review.correctedPayload?.cleaned_content || "",
      formattedContent:
        review.correctedPayload?.formattedContent ||
        review.rawText ||
        review.task.description,
      hasTable: Boolean(review.correctedPayload?.hasTable),
      correctedText:
        review.correctedPayload?.correctedText ||
        review.correctedPayload?.cleaned_content ||
        review.correctedPayload?.description ||
        review.task.description,
      flaggedWords: review.correctedPayload?.flaggedWords || [],
      evidence: review.correctedPayload?.evidence || [],
      pipeline: review.correctedPayload?.pipeline || {},
      languages: review.correctedPayload?.languages || [],
      imageUrl: review.correctedPayload?.imageUrl || null,
      image_url: review.correctedPayload?.imageUrl || null,
      imageUrls: review.correctedPayload?.imageUrls || [],
      image_urls: review.correctedPayload?.imageUrls || []
    }));
}

async function buildAdminSummary() {
  const overview = await buildOverview();
  const alerts = await buildAlerts();
  const openTasks = await loadOpenTasksWithRelations();
  const activeSosAlerts = await SOSAlert.findAll({ where: { status: "active" }, order: [["created_at", "DESC"]] });
  const vettingCount = await Task.count({ where: { status: TASK_STATUS.PENDING_VETTING } });

  return {
    metrics: [
      { label: "Open needs", value: overview.openNeeds },
      { label: "Review queue", value: (await Review.count({ where: { status: "pending" } })).toString() },
      { label: "Alerts raised", value: alerts.length.toString() },
      { label: "Volunteer coverage", value: overview.volunteerReadiness },
      { label: "Active SOS", value: activeSosAlerts.length.toString() },
      { label: "Pending vetting", value: vettingCount.toString() }
    ],
    alerts,
    sosAlerts: activeSosAlerts,
    vettingCount,
    openTasks: await Promise.all(openTasks.slice(0, 6).map((task) => buildTaskPayload(task)))
  };
}

async function buildIssuePayloads() {
  const tasks = await Task.findAll({
    where: buildLiveTaskWhere(),
    include: [{ model: User, as: "ngo" }],
    order: sequelize.literal('"Task"."updated_at" DESC')
  });

  return tasks.map((task) => {
    const coords = pointToCoordinates(task.location);
    const updatedAt = readTimestamp(task, "updatedAt", "createdAt");
    const heatWeight = Number(
      (severityWeight(task.severity) * computeTimeDecayWeight(updatedAt)).toFixed(2)
    );
    return {
      id: task.id,
      type: task.type,
      severity: task.severity,
      label: task.title,
      updated: formatTimeAgo(readTimestamp(task, "updatedAt", "createdAt")),
      updated_at: updatedAt,
      ngo: task.ngo?.name || "NGO Desk",
      locationName: task.locationName,
      coordinates: coords,
      lat: coords.lat,
      lng: coords.lng,
      heatWeight,
      evidenceKeywords: summarizeEvidenceKeywords(task.description || "", task.type),
      peopleMention: inferPeopleMention(task.description || "")
    };
  });
}

async function getCompaniesForUser(user) {
  if (user.role === "corporate" && user.companyId) {
    const company = await Company.findByPk(user.companyId);
    return company ? [company] : [];
  }

  if (user.role === "admin") {
    return Company.findAll({ order: [["name", "ASC"]] });
  }

  return [];
}

async function buildCSRStats(companyId, filters = {}) {
  const company = await Company.findByPk(companyId);
  if (!company) {
    return null;
  }

  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function normalizeMonthName(raw) {
    const value = String(raw || "").trim();
    if (!value) {
      return "";
    }

    const abbreviated = value.slice(0, 3);
    return abbreviated.charAt(0).toUpperCase() + abbreviated.slice(1).toLowerCase();
  }

  function padMonthlyHours(series = []) {
    const normalizedSeries = Array.isArray(series)
      ? series.map((entry) => ({
        month: normalizeMonthName(entry.month),
        hours: Number(entry.hours || 0)
      }))
      : [];

    if (normalizedSeries.length === 0) {
      return [];
    }

    if (normalizedSeries.length >= 4) {
      return normalizedSeries;
    }

    const lookup = normalizedSeries.reduce((accumulator, entry) => {
      accumulator[entry.month] = entry.hours;
      return accumulator;
    }, {});

    let firstIdx = MONTH_NAMES.indexOf(normalizedSeries[0].month);
    if (firstIdx === -1) {
      firstIdx = 0;
    }

    let lastIdx = MONTH_NAMES.indexOf(normalizedSeries[normalizedSeries.length - 1].month);
    if (lastIdx === -1) {
      lastIdx = firstIdx;
    }

    const startIdx = Math.max(0, firstIdx - 2);
    const endIdx = Math.min(11, lastIdx + 2);
    const paddedSeries = [];

    for (let index = startIdx; index <= endIdx; index += 1) {
      const month = MONTH_NAMES[index];
      paddedSeries.push({
        month,
        hours: lookup[month] || 0
      });
    }

    return paddedSeries;
  }

  const dateRange = buildDateRange(filters, filters);
  const taskWhere = {
    companyId,
    completedAt: {
      [Op.not]: null
    },
    ...buildDateWhere("completedAt", dateRange.startDate, dateRange.endDate)
  };

  if (filters.ngoId) {
    taskWhere.ngoId = filters.ngoId;
  }

  const contributionWhere = {
    companyId,
    ...buildDateWhere("date", dateRange.startDate, dateRange.endDate)
  };

  const [contributions, completedTasks, reports] = await Promise.all([
    Contribution.findAll({ where: contributionWhere, order: [["date", "ASC"]] }),
    Task.findAll({ where: taskWhere, order: [["completed_at", "DESC"]] }),
    CSRReport.findAll({
      where: { companyId },
      order: sequelize.literal('"CSRReport"."generated_at" DESC'),
      limit: 5
    })
  ]);

  const totals = {
    volunteerHours: Number(
      contributions.reduce((sum, item) => sum + Number(item.volunteerHours || 0), 0).toFixed(1)
    ),
    funds: Number(contributions.reduce((sum, item) => sum + Number(item.funds || 0), 0).toFixed(0)),
    peopleServed: completedTasks.reduce((sum, task) => sum + Number(task.peopleServed || 0), 0),
    tasksFunded: completedTasks.length
  };

  const rawMonthlyHours = contributions.reduce((accumulator, contribution) => {
    const month = contribution.date.toLocaleDateString("en-IN", { month: "short" });
    const existing = accumulator.find((item) => item.month === month);
    const hours = Number(contribution.volunteerHours || 0);

    if (existing) {
      existing.hours += hours;
      return accumulator;
    }

    accumulator.push({ month, hours });
    return accumulator;
  }, []);

  const monthlyHours = padMonthlyHours(rawMonthlyHours);

  const maxHours = Math.max(...monthlyHours.map((entry) => entry.hours), 1);
  monthlyHours.forEach((entry) => {
    entry.height = Math.max(18, Math.round((entry.hours / maxHours) * 100));
  });

  const categories = completedTasks.reduce((accumulator, task) => {
    accumulator[task.type] = (accumulator[task.type] || 0) + 1;
    return accumulator;
  }, {});

  const taskAssignmentCounts = await Promise.all(
    completedTasks.map(async (task) => ({
      task,
      volunteerCount: await Assignment.count({ where: { taskId: task.id } }),
      responseHours: Math.max(
        Math.round(
          ((readTimestamp(task, "completedAt", "updatedAt") || new Date()).getTime() -
            (readTimestamp(task, "createdAt", "updatedAt") || new Date()).getTime()) /
          (1000 * 60 * 60)
        ),
        1
      )
    }))
  );

  const receiptLines = await Promise.all(
    taskAssignmentCounts.map(async ({ task, volunteerCount, responseHours }) => {
      const outputMetric =
        task.type === "water"
          ? `${Math.max(Number(task.peopleServed || 0) * 12, 180)} liters purified or distributed`
          : task.type === "medical"
            ? `${Math.max(Number(task.peopleServed || 0), 12)} treatments or triage touchpoints`
            : task.type === "food"
              ? `${Math.max(Number(task.peopleServed || 0), 20)} meals or ration units`
              : `${Math.max(Number(task.peopleServed || 0), 10)} people supported`;
      const outcomeMetric =
        task.type === "water"
          ? "Fewer unsafe-water mentions were logged after the intervention window"
          : task.type === "medical"
            ? "Residents were routed into treatment faster"
            : task.type === "sanitation"
              ? "Waste backlog pressure eased in the ward"
              : "Coverage improved for the immediate response lane";

      return {
        title: task.title,
        locationName: task.locationName,
        volunteers: volunteerCount,
        peopleServed: Number(task.peopleServed || 0),
        outputMetric,
        outcomeMetric,
        responseHours,
        frameworkTags: ["GRI 203", "GRI 413", "SASB Community Impact"],
        completedAt: task.completedAt
          ? task.completedAt.toLocaleDateString("en-IN")
          : "Pending"
      };
    })
  );

  const outcomeMetrics = [
    {
      label: "Response completed within 72h",
      value: `${taskAssignmentCounts.filter((entry) => entry.responseHours <= 72).length}/${completedTasks.length || 0}`,
      description: "Speed proxy showing how quickly funded tasks moved from intake to completion."
    },
    {
      label: "High-risk tasks with buddy coverage",
      value: `${taskAssignmentCounts.filter((entry) => requiresBuddy(entry.task) && entry.volunteerCount >= 2).length}`,
      description: "Safety proxy showing where the buddy system held for higher-risk field work."
    },
    {
      label: "People reached per 10 volunteer hours",
      value: totals.volunteerHours
        ? Number(((totals.peopleServed / totals.volunteerHours) * 10).toFixed(1)).toString()
        : "0",
      description: "Operational efficiency proxy for CSR and ESG review decks."
    }
  ];

  const frameworkAlignment = [
    {
      framework: "GRI 203",
      focus: "Infrastructure and community benefit"
    },
    {
      framework: "GRI 413",
      focus: "Local community engagement and response impact"
    },
    {
      framework: "SASB Community Impact",
      focus: "Comparable outputs and outcomes for board reporting"
    }
  ];

  const rangeLabel =
    dateRange.startDate || dateRange.endDate
      ? `between ${dateRange.startDate ? dateRange.startDate.toLocaleDateString("en-IN") : "the start"} and ${dateRange.endDate ? dateRange.endDate.toLocaleDateString("en-IN") : "today"
      }`
      : "across the full reporting window";

  return {
    company: company.get({ plain: true }),
    filters: {
      startDate: dateRange.startDate ? dateRange.startDate.toISOString().slice(0, 10) : "",
      endDate: dateRange.endDate ? dateRange.endDate.toISOString().slice(0, 10) : ""
    },
    totals,
    categories,
    categorySummary: Object.entries(categories).map(([label, value]) => ({
      label: titleCase(label),
      value
    })),
    monthlyHours,
    receiptLines,
    outcomeMetrics,
    frameworkAlignment,
    testimonials: receiptLines.slice(0, 3).map((line) => ({
      quote: `${line.locationName} teams closed ${line.title.toLowerCase()} with ${line.volunteers} volunteers in ${line.responseHours}h.`,
      attribution: `${line.locationName} field lane`
    })),
    narrative: `${company.name} logged ${totals.volunteerHours} volunteer hours, completed ${totals.tasksFunded} funded task flows, and reached ${totals.peopleServed} people ${rangeLabel}.`
  };
}

async function renderCSRHtml(stats) {
  const templateSource = await fsPromises.readFile(TEMPLATE_PATH, "utf8");
  const template = Handlebars.compile(templateSource);

  return template({
    company: stats.company,
    narrative: stats.narrative,
    generatedAt: new Date().toLocaleString("en-IN"),
    metricCards: [
      {
        label: "Volunteer Hours",
        value: stats.totals.volunteerHours,
        description: "Tracked from company contributions across the selected reporting window."
      },
      {
        label: "Tasks Completed",
        value: stats.totals.tasksFunded,
        description: "Completed task flows linked to this company."
      },
      {
        label: "People Served",
        value: stats.totals.peopleServed,
        description: "Estimated direct reach based on funded completions."
      },
      {
        label: "Funds Tracked",
        value: `INR ${Number(stats.totals.funds || 0).toLocaleString("en-IN")}`,
        description: "Operational funding tied to visible field work."
      }
    ],
    monthlyHours: stats.monthlyHours,
    receiptLines: stats.receiptLines,
    categorySummary: stats.categorySummary,
    outcomeMetrics: stats.outcomeMetrics,
    frameworkAlignment: stats.frameworkAlignment,
    testimonials: stats.testimonials,
    // raw JSON used by in-template Chart.js rendering (unescaped)
    rawData: JSON.stringify({
      monthlyHours: stats.monthlyHours || [],
      categorySummary: stats.categorySummary || [],
      totals: stats.totals || {}
    })
  });
}

async function writeFallbackCSRReport(reportPath, stats) {
  await fsPromises.mkdir(path.dirname(reportPath), { recursive: true });

  const doc = new PDFDocument({ margin: 48, size: "A4" });
  const stream = fs.createWriteStream(reportPath);
  doc.pipe(stream);

  doc.fontSize(24).text(`${stats.company.name} Impact Report`);
  doc.moveDown(0.5);
  doc.fontSize(12).text(stats.narrative);
  doc.moveDown();

  const metricLines = [
    ["Volunteer Hours", stats.totals.volunteerHours],
    ["Tasks Completed", stats.totals.tasksFunded],
    ["People Served", stats.totals.peopleServed],
    ["Funds Tracked", `INR ${Number(stats.totals.funds || 0).toLocaleString("en-IN")}`]
  ];

  for (const [label, value] of metricLines) {
    doc.fontSize(14).text(`${label}: ${value}`);
    doc.moveDown(0.25);
  }

  doc.moveDown();
  doc.fontSize(16).text("Receipt Lines");
  doc.moveDown(0.25);

  for (const [index, line] of stats.receiptLines.entries()) {
    doc.fontSize(12).text(
      `${index + 1}. ${line.title} · ${line.locationName} · ${line.volunteers} volunteers`
    );
  }

  // Draw a smooth area curve for monthlyHours
  try {
    const months = Array.isArray(stats.monthlyHours) ? stats.monthlyHours : [];
    if (months.length) {
      doc.addPage({ margin: 48 });
      doc.fontSize(18).text('Volunteer hours trend', { underline: false });
      doc.moveDown(0.2);

      const margin = 48;
      const contentWidth = doc.page.width - margin * 2;
      const chartWidth = Math.min(520, contentWidth);
      const chartHeight = 160;
      const chartX = margin;
      const chartY = doc.y + 8;

      // normalize month names to 3-letter abbrev and pad sparse series (like frontend)
      const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      function normalizeMonthName(raw) {
        const s = String(raw || '').trim();
        if (!s) return '';
        const abbr = s.slice(0,3);
        return abbr.charAt(0).toUpperCase() + abbr.slice(1).toLowerCase();
      }

      const lookup = {};
      months.forEach(m => {
        const name = normalizeMonthName(m.month || m.label || '');
        lookup[name] = Number(m.hours || 0);
      });

      let paddedSeries = months.map(m => ({ month: normalizeMonthName(m.month || m.label || ''), hours: Number(m.hours || 0) }));
      if (months.length > 0 && months.length < 4) {
        const first = normalizeMonthName(months[0].month || months[0].label || '');
        const last = normalizeMonthName(months[months.length - 1].month || months[months.length - 1].label || '');
        let firstIdx = MONTH_NAMES.indexOf(first);
        if (firstIdx === -1) firstIdx = 0;
        let lastIdx = MONTH_NAMES.indexOf(last);
        if (lastIdx === -1) lastIdx = firstIdx;
        const startIdx = Math.max(0, firstIdx - 2);
        const endIdx = Math.min(11, lastIdx + 2);
        paddedSeries = [];
        for (let i = startIdx; i <= endIdx; i++) {
          const mName = MONTH_NAMES[i];
          paddedSeries.push({ month: mName, hours: lookup[mName] || 0 });
        }
      }

      const values = paddedSeries.map(m => Number(m.hours || 0));
      const maxVal = Math.max(...values, 1);
      const stepX = chartWidth / Math.max(paddedSeries.length - 1, 1);
      // center chart horizontally within content width
      const chartXCentered = chartX + Math.max(0, (contentWidth - chartWidth) / 2);
      const points = paddedSeries.map((m, i) => ({
        x: chartXCentered + i * stepX,
        y: chartY + chartHeight - (Number(m.hours || 0) / maxVal) * chartHeight,
        label: String(m.month || '')
      }));

      // draw axes labels
      doc.fontSize(10).fillColor('rgba(43,43,43,0.7)');
      doc.text(`${Math.round(maxVal)} hrs`, chartXCentered, chartY - 6);
      doc.text('0 hrs', chartXCentered, chartY + chartHeight + 4);

      // draw grid lines
      doc.save();
      doc.lineWidth(0.5).strokeColor('rgba(43,43,43,0.06)');
      const gridSteps = 4;
      for (let i = 0; i <= gridSteps; i++) {
        const y = chartY + (chartHeight / gridSteps) * i;
        doc.moveTo(chartXCentered, y).lineTo(chartXCentered + chartWidth, y).stroke();
      }
      doc.restore();

      // build smooth path using cubic Bezier through midpoint control points
      doc.save();
      // area fill path
      doc.moveTo(points[0].x, points[0].y);
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i];
        const p1 = points[i + 1];
        const midX = (p0.x + p1.x) / 2;
        doc.bezierCurveTo(midX, p0.y, midX, p1.y, p1.x, p1.y);
      }
      // close path to baseline
      doc.lineTo(points[points.length - 1].x, chartY + chartHeight);
      doc.lineTo(points[0].x, chartY + chartHeight);
      doc.closePath();
      // fill area with translucent coral
      doc.fillColor('#e07a6a').opacity(0.12).fill();
      doc.opacity(1);

      // stroke the curve path again for border
      doc.moveTo(points[0].x, points[0].y);
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i];
        const p1 = points[i + 1];
        const midX = (p0.x + p1.x) / 2;
        doc.bezierCurveTo(midX, p0.y, midX, p1.y, p1.x, p1.y);
      }
      doc.lineWidth(2.5).strokeColor('#b85f54').stroke();

      // draw point markers
      for (const p of points) {
        doc.circle(p.x, p.y, 5).fillColor('#ffffff').fill();
        doc.circle(p.x, p.y, 3).fillColor('#e07a6a').fill();
      }

      // draw month labels
      doc.fontSize(10).fillColor('rgba(43,43,43,0.72)');
      for (const p of points) {
        doc.text(p.label, p.x - 14, chartY + chartHeight + 6, { width: 28, align: 'center' });
      }

      doc.restore();

      doc.moveDown(10);
    }
  } catch (err) {
    console.warn('Failed to draw fallback curve in PDF:', err.message || err);
  }

  doc.end();
  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

async function generateCSRReport(companyId, filters = {}) {
  const stats = await buildCSRStats(companyId, filters);
  if (!stats) {
    return null;
  }

  const html = await renderCSRHtml(stats);
  const filename = `csr-report-${companyId}-${Date.now()}.pdf`;
  const reportPath = path.join(REPORTS_DIR, filename);
  try {
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      // Wait for in-page Chart.js rendering to finish (template sets window.__helphiveChartsReady)
      try {
        await page.waitForFunction('window.__helphiveChartsReady === true', { timeout: 5000 });
      } catch (err) {
        // If charts don't signal readiness, continue anyway; PDF will still be generated.
        console.warn('Charts readiness timed out, continuing to generate PDF');
      }
      await page.pdf({
        path: reportPath,
        format: "A4",
        printBackground: true,
        margin: {
          top: "18px",
          right: "18px",
          bottom: "18px",
          left: "18px"
        }
      });
    } finally {
      await browser.close();
    }
  } catch (error) {
    if (!/Could not find Chrome/i.test(error.message || "")) {
      throw error;
    }

    console.warn(
      "Puppeteer Chrome not available; generating CSR report with PDFKit fallback."
    );
    await writeFallbackCSRReport(reportPath, stats);
  }

  await CSRReport.create({
    id: createId("report"),
    companyId,
    filePath: reportPath,
    generatedAt: new Date()
  });

  return {
    path: reportPath,
    downloadUrl: `/generated-reports/${filename}`
  };
}

async function runGeminiStructuredExtraction(filePath, mimeType, prompt, model = GEMINI_MULTIMODAL_MODEL) {
  if (!geminiClient) {
    return null;
  }

  const uploadedFile = await geminiClient.files.upload({
    file: filePath,
    config: { mimeType }
  });

  const response = await geminiClient.models.generateContent({
    model,
    contents: createUserContent([
      createPartFromUri(uploadedFile.uri, uploadedFile.mimeType || mimeType),
      prompt
    ])
  });

  return parseModelJson(response.text || "", {});
}

function getExternalApiErrorStatus(error) {
  return Number(
    error?.status ||
    error?.statusCode ||
    error?.code ||
    error?.response?.status ||
    error?.error?.code ||
    0
  );
}

function isRecoverableGeminiError(error) {
  const status = getExternalApiErrorStatus(error);
  const message = String(error?.message || "");

  return (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 429 ||
    status >= 500 ||
    /API key|RESOURCE_EXHAUSTED|quota|billing|prepayment|provider/i.test(message)
  );
}

function describeGeminiOcrFailure(error) {
  const status = getExternalApiErrorStatus(error);
  const message = String(error?.message || "");

  if (status === 429 || /RESOURCE_EXHAUSTED|quota|billing|prepayment/i.test(message)) {
    return "Gemini OCR is temporarily unavailable because the API quota or billing credits are exhausted.";
  }

  if (status === 401 || status === 403 || /API key/i.test(message)) {
    return "Gemini OCR is temporarily unavailable because the API key is not authorized.";
  }

  return "Gemini OCR is temporarily unavailable.";
}

async function runGeminiPlainText(prompt, model = GEMINI_MULTIMODAL_MODEL) {
  if (!geminiClient) {
    return "";
  }

  const response = await geminiClient.models.generateContent({
    model,
    contents: createUserContent([prompt])
  });

  return stripMarkdownCodeFence(response.text || "").trim();
}

async function reconstructLowConfidenceSurveyText(rawText = "", confidence = 1) {
  const normalizedRawText = String(rawText || "").trim();
  if (!normalizedRawText || clampConfidence(confidence, 1) >= 0.6 || !geminiClient) {
    return "";
  }

  try {
    return await runGeminiPlainText(
      `The following text was extracted by OCR from a handwritten community survey form and contains many errors. Please reconstruct the most likely intended text based on context. The form is likely about community needs, flood relief, health, education, or livelihood in rural India. Preserve any names, numbers, locations, and rupee amounts as best as possible. Return only the cleaned reconstructed text, nothing else. Raw OCR text: ${normalizedRawText}`
    );
  } catch (error) {
    console.warn(`Low-confidence OCR cleanup skipped: ${error.message}`);
    return "";
  }
}

function normalizeOcrText(text = "") {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getOcrReadabilityStats(text = "") {
  const normalizedText = normalizeOcrText(text);
  const characters = normalizedText.replace(/\s/g, "").length;
  const words = normalizedText.split(/\s+/).filter(Boolean);
  const usefulWords = words.filter((word) => {
    const readableCharacters = (word.match(/[\p{L}\p{M}\p{N}]/gu) || []).length;
    return readableCharacters >= 2;
  });
  const usefulCharacterCount = (normalizedText.match(/[\p{L}\p{M}\p{N}]/gu) || []).length;
  const devanagariCharacterCount = (normalizedText.match(/[\u0900-\u097F]/gu) || []).length;
  const characterQuality = characters ? usefulCharacterCount / characters : 0;
  const devanagariRatio = usefulCharacterCount ? devanagariCharacterCount / usefulCharacterCount : 0;
  const wordQuality = words.length ? usefulWords.length / words.length : 0;
  const lines = normalizedText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const structuredLineCount = lines.filter((line) => /[:：\-–—•]|\d/.test(line)).length;
  const numericTokenCount = (normalizedText.match(/\d+/g) || []).length;

  return {
    characters,
    usefulWords,
    characterQuality,
    devanagariRatio,
    wordQuality,
    lineCount: lines.length,
    structuredLineCount,
    numericTokenCount
  };
}

function isReadableHandwrittenExtraction(text = "", confidence = 0) {
  const normalizedConfidence = clampConfidence(confidence, 0);
  const stats = getOcrReadabilityStats(text);
  const hasCoherentText =
    stats.usefulWords.length >= 6 &&
    stats.characters >= 24 &&
    stats.characterQuality >= 0.72 &&
    stats.wordQuality >= 0.55;
  const looksLikeSparseNote = stats.lineCount <= 12;
  const looksLikeIndicNotebookNote =
    normalizedConfidence >= OCR_INDIC_NOTE_MIN_RAW_CONFIDENCE &&
    stats.devanagariRatio >= 0.72 &&
    stats.usefulWords.length >= 5 &&
    stats.characters >= 18 &&
    stats.characterQuality >= 0.68 &&
    stats.wordQuality >= 0.5 &&
    stats.lineCount <= 8;
  const looksLikeStructuredSurvey =
    stats.lineCount <= 60 &&
    stats.usefulWords.length >= 12 &&
    (stats.structuredLineCount >= 3 || stats.numericTokenCount >= 3);
  const passesStandardRawConfidence =
    normalizedConfidence >= OCR_READABLE_HANDWRITING_MIN_RAW_CONFIDENCE &&
    hasCoherentText &&
    (looksLikeSparseNote || looksLikeStructuredSurvey);

  return passesStandardRawConfidence || (hasCoherentText && looksLikeIndicNotebookNote);
}

function calibrateOcrConfidence(confidence, text = "") {
  const normalizedConfidence = clampConfidence(confidence, 0);

  if (!isReadableHandwrittenExtraction(text, normalizedConfidence)) {
    return normalizedConfidence;
  }

  return clampConfidence(
    Math.max(normalizedConfidence, OCR_READABLE_HANDWRITING_CONFIDENCE_FLOOR),
    normalizedConfidence
  );
}

function scoreOcrCandidate({ text = "", averageConfidence = 0, lowConfidenceWords = [] }) {
  const stats = getOcrReadabilityStats(text);

  return (
    Number(averageConfidence || 0) * 100 +
    Math.min(stats.characters, 240) * 0.05 +
    Math.min(stats.usefulWords.length, 60) * 1.4 +
    stats.characterQuality * 12 +
    stats.wordQuality * 8 -
    normalizeArray(lowConfidenceWords).length * 0.9
  );
}

function tesseractOptionsForProfile(profile = {}) {
  return {
    tessedit_pageseg_mode: profile.pageSegMode,
    preserve_interword_spaces: "1"
  };
}

async function runTesseractOCR(filePath) {
  const languages = uniqueValues([
    OCR_LANGUAGES,
    "hin+mar",
    "hin",
    "mar",
    "eng+hin",
    "eng"
  ]);
  let lastError = null;
  const candidates = [];

  for (const [languageIndex, language] of languages.entries()) {
    const profiles =
      languageIndex === 0 ? OCR_TESSERACT_PROFILES : OCR_TESSERACT_FALLBACK_PROFILES;

    for (const profile of profiles) {
      try {
        const result = await Tesseract.recognize(
          filePath,
          language,
          tesseractOptionsForProfile(profile)
        );
        const words = (result?.data?.words || [])
          .map((word) => ({
            text: String(word.text || "").trim(),
            confidence: clampConfidence(Number(word.confidence || 0) / 100, 0)
          }))
          .filter((word) => word.text);
        const lowConfidenceWords = words
          .filter((word) => word.confidence < OCR_LOW_CONFIDENCE_WORD_THRESHOLD)
          .sort((left, right) => left.confidence - right.confidence)
          .slice(0, 12)
          .map((word) => word.text);
        const rawConfidence = clampConfidence((result?.data?.confidence || 0) / 100, 0);
        const text = normalizeOcrText(result?.data?.text || "");
        const averageConfidence = calibrateOcrConfidence(rawConfidence, text);

        if (text) {
          const candidateLowConfidenceWords =
            averageConfidence >= OCR_CONFIDENCE_THRESHOLD ? [] : lowConfidenceWords;

          candidates.push({
            text,
            averageConfidence,
            rawConfidence,
            lowConfidenceWords: candidateLowConfidenceWords,
            language,
            profile: profile.name,
            score: scoreOcrCandidate({
              text,
              averageConfidence,
              lowConfidenceWords: candidateLowConfidenceWords
            })
          });
        }
      } catch (error) {
        lastError = error;
      }
    }
  }

  const best = candidates.sort((left, right) => right.score - left.score)[0];
  if (!best) {
    throw lastError || new Error("Tesseract OCR could not process this file.");
  }

  const cleanedContent = await reconstructLowConfidenceSurveyText(best.text, best.rawConfidence);

  return {
    text: best.text,
    cleanedContent,
    averageConfidence: best.averageConfidence,
    provider: "Tesseract",
    model: `tesseract:${best.language}/${best.profile}`,
    languagesDetected: detectLanguageHints(best.text),
    lowConfidenceWords: best.lowConfidenceWords,
    keyPhrases: summarizeEvidenceKeywords(best.text, inferNeedType(best.text)),
    structuredExtraction: {
      languages: detectLanguageHints(best.text),
      lowConfidenceWords: best.lowConfidenceWords,
      evidence: summarizeEvidenceKeywords(best.text, inferNeedType(best.text))
    },
    engines: [
      {
        provider: "Tesseract",
        model: `tesseract:${best.language}/${best.profile}`,
        confidence: best.averageConfidence,
        rawConfidence: best.rawConfidence
      }
    ]
  };
}

async function runGeminiSurveyOCR(filePath, mimeType = "") {
  let parsed = null;

  try {
    parsed = await runGeminiStructuredExtraction(
      filePath,
      inferImageMimeType(filePath, mimeType),
      [
        "You are extracting handwritten or printed survey text from an image that may contain English, Marathi, Hindi, Urdu, Telugu, or Kannada text.",
        "If the image is a screenshot of a handwriting app, ignore navigation controls, keyboard buttons, thumbnails, suggestions, and other UI chrome; extract only the main handwritten note or form content.",
        "If the image is a photographed page or form, read the page top-to-bottom and preserve headings, bullets, labels, dates, counts, amounts, and locations.",
        "For sparse handwriting, preserve line breaks and read the dominant handwritten text even when it is only a short phrase.",
        "Do not invent missing words; mark only truly uncertain words as low_confidence_words.",
        "Return valid JSON only.",
        "Use this shape:",
        '{"text":"","summary":"","language":"","languages":[],"confidence":0.0,"low_confidence_words":[],"key_phrases":[],"need_type":"","severity":"","location_name":"","title":"","required_skills":[],"evidence":[],"people_mentioned":0}',
        "Preserve local-language words exactly. Confidence must be between 0 and 1."
      ].join(" ")
    );
  } catch (error) {
    if (isRecoverableGeminiError(error)) {
      console.warn(`${describeGeminiOcrFailure(error)} Falling back to Tesseract OCR.`);
      return null;
    }

    throw error;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const text = String(parsed.text || parsed.summary || "").trim();
  if (!text) {
    return null;
  }
  const rawConfidence = clampConfidence(parsed.confidence, 0.82);
  const averageConfidence = calibrateOcrConfidence(rawConfidence, text);

  return {
    text,
    averageConfidence,
    provider: "Google Gemini",
    model: GEMINI_MULTIMODAL_MODEL,
    languagesDetected: uniqueValues([
      ...normalizeArray(parsed.languages),
      ...detectLanguageHints(text),
      parsed.language
    ]),
    lowConfidenceWords:
      averageConfidence >= OCR_CONFIDENCE_THRESHOLD
        ? []
        : uniqueValues(normalizeArray(parsed.low_confidence_words)).slice(0, 12),
    keyPhrases: uniqueValues(normalizeArray(parsed.key_phrases)).slice(0, 8),
    structuredExtraction: {
      type: parsed.need_type,
      severity: parsed.severity,
      locationName: parsed.location_name,
      title: parsed.title,
      requiredSkills: normalizeArray(parsed.required_skills),
      evidence: normalizeArray(parsed.evidence),
      languages: uniqueValues(normalizeArray(parsed.languages)),
      peopleMention: Number(parsed.people_mentioned || 0) || null
    },
    engines: [
      {
        provider: "Google Gemini",
        model: GEMINI_MULTIMODAL_MODEL,
        confidence: averageConfidence,
        rawConfidence
      }
    ]
  };
}

function normalizeSurveyTableFormattingResult(parsed, rawText = "") {
  const normalizedRawText = String(rawText || "").trim();
  const hasTable =
    typeof parsed?.hasTable === "string"
      ? parsed.hasTable.trim().toLowerCase() === "true"
      : Boolean(parsed?.hasTable);
  const formattedContent = String(parsed?.formattedContent || "").trim();

  if (hasTable && formattedContent) {
    return {
      hasTable: true,
      formattedContent
    };
  }

  return {
    hasTable: false,
    formattedContent: normalizedRawText
  };
}

function isLikelyMarkdownTable(text = "") {
  return String(text || "")
    .split(/\r?\n/)
    .some((line) => (String(line).match(/\|/g) || []).length >= 2);
}

async function formatSurveyTableContent(filePath, mimeType = "", rawText = "") {
  const normalizedRawText = String(rawText || "").trim();
  if (!normalizedRawText || !geminiClient) {
    return {
      hasTable: false,
      formattedContent: normalizedRawText
    };
  }

  try {
    const parsed = await runGeminiStructuredExtraction(
      filePath,
      inferImageMimeType(filePath, mimeType),
      `This is OCR-extracted text from a handwritten Hindi survey form that may contain a table. Raw text: ${normalizedRawText}. Look at both the raw text and the image carefully. If this content contains a tabular structure with rows and columns, reconstruct it as a clean Markdown table preserving all Hindi text exactly as written. If it does not contain a table, return the text as-is. Return only a JSON object with fields: hasTable (boolean) and formattedContent (string).`
    );

    return normalizeSurveyTableFormattingResult(parsed, normalizedRawText);
  } catch (error) {
    console.warn(`Survey table formatting skipped: ${error.message}`);
    return {
      hasTable: false,
      formattedContent: normalizedRawText
    };
  }
}

function mergeExtractionSignals(primary = {}, secondary = {}) {
  return {
    type: primary.type || secondary.type,
    severity: primary.severity || secondary.severity,
    locationName: primary.locationName || secondary.locationName,
    title: primary.title || secondary.title,
    requiredSkills:
      normalizeArray(primary.requiredSkills).length > 0
        ? normalizeArray(primary.requiredSkills)
        : normalizeArray(secondary.requiredSkills),
    evidence: uniqueValues([
      ...normalizeArray(primary.evidence),
      ...normalizeArray(secondary.evidence)
    ]),
    languages: uniqueValues([
      ...normalizeArray(primary.languages),
      ...normalizeArray(secondary.languages)
    ]),
    peopleMention: primary.peopleMention || secondary.peopleMention || null
  };
}

async function runOCR(filePath, mimeType = "") {
  const results = await Promise.allSettled([
    runTesseractOCR(filePath),
    runGeminiSurveyOCR(filePath, mimeType)
  ]);
  const successes = results
    .filter((result) => result.status === "fulfilled" && result.value?.text)
    .map((result) => result.value);

  if (!successes.length) {
    const failures = results
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason)
      .filter(Boolean);
    const onlyGeminiUnavailable =
      failures.length > 0 && failures.every((error) => isRecoverableGeminiError(error));
    const error = new Error(
      onlyGeminiUnavailable
        ? "OCR could not process this image right now because Gemini is unavailable and Tesseract could not extract readable text. Please try a clearer image or retry after Gemini quota/billing is restored."
        : "No OCR engine could extract text from this survey image."
    );
    error.statusCode = onlyGeminiUnavailable ? 503 : 422;
    throw error;
  }

  const primary = [...successes].sort((left, right) => {
    const leftScore = left.averageConfidence * 100 + Math.min(left.text.length, 200) * 0.03;
    const rightScore = right.averageConfidence * 100 + Math.min(right.text.length, 200) * 0.03;
    return rightScore - leftScore;
  })[0];
  const secondary = successes.find((entry) => entry !== primary) || {};
  const mergedExtraction = mergeExtractionSignals(
    primary.structuredExtraction || {},
    secondary.structuredExtraction || {}
  );
  const shouldCarrySecondaryLowWords =
    Number(primary.averageConfidence || 0) < OCR_CONFIDENCE_THRESHOLD ||
    Number(secondary.averageConfidence || 0) >= Number(primary.averageConfidence || 0);
  const lowConfidenceWords = uniqueValues([
    ...normalizeArray(primary.lowConfidenceWords),
    ...(shouldCarrySecondaryLowWords ? normalizeArray(secondary.lowConfidenceWords) : [])
  ]).slice(0, 12);
  const meanConfidence = clampConfidence(
    successes.reduce((sum, entry) => sum + Number(entry.averageConfidence || 0), 0) / successes.length,
    primary.averageConfidence
  );
  const averageConfidence = clampConfidence(
    Math.max(Number(primary.averageConfidence || 0), meanConfidence),
    primary.averageConfidence
  );
  const tableFormatting = await formatSurveyTableContent(
    filePath,
    mimeType,
    primary.text
  );
  const cleanedContent = String(primary.cleanedContent || secondary.cleanedContent || "").trim();

  return {
    text: tableFormatting.formattedContent || primary.text,
    rawText: primary.text,
    cleanedContent,
    hasTable: tableFormatting.hasTable,
    formattedContent: tableFormatting.formattedContent || primary.text,
    averageConfidence: Number(averageConfidence.toFixed(2)),
    provider:
      successes.length > 1
        ? `${primary.provider || "OCR pipeline"} + ${secondary.provider || "Tesseract"}`
        : primary.provider || "OCR pipeline",
    model: primary.model || null,
    languagesDetected: uniqueValues([
      ...normalizeArray(primary.languagesDetected),
      ...normalizeArray(secondary.languagesDetected)
    ]),
    lowConfidenceWords,
    keyPhrases: uniqueValues([
      ...normalizeArray(primary.keyPhrases),
      ...normalizeArray(secondary.keyPhrases)
    ]),
    structuredExtraction: mergedExtraction,
    engines: successes.flatMap((entry) => entry.engines || [])
  };
}

async function mergeSurveyBatchExtractions(extractions = []) {
  const normalizedExtractions = (Array.isArray(extractions) ? extractions : []).filter(
    (entry) => entry && (entry.rawText || entry.text || entry.formattedContent)
  );

  if (!normalizedExtractions.length) {
    return {
      text: "",
      rawText: "",
      cleanedContent: "",
      averageConfidence: 0,
      languagesDetected: [],
      lowConfidenceWords: [],
      keyPhrases: [],
      structuredExtraction: {}
    };
  }

  const mergedFallbackText = normalizedExtractions
    .map((entry) =>
      String(entry.formattedContent || entry.cleanedContent || entry.text || entry.rawText || "").trim()
    )
    .filter(Boolean)
    .join("\n\n");

  const rawText = normalizedExtractions
    .map((entry, index) => {
      const label = `Page ${index + 1}${entry.filename ? ` (${entry.filename})` : ""}`;
      return `${label}\n${String(entry.rawText || entry.text || entry.formattedContent || "").trim()}`;
    })
    .filter(Boolean)
    .join("\n\n---\n\n")
    .trim();

  const cleanedInput = normalizedExtractions
    .map((entry, index) => {
      const label = `Page ${index + 1}${entry.filename ? ` (${entry.filename})` : ""}`;
      return `${label}\n${String(entry.cleanedContent || entry.formattedContent || entry.text || entry.rawText || "").trim()}`;
    })
    .filter(Boolean)
    .join("\n\n---\n\n")
    .trim();

  let mergedText = cleanedInput || rawText;
  if (geminiClient && mergedText) {
    try {
      mergedText = await runGeminiPlainText(
        [
          "The following are OCR extractions from multiple pages of the same community survey form. Merge them into one coherent structured summary, removing duplicates and preserving all unique names, numbers, locations, needs, and severity information. Return the merged result as clean structured text.",
          "If any section is tabular, preserve it as a Markdown table.",
          cleanedInput || rawText
        ].join("\n\n")
      );
    } catch (error) {
      console.warn(`Survey batch merge fallback used: ${error.message}`);
      mergedText = cleanedInput || rawText;
    }
  }

  const mergedContent = String(mergedText || "").trim() || mergedFallbackText || cleanedInput || rawText;

  const averageConfidence = clampConfidence(
    normalizedExtractions.reduce((sum, entry) => sum + Number(entry.averageConfidence || 0), 0) /
    normalizedExtractions.length,
    0
  );
  const cleanedContent = await reconstructLowConfidenceSurveyText(rawText, averageConfidence);

  return {
    text: String(mergedContent || "").trim(),
    rawText,
    cleanedContent: String(cleanedContent || "").trim(),
    averageConfidence: Number(averageConfidence.toFixed(2)),
    languagesDetected: uniqueValues(
      normalizedExtractions.flatMap((entry) => normalizeArray(entry.languagesDetected))
    ),
    lowConfidenceWords: uniqueValues(
      normalizedExtractions.flatMap((entry) => normalizeArray(entry.lowConfidenceWords))
    ).slice(0, 16),
    keyPhrases: uniqueValues(
      normalizedExtractions.flatMap((entry) => normalizeArray(entry.keyPhrases))
    ).slice(0, 12),
    structuredExtraction: normalizedExtractions.reduce(
      (mergedSignals, entry) =>
        mergeExtractionSignals(mergedSignals, entry.structuredExtraction || {}),
      {}
    )
  };
}

async function transcribeAudio(filePath, mimeType = "audio/webm") {
  if (!geminiClient) {
    const error = new Error("GEMINI_API_KEY is required for audio transcription.");
    error.statusCode = 503;
    throw error;
  }

  const parsed = await runGeminiStructuredExtraction(
    filePath,
    inferAudioMimeType(filePath, mimeType),
    [
      "You are processing a field audio note for civic response in India.",
      "Transcribe the speech faithfully and extract structured needs in one step.",
      "Return valid JSON only using this shape:",
      '{"transcript":"","language":"","languages":[],"confidence":0.0,"key_phrases":[],"need_type":"","severity":"","location_name":"","title":"","required_skills":[],"evidence":[],"people_mentioned":0}',
      "The speech may contain Marathi, Hindi, Urdu, Kannada, Telugu, Tamil, or English. Confidence must be between 0 and 1."
    ].join(" "),
    GEMINI_AUDIO_MODEL
  );

  const text = String(parsed?.transcript || "").trim();
  if (!text) {
    const error = new Error("Audio transcription did not return any text.");
    error.statusCode = 422;
    throw error;
  }

  return {
    text,
    provider: "Google Gemini",
    model: GEMINI_AUDIO_MODEL,
    averageConfidence: clampConfidence(parsed.confidence, 0.86),
    languagesDetected: uniqueValues([
      parsed.language,
      ...normalizeArray(parsed.languages),
      ...detectLanguageHints(text)
    ]),
    keyPhrases: uniqueValues(normalizeArray(parsed.key_phrases)).slice(0, 10),
    structuredExtraction: {
      type: parsed.need_type,
      severity: parsed.severity,
      locationName: parsed.location_name,
      title: parsed.title,
      requiredSkills: normalizeArray(parsed.required_skills),
      evidence: normalizeArray(parsed.evidence),
      languages: uniqueValues(normalizeArray(parsed.languages)),
      peopleMention: Number(parsed.people_mentioned || 0) || null
    }
  };
}

async function sendTwilioReply(to, body) {
  if (!twilioClient || !process.env.TWILIO_WHATSAPP_FROM) {
    return null;
  }

  return twilioClient.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to,
    body
  });
}

async function logMessage({
  phoneNumber = null,
  direction = "incoming",
  fromUser,
  body = "",
  mediaUrl = null
}) {
  await Message.create({
    id: createId("message"),
    phoneNumber,
    direction,
    fromUser,
    body,
    mediaUrl,
    timestamp: new Date()
  });
}

async function requireAuth(request, response, next) {
  const user = await getUserFromRequest(request);
  if (!user) {
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  request.user = user;
  next();
}

function parseWebSocketToken(requestUrl = "", headers = {}) {
  const authHeader = headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  try {
    const parsed = new URL(requestUrl, "http://localhost");
    return parsed.searchParams.get("token") || "";
  } catch (error) {
    return "";
  }
}

async function authenticateWebSocket(request) {
  const token = parseWebSocketToken(request.url, request.headers);
  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload?.sub) {
      return null;
    }
    return getUserWithProfile(payload.sub);
  } catch (error) {
    return null;
  }
}

function sendSocketJson(socket, payload) {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify({ createdAt: new Date().toISOString(), ...payload }));
  }
}

async function updateVolunteerLocationStatus(volunteer, body = {}) {
  const hasCoordinates =
    body.location ||
    body.latitude !== undefined ||
    body.lat !== undefined ||
    body.gps_lat !== undefined ||
    body.longitude !== undefined ||
    body.lng !== undefined ||
    body.gps_lng !== undefined;
  const existingCoords = pointToCoordinates(volunteer.location);
  const coords = hasCoordinates
    ? readLatLngFromBody(body)
    : assertValidCoordinates(existingCoords.lat, existingCoords.lng, "volunteer.location");
  const requestedStatus = String(body.status || "").trim().toLowerCase();
  const isAvailable =
    requestedStatus === "busy" || requestedStatus === "offline"
      ? false
      : requestedStatus === "available"
        ? true
        : body.isAvailable === undefined
          ? volunteer.isAvailable
          : parseBooleanLike(body.isAvailable, volunteer.isAvailable);
  const dispatchMode = normalizeDispatchMode(body.dispatchMode || body.assignmentMode || body.mode);

  await volunteer.update({
    location: pointFromCoordinates(coords.lat, coords.lng),
    isAvailable
  });
  volunteerDispatchModes.set(String(volunteer.id), dispatchMode);

  const cell = setSpatialMembership({
    kind: "volunteer",
    id: volunteer.id,
    latitude: coords.lat,
    longitude: coords.lng,
    active: isAvailable
  });
  await indexVolunteerInRedis(volunteer, { coords, isAvailable });

  if (isAvailable) {
    enqueueDispatchWork({
      kind: "volunteer_available",
      volunteerId: volunteer.id,
      mode: dispatchMode,
      radiusMeters: body.radiusMeters || body.radius_meters
    });
  }

  return {
    volunteer: {
      id: volunteer.id,
      userId: volunteer.userId,
      status: isAvailable ? "available" : "busy",
      dispatchMode,
      location: coords
    },
    spatial: { grid: "h3", cell, resolution: DISPATCH_H3_RESOLUTION }
  };
}

async function handleDispatchSocketMessage({ socket, user, volunteer, rawMessage }) {
  let message;
  try {
    message = JSON.parse(String(rawMessage || "{}"));
  } catch (error) {
    sendSocketJson(socket, { type: "error", error: "WebSocket messages must be JSON." });
    return;
  }

  const type = String(message.type || "").trim();
  try {
    if (type === "volunteer_location_update" || type === "status_update") {
      if (!volunteer) {
        sendSocketJson(socket, { type: "error", error: "Volunteer profile required." });
        return;
      }
      const result = await updateVolunteerLocationStatus(volunteer, message);
      sendSocketJson(socket, { type: "volunteer_status_updated", ...result });
      return;
    }

    if (type === "task_ingest") {
      if (!["ngo", "admin"].includes(user.role)) {
        sendSocketJson(socket, { type: "error", error: "Only NGO workers or admins can ingest dispatch tasks." });
        return;
      }
      const { task, cell } = await createDispatchTaskFromRequest(message.task || message, user);
      await indexTaskInRedis(task);
      enqueueDispatchWork({
        kind: "new_task",
        taskId: task.id,
        mode: normalizeDispatchMode(message.assignmentMode || message.mode),
        radiusMeters: message.radiusMeters || message.radius_meters
      });
      sendSocketJson(socket, {
        type: "task_ingested",
        task: await buildTaskPayload(task, user),
        spatial: { grid: "h3", cell, resolution: DISPATCH_H3_RESOLUTION }
      });
      return;
    }

    if (type === "accept_task") {
      if (!volunteer) {
        sendSocketJson(socket, { type: "error", error: "Volunteer profile required." });
        return;
      }
      const task = await Task.findByPk(message.taskId || message.task_id);
      if (!task) {
        sendSocketJson(socket, { type: "error", error: "Task not found." });
        return;
      }
      let assignment = await Assignment.findOne({ where: { taskId: task.id, volunteerId: volunteer.id } });
      if (!assignment) {
        const taskCoords = pointToCoordinates(task.location);
        const volunteerCoords = pointToCoordinates(volunteer.location);
        const route = await computeRouteEstimate(taskCoords, volunteerCoords);
        const score = dispatchScore({ task, volunteer, route });
        assignment = (await assignTaskToVolunteer({
          task,
          rankedCandidate: { volunteer, ...score },
          mode: "volunteer_choice"
        })).assignment;
      } else {
        await Promise.all([
          assignment.update({ status: "active", assignedAt: new Date() }),
          task.update({ isAssigned: true, status: TASK_STATUS.OPEN, updatedAt: new Date() }),
          volunteer.update({ isAvailable: false })
        ]);
      }
      await recordDispatchOutcome({ task, volunteer, assignment, outcome: "accepted" });
      await Promise.all([
        indexTaskInRedis(task, { active: false }),
        indexVolunteerInRedis(volunteer, { isAvailable: false })
      ]);
      sendSocketJson(socket, { type: "task_acceptance_recorded", taskId: task.id, assignmentId: assignment.id });
      return;
    }

    if (type === "decline_task") {
      if (!volunteer) {
        sendSocketJson(socket, { type: "error", error: "Volunteer profile required." });
        return;
      }
      const task = await Task.findByPk(message.taskId || message.task_id);
      if (!task) {
        sendSocketJson(socket, { type: "error", error: "Task not found." });
        return;
      }
      const assignment = await Assignment.findOne({ where: { taskId: task.id, volunteerId: volunteer.id } });
      if (assignment) {
        await assignment.update({ status: "declined" });
      }
      await volunteer.update({ isAvailable: true });
      await recordDispatchOutcome({ task, volunteer, assignment, outcome: "declined", notes: message.notes });
      await indexVolunteerInRedis(volunteer, { isAvailable: true });
      enqueueDispatchWork({
        kind: "new_task",
        taskId: task.id,
        radiusMeters: message.radiusMeters || message.radius_meters
      });
      sendSocketJson(socket, { type: "task_decline_recorded", taskId: task.id });
      return;
    }

    if (type === "dispatch_outcome") {
      const task = await Task.findByPk(message.taskId || message.task_id);
      if (!task) {
        sendSocketJson(socket, { type: "error", error: "Task not found." });
        return;
      }
      const assignment = message.assignmentId
        ? await Assignment.findByPk(message.assignmentId)
        : volunteer
          ? await Assignment.findOne({ where: { taskId: task.id, volunteerId: volunteer.id } })
          : null;
      const outcomeRecord = await recordDispatchOutcome({
        task,
        volunteer,
        assignment,
        outcome: message.outcome,
        notes: message.notes,
        correction: message.correction
      });
      sendSocketJson(socket, { type: "dispatch_outcome_recorded", outcomeId: outcomeRecord.id });
      return;
    }

    sendSocketJson(socket, { type: "error", error: "Unknown dispatch WebSocket message type." });
  } catch (error) {
    sendSocketJson(socket, { type: "error", error: error.message || "Dispatch WebSocket action failed." });
  }
}

async function attachDispatchWebSocketServer(httpServer) {
  const webSocketServer = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", async (request, socket, head) => {
    let pathname = "";
    try {
      pathname = new URL(request.url, "http://localhost").pathname;
    } catch (error) {
      socket.destroy();
      return;
    }

    if (pathname !== DISPATCH_WS_PATH) {
      return;
    }

    if (!appState.databaseReady) {
      socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
      socket.destroy();
      return;
    }

    let user = null;
    try {
      user = await authenticateWebSocket(request);
    } catch (error) {
      socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
      socket.destroy();
      return;
    }
    if (!user) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    webSocketServer.handleUpgrade(request, socket, head, async (ws) => {
      try {
        const volunteer =
          user.role === "volunteer" ? await ensureVolunteerProfileForUser(user.id) : user.volunteerProfile || null;
        webSocketServer.emit("connection", ws, request, user, volunteer);
      } catch (error) {
        ws.close(1011, "Dispatch socket initialization failed.");
      }
    });
  });

  webSocketServer.on("connection", (socket, request, user, volunteer) => {
    if (volunteer) {
      const streams = volunteerSocketStreams.get(String(volunteer.id)) || new Set();
      streams.add(socket);
      volunteerSocketStreams.set(String(volunteer.id), streams);
    }

    sendSocketJson(socket, {
      type: "ready",
      userId: user.id,
      role: user.role,
      volunteerId: volunteer?.id || null,
      protocol: {
        location: "volunteer_location_update",
        taskIngest: "task_ingest",
        accept: "accept_task",
        decline: "decline_task",
        outcome: "dispatch_outcome"
      }
    });

    socket.on("message", (rawMessage) => {
      handleDispatchSocketMessage({ socket, user, volunteer, rawMessage });
    });

    socket.on("close", () => {
      if (!volunteer) {
        return;
      }
      const streams = volunteerSocketStreams.get(String(volunteer.id));
      if (!streams) {
        return;
      }
      streams.delete(socket);
      if (!streams.size) {
        volunteerSocketStreams.delete(String(volunteer.id));
      }
    });
  });

  return webSocketServer;
}

function requireRole(roles) {
  return (request, response, next) => {
    if (!request.user) {
      response.status(401).json({ error: "Authentication required." });
      return;
    }

    if (!roles.includes(request.user.role)) {
      response.status(403).json({ error: "You do not have access to this route." });
      return;
    }

    next();
  };
}

function isDatabaseBackedRequest(request) {
  const pathname = request.path || "";
  return (
    pathname.startsWith("/api/") ||
    pathname === "/tasks" ||
    pathname.startsWith("/tasks/") ||
    pathname === "/volunteers" ||
    pathname.startsWith("/volunteers/") ||
    pathname === "/dispatch" ||
    pathname.startsWith("/dispatch/")
  );
}

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.get("/favicon.ico", (request, response) => {
  response.status(204).end();
});
app.use("/generated-reports", express.static(REPORTS_DIR));
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(FRONTEND_DIR));

ROLE_PAGE_FILES.forEach((pageFile) => {
  app.get(`/${pageFile}`, (request, response) => {
    response.sendFile(path.join(ROOT_DIR, pageFile));
  });
});

app.use((request, response, next) => {
  if (request.path === "/api/health" || !isDatabaseBackedRequest(request) || appState.databaseReady) {
    next();
    return;
  }

  response.status(503).json({
    error: "Backend data services are still starting. Please retry shortly.",
    ready: false,
    startedAt: appState.initializationStartedAt,
    startupError: appState.startupError ? appState.startupError.message : null
  });
});

app.post("/api/signup", async (request, response, next) => {
  try {
    const role = normalizeRole(request.body.role);
    if (!role) {
      response.status(400).json({ error: "Choose a valid role." });
      return;
    }

    const email = String(request.body.email || "").trim().toLowerCase();
    const password = String(request.body.password || "");
    const name = String(request.body.name || "").trim();

    if (!name || !email || !password) {
      response.status(400).json({ error: "Name, email, and password are required." });
      return;
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      response.status(409).json({ error: "An account with that email already exists." });
      return;
    }

    let companyId = null;
    if (role === "corporate") {
      const companyName = String(request.body.companyName || `${name} Corporate Desk`).trim();
      const company = await Company.create({
        id: createId("company"),
        name: companyName,
        details: `${companyName} joined HelpHive through the public signup flow.`
      });
      companyId = company.id;
    }

    const user = await User.create({
      id: createId("user"),
      name,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role,
      companyId
    });

    await ensureVolunteerProfileForUser(user.id, {
      skills: request.body.skills,
      technicalSkills: request.body.technicalSkills,
      languages: request.body.languages,
      medicalTraining: request.body.medicalTraining,
      communicationStyle: request.body.communicationStyle,
      preferredCauses: request.body.preferredCauses,
      availability: request.body.availability,
      baseLocation: request.body.baseLocation,
      govIdLast4: request.body.govIdLast4,
      emergencyContactName: request.body.emergencyContactName,
      emergencyContactPhone: request.body.emergencyContactPhone,
      vaccinationStatus: request.body.vaccinationStatus
    });

    const createdUser = await getUserWithProfile(user.id);
    response.status(201).json({
      token: buildToken(createdUser),
      user: serializeUser(createdUser, { includePrivate: true })
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/login", async (request, response, next) => {
  try {
    const email = String(request.body.email || "").trim().toLowerCase();
    const password = String(request.body.password || "");

    if (!email || !password) {
      response.status(400).json({ error: "Email and password are required." });
      return;
    }

    const user = await User.findOne({
      where: {
        email: {
          [Op.in]: getLoginEmailCandidates(email)
        }
      },
      include: [
        { model: Volunteer, as: "volunteerProfile" },
        { model: Company, as: "company" }
      ]
    });

    if (!user) {
      response.status(401).json({ error: "Invalid email or password." });
      return;
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      response.status(401).json({ error: "Invalid email or password." });
      return;
    }

    response.json({
      token: buildToken(user),
      user: serializeUser(user, { includePrivate: true })
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/health", async (request, response, next) => {
  if (!appState.databaseReady) {
    response.status(appState.startupError ? 500 : 503).json({
      ok: false,
      ready: false,
      initializing: !appState.startupError,
      startedAt: appState.initializationStartedAt,
      completedAt: appState.initializationCompletedAt,
      error: appState.startupError ? appState.startupError.message : null
    });
    return;
  }

  if (!appState.schemaReady) {
    response.json({
      ok: true,
      ready: true,
      schemaReady: false,
      schemaMaintenanceRunning: appState.schemaMaintenanceRunning,
      startedAt: appState.initializationStartedAt,
      completedAt: appState.initializationCompletedAt,
      redisReady
    });
    return;
  }

  try {
    response.json({
      ok: true,
      ready: true,
      schemaReady: true,
      users: await User.count(),
      tasks: await Task.count(),
      companies: await Company.count(),
      redisReady
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/whatsapp", async (request, response, next) => {
  try {
    const from = String(request.body.From || "").trim();
    const body = String(request.body.Body || "").trim();
    const mediaUrl = request.body.MediaUrl0 || null;
    const latitude = request.body.Latitude ? Number(request.body.Latitude) : null;
    const longitude = request.body.Longitude ? Number(request.body.Longitude) : null;

    await logMessage({
      phoneNumber: from,
      direction: "incoming",
      fromUser: from,
      body,
      mediaUrl
    });

    let session = await IntakeSession.findOne({ where: { phoneNumber: from } });
    if (!session) {
      session = await IntakeSession.create({
        id: createId("session"),
        phoneNumber: from,
        step: "awaiting_location",
        pendingPayload: {}
      });
    }

    let reply =
      "Welcome to HelpHive. Please share the locality first, or send a WhatsApp location pin so we can start the intake.";
    const ngoUser =
      (await User.findOne({ where: { role: "ngo" }, order: [["name", "ASC"]] })) ||
      (await User.findOne({ where: { role: "admin" }, order: [["name", "ASC"]] }));

    if (/restart|start over|reset/i.test(body)) {
      await session.update({
        step: "awaiting_location",
        pendingPayload: {},
        lastInboundAt: new Date()
      });
      reply = "The intake has been reset. Share the locality or a location pin to begin again.";
    } else if (session.step === "awaiting_location") {
      const location =
        Number.isFinite(latitude) && Number.isFinite(longitude)
          ? {
            name: request.body.Address || request.body.Label || "Pinned location",
            lat: latitude,
            lng: longitude,
            ngo: detectLocation(request.body.Address || request.body.Label || "").ngo
          }
          : detectLocation(body, "", { allowDefault: false });

      if (!location?.name) {
        reply = "I couldn't identify the area yet. Please send the locality name, like Kothrud or Pimpri.";
      } else {
        await session.update({
          step: "awaiting_need_type",
          pendingPayload: {
            locationName: location.name,
            latitude: location.lat,
            longitude: location.lng,
            ngoName: location.ngo
          },
          lastInboundAt: new Date()
        });
        reply =
          "Thanks. What kind of need is this: water, sanitation, food, medical, volunteer, or shelter?";
      }
    } else if (session.step === "awaiting_need_type") {
      const type = inferNeedType(body);
      if (!type) {
        reply = "Please reply with a need type like water, sanitation, food, medical, volunteer, or shelter.";
      } else {
        await session.update({
          step: "awaiting_severity",
          pendingPayload: {
            ...(session.pendingPayload || {}),
            type
          },
          lastInboundAt: new Date()
        });
        reply = "Got it. How severe is this right now: critical, urgent, or stable?";
      }
    } else if (session.step === "awaiting_severity") {
      const severity = inferSeverity(body);
      const pending = session.pendingPayload || {};
      const ngoDesk =
        ngoUser ||
        (await User.findOne({
          where: {
            role: {
              [Op.in]: ["ngo", "admin"]
            }
          },
          order: [["name", "ASC"]]
        }));

      const taskContext = buildTaskRoutingProfile({
        type: pending.type || "volunteer",
        severity,
        description: `WhatsApp intake from ${from}: ${body}`,
        locationName: pending.locationName || "Pune"
      });

      const task = await createTaskRecord({
        ngoUserId: ngoDesk.id,
        source: "whatsapp",
        description: `WhatsApp intake from ${from}: ${body}`,
        extractedText: body,
        title: buildTaskTitle(pending.type || "volunteer", pending.locationName || "Pune"),
        type: pending.type || "volunteer",
        severity,
        locationName: pending.locationName || "Pune",
        latitude: pending.latitude || MAP_REFRESH_CENTER.lat,
        longitude: pending.longitude || MAP_REFRESH_CENTER.lng,
        requiredSkills: taskContext.requiredSkills,
        complementarySkills: taskContext.complementarySkills,
        preferredLanguages: taskContext.preferredLanguages,
        preferredCommunicationStyles: taskContext.preferredCommunicationStyles,
        contextTags: taskContext.contextTags,
        minimumMedicalTraining: taskContext.minimumMedicalTraining,
        category: taskContext.category,
        timeWindows: taskContext.timeWindows,
        peopleServed: inferPeopleServed(pending.type || "volunteer", severity)
      });

      await session.update({
        step: "awaiting_location",
        pendingPayload: {},
        lastInboundAt: new Date()
      });

      reply = `Thanks. I created ${task.title} with ${titleCase(severity)} severity. Reply again with a locality if you want to log another need.`;
    }

    try {
      await sendTwilioReply(from, reply);
    } catch (twilioError) {
      console.warn("Twilio send failed:", twilioError.message);
    }

    await logMessage({
      phoneNumber: from,
      direction: "outgoing",
      fromUser: process.env.TWILIO_WHATSAPP_FROM || "kindred-whatsapp-bot",
      body: reply
    });

    response.json({ ok: true, reply });
  } catch (error) {
    next(error);
  }
});

app.get("/api/me", requireAuth, async (request, response) => {
  response.json({ user: serializeUser(request.user, { includePrivate: true }) });
});

app.put("/api/profile", requireAuth, async (request, response, next) => {
  try {
    await request.user.update({
      name: request.body.name || request.user.name
    });

    if ((request.user.role === "csr_partner" || request.user.role === "corporate") && request.user.companyId) {
      const company = await Company.findByPk(request.user.companyId);
      if (company) {
        const companyName = String(request.body.companyName || "").trim();
        if (companyName && companyName !== company.name) {
          const existing = await Company.findOne({ where: { name: companyName } });
          if (existing) {
            response.status(409).json({ error: "A company with that name already exists." });
            return;
          }
          await company.update({ name: companyName });
        }

        let existingDetails = {};
        if (company.details) {
          if (typeof company.details === "object") {
            existingDetails = company.details;
          } else {
            try {
              existingDetails = JSON.parse(company.details);
            } catch (e) {
              existingDetails = { description: company.details };
            }
          }
        }

        const updatedDetails = {
          ...existingDetails,
          sector: request.body.sector !== undefined ? String(request.body.sector).trim() : existingDetails.sector,
          budgetRange: request.body.budgetRange !== undefined ? String(request.body.budgetRange).trim() : existingDetails.budgetRange,
          headquarters: request.body.headquarters !== undefined ? String(request.body.headquarters).trim() : existingDetails.headquarters,
          website: request.body.website !== undefined ? String(request.body.website).trim() : existingDetails.website,
          description: request.body.description !== undefined ? String(request.body.description).trim() : existingDetails.description
        };

        await company.update({
          details: JSON.stringify(updatedDetails)
        });
      }
    } else {
      await ensureVolunteerProfileForUser(request.user.id, {
        skills: request.body.skills,
        technicalSkills: request.body.technicalSkills,
        languages: request.body.languages,
        medicalTraining: request.body.medicalTraining,
        communicationStyle: request.body.communicationStyle,
        preferredCauses: request.body.preferredCauses,
        availability: request.body.availability,
        baseLocation: request.body.baseLocation,
        govIdLast4: request.body.govIdLast4,
        emergencyContactName: request.body.emergencyContactName,
        emergencyContactPhone: request.body.emergencyContactPhone,
        vaccinationStatus: request.body.vaccinationStatus
      });
    }

    const refreshed = await getUserWithProfile(request.user.id);
    response.json({ user: serializeUser(refreshed, { includePrivate: true }) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/overview", requireAuth, async (request, response, next) => {
  try {
    response.json(await buildOverview());
  } catch (error) {
    next(error);
  }
});

app.get("/api/issues", requireAuth, async (request, response, next) => {
  try {
    response.json({
      issues: await buildIssuePayloads(),
      alerts: await buildAlerts()
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/tasks", requireAuth, async (request, response, next) => {
  try {
    const tasks = await loadOpenTasksWithRelations();
    const cachedVolunteerProfiles = await Volunteer.findAll({
      include: [{ model: User, as: "user" }],
      where: {},
      order: [["id", "ASC"]]
    });
    const payloads = await Promise.all(tasks.map((task) => buildTaskPayload(task, request.user, { cachedVolunteerProfiles })));
    const rankedTasks =
      request.user.role === "volunteer"
        ? [...payloads].sort((left, right) => {
          const scoreDelta =
            Number(right.currentUserMatch?.score || -999) - Number(left.currentUserMatch?.score || -999);
          if (scoreDelta !== 0) {
            return scoreDelta;
          }
          const severityOrder = { critical: 0, urgent: 1, stable: 2 };
          return (severityOrder[left.severity] || 3) - (severityOrder[right.severity] || 3);
        })
        : payloads;
    response.json({
      tasks: rankedTasks
    });
  } catch (error) {
    next(error);
  }
});

app.post(["/api/tasks", "/tasks"], requireAuth, async (request, response, next) => {
  try {
    const hasVerificationFields = [
      "gps_lat",
      "gps_lng",
      "device_timestamp",
      "media_url"
    ].some((field) => request.body[field] !== undefined);
    const hasDispatchLocation = Boolean(
      request.body.location ||
      request.body.latitude !== undefined ||
      request.body.lat !== undefined
    );

    if (hasVerificationFields || !hasDispatchLocation) {
      const task = await createOrConfirmVerifiedTask(request.body, request.user);
      const taskCoords = pointToCoordinates(task.location);
      if (Number.isFinite(taskCoords.lat) && Number.isFinite(taskCoords.lng)) {
        setSpatialMembership({
          kind: "task",
          id: task.id,
          latitude: taskCoords.lat,
          longitude: taskCoords.lng,
          active: task.status === TASK_STATUS.OPEN && !task.isAssigned
        });
      }
      await indexTaskInRedis(task);
      const dispatch =
        task.status === TASK_STATUS.OPEN && !task.isAssigned
          ? await dispatchTask(task, { mode: "auto_assign" })
          : null;
      response.status(201).json({ task: await buildTaskPayload(task, request.user), dispatch });
      return;
    }

    const { task, cell } = await createDispatchTaskFromRequest(request.body, request.user);
    const dispatch = await dispatchTask(task, {
      mode: String(request.body.assignmentMode || request.body.mode || "auto_assign") === "volunteer_choice"
        ? "volunteer_choice"
        : "auto_assign",
      radiusMeters: request.body.radiusMeters || request.body.radius_meters
    });
    await indexTaskInRedis(task, { active: !dispatch?.assigned });
    response.status(201).json({
      task: await buildTaskPayload(task, request.user),
      dispatch,
      spatial: { grid: "h3", cell, resolution: DISPATCH_H3_RESOLUTION }
    });
  } catch (error) {
    next(error);
  }
});

app.post(["/api/tasks/:id/confirm", "/tasks/:id/confirm"], requireAuth, async (request, response, next) => {
  try {
    const gpsLat =
      request.body.gps_lat === undefined || request.body.gps_lat === null
        ? null
        : Number(request.body.gps_lat);
    const gpsLng =
      request.body.gps_lng === undefined || request.body.gps_lng === null
        ? null
        : Number(request.body.gps_lng);

    if (
      (gpsLat !== null && !Number.isFinite(gpsLat)) ||
      (gpsLng !== null && !Number.isFinite(gpsLng)) ||
      (gpsLat !== null && (gpsLat < -90 || gpsLat > 90)) ||
      (gpsLng !== null && (gpsLng < -180 || gpsLng > 180))
    ) {
      response.status(400).json({ error: "gps_lat and gps_lng must be valid coordinates when provided." });
      return;
    }

    const task = await sequelize.transaction(async (transaction) => {
      await insertTaskConfirmation({
        taskId: request.params.id,
        reporterId: request.user.id,
        gpsLat,
        gpsLng,
        transaction,
        conflictIsError: true
      });
      const refreshedUser = await User.findByPk(request.user.id, { transaction });
      if (refreshedUser) {
        await awardPointsAndBadges(refreshedUser, 10, transaction);
      }
      return refreshVerificationStatus(request.params.id, request.user, transaction);
    });

    response.json({ task: await buildTaskPayload(task, request.user) });
  } catch (error) {
    next(error);
  }
});

app.patch(
  ["/api/tasks/:id/resolve", "/tasks/:id/resolve"],
  requireAuth,
  requireRole(["ngo", "admin"]),
  async (request, response, next) => {
    try {
      if (typeof request.body.valid !== "boolean") {
        response.status(400).json({ error: "valid must be a boolean." });
        return;
      }

      const result = await sequelize.transaction(async (transaction) => {
        const task = await Task.findByPk(request.params.id, {
          transaction,
          lock: transaction.LOCK.UPDATE
        });

        if (!task) {
          const error = new Error("Task not found.");
          error.statusCode = 404;
          throw error;
        }

        await task.update(
          {
            status: request.body.valid ? TASK_STATUS.CONFIRMED : TASK_STATUS.REJECTED,
            updatedAt: new Date()
          },
          { transaction }
        );

        const [reporters] = await sequelize.query(
          `
            SELECT DISTINCT reporter_id
            FROM (
              SELECT ngo_id AS reporter_id
              FROM tasks
              WHERE id = $1
              UNION
              SELECT reporter_id
              FROM task_confirmations
              WHERE task_id = $1
            ) reporters
            WHERE reporter_id IS NOT NULL
          `,
          {
            bind: [request.params.id],
            transaction
          }
        );

        for (const reporter of reporters) {
          await updateTrustScore(reporter.reporter_id, request.body.valid, {
            query(sql, params) {
              return sequelize.query(sql, {
                bind: params,
                transaction,
                type: Sequelize.QueryTypes.SELECT
              }).then((rows) => ({ rows }));
            }
          });
        }

        return {
          task: await Task.findByPk(request.params.id, {
            include: [{ model: User, as: "ngo" }],
            transaction
          }),
          reporterCount: reporters.length
        };
      });

      response.json({
        task: await buildTaskPayload(result.task, request.user),
        reporterCount: result.reporterCount
      });
    } catch (error) {
      next(error);
    }
  }
);

app.get(
  ["/api/users/:id/trust", "/users/:id/trust"],
  requireAuth,
  requireRole(["admin"]),
  async (request, response, next) => {
    try {
      const user = await User.findByPk(request.params.id, {
        attributes: ["trustScore", "reportsTotal", "reportsConfirmed"]
      });

      if (!user) {
        response.status(404).json({ error: "User not found." });
        return;
      }

      response.json({
        trust_score: user.trustScore,
        reports_total: user.reportsTotal,
        reports_confirmed: user.reportsConfirmed
      });
    } catch (error) {
      next(error);
    }
  }
);

app.get("/api/alerts", requireAuth, async (request, response, next) => {
  try {
    response.json({ alerts: await buildAlerts() });
  } catch (error) {
    next(error);
  }
});

app.get(["/api/dispatch/spatial-index", "/dispatch/spatial-index"], requireAuth, requireRole(["admin"]), async (request, response) => {
  response.json(serializeSpatialIndex());
});

app.get(
  ["/api/volunteers/:id/notifications", "/volunteers/:id/notifications"],
  requireAuth,
  requireRole(["volunteer", "admin"]),
  async (request, response, next) => {
    try {
      const volunteer = await Volunteer.findOne({
        where: {
          [Op.or]: [{ id: request.params.id }, { userId: request.params.id }]
        }
      });

      if (!volunteer) {
        response.status(404).json({ error: "Volunteer not found." });
        return;
      }

      if (request.user.role !== "admin" && volunteer.userId !== request.user.id) {
        response.status(403).json({ error: "You cannot subscribe to this volunteer stream." });
        return;
      }

      response.setHeader("Content-Type", "text/event-stream");
      response.setHeader("Cache-Control", "no-cache");
      response.setHeader("Connection", "keep-alive");
      response.flushHeaders?.();

      const key = String(volunteer.id);
      const streams = volunteerNotificationStreams.get(key) || new Set();
      streams.add(response);
      volunteerNotificationStreams.set(key, streams);

      response.write(`event: ready\n`);
      response.write(`data: ${JSON.stringify({ volunteerId: volunteer.id })}\n\n`);
      for (const event of volunteerNotificationBacklog.get(key) || []) {
        response.write(`event: dispatch\n`);
        response.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      request.on("close", () => {
        const activeStreams = volunteerNotificationStreams.get(key);
        if (!activeStreams) {
          return;
        }
        activeStreams.delete(response);
        if (activeStreams.size === 0) {
          volunteerNotificationStreams.delete(key);
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  ["/api/volunteers/:id/location", "/volunteers/:id/location"],
  requireAuth,
  requireRole(["volunteer", "admin"]),
  async (request, response, next) => {
    try {
      const volunteer = await Volunteer.findOne({
        include: [{ model: User, as: "user" }],
        where: {
          [Op.or]: [{ id: request.params.id }, { userId: request.params.id }]
        }
      });

      if (!volunteer) {
        response.status(404).json({ error: "Volunteer not found." });
        return;
      }

      if (request.user.role !== "admin" && volunteer.userId !== request.user.id) {
        response.status(403).json({ error: "You cannot update this volunteer location." });
        return;
      }

      const result = await updateVolunteerLocationStatus(volunteer, request.body);

      let rematch = null;
      if (result.volunteer.status === "available" && request.body.autoDispatch === true) {
        const nearbyTasks = await Task.findAll({
          where: buildLiveTaskWhere({ isAssigned: false }),
          limit: 5,
          order: [["updatedAt", "DESC"]]
        });
        const dispatched = [];
        for (const task of nearbyTasks) {
          const taskCoords = pointToCoordinates(task.location);
          const coords = result.volunteer.location;
          const distanceKm = haversineKm(coords.lat, coords.lng, taskCoords.lat, taskCoords.lng);
          if (distanceKm !== null && distanceKm * 1000 <= DISPATCH_DEFAULT_RADIUS_METERS) {
            dispatched.push({ taskId: task.id, result: await dispatchTask(task) });
          }
        }
        rematch = dispatched;
      }

      response.json({
        ...result,
        rematch
      });
    } catch (error) {
      next(error);
    }
  }
);

app.get(["/api/tasks/nearby", "/tasks/nearby"], requireAuth, requireRole(["volunteer", "admin"]), async (request, response, next) => {
  try {
    const volunteer =
      request.user.role === "admin" && request.query.volunteerId
        ? await Volunteer.findOne({
          where: {
            [Op.or]: [{ id: request.query.volunteerId }, { userId: request.query.volunteerId }]
          },
          include: [{ model: User, as: "user" }]
        })
        : await ensureVolunteerProfileForUser(request.user.id);

    if (!volunteer) {
      response.status(404).json({ error: "Volunteer not found." });
      return;
    }

    const volunteerCoords = pointToCoordinates(volunteer.location);
    assertValidCoordinates(volunteerCoords.lat, volunteerCoords.lng, "volunteer.location");
    const radiusMeters = Number(request.query.radiusMeters || request.query.radius_meters || DISPATCH_DEFAULT_RADIUS_METERS);
    const sort = String(request.query.sort || "distance").toLowerCase();
    const tasks = await findOpenTasksNear(volunteerCoords, radiusMeters);

    const visibleTasks = [];
    for (const task of tasks) {
      const skillMatchLevel = scoreSkillMatch(task.requiredSkills, volunteer);
      const languageMatchLevel = scoreLanguageMatch(
        normalizeArray(task.preferredLanguages).length ? task.preferredLanguages : preferredLanguagesForTask(task),
        volunteer
      );
      if (skillMatchLevel <= 0 && languageMatchLevel <= 0) {
        continue;
      }

      const taskCoords = pointToCoordinates(task.location);
      const route = await computeRouteEstimate(taskCoords, volunteerCoords);
      visibleTasks.push({
        task,
        skillMatchLevel,
        languageMatchLevel,
        route,
        distanceMeters: route.distanceMeters,
        urgencyScore: urgencyToScore(task)
      });
    }

    visibleTasks.sort((left, right) => {
      if (sort === "urgency") {
        const urgencyDelta = right.urgencyScore - left.urgencyScore;
        if (urgencyDelta !== 0) {
          return urgencyDelta;
        }
      }
      return Number(left.distanceMeters || Infinity) - Number(right.distanceMeters || Infinity);
    });

    response.json({
      tasks: await Promise.all(
        visibleTasks.map(async (entry) => ({
          ...(await buildTaskPayload(entry.task, request.user)),
          match: {
            skillMatchLevel: Number(entry.skillMatchLevel.toFixed(3)),
            languageMatchLevel: Number(entry.languageMatchLevel.toFixed(3)),
            routeTimeSeconds:
              entry.route.durationSeconds === null ? null : Math.round(entry.route.durationSeconds),
            routeDistanceMeters:
              entry.route.distanceMeters === null ? null : Math.round(entry.route.distanceMeters),
            routeProvider: entry.route.provider
          }
        }))
      )
    });
  } catch (error) {
    next(error);
  }
});

app.post(["/api/tasks/:id/accept", "/tasks/:id/accept"], requireAuth, requireRole(["volunteer", "admin"]), async (request, response, next) => {
  try {
    const task = await Task.findByPk(request.params.id);
    if (!task) {
      response.status(404).json({ error: "Task not found." });
      return;
    }

    const volunteer =
      request.user.role === "admin" && request.body.volunteerId
        ? await Volunteer.findOne({ where: { [Op.or]: [{ id: request.body.volunteerId }, { userId: request.body.volunteerId }] } })
        : await ensureVolunteerProfileForUser(request.user.id);

    if (!volunteer) {
      response.status(404).json({ error: "Volunteer not found." });
      return;
    }

    let assignment = await Assignment.findOne({ where: { taskId: task.id, volunteerId: volunteer.id } });
    if (!assignment) {
      const taskCoords = pointToCoordinates(task.location);
      const volunteerCoords = pointToCoordinates(volunteer.location);
      const route = await computeRouteEstimate(taskCoords, volunteerCoords);
      const score = dispatchScore({ task, volunteer, route });
      const assigned = await assignTaskToVolunteer({
        task,
        rankedCandidate: { volunteer, ...score },
        mode: "volunteer_choice"
      });
      assignment = assigned.assignment;
    } else {
      await assignment.update({
        status: "active",
        assignedAt: new Date()
      });
      await Promise.all([
        task.update({ isAssigned: true, status: TASK_STATUS.OPEN, updatedAt: new Date() }),
        volunteer.update({ isAvailable: false })
      ]);
    }

    const taskCoords = pointToCoordinates(task.location);
    setSpatialMembership({ kind: "task", id: task.id, latitude: taskCoords.lat, longitude: taskCoords.lng, active: false });
    setSpatialMembership({ kind: "volunteer", id: volunteer.id, latitude: pointToCoordinates(volunteer.location).lat, longitude: pointToCoordinates(volunteer.location).lng, active: false });
    await recordDispatchOutcome({ task, volunteer, assignment, outcome: "accepted" });
    sendVolunteerNotification(volunteer.id, { type: "task_acceptance_recorded", taskId: task.id, assignmentId: assignment.id });

    response.json({
      task: await buildTaskPayload(await Task.findByPk(task.id), request.user),
      assignment: {
        id: assignment.id,
        taskId: assignment.taskId,
        volunteerId: assignment.volunteerId,
        status: "active"
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post(["/api/tasks/:id/decline", "/tasks/:id/decline"], requireAuth, requireRole(["volunteer", "admin"]), async (request, response, next) => {
  try {
    const task = await Task.findByPk(request.params.id);
    if (!task) {
      response.status(404).json({ error: "Task not found." });
      return;
    }

    const volunteer =
      request.user.role === "admin" && request.body.volunteerId
        ? await Volunteer.findOne({ where: { [Op.or]: [{ id: request.body.volunteerId }, { userId: request.body.volunteerId }] } })
        : await ensureVolunteerProfileForUser(request.user.id);

    if (!volunteer) {
      response.status(404).json({ error: "Volunteer not found." });
      return;
    }

    const assignment = await Assignment.findOne({ where: { taskId: task.id, volunteerId: volunteer.id } });
    if (assignment) {
      await assignment.update({ status: "declined" });
      await recordDispatchOutcome({
        task,
        volunteer,
        assignment,
        outcome: "declined",
        notes: request.body.notes
      });
    }

    const remaining = await Assignment.count({
      where: {
        taskId: task.id,
        status: { [Op.in]: ["pending", "active"] }
      }
    });

    if (!remaining) {
      const coords = pointToCoordinates(task.location);
      await task.update({ isAssigned: false, status: TASK_STATUS.OPEN, updatedAt: new Date() });
      setSpatialMembership({ kind: "task", id: task.id, latitude: coords.lat, longitude: coords.lng, active: true });
    }

    sendVolunteerNotification(volunteer.id, { type: "task_decline_recorded", taskId: task.id });
    const rematch = await dispatchTask(task, { excludeVolunteerIds: [volunteer.id] });

    response.json({
      declined: true,
      taskId: task.id,
      volunteerId: volunteer.id,
      rematch
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/tasks/:id/volunteer", requireAuth, requireRole(["volunteer", "admin"]), async (request, response, next) => {
  try {
    const task = await Task.findByPk(request.params.id);
    if (!task) {
      response.status(404).json({ error: "Task not found." });
      return;
    }

    if (task.status !== TASK_STATUS.OPEN) {
      response.status(400).json({ error: "This task is not available for volunteering." });
      return;
    }

    if (task.completedAt) {
      response.status(400).json({ error: "This task is already completed." });
      return;
    }

    const volunteerProfile = await ensureVolunteerProfileForUser(request.user.id);
    const existingAssignment = await Assignment.findOne({
      where: {
        taskId: task.id,
        volunteerId: volunteerProfile.id
      }
    });

    if (!existingAssignment) {
      await Assignment.create({
        id: createId("assignment"),
        taskId: task.id,
        volunteerId: volunteerProfile.id,
        assignedAt: new Date(),
        status: "active",
        matchScore: computeMatchScore(task, volunteerProfile).score
      });
    } else {
      await existingAssignment.update({
        status: "active",
        assignedAt: new Date()
      });
    }

    await Promise.all([
      task.update({
        isAssigned: true,
        updatedAt: new Date()
      }),
      volunteerProfile.update({ isAvailable: false })
    ]);

    const taskCoords = pointToCoordinates(task.location);
    const volunteerCoords = pointToCoordinates(volunteerProfile.location);
    if (Number.isFinite(taskCoords.lat) && Number.isFinite(taskCoords.lng)) {
      setSpatialMembership({ kind: "task", id: task.id, latitude: taskCoords.lat, longitude: taskCoords.lng, active: false });
    }
    if (Number.isFinite(volunteerCoords.lat) && Number.isFinite(volunteerCoords.lng)) {
      setSpatialMembership({
        kind: "volunteer",
        id: volunteerProfile.id,
        latitude: volunteerCoords.lat,
        longitude: volunteerCoords.lng,
        active: false
      });
    }

    const refreshedTask = await Task.findByPk(task.id, {
      include: [
        { model: User, as: "ngo" },
        {
          model: Assignment,
          as: "assignments",
          include: [{ model: Volunteer, as: "volunteer", include: [{ model: User, as: "user" }] }]
        }
      ]
    });

    response.json({ task: await buildTaskPayload(refreshedTask, request.user) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/tasks/:id/complete", requireAuth, async (request, response, next) => {
  try {
    const task = await Task.findByPk(request.params.id, {
      include: [{ model: Assignment, as: "assignments" }]
    });
    if (!task) {
      response.status(404).json({ error: "Task not found." });
      return;
    }

    const volunteerProfile = await Volunteer.findOne({ where: { userId: request.user.id } });
    const assignedVolunteerIds = new Set((task.assignments || []).map((assignment) => assignment.volunteerId));
    const canComplete =
      request.user.role === "admin" ||
      request.user.role === "ngo" ||
      (volunteerProfile && assignedVolunteerIds.has(volunteerProfile.id));

    if (!canComplete) {
      response.status(403).json({ error: "You cannot complete this task." });
      return;
    }

    await task.update({
      completedAt: new Date(),
      status: TASK_STATUS.COMPLETED,
      peopleServed: task.peopleServed || inferPeopleServed(task.type, task.severity),
      updatedAt: new Date()
    });
    await Promise.all(
      (task.assignments || [])
        .filter((assignment) => ["active", "pending"].includes(assignment.status))
        .map((assignment) => assignment.update({ status: "completed" }))
    );
    const assignedVolunteerIdsToRelease = uniqueValues(
      (task.assignments || []).map((assignment) => assignment.volunteerId)
    );
    if (assignedVolunteerIdsToRelease.length) {
      const volunteersToRelease = await Volunteer.findAll({
        where: { id: { [Op.in]: assignedVolunteerIdsToRelease } }
      });
      await Promise.all(
        volunteersToRelease.map(async (volunteer) => {
          await volunteer.update({ isAvailable: true });
          await indexVolunteerInRedis(volunteer, { isAvailable: true });
          const coords = pointToCoordinates(volunteer.location);
          if (Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
            setSpatialMembership({
              kind: "volunteer",
              id: volunteer.id,
              latitude: coords.lat,
              longitude: coords.lng,
              active: true
            });
          }
        })
      );
    }
    if (volunteerProfile) {
      const assignment = (task.assignments || []).find(
        (entry) => entry.volunteerId === volunteerProfile.id
      );
      await recordDispatchOutcome({
        task,
        volunteer: volunteerProfile,
        assignment,
        outcome: "completed",
        notes: request.body.notes
      });
    }
    const taskCoords = pointToCoordinates(task.location);
    await indexTaskInRedis(task, { coords: taskCoords, active: false });
    if (Number.isFinite(taskCoords.lat) && Number.isFinite(taskCoords.lng)) {
      setSpatialMembership({
        kind: "task",
        id: task.id,
        latitude: taskCoords.lat,
        longitude: taskCoords.lng,
        active: false
      });
    }

    const refreshedTask = await Task.findByPk(task.id, {
      include: [
        { model: User, as: "ngo" },
        {
          model: Assignment,
          as: "assignments",
          include: [{ model: Volunteer, as: "volunteer", include: [{ model: User, as: "user" }] }]
        }
      ]
    });

    response.json({ task: await buildTaskPayload(refreshedTask, request.user) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/dispatch/outcomes", requireAuth, async (request, response, next) => {
  try {
    const task = await Task.findByPk(request.body.taskId || request.body.task_id);
    if (!task) {
      response.status(404).json({ error: "Task not found." });
      return;
    }

    const volunteer = request.body.volunteerId || request.body.volunteer_id
      ? await Volunteer.findOne({
        where: {
          [Op.or]: [
            { id: request.body.volunteerId || request.body.volunteer_id },
            { userId: request.body.volunteerId || request.body.volunteer_id }
          ]
        }
      })
      : await Volunteer.findOne({ where: { userId: request.user.id } });
    const assignment = request.body.assignmentId || request.body.assignment_id
      ? await Assignment.findByPk(request.body.assignmentId || request.body.assignment_id)
      : volunteer
        ? await Assignment.findOne({ where: { taskId: task.id, volunteerId: volunteer.id } })
        : null;
    const isAssignedVolunteer = Boolean(volunteer && assignment && volunteer.userId === request.user.id);
    const canRecord =
      request.user.role === "admin" ||
      request.user.role === "ngo" ||
      isAssignedVolunteer;

    if (!canRecord) {
      response.status(403).json({ error: "You cannot record this dispatch outcome." });
      return;
    }

    const outcome = String(request.body.outcome || "").trim().toLowerCase();
    const outcomeRecord = await recordDispatchOutcome({
      task,
      volunteer,
      assignment,
      outcome,
      notes: request.body.notes,
      correction: request.body.correction
    });

    if (["cancelled", "canceled", "false"].includes(outcome)) {
      await task.update({
        status: outcome === "false" ? TASK_STATUS.REJECTED : TASK_STATUS.OPEN,
        isAssigned: false,
        rejectedAt: outcome === "false" ? new Date() : task.rejectedAt,
        updatedAt: new Date()
      });
      if (assignment) {
        await assignment.update({ status: "cancelled" });
      }
      const taskCoords = pointToCoordinates(task.location);
      const shouldRemainDispatchable = outcome !== "false";
      setSpatialMembership({
        kind: "task",
        id: task.id,
        latitude: taskCoords.lat,
        longitude: taskCoords.lng,
        active: shouldRemainDispatchable
      });
      await indexTaskInRedis(task, { coords: taskCoords, active: shouldRemainDispatchable });
    }

    if (volunteer && ["cancelled", "canceled", "false", "completed"].includes(outcome)) {
      await volunteer.update({ isAvailable: true });
      await indexVolunteerInRedis(volunteer, { isAvailable: true });
    }

    response.status(201).json({
      outcome: {
        id: outcomeRecord.id,
        taskId: outcomeRecord.taskId,
        volunteerId: outcomeRecord.volunteerId,
        assignmentId: outcomeRecord.assignmentId,
        outcome: outcomeRecord.outcome
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/match", requireAuth, requireRole(["admin"]), async (request, response, next) => {
  try {
    const tasks = await Task.findAll({
      where: buildLiveTaskWhere({
        isAssigned: false
      }),
      order: [sequelize.literal('"Task"."severity" ASC'), sequelize.literal('"Task"."updated_at" DESC')]
    });

    const volunteers = await Volunteer.findAll({
      include: [{ model: User, as: "user", where: { role: "volunteer" } }]
    });

    const activeAssignments = await Assignment.findAll({
      include: [{ model: Task, as: "task", where: buildLiveTaskWhere() }]
    });

    const unavailableVolunteerIds = new Set(activeAssignments.map((assignment) => assignment.volunteerId));
    const availableVolunteers = volunteers.filter((volunteer) => !unavailableVolunteerIds.has(volunteer.id));
    const volunteerPool = new Map(availableVolunteers.map((volunteer) => [volunteer.id, volunteer]));
    const pairings = [];

    const tasksByPriority = [...tasks].sort((left, right) => {
      const severityOrder = { critical: 0, urgent: 1, stable: 2 };
      return severityOrder[left.severity] - severityOrder[right.severity];
    });

    for (const task of tasksByPriority) {
      const targetCount = requiresBuddy(task) ? 2 : 1;
      const selected = [];

      for (let index = 0; index < targetCount; index += 1) {
        const ranked = [...volunteerPool.values()]
          .filter((volunteer) => !selected.some((entry) => entry.volunteer.id === volunteer.id))
          .map((volunteer) => ({
            volunteer,
            score: computeMatchScore(
              task,
              volunteer,
              selected.map((entry) => entry.volunteer)
            )
          }))
          .sort((left, right) => right.score.score - left.score.score);

        const nextVolunteer = ranked.find((entry) => entry.score.score > -6);
        if (!nextVolunteer) {
          break;
        }
        selected.push(nextVolunteer);
      }

      const assignedUsers = [];
      for (const entry of selected) {
        await Assignment.create({
          id: createId("assignment"),
          taskId: task.id,
          volunteerId: entry.volunteer.id,
          assignedAt: new Date()
        });
        volunteerPool.delete(entry.volunteer.id);
        assignedUsers.push(entry.volunteer.user.name);
      }

      if (assignedUsers.length) {
        await task.update({
          isAssigned: true,
          updatedAt: new Date()
        });
      }

      pairings.push({
        task: task.title,
        taskId: task.id,
        taskTitle: task.title,
        category: task.category,
        locationName: task.locationName,
        requiredSkills: task.requiredSkills || [],
        complementarySkills: task.complementarySkills || [],
        contextTags: task.contextTags || [],
        requiresBuddy: requiresBuddy(task),
        preferredLanguages: normalizeArray(task.preferredLanguages).length
          ? task.preferredLanguages
          : preferredLanguagesForTask(task),
        safetyMode: requiresBuddy(task) ? "buddy_required" : "solo_allowed",
        volunteers: selected.map((entry) => ({
          id: entry.volunteer.user.id,
          name: entry.volunteer.user.name,
          score: Number(entry.score.score.toFixed(2)),
          reasons: entry.score.reasons,
          verificationReady: entry.score.verification.ready,
          missingChecks: entry.score.verification.missing,
          distanceKm:
            entry.score.distanceKm === null ? null : Number(entry.score.distanceKm.toFixed(2))
        })),
        warnings:
          selected.length < targetCount
            ? [`Only ${selected.length} of ${targetCount} recommended responders could be assigned.`]
            : []
      });
    }

    response.json({ matches: pairings });
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/surveys",
  requireAuth,
  requireRole(["ngo", "admin"]),
  upload.array("image", MAX_SURVEY_UPLOAD_FILES),
  async (request, response, next) => {
    try {
      const files = Array.isArray(request.files) ? request.files : [];
      if (!files.length) {
        response.status(400).json({ error: "Please upload at least one survey image." });
        return;
      }

      const batchImageUrls = files.map((file) => buildUploadUrl(request, file.filename)).filter(Boolean);
      const results = [];
      const successfulExtractions = [];
      let processedCount = 0;
      let passedCount = 0;
      let failedCount = 0;

      for (const file of files) {
        const filename = file.originalname || file.filename || path.basename(file.path || "");
        const imageUrl = buildUploadUrl(request, file.filename);

        try {
          const ocr = await runOCR(file.path, file.mimetype || "");
          const capturedClearly = !shouldRequireReview(ocr.averageConfidence, ocr.lowConfidenceWords);
          processedCount += 1;
          if (capturedClearly) {
            passedCount += 1;
          }

          successfulExtractions.push({
            ...ocr,
            filename,
            imageUrl
          });
          results.push({
            filename,
            imageUrl,
            imageUrls: batchImageUrls,
            ocr,
            capturedClearly
          });
        } catch (error) {
          failedCount += 1;
          results.push({
            filename,
            imageUrl,
            imageUrls: batchImageUrls,
            capturedClearly: false,
            error: error.message || "Survey image could not be processed."
          });
        }
      }

      if (!successfulExtractions.length) {
        const error = new Error("No survey images could be processed from this upload.");
        error.statusCode = 422;
        throw error;
      }

      const mergedBatch = await mergeSurveyBatchExtractions(successfulExtractions);
      const mergedContent = String(mergedBatch.text || "").trim();
      console.log("Merged content:", mergedContent);
      const routingText = mergedBatch.rawText || mergedBatch.text || "";
      const displayText = mergedBatch.cleanedContent || mergedContent || routingText;
      const parsed = extractNeedSignals(displayText, mergedBatch.structuredExtraction || {});
      const needsReview = shouldRequireReview(mergedBatch.averageConfidence, mergedBatch.lowConfidenceWords);
      const task = await createTaskRecord({
        ngoUserId: request.user.id,
        source: "ocr",
        status: needsReview ? TASK_STATUS.PENDING_REVIEW : TASK_STATUS.OPEN,
        description: displayText || "OCR survey intake",
        extractedText: displayText,
        title: parsed.title,
        type: parsed.type,
        severity: parsed.severity,
        locationName: parsed.locationName,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        requiredSkills: parsed.requiredSkills,
        complementarySkills: parsed.complementarySkills,
        preferredLanguages: parsed.preferredLanguages,
        preferredCommunicationStyles: parsed.preferredCommunicationStyles,
        contextTags: parsed.contextTags,
        minimumMedicalTraining: parsed.minimumMedicalTraining,
        category: parsed.category,
        timeWindows: parsed.timeWindows,
        peopleServed: inferPeopleServed(parsed.type, parsed.severity),
        mediaUrl: batchImageUrls[0] || null
      });

      const review = await createReviewIfNeeded({
        taskId: task.id,
        source: "ocr",
        rawText: displayText,
        rawExtractedText: routingText,
        cleanedContent: mergedBatch.cleanedContent,
        formattedContent: mergedContent,
        hasTable: isLikelyMarkdownTable(mergedContent),
        confidence: mergedBatch.averageConfidence,
        suggestedType: parsed.type,
        suggestedSeverity: parsed.severity,
        suggestedLocation: parsed.locationName,
        flaggedWords: mergedBatch.lowConfidenceWords,
        evidence: parsed.evidence,
        pipeline: {
          provider: "OCR batch merge",
          model: GEMINI_MULTIMODAL_MODEL,
          engines: successfulExtractions.flatMap((entry) => entry.engines || []),
          keyPhrases: mergedBatch.keyPhrases
        },
        languages: mergedBatch.languagesDetected,
        imageUrl: batchImageUrls[0] || null,
        imageUrls: batchImageUrls
      });

      response.status(201).json({
        summary: {
          submittedCount: files.length,
          processedCount,
          passedCount,
          flaggedCount: review ? 1 : 0,
          failedCount
        },
        task: {
          id: task.id,
          title: task.title,
          type: task.type,
          severity: task.severity,
          locationName: task.locationName,
          needsReview: Boolean(review)
        },
        merged: {
          text: mergedContent,
          rawText: mergedBatch.rawText,
          cleanedContent: mergedBatch.cleanedContent,
          formattedContent: mergedContent,
          averageConfidence: mergedBatch.averageConfidence,
          languagesDetected: mergedBatch.languagesDetected,
          keyPhrases: mergedBatch.keyPhrases
        },
        reviewId: review?.id || null,
        results
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/voice",
  requireAuth,
  requireRole(["ngo", "admin"]),
  upload.single("audio"),
  async (request, response, next) => {
    try {
      if (!request.file) {
        response.status(400).json({ error: "Please upload an audio file." });
        return;
      }

      const transcript = await transcribeAudio(request.file.path, request.file.mimetype || "audio/webm");
      const parsed = extractNeedSignals(transcript.text, transcript.structuredExtraction || {});
      const needsReview = shouldRequireReview(transcript.averageConfidence, []);
      const task = await createTaskRecord({
        ngoUserId: request.user.id,
        source: "voice",
        status: needsReview ? TASK_STATUS.PENDING_REVIEW : TASK_STATUS.OPEN,
        description: transcript.text,
        extractedText: transcript.text,
        title: parsed.title,
        type: parsed.type,
        severity: parsed.severity,
        locationName: parsed.locationName,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        requiredSkills: parsed.requiredSkills,
        complementarySkills: parsed.complementarySkills,
        preferredLanguages: parsed.preferredLanguages,
        preferredCommunicationStyles: parsed.preferredCommunicationStyles,
        contextTags: parsed.contextTags,
        minimumMedicalTraining: parsed.minimumMedicalTraining,
        category: parsed.category,
        timeWindows: parsed.timeWindows,
        peopleServed: inferPeopleServed(parsed.type, parsed.severity)
      });

      const review = await createReviewIfNeeded({
        taskId: task.id,
        source: "voice",
        rawText: transcript.text,
        confidence: transcript.averageConfidence,
        suggestedType: parsed.type,
        suggestedSeverity: parsed.severity,
        suggestedLocation: parsed.locationName,
        flaggedWords: [],
        evidence: parsed.evidence,
        pipeline: {
          provider: transcript.provider,
          model: transcript.model,
          keyPhrases: transcript.keyPhrases
        },
        languages: transcript.languagesDetected
      });

      response.status(201).json({
        transcript,
        need: {
          id: task.id,
          title: task.title,
          type: task.type,
          severity: task.severity,
          locationName: task.locationName,
          needsReview: Boolean(review)
        },
        reviewId: review?.id || null
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post("/api/manual-need", requireAuth, requireRole(["ngo", "admin"]), async (request, response, next) => {
  try {
    const description = String(request.body.description || "").trim();
    if (!description) {
      response.status(400).json({ error: "Please describe the need." });
      return;
    }

    const parsed = extractNeedSignals(description);
    const task = await createTaskRecord({
      ngoUserId: request.user.id,
      source: "manual",
      description,
      title: parsed.title,
      type: parsed.type,
      severity: parsed.severity,
      locationName: parsed.locationName,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      requiredSkills: parsed.requiredSkills,
      complementarySkills: parsed.complementarySkills,
      preferredLanguages: parsed.preferredLanguages,
      preferredCommunicationStyles: parsed.preferredCommunicationStyles,
      contextTags: parsed.contextTags,
      minimumMedicalTraining: parsed.minimumMedicalTraining,
      category: parsed.category,
      timeWindows: parsed.timeWindows,
      peopleServed: inferPeopleServed(parsed.type, parsed.severity)
    });

    response.status(201).json({
      need: {
        id: task.id,
        title: task.title,
        description: task.description,
        type: task.type,
        severity: task.severity
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin-summary", requireAuth, requireRole(["admin"]), async (request, response, next) => {
  try {
    response.json(await buildAdminSummary());
  } catch (error) {
    next(error);
  }
});

app.get("/api/review-queue", requireAuth, requireRole(["admin"]), async (request, response, next) => {
  try {
    response.json({ items: await buildReviewQueue() });
  } catch (error) {
    next(error);
  }
});

app.put("/api/needs/:id", requireAuth, requireRole(["admin"]), async (request, response, next) => {
  try {
    const review = await Review.findByPk(request.params.id, {
      include: [{ model: Task, as: "task" }]
    });

    if (!review || !review.task) {
      response.status(404).json({ error: "Review item not found." });
      return;
    }

    if (review.status !== "pending") {
      response.status(400).json({ error: "This review item has already been processed." });
      return;
    }

    const location = detectLocation(request.body.locationName || review.task.locationName);
    const correctedText = String(request.body.correctedText || request.body.description || "").trim();
    const existingPayload = review.correctedPayload || {};
    const routingProfile = buildTaskRoutingProfile({
      type: review.task.type,
      severity: request.body.severity || review.task.severity,
      description: correctedText || request.body.description || review.task.description,
      locationName: request.body.locationName || review.task.locationName,
      requiredSkills: review.task.requiredSkills,
      complementarySkills: review.task.complementarySkills,
      preferredLanguages: review.task.preferredLanguages,
      preferredCommunicationStyles: review.task.preferredCommunicationStyles,
      contextTags: review.task.contextTags,
      minimumMedicalTraining: review.task.minimumMedicalTraining,
      category: review.task.category,
      timeWindows: review.task.timeWindows
    });
    await review.task.update({
      title: request.body.title || review.task.title,
      description: correctedText || request.body.description || review.task.description,
      severity: normalizeSeverity(request.body.severity || review.task.severity),
      locationName: request.body.locationName || review.task.locationName,
      status: TASK_STATUS.OPEN,
      category: routingProfile.category,
      requiredSkills: routingProfile.requiredSkills,
      complementarySkills: routingProfile.complementarySkills,
      preferredLanguages: routingProfile.preferredLanguages,
      preferredCommunicationStyles: routingProfile.preferredCommunicationStyles,
      contextTags: routingProfile.contextTags,
      minimumMedicalTraining: routingProfile.minimumMedicalTraining,
      timeWindows: routingProfile.timeWindows,
      location: pointFromCoordinates(location.lat, location.lng),
      rejectedAt: null,
      updatedAt: new Date()
    });

    await review.update({
      status: "approved",
      correctedPayload: {
        ...existingPayload,
        title: request.body.title || review.task.title,
        description: correctedText || request.body.description || review.task.description,
        correctedText: correctedText || review.task.description,
        severity: normalizeSeverity(request.body.severity || review.task.severity),
        locationName: request.body.locationName || review.task.locationName,
        trainingStatus: "approved_for_feedback",
        reviewedAt: new Date().toISOString()
      }
    });

    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.put("/api/needs/:id/reject", requireAuth, requireRole(["admin"]), async (request, response, next) => {
  try {
    const review = await Review.findByPk(request.params.id, {
      include: [{ model: Task, as: "task" }]
    });

    if (!review || !review.task) {
      response.status(404).json({ error: "Review item not found." });
      return;
    }

    if (review.status !== "pending") {
      response.status(400).json({ error: "This review item has already been processed." });
      return;
    }

    const rejectedAt = new Date();
    const existingPayload = review.correctedPayload || {};

    await review.task.update({
      status: TASK_STATUS.REJECTED,
      rejectedAt,
      updatedAt: rejectedAt
    });

    await review.update({
      status: "rejected",
      correctedPayload: {
        ...existingPayload,
        trainingStatus: "rejected_for_feedback",
        rejectedAt: rejectedAt.toISOString()
      }
    });

    response.json({ ok: true, rejectedAt: rejectedAt.toISOString() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/companies", requireAuth, requireRole(["corporate", "admin"]), async (request, response, next) => {
  try {
    const companies = await getCompaniesForUser(request.user);
    response.json({
      companies: companies.map((company) => company.get({ plain: true }))
    });
  } catch (error) {
    next(error);
  }
});

app.get(
  "/api/companies/:id/csr-stats",
  requireAuth,
  requireRole(["corporate", "admin"]),
  async (request, response, next) => {
    try {
      const companyId = request.user.role === "corporate" ? request.user.companyId : request.params.id;
      if (!companyId) {
        response.status(400).json({ error: "No company is linked to this account." });
        return;
      }

      const stats = await buildCSRStats(companyId, request.query);
      if (!stats) {
        response.status(404).json({ error: "Company not found." });
        return;
      }

      response.json(stats);
    } catch (error) {
      next(error);
    }
  }
);

app.get("/api/csr-report", requireAuth, requireRole(["corporate", "admin"]), async (request, response, next) => {
  try {
    const fallbackCompanyId =
      request.user.companyId || (await Company.findOne({ order: [["name", "ASC"]] }))?.id;
    if (!fallbackCompanyId) {
      response.status(404).json({ error: "Company not found." });
      return;
    }

    const stats = await buildCSRStats(fallbackCompanyId, request.query);
    if (!stats) {
      response.status(404).json({ error: "Company not found." });
      return;
    }

    response.json(stats);
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/companies/:id/report",
  requireAuth,
  requireRole(["corporate", "admin"]),
  async (request, response, next) => {
    try {
      const companyId = request.user.role === "corporate" ? request.user.companyId : request.params.id;
      if (!companyId) {
        response.status(400).json({ error: "No company is linked to this account." });
        return;
      }

      const generated = await generateCSRReport(companyId, request.body || {});
      if (!generated) {
        response.status(404).json({ error: "Company not found." });
        return;
      }

      const publicOrigin = buildPublicOrigin(request);
      response.status(201).json({
        ...generated,
        downloadUrl: publicOrigin
          ? new URL(generated.downloadUrl, publicOrigin).toString()
          : generated.downloadUrl
      });
    } catch (error) {
      next(error);
    }
  }
);

app.get("/api/ngos", requireAuth, async (request, response, next) => {
  try {
    const ngos = await User.findAll({
      where: { role: "ngo" },
      attributes: ["id", "name", "email"],
      include: [{ model: Volunteer, as: "volunteerProfile", attributes: ["baseLocation"], required: false }],
      order: [["name", "ASC"]]
    });

    // Fetch task stats per NGO in one query
    const companyId = request.user?.companyId || null;
    const taskStatsRows = await sequelize.query(
      `SELECT
         ngo_id AS "ngoId",
         COUNT(*)::int AS "totalTasks",
         COUNT(CASE WHEN status = 'completed' THEN 1 END)::int AS "completedTasks",
         COALESCE(SUM(people_served), 0)::int AS "peopleServed",
         MAX(GREATEST(COALESCE(completed_at, created_at), created_at)) AS "latestActivity"
       FROM tasks
       WHERE ngo_id = ANY($1::text[])
       ${companyId ? "AND company_id = $2" : ""}
       GROUP BY ngo_id`,
      {
        bind: companyId
          ? [ngos.map(n => n.id), companyId]
          : [ngos.map(n => n.id)],
        type: sequelize.QueryTypes.SELECT
      }
    );

    const statsMap = {};
    for (const row of taskStatsRows) {
      statsMap[row.ngoId] = row;
    }

    response.json({
      ngos: ngos.map(ngo => {
        const stats = statsMap[ngo.id] || {
          totalTasks: 0,
          completedTasks: 0,
          peopleServed: 0,
          latestActivity: null
        };
        return {
          id: ngo.id,
          name: ngo.name,
          email: ngo.email,
          baseLocation: ngo.volunteerProfile?.baseLocation || "",
          totalTasks: stats.totalTasks,
          completedTasks: stats.completedTasks,
          peopleServed: stats.peopleServed,
          latestActivity: stats.latestActivity
        };
      })
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/ngos", requireAuth, requireRole(["corporate", "admin"]), async (request, response, next) => {
  try {
    const { name, email, password, baseLocation } = request.body;
    if (!name || !email || !password) {
      response.status(400).json({ error: "Name, email, and password are required." });
      return;
    }

    const existing = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existing) {
      response.status(409).json({ error: "An account with that email already exists." });
      return;
    }

    const ngoUser = await User.create({
      id: createId("user"),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash: await bcrypt.hash(password, 10),
      role: "ngo"
    });

    await ensureVolunteerProfileForUser(ngoUser.id, {
      baseLocation: baseLocation ? baseLocation.trim() : ""
    });

    const createdNgo = await getUserWithProfile(ngoUser.id);

    response.status(201).json({
      ngo: {
        id: createdNgo.id,
        name: createdNgo.name,
        email: createdNgo.email,
        baseLocation: createdNgo.volunteerProfile?.baseLocation || ""
      }
    });
  } catch (error) {
    next(error);
  }
});

// ────────────────────────────────────────────────────────────
// Safety: SOS Alerts
// ────────────────────────────────────────────────────────────
app.post("/api/volunteers/sos", requireAuth, requireRole(["volunteer"]), async (request, response, next) => {
  try {
    const latitude = Number(request.body.latitude || 0) || null;
    const longitude = Number(request.body.longitude || 0) || null;

    const volunteer = await Volunteer.findOne({ where: { userId: request.user.id } });
    if (!volunteer) {
      response.status(404).json({ error: "Volunteer profile not found." });
      return;
    }

    const alert = await SOSAlert.create({
      id: createId("sos"),
      volunteerId: request.user.id,
      volunteerName: request.user.name || "Unknown",
      latitude,
      longitude,
      status: "active"
    });

    await awardPointsAndBadges(request.user, 5);

    response.status(201).json({ alert, message: "SOS alert sent. Coordinators have been notified." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/sos/:id/resolve", requireAuth, requireRole(["admin", "ngo"]), async (request, response, next) => {
  try {
    const alert = await SOSAlert.findByPk(request.params.id);
    if (!alert) {
      response.status(404).json({ error: "SOS alert not found." });
      return;
    }

    if (alert.status !== "active") {
      response.status(400).json({ error: "This alert has already been resolved." });
      return;
    }

    await alert.update({ status: "resolved", resolvedAt: new Date() });

    response.json({ alert, message: "SOS alert resolved." });
  } catch (error) {
    next(error);
  }
});

app.get("/api/sos/active", requireAuth, requireRole(["admin", "ngo"]), async (request, response, next) => {
  try {
    const alerts = await SOSAlert.findAll({
      where: { status: "active" },
      order: [["created_at", "DESC"]]
    });
    response.json({ alerts });
  } catch (error) {
    next(error);
  }
});

// ────────────────────────────────────────────────────────────
// Safety: Task Feedback / Verification
// ────────────────────────────────────────────────────────────
app.post("/api/tasks/:id/feedback", requireAuth, requireRole(["volunteer", "admin", "ngo"]), async (request, response, next) => {
  try {
    const task = await Task.findByPk(request.params.id, {
      include: [{ model: User, as: "ngo" }]
    });
    if (!task) {
      response.status(404).json({ error: "Task not found." });
      return;
    }

    const rating = Math.max(1, Math.min(5, Number(request.body.rating || 3)));
    const verified = request.body.verified !== false;
    const comments = String(request.body.comments || "").trim();

    const volunteer = await ensureVolunteerProfileForUser(request.user.id);
    if (!volunteer) {
      response.status(400).json({ error: "Volunteer profile not found." });
      return;
    }

    const feedback = await sequelize.transaction(async (transaction) => {
      const created = await TaskFeedback.create({
        id: createId("feedback"),
        taskId: task.id,
        volunteerId: volunteer.id,
        rating,
        verified,
        comments
      }, { transaction });

      // Mark task completed
      await task.update({
        status: TASK_STATUS.COMPLETED,
        completedAt: new Date()
      }, { transaction });

      // Update volunteer availability
      if (volunteer) {
        await volunteer.update({ isAvailable: true }, { transaction });
      }

      // Update trust scores for reporters
      const reporterUser = task.ngo;
      if (reporterUser) {
        const queryable = {
          query(sql, params) {
            return sequelize.query(sql, {
              bind: params,
              transaction,
              type: Sequelize.QueryTypes.SELECT
            }).then((rows) => ({ rows }));
          }
        };
        await updateTrustScore(reporterUser.id, verified, queryable);
      }

      // Award gamification points to the volunteer
      const refreshedUser = await User.findByPk(request.user.id, { transaction });
      if (refreshedUser) {
        await awardPointsAndBadges(refreshedUser, verified ? 50 : 10, transaction);
      }

      return created;
    });

    response.json({ feedback, message: "Thank you for your feedback." });
  } catch (error) {
    next(error);
  }
});

// ────────────────────────────────────────────────────────────
// Gamification: Leaderboard
// ────────────────────────────────────────────────────────────
app.get("/api/leaderboard", requireAuth, async (request, response, next) => {
  try {
    const users = await User.findAll({
      where: { points: { [Op.gt]: 0 } },
      order: [["points", "DESC"]],
      limit: 25
    });

    response.json({
      leaderboard: users.map((user, index) => ({
        rank: index + 1,
        id: user.id,
        name: user.name,
        role: user.role,
        roleLabel: ROLE_LABELS[user.role] || titleCase(user.role),
        points: user.points,
        badges: user.badges || [],
        trustScore: Number(user.trustScore || 0).toFixed(2)
      }))
    });
  } catch (error) {
    next(error);
  }
});

// ────────────────────────────────────────────────────────────
// Manual Vetting: Coordinator Queue
// ────────────────────────────────────────────────────────────
app.get("/api/coordinators/vetting-queue", requireAuth, requireRole(["admin", "ngo"]), async (request, response, next) => {
  try {
    const tasks = await Task.findAll({
      where: { status: TASK_STATUS.PENDING_VETTING },
      include: [{ model: User, as: "ngo" }],
      order: [sequelize.literal('"Task"."updated_at" DESC')]
    });

    response.json({
      items: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        severity: task.severity,
        locationName: task.locationName,
        peopleServed: task.peopleServed,
        type: task.type,
        reporter: task.ngo?.name || "Unknown",
        createdAt: readTimestamp(task, "createdAt")
      }))
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/tasks/:id/vet", requireAuth, requireRole(["admin", "ngo"]), async (request, response, next) => {
  try {
    const task = await Task.findByPk(request.params.id);
    if (!task) {
      response.status(404).json({ error: "Task not found." });
      return;
    }

    if (task.status !== TASK_STATUS.PENDING_VETTING) {
      response.status(400).json({ error: "This task is not awaiting vetting." });
      return;
    }

    const approved = request.body.approved !== false;
    await task.update({
      status: approved ? TASK_STATUS.OPEN : TASK_STATUS.REJECTED,
      rejectedAt: approved ? null : new Date(),
      updatedAt: new Date()
    });

    response.json({
      task: { id: task.id, title: task.title, status: task.status },
      message: approved ? "Task approved and now visible to volunteers." : "Task rejected."
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, request, response, next) => {
  console.error(error);
  response.status(error.statusCode || 500).json({
    error: error.message || "Something went wrong."
  });
});

async function initializeApp() {
  appState.initializationStartedAt = new Date().toISOString();
  appState.initializationCompletedAt = null;
  appState.startupError = null;
  await ensureDirectories();
  await waitForDatabaseConnection();
  appState.databaseReady = true;
  appState.initializationCompletedAt = new Date().toISOString();
  console.log(`Database connection ready: ${DISPLAY_DATABASE_URL}`);

  runSchemaMaintenance();
}

async function runSchemaMaintenance() {
  if (appState.schemaMaintenanceRunning) {
    return;
  }

  appState.schemaMaintenanceRunning = true;
  try {
    await ensureDatabase();
    await seedDatabase();
    appState.schemaReady = true;
    warmDispatchInfrastructure();
  } catch (error) {
    appState.startupError = error;
    console.error("Database schema maintenance failed:", error);
  } finally {
    appState.schemaMaintenanceRunning = false;
  }
}

async function warmDispatchInfrastructure() {
  try {
    await rebuildSpatialIndex();
  } catch (error) {
    console.warn(`In-memory dispatch index warmup skipped: ${error.message}`);
  }

  const redisConnected = await connectRedis();
  if (!redisConnected) {
    return;
  }

  try {
    await rebuildRedisDispatchIndex();
  } catch (error) {
    console.warn(`Redis dispatch index warmup skipped: ${error.message}`);
  }
}

const httpServer = http.createServer(app);

function startHttpServer({ dispatchWebSocketReady = false } = {}) {
  httpServer.once("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `Port ${port} is already in use. Stop the existing server or start this app with a different PORT.`
      );
      process.exit(1);
    }

    if (error.code === "EPERM") {
      console.error(
        `Unable to bind ${host}:${port}. Try setting HOST=127.0.0.1 for local development or choose a different PORT.`
      );
      process.exit(1);
    }

    console.error("HTTP server startup failed:", error);
    process.exit(1);
  });

  httpServer.listen(port, host, () => {
    console.log(`Server is running at http://${host}:${port}`);
    console.log(`Data services initializing in background.`);
    if (dispatchWebSocketReady) {
      console.log(`Dispatch WebSocket ready at ${DISPATCH_WS_PATH}`);
    }
  });
}

attachDispatchWebSocketServer(httpServer)
  .then(() => {
    startHttpServer({ dispatchWebSocketReady: true });
  })
  .catch((error) => {
    console.error("Dispatch WebSocket startup failed:", error);
    startHttpServer();
  });

initializeApp().catch((error) => {
  appState.databaseReady = false;
  appState.startupError = error;
  appState.initializationCompletedAt = new Date().toISOString();
  console.error("Application startup failed:", error);
  if (error?.name?.includes("Sequelize")) {
    console.error(
      `Check that PostgreSQL is running and the service has DATABASE_URL or PGHOST/PGDATABASE/PGUSER/PGPASSWORD configured. Effective database target: ${DISPLAY_DATABASE_URL}`
    );
  }
});
