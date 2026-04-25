require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
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

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "kindred-dev-secret";
const DATABASE_URL =
  process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/kindredpune";
const REPORTS_DIR = path.join(__dirname, "generated-reports");
const UPLOAD_DIR = path.join(__dirname, "uploads");
const TEMPLATE_PATH = path.join(__dirname, "templates", "csr-report.hbs");
const SEED_DATA_FILE = path.join(__dirname, "data", "db.json");
const OCR_CONFIDENCE_THRESHOLD = Number(process.env.OCR_CONFIDENCE_THRESHOLD || 0.8);
const MAP_REFRESH_CENTER = { lat: 18.5204, lng: 73.8567 };

const geminiClient = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const twilioClient =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

const sequelize = new Sequelize(DATABASE_URL, {
  dialect: "postgres",
  logging: false,
  dialectOptions: process.env.DB_SSL === "true" ? { ssl: { require: true, rejectUnauthorized: false } } : {}
});

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
  water: ["water", "tanker", "refill", "purification", "drinking water", "पाणी"],
  sanitation: ["sanitation", "waste", "garbage", "overflow", "drain", "toilet", "cleaning", "कचरा"],
  volunteer: ["volunteer", "helper", "support staff", "community support"],
  medical: ["medical", "medicine", "doctor", "clinic", "fever", "triage", "hospital", "दवा"],
  food: ["food", "ration", "meal", "kitchen", "hunger", "groceries", "राशन"],
  shelter: ["shelter", "housing", "roof", "sleeping", "eviction"],
  education: ["school", "education", "student", "supplies"]
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

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function normalizeRole(role) {
  return ROLE_ALIASES[String(role || "").trim().toLowerCase()] || null;
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

function titleCase(value = "") {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
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

function inferSeverity(text = "") {
  const normalized = String(text || "").toLowerCase();

  for (const [severity, keywords] of Object.entries(SEVERITY_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
      return severity;
    }
  }

  return "urgent";
}

function inferPeopleServed(type, severity) {
  const base = type === "food" ? 28 : type === "medical" ? 18 : 22;
  const multiplier = severity === "critical" ? 1.5 : severity === "urgent" ? 1.2 : 1;
  return Math.round(base * multiplier);
}

function buildTaskTitle(type, locationName) {
  return `${titleCase(type)} Support - ${locationName}`;
}

function extractNeedSignals(text = "", fallback = {}) {
  const location = detectLocation(text, fallback.locationName);
  const type = fallback.type || inferNeedType(text);
  const severity = fallback.severity || inferSeverity(text);

  return {
    type,
    severity,
    locationName: location.name,
    latitude: location.lat,
    longitude: location.lng,
    ngoName: location.ngo,
    title: fallback.title || buildTaskTitle(type, location.name),
    requiredSkills: SKILL_MAP[type] || ["community outreach"]
  };
}

function computeMatchScore(task, volunteer) {
  const taskCoords = pointToCoordinates(task.location);
  const volunteerCoords = pointToCoordinates(volunteer.location);
  const taskSkills = normalizeArray(task.requiredSkills);
  const volunteerSkills = normalizeArray(volunteer.skills);

  const overlapCount = taskSkills.filter((skill) =>
    volunteerSkills.some(
      (volunteerSkill) => volunteerSkill.toLowerCase() === String(skill).toLowerCase()
    )
  ).length;

  const distanceKm = haversineKm(taskCoords.lat, taskCoords.lng, volunteerCoords.lat, volunteerCoords.lng);
  const normalizedDistance = distanceKm === null ? 15 : distanceKm;

  return {
    overlapCount,
    distanceKm,
    score: overlapCount - normalizedDistance
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
    languages: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: []
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
    location: {
      type: DataTypes.GEOGRAPHY("POINT", 4326),
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
    peopleServed: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "people_served"
    },
    location: {
      type: DataTypes.GEOGRAPHY("POINT", 4326),
      allowNull: true
    },
    isAssigned: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "is_assigned"
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "completed_at"
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
  await sequelize.authenticate();
  await sequelize.query("CREATE EXTENSION IF NOT EXISTS postgis;");
  await sequelize.sync();
  await sequelize.query("CREATE INDEX IF NOT EXISTS volunteers_location_idx ON volunteers USING GIST (location);");
  await sequelize.query("CREATE INDEX IF NOT EXISTS tasks_location_idx ON tasks USING GIST (location);");
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
        `${company.name} contributes funds and volunteer hours into KindredPune response lanes.`
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
      languages: normalizeArray(seededUser.languages),
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
      requiredSkills: normalizeArray(task.requiredSkills),
      peopleServed: task.status === "completed" ? inferPeopleServed(task.type, task.severity) : 0,
      location: pointFromCoordinates(task.latitude, task.longitude),
      isAssigned: Boolean((task.assignedVolunteerIds || []).length),
      createdAt: task.createdAt ? new Date(task.createdAt) : new Date(),
      updatedAt: task.updatedAt ? new Date(task.updatedAt) : new Date(),
      completedAt: task.completedAt ? new Date(task.completedAt) : null
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
      severity: {
        [Op.in]: ["critical", "urgent"]
      }
    },
    limit: 1
  });

  if (lowConfidenceTasks[0]) {
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

function serializeUser(user) {
  const profile = user?.volunteerProfile || null;
  const coordinates = pointToCoordinates(profile?.location);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role] || titleCase(user.role),
    companyId: user.companyId || null,
    companyName: user.company?.name || null,
    skills: profile?.skills || [],
    languages: profile?.languages || [],
    availability: profile?.availability || "",
    baseLocation: profile?.baseLocation || "",
    latitude: coordinates.lat,
    longitude: coordinates.lng
  };
}

