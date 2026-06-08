const path = require("path");
const fs = require("fs");
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
const { GoogleGenAI, createPartFromUri, createUserContent } = require("@google/genai");
const twilio = require("twilio");
const Tesseract = require("tesseract.js");
const { Sequelize, DataTypes, Op } = require("sequelize");

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
const JWT_SECRET = process.env.JWT_SECRET || "kindred-dev-secret";
const DEFAULT_DATABASE_URL = "postgres://postgres:postgres@127.0.0.1:5432/kindredpune";
const DB_LOCATION_MODE = String(process.env.DB_LOCATION_MODE || "postgis").trim().toLowerCase();
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
const SILENT_NEED_DECAY_LAMBDA = Number(process.env.SILENT_NEED_DECAY_LAMBDA || 0.08);
const SILENT_NEED_LOOKBACK_DAYS = Number(process.env.SILENT_NEED_LOOKBACK_DAYS || 5);
const GEMINI_MULTIMODAL_MODEL = process.env.GEMINI_MULTIMODAL_MODEL || "gemini-2.5-flash";
const GEMINI_AUDIO_MODEL = process.env.GEMINI_AUDIO_MODEL || "gemini-2.5-flash";
const MAP_REFRESH_CENTER = { lat: 18.5204, lng: 73.8567 };
const DB_CONNECTION_RETRY_ATTEMPTS = Number(process.env.DB_CONNECTION_RETRY_ATTEMPTS || 12);
const DB_CONNECTION_RETRY_DELAY_MS = Number(process.env.DB_CONNECTION_RETRY_DELAY_MS || 2500);
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
      `postgres://${encodeURIComponent(connection.connectionParts?.username || "unknown")}:****@${
        connection.connectionParts?.host || "unknown"
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
  return code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EHOSTUNREACH";
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

const sequelizeOptions = {
  dialect: "postgres",
  logging: false,
  dialectOptions: DATABASE_SSL_ENABLED ? { ssl: { require: true, rejectUnauthorized: false } } : {}
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
  REJECTED: "rejected",
  COMPLETED: "completed"
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
  const authHeader = request.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  try {
    return jwt.verify(authHeader.slice(7), JWT_SECRET);
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
    score: Number(totalScore.toFixed(2)),
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
    }
  },
  {
    tableName: "tasks",
    createdAt: "created_at",
    updatedAt: "updated_at"
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
    }
  },
  {
    tableName: "assignments",
    timestamps: false
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

User.hasOne(Volunteer, { foreignKey: "user_id", as: "volunteerProfile" });
Volunteer.belongsTo(User, { foreignKey: "user_id", as: "user" });

User.belongsTo(Company, { foreignKey: "company_id", as: "company" });
Company.hasMany(User, { foreignKey: "company_id", as: "users" });

Task.belongsTo(User, { foreignKey: "ngo_id", as: "ngo" });
User.hasMany(Task, { foreignKey: "ngo_id", as: "ngoTasks" });

Task.belongsTo(Company, { foreignKey: "company_id", as: "company" });
Company.hasMany(Task, { foreignKey: "company_id", as: "tasks" });

Assignment.belongsTo(Task, { foreignKey: "task_id", as: "task" });
Task.hasMany(Assignment, { foreignKey: "task_id", as: "assignments" });

Assignment.belongsTo(Volunteer, { foreignKey: "volunteer_id", as: "volunteer" });
Volunteer.hasMany(Assignment, { foreignKey: "volunteer_id", as: "assignments" });

Contribution.belongsTo(Company, { foreignKey: "company_id", as: "company" });
Company.hasMany(Contribution, { foreignKey: "company_id", as: "contributions" });

CSRReport.belongsTo(Company, { foreignKey: "company_id", as: "company" });
Company.hasMany(CSRReport, { foreignKey: "company_id", as: "reports" });

Review.belongsTo(Task, { foreignKey: "task_id", as: "task" });
Task.hasMany(Review, { foreignKey: "task_id", as: "reviews" });

async function ensureDatabase() {
  for (let attempt = 1; attempt <= DB_CONNECTION_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await sequelize.authenticate();
      break;
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
  await sequelize.query(
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP WITH TIME ZONE;"
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

  const payload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role] || titleCase(user.role),
    companyId: user.companyId || null,
    companyName: user.company?.name || null,
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
    verification
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

async function buildTaskPayload(task, currentUser = null) {
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
  const volunteerProfiles = await Volunteer.findAll({
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
  peopleServed = 0
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
    status: normalizeTaskStatus(status, TASK_STATUS.OPEN),
    rejectedAt: null
  });
}

async function createReviewIfNeeded({
  taskId,
  source,
  rawText,
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
      correctedText:
        review.correctedPayload?.correctedText ||
        review.correctedPayload?.description ||
        review.task.description,
      flaggedWords: review.correctedPayload?.flaggedWords || [],
      evidence: review.correctedPayload?.evidence || [],
      pipeline: review.correctedPayload?.pipeline || {},
      languages: review.correctedPayload?.languages || [],
      imageUrl: review.correctedPayload?.imageUrl || null,
      imageUrls: review.correctedPayload?.imageUrls || []
    }));
}

async function buildAdminSummary() {
  const overview = await buildOverview();
  const alerts = await buildAlerts();
  const openTasks = await loadOpenTasksWithRelations();

  return {
    metrics: [
      { label: "Open needs", value: overview.openNeeds },
      { label: "Review queue", value: (await Review.count({ where: { status: "pending" } })).toString() },
      { label: "Alerts raised", value: alerts.length.toString() },
      { label: "Volunteer coverage", value: overview.volunteerReadiness }
    ],
    alerts,
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

  const dateRange = buildDateRange(filters, filters);
  const contributionWhere = {
    companyId,
    ...buildDateWhere("date", dateRange.startDate, dateRange.endDate)
  };
  const taskWhere = {
    companyId,
    completedAt: {
      [Op.not]: null
    },
    ...buildDateWhere("completedAt", dateRange.startDate, dateRange.endDate)
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

  const monthlyHours = contributions.reduce((accumulator, contribution) => {
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
      ? `between ${dateRange.startDate ? dateRange.startDate.toLocaleDateString("en-IN") : "the start"} and ${
          dateRange.endDate ? dateRange.endDate.toLocaleDateString("en-IN") : "today"
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
    recentReports: reports.map((report) => report.get({ plain: true })),
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
    testimonials: stats.testimonials
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
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
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

async function runTesseractOCR(filePath) {
  const languages = uniqueValues([OCR_LANGUAGES, "eng+hin", "eng"]);
  let lastError = null;

  for (const language of languages) {
    try {
      const result = await Tesseract.recognize(filePath, language);
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
      const averageConfidence = clampConfidence((result?.data?.confidence || 0) / 100, 0);
      const text = result?.data?.text?.trim() || "";

      return {
        text,
        averageConfidence,
        provider: "Tesseract",
        model: `tesseract:${language}`,
        languagesDetected: detectLanguageHints(text),
        lowConfidenceWords,
        keyPhrases: summarizeEvidenceKeywords(text, inferNeedType(text)),
        structuredExtraction: {
          languages: detectLanguageHints(text),
          lowConfidenceWords,
          evidence: summarizeEvidenceKeywords(text, inferNeedType(text))
        },
        engines: [{ provider: "Tesseract", model: `tesseract:${language}`, confidence: averageConfidence }]
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Tesseract OCR could not process this file.");
}

async function runGeminiSurveyOCR(filePath, mimeType = "") {
  const parsed = await runGeminiStructuredExtraction(
    filePath,
    inferImageMimeType(filePath, mimeType),
    [
      "You are extracting survey text from an image that may contain English, Marathi, Hindi, Urdu, Telugu, or Kannada text.",
      "Return valid JSON only.",
      "Use this shape:",
      '{"text":"","summary":"","language":"","languages":[],"confidence":0.0,"low_confidence_words":[],"key_phrases":[],"need_type":"","severity":"","location_name":"","title":"","required_skills":[],"evidence":[],"people_mentioned":0}',
      "Preserve local-language words exactly. Confidence must be between 0 and 1."
    ].join(" ")
  );

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const text = String(parsed.text || parsed.summary || "").trim();
  if (!text) {
    return null;
  }

  return {
    text,
    averageConfidence: clampConfidence(parsed.confidence, 0.82),
    provider: "Google Gemini",
    model: GEMINI_MULTIMODAL_MODEL,
    languagesDetected: uniqueValues([
      ...normalizeArray(parsed.languages),
      ...detectLanguageHints(text),
      parsed.language
    ]),
    lowConfidenceWords: uniqueValues(normalizeArray(parsed.low_confidence_words)).slice(0, 12),
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
    engines: [{ provider: "Google Gemini", model: GEMINI_MULTIMODAL_MODEL, confidence: clampConfidence(parsed.confidence, 0.82) }]
  };
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
    throw new Error("No OCR engine could extract text from this survey image.");
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
  const lowConfidenceWords = uniqueValues([
    ...normalizeArray(primary.lowConfidenceWords),
    ...normalizeArray(secondary.lowConfidenceWords)
  ]).slice(0, 12);
  const averageConfidence = clampConfidence(
    successes.reduce((sum, entry) => sum + Number(entry.averageConfidence || 0), 0) / successes.length,
    primary.averageConfidence
  );

  return {
    text: primary.text,
    averageConfidence: Number(averageConfidence.toFixed(2)),
    provider:
      successes.length > 1
        ? `${primary.provider} + ${secondary.provider || "Tesseract"}`
        : primary.provider,
    model: primary.model,
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

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/generated-reports", express.static(REPORTS_DIR));
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(FRONTEND_DIR));

ROLE_PAGE_FILES.forEach((pageFile) => {
  app.get(`/${pageFile}`, (request, response) => {
    response.sendFile(path.join(ROOT_DIR, pageFile));
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
  try {
    response.json({
      ok: true,
      users: await User.count(),
      tasks: await Task.count(),
      companies: await Company.count()
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
    const payloads = await Promise.all(tasks.map((task) => buildTaskPayload(task, request.user)));
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

app.get("/api/alerts", requireAuth, async (request, response, next) => {
  try {
    response.json({ alerts: await buildAlerts() });
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
        assignedAt: new Date()
      });
    }

    await task.update({
      isAssigned: true,
      updatedAt: new Date()
    });

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
      let processedCount = 0;
      let passedCount = 0;
      let flaggedCount = 0;
      let failedCount = 0;

      for (const file of files) {
        const filename = file.originalname || file.filename || path.basename(file.path || "");
        const imageUrl = buildUploadUrl(request, file.filename);

        try {
          const ocr = await runOCR(file.path, file.mimetype || "");
          const parsed = extractNeedSignals(ocr.text, ocr.structuredExtraction || {});
          const needsReview = shouldRequireReview(ocr.averageConfidence, ocr.lowConfidenceWords);
          const task = await createTaskRecord({
            ngoUserId: request.user.id,
            source: "ocr",
            status: needsReview ? TASK_STATUS.PENDING_REVIEW : TASK_STATUS.OPEN,
            description: ocr.text || "OCR survey intake",
            extractedText: ocr.text,
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
            source: "ocr",
            rawText: ocr.text,
            confidence: ocr.averageConfidence,
            suggestedType: parsed.type,
            suggestedSeverity: parsed.severity,
            suggestedLocation: parsed.locationName,
            flaggedWords: ocr.lowConfidenceWords,
            evidence: parsed.evidence,
            pipeline: {
              provider: ocr.provider,
              model: ocr.model,
              engines: ocr.engines,
              keyPhrases: ocr.keyPhrases
            },
            languages: ocr.languagesDetected,
            imageUrl,
            imageUrls: batchImageUrls
          });

          processedCount += 1;
          if (review) {
            flaggedCount += 1;
          } else {
            passedCount += 1;
          }

          results.push({
            filename,
            imageUrl,
            imageUrls: batchImageUrls,
            ocr,
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
          failedCount += 1;
          results.push({
            filename,
            imageUrl,
            imageUrls: batchImageUrls,
            error: error.message || "Survey image could not be processed."
          });
        }
      }

      response.status(201).json({
        summary: {
          submittedCount: files.length,
          processedCount,
          passedCount,
          flaggedCount,
          failedCount
        },
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

app.use((error, request, response, next) => {
  console.error(error);
  response.status(error.statusCode || 500).json({
    error: error.message || "Something went wrong."
  });
});

async function initializeApp() {
  await ensureDirectories();
  await ensureDatabase();
  await seedDatabase();
}

initializeApp()
  .then(() => {
    app.listen(port, "0.0.0.0", () => {
      console.log(`Server is running on port ${port}`);
      console.log(`Database connection ready: ${DISPLAY_DATABASE_URL}`);
    });
  })
  .catch((error) => {
    console.error("Application startup failed:", error);
    if (error?.name?.includes("Sequelize")) {
      console.error(
        `Check that PostgreSQL with PostGIS is running and the service has DATABASE_URL or PGHOST/PGDATABASE/PGUSER/PGPASSWORD configured. Effective database target: ${DISPLAY_DATABASE_URL}`
      );
    }
    process.exit(1);
  });