async function ensureVolunteerProfileForUser(userId, payload = {}) {
  const existing = await Volunteer.findOne({ where: { userId } });
  const detectedLocation = detectLocation(payload.baseLocation || payload.locationName || "");
  const latitude = payload.latitude ?? detectedLocation.lat;
  const longitude = payload.longitude ?? detectedLocation.lng;

  if (existing) {
    await existing.update({
      skills: payload.skills ? normalizeArray(payload.skills) : existing.skills,
      languages: payload.languages ? normalizeArray(payload.languages) : existing.languages,
      availability: payload.availability ?? existing.availability,
      baseLocation: payload.baseLocation ?? existing.baseLocation,
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
    languages: normalizeArray(payload.languages),
    availability: payload.availability || "",
    baseLocation: payload.baseLocation || detectedLocation.name,
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

  const assignedUsers = (taskWithRelations.assignments || [])
    .map((assignment) => assignment.volunteer?.user)
    .filter(Boolean)
    .map((user) => serializeUser({ ...user.get({ plain: true }), volunteerProfile: user.volunteerProfile }));

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
      score: computeMatchScore(taskWithRelations, profile)
    }))
    .sort((left, right) => right.score.score - left.score.score)
    .slice(0, 2);

  const taskCoords = pointToCoordinates(taskWithRelations.location);
  const currentCoords = pointToCoordinates(currentUser?.volunteerProfile?.location);
  const distanceKm = currentUser
    ? haversineKm(taskCoords.lat, taskCoords.lng, currentCoords.lat, currentCoords.lng)
    : null;

  return {
    id: taskWithRelations.id,
    title: taskWithRelations.title,
    type: taskWithRelations.type,
    severity: taskWithRelations.severity,
    locationName: taskWithRelations.locationName,
    latitude: taskCoords.lat,
    longitude: taskCoords.lng,
    status: taskWithRelations.completedAt ? "completed" : taskWithRelations.isAssigned ? "in_progress" : "open",
    requiredSkills: taskWithRelations.requiredSkills || [],
    assignedUsers,
    assignedVolunteerIds: (taskWithRelations.assignments || []).map((assignment) => assignment.volunteerId),
    sponsorCompanyId: taskWithRelations.companyId || null,
    createdAt: taskWithRelations.createdAt,
    updatedAt: taskWithRelations.updatedAt,
    completedAt: taskWithRelations.completedAt,
    notes: taskWithRelations.description,
    ngo: taskWithRelations.ngo?.name || "NGO Desk",
    buddySuggestions: availableSuggestions.map(({ profile }) =>
      serializeUser({ ...profile.user.get({ plain: true }), volunteerProfile: profile.get({ plain: true }) })
    ),
    distanceKm: distanceKm === null ? null : Number(distanceKm.toFixed(1))
  };
}

async function createTaskRecord({
  ngoUserId,
  companyId = null,
  source = "manual",
  description,
  extractedText = "",
  title,
  type,
  severity,
  locationName,
  latitude,
  longitude,
  requiredSkills = [],
  peopleServed = 0
}) {
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
    requiredSkills,
    peopleServed,
    location: pointFromCoordinates(latitude, longitude),
    isAssigned: false
  });
}

async function createReviewIfNeeded({ taskId, source, rawText, confidence, suggestedType, suggestedSeverity, suggestedLocation }) {
  if (Number(confidence) >= OCR_CONFIDENCE_THRESHOLD) {
    return null;
  }

  return Review.create({
    id: createId("review"),
    taskId,
    source,
    rawText,
    confidence: Number(confidence.toFixed(2)),
    suggestedType,
    suggestedSeverity,
    suggestedLocation,
    status: "pending"
  });
}

async function loadOpenTasksWithRelations() {
  return Task.findAll({
    where: {
      completedAt: null
    },
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
    criticalClusters: tasks.filter((task) => task.severity === "critical").length,
    responseCycle: `${Math.round(responseMinutes)} min`,
    volunteerReadiness: `${Math.round((matchedCount / Math.max(tasks.length, 1)) * 100)}%`,
    activeVolunteers
  };
}

async function buildAlerts() {
  const tasks = await Task.findAll({
    where: {
      completedAt: null,
      severity: {
        [Op.in]: ["critical", "urgent"]
      }
    },
    order: sequelize.literal('"Task"."updated_at" DESC')
  });

  return tasks.map((task) => {
    const coords = pointToCoordinates(task.location);
    return {
      id: `alert-${task.id}`,
      type: task.type,
      severity: task.severity,
      title: `${titleCase(task.type)} alert - ${task.locationName}`,
      locationName: task.locationName,
      latitude: coords.lat,
      longitude: coords.lng,
      evidenceCount: task.severity === "critical" ? 3 : 2,
      explanation: `${titleCase(task.type)} support remains open in ${task.locationName}.`
    };
  });
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
    .filter((review) => review.task)
    .map((review) => ({
      id: review.id,
      taskId: review.taskId,
      source: review.source,
      title: review.task.title,
      description: review.task.description,
      severity: review.task.severity,
      locationName: review.task.locationName,
      confidence: Number(review.confidence),
      rawText: review.rawText || ""
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
    where: {
      completedAt: null
    },
    include: [{ model: User, as: "ngo" }],
    order: sequelize.literal('"Task"."updated_at" DESC')
  });

  return tasks.map((task) => {
    const coords = pointToCoordinates(task.location);
    return {
      id: task.id,
      type: task.type,
      severity: task.severity,
      label: task.title,
      updated: formatTimeAgo(readTimestamp(task, "updatedAt", "createdAt")),
      updated_at: readTimestamp(task, "updatedAt", "createdAt"),
      ngo: task.ngo?.name || "NGO Desk",
      locationName: task.locationName,
      coordinates: coords,
      lat: coords.lat,
      lng: coords.lng
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

  const receiptLines = await Promise.all(
    completedTasks.map(async (task) => {
      const volunteerCount = await Assignment.count({ where: { taskId: task.id } });
      return {
        title: task.title,
        locationName: task.locationName,
        volunteers: volunteerCount,
        completedAt: task.completedAt
          ? task.completedAt.toLocaleDateString("en-IN")
          : "Pending"
      };
    })
  );

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
    categorySummary: stats.categorySummary
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

async function runOCR(filePath) {
  const result = await Tesseract.recognize(filePath, "eng");
  const averageConfidence = Number(((result?.data?.confidence || 0) / 100).toFixed(2));
  const text = result?.data?.text?.trim() || "";
  return { text, averageConfidence };
}

async function transcribeAudio(filePath, mimeType = "audio/webm") {
  if (!geminiClient) {
    const error = new Error("GEMINI_API_KEY is required for audio transcription.");
    error.statusCode = 503;
    throw error;
  }

  const uploadedFile = await geminiClient.files.upload({
    file: filePath,
    config: { mimeType: inferAudioMimeType(filePath, mimeType) }
  });

  const transcript = await geminiClient.models.generateContent({
    model: "gemini-2.5-flash",
    contents: createUserContent([
      createPartFromUri(uploadedFile.uri, uploadedFile.mimeType || mimeType),
      "Generate a clean transcript of the speech in this audio. Return only the transcript text."
    ])
  });

  return {
    text: transcript.text || "",
    provider: "Google Gemini",
    model: "gemini-2.5-flash"
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
app.use(express.static(__dirname));

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
        details: `${companyName} joined KindredPune through the public signup flow.`
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
      languages: request.body.languages,
      availability: request.body.availability,
      baseLocation: request.body.baseLocation
    });

    const createdUser = await getUserWithProfile(user.id);
    response.status(201).json({
      token: buildToken(createdUser),
      user: serializeUser(createdUser)
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
      where: { email },
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
      user: serializeUser(user)
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
      "Welcome to KindredPune. Please share the locality first, or send a WhatsApp location pin so we can start the intake.";
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
        requiredSkills: SKILL_MAP[pending.type || "volunteer"] || ["community outreach"],
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
  response.json({ user: serializeUser(request.user) });
});

app.put("/api/profile", requireAuth, async (request, response, next) => {
  try {
    await request.user.update({
      name: request.body.name || request.user.name
    });

    await ensureVolunteerProfileForUser(request.user.id, {
      skills: request.body.skills,
      languages: request.body.languages,
      availability: request.body.availability,
      baseLocation: request.body.baseLocation
    });

    const refreshed = await getUserWithProfile(request.user.id);
    response.json({ user: serializeUser(refreshed) });
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
      issues: await buildIssuePayloads()
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/tasks", requireAuth, async (request, response, next) => {
  try {
    const tasks = await loadOpenTasksWithRelations();
    response.json({
      tasks: await Promise.all(tasks.map((task) => buildTaskPayload(task, request.user)))
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
      where: {
        completedAt: null,
        isAssigned: false
      },
      order: [
        ["severity", "ASC"],
        ["updatedAt", "DESC"]
      ]
    });

    const volunteers = await Volunteer.findAll({
      include: [{ model: User, as: "user", where: { role: "volunteer" } }]
    });

    const activeAssignments = await Assignment.findAll({
      include: [{ model: Task, as: "task", where: { completedAt: null } }]
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
      const targetCount = task.severity === "critical" ? 2 : 1;
      const ranked = [...volunteerPool.values()]
        .map((volunteer) => ({
          volunteer,
          score: computeMatchScore(task, volunteer)
        }))
        .sort((left, right) => right.score.score - left.score.score);

      const selected = ranked
        .filter((entry) => entry.score.score > -20)
        .slice(0, targetCount);

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
        locationName: task.locationName,
        volunteers: selected.map((entry) => ({
          id: entry.volunteer.user.id,
          name: entry.volunteer.user.name,
          score: Number(entry.score.score.toFixed(2)),
          distanceKm:
            entry.score.distanceKm === null ? null : Number(entry.score.distanceKm.toFixed(2))
        }))
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
  upload.single("image"),
  async (request, response, next) => {
    try {
      if (!request.file) {
        response.status(400).json({ error: "Please upload a survey image." });
        return;
      }

      const ocr = await runOCR(request.file.path);
      const parsed = extractNeedSignals(ocr.text);
      const task = await createTaskRecord({
        ngoUserId: request.user.id,
        source: "ocr",
        description: ocr.text || "OCR survey intake",
        extractedText: ocr.text,
        title: parsed.title,
        type: parsed.type,
        severity: parsed.severity,
        locationName: parsed.locationName,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        requiredSkills: parsed.requiredSkills,
        peopleServed: inferPeopleServed(parsed.type, parsed.severity)
      });

      const review = await createReviewIfNeeded({
        taskId: task.id,
        source: "ocr",
        rawText: ocr.text,
        confidence: ocr.averageConfidence,
        suggestedType: parsed.type,
        suggestedSeverity: parsed.severity,
        suggestedLocation: parsed.locationName
      });

      response.status(201).json({
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

      const transcript = await transcribeAudio(
        request.file.path,
        request.file.mimetype || "audio/webm"
      );
      const parsed = extractNeedSignals(transcript.text);
      const task = await createTaskRecord({
        ngoUserId: request.user.id,
        source: "voice",
        description: transcript.text,
        extractedText: transcript.text,
        title: parsed.title,
        type: parsed.type,
        severity: parsed.severity,
        locationName: parsed.locationName,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        requiredSkills: parsed.requiredSkills,
        peopleServed: inferPeopleServed(parsed.type, parsed.severity)
      });

      response.status(201).json({
        transcript,
        need: {
          id: task.id,
          title: task.title,
          type: task.type,
          severity: task.severity,
          locationName: task.locationName
        }
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

    const location = detectLocation(request.body.locationName || review.task.locationName);
    await review.task.update({
      title: request.body.title || review.task.title,
      description: request.body.description || review.task.description,
      severity: normalizeSeverity(request.body.severity || review.task.severity),
      locationName: request.body.locationName || review.task.locationName,
      location: pointFromCoordinates(location.lat, location.lng),
      updatedAt: new Date()
    });

    await review.update({
      status: "approved",
      correctedPayload: {
        title: request.body.title || review.task.title,
        description: request.body.description || review.task.description,
        severity: normalizeSeverity(request.body.severity || review.task.severity),
        locationName: request.body.locationName || review.task.locationName
      }
    });

    response.json({ ok: true });
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

      response.status(201).json(generated);
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

async function start() {
  await ensureDirectories();
  await ensureDatabase();
  await seedDatabase();
  app.listen(PORT, () => {
    console.log(`KindredPune server running on http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  if (error?.name?.includes("SequelizeConnection")) {
    console.error(
      `Check that PostgreSQL with PostGIS is running and DATABASE_URL points to it. Current DATABASE_URL: ${DATABASE_URL}`
    );
  }
  process.exit(1);
});
