require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const Handlebars = require("handlebars");
const PDFDocument = require("pdfkit");
const { initDatabase, query, withTransaction, pool } = require("./db");

let OpenAI;
let twilio;
let puppeteer;

try {
  OpenAI = require("openai");
} catch (error) {
  OpenAI = null;
}

try {
  twilio = require("twilio");
} catch (error) {
  twilio = null;
}

try {
  puppeteer = require("puppeteer");
} catch (error) {
  puppeteer = null;
}

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "kindred-dev-secret";
const DECAY_LAMBDA = Number(process.env.DECAY_LAMBDA || 0.12);
const SILENT_NEED_THRESHOLD = Number(process.env.SILENT_NEED_THRESHOLD || 2);
const OCR_CONFIDENCE_THRESHOLD = Number(process.env.OCR_CONFIDENCE_THRESHOLD || 0.8);
const UPLOAD_DIR = path.join(__dirname, "uploads");
const REPORTS_DIR = path.join(__dirname, "generated-reports");
const TEMPLATES_DIR = path.join(__dirname, "templates");
const REPORT_BASE_URL =
  process.env.REPORT_BASE_URL || `http://localhost:${PORT}`;

const openai =
  process.env.OPENAI_API_KEY && OpenAI
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

const upload = multer({
  dest: UPLOAD_DIR,
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});

const AREA_COORDINATES = {
  shivajinagar: { latitude: 18.5314, longitude: 73.8446, label: "Shivajinagar" },
  kasba: { latitude: 18.5204, longitude: 73.8567, label: "Kasba Peth" },
  kasba_peth: { latitude: 18.5204, longitude: 73.8567, label: "Kasba Peth" },
  pimpri: { latitude: 18.6298, longitude: 73.7997, label: "Pimpri" },
  kothrud: { latitude: 18.5074, longitude: 73.8077, label: "Kothrud" },
  yerawada: { latitude: 18.5538, longitude: 73.8893, label: "Yerawada" },
  hadapsar: { latitude: 18.5089, longitude: 73.9259, label: "Hadapsar" },
  bavdhan: { latitude: 18.5157, longitude: 73.7797, label: "Bavdhan" },
  camp: { latitude: 18.5169, longitude: 73.8785, label: "Camp" }
};

const TYPE_KEYWORDS = {
  water: ["water", "tank", "refill", "purification", "drinking", "pipeline"],
  sanitation: ["waste", "drain", "sewage", "sanitation", "toilet", "garbage"],
  medical: ["medical", "health", "clinic", "medicine", "illness", "fever"],
  food: ["food", "meal", "ration", "kitchen", "nutrition"],
  shelter: ["shelter", "housing", "roof", "rain"],
  volunteer: ["volunteer", "helper", "crew", "support", "buddy"],
  education: ["school", "education", "class", "learning"]
};

const SKILL_KEYWORDS = {
  water: ["logistics", "marathi", "community outreach"],
  sanitation: ["logistics", "community outreach"],
  medical: ["medical", "triage", "marathi"],
  food: ["meal distribution", "logistics"],
  volunteer: ["coordination", "marathi"],
  shelter: ["logistics", "community outreach"],
  education: ["teaching", "marathi"]
};

const SEVERITY_SCORES = {
  critical: 1,
  urgent: 0.76,
  stable: 0.48
};

const whatsappSessions = new Map();

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(UPLOAD_DIR));
app.use("/generated-reports", express.static(REPORTS_DIR));

function titleCase(value = "") {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createFilename(prefix, extension) {
  return `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`;
}

function getAreaMatch(text = "") {
  const normalized = String(text).toLowerCase();
  return Object.entries(AREA_COORDINATES).find(([key]) =>
    normalized.includes(key.replaceAll("_", " "))
  );
}

function detectType(text = "") {
  const normalized = String(text).toLowerCase();
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return type;
    }
  }
  return "volunteer";
}

function detectSeverity(text = "") {
  const normalized = String(text).toLowerCase();
  if (/(critical|urgent|severe|outbreak|immediate|collapsed|danger)/.test(normalized)) {
    return "critical";
  }
  if (/(queue|delay|shortage|overflow|stalled|needed|high)/.test(normalized)) {
    return "urgent";
  }
  return "stable";
}

function inferLanguage(text = "", fallback = "Marathi / Hindi mix") {
  const normalized = String(text).toLowerCase();
  if (/[ऀ-ॿ]/.test(text)) {
    return "Devanagari";
  }
  if (/[஀-௿]/.test(text)) {
    return "Tamil";
  }
  if (/[అ-౿]/.test(text)) {
    return "Telugu";
  }
  if (/[ಅ-೿]/.test(text)) {
    return "Kannada";
  }
  if (normalized.includes("marathi")) {
    return "Marathi";
  }
  return fallback;
}

function availabilityLabelToJson(value) {
  if (!value) {
    return { label: "To be updated" };
  }
  if (typeof value === "object" && value.label) {
    return value;
  }
  return { label: String(value) };
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

function calculateCurrentIntensity(item) {
  const ageHours = Math.max(
    0,
    (Date.now() - new Date(item.updated_at || item.updatedAt || Date.now()).getTime()) /
      (1000 * 60 * 60)
  );
  const base = SEVERITY_SCORES[item.severity] || 0.48;
  return Number((base * Math.exp(-DECAY_LAMBDA * ageHours)).toFixed(3));
}

function haversineKm(aLat, aLng, bLat, bLng) {
  if ([aLat, aLng, bLat, bLng].some((value) => value === null || value === undefined)) {
    return null;
  }
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const a =
    sinLat * sinLat +
    Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function severityWeight(severity) {
  if (severity === "critical") {
    return 3;
  }
  if (severity === "urgent") {
    return 2;
  }
  return 1;
}

function extractNeedFromText(text, source, confidence = 0.84) {
  const matchedArea = getAreaMatch(text);
  const location = matchedArea
    ? matchedArea[1]
    : { latitude: 18.5204, longitude: 73.8567, label: "Central Pune" };
  const type = detectType(text);
  const severity = detectSeverity(text);

  return {
    type,
    severity,
    title: `${titleCase(type)} support - ${location.label}`,
    description: String(text).trim() || "Need intake pending review.",
    locationName: location.label,
    latitude: location.latitude,
    longitude: location.longitude,
    source,
    requiredSkills: SKILL_KEYWORDS[type] || ["community outreach"],
    confidence,
    needsReview: confidence < OCR_CONFIDENCE_THRESHOLD,
    language: inferLanguage(text),
    extractedText: text
  };
}

function taskRowToIssue(row) {
  return {
    id: row.id,
    lat: Number(row.latitude),
    lng: Number(row.longitude),
    type: row.type,
    severity: row.severity,
    label: row.title,
    updated: new Date(row.updated_at).toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit"
    }),
    updated_at: row.updated_at,
    ngo: row.ngo_name || "Unassigned NGO",
    locationName: row.location_name,
    source: row.source,
    currentIntensity: calculateCurrentIntensity(row)
  };
}

function createToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function userRowToClient(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    skills: row.skills || [],
    languages: row.languages || [],
    availability:
      typeof row.availability === "object" ? row.availability.label || "" : "",
    baseLocation: row.base_location || "",
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    companyId: row.company_id
  };
}

async function getUserById(id, client = null) {
  const runner = client || { query };
  const result = await runner.query(
    `
      SELECT
        u.id,
        u.name,
        u.email,
        u.password_hash,
        u.role,
        u.skills,
        u.languages,
        u.availability,
        u.base_location,
        u.company_id,
        CASE WHEN v.location IS NOT NULL THEN ST_Y(v.location::geometry) END AS latitude,
        CASE WHEN v.location IS NOT NULL THEN ST_X(v.location::geometry) END AS longitude,
        v.id AS volunteer_profile_id
      FROM users u
      LEFT JOIN volunteers v ON v.user_id = u.id
      WHERE u.id = $1
    `,
    [id]
  );
  return result.rows[0] || null;
}

async function getUserByEmail(email, client = null) {
  const runner = client || { query };
  const result = await runner.query(
    `
      SELECT
        u.id,
        u.name,
        u.email,
        u.password_hash,
        u.role,
        u.skills,
        u.languages,
        u.availability,
        u.base_location,
        u.company_id,
        CASE WHEN v.location IS NOT NULL THEN ST_Y(v.location::geometry) END AS latitude,
        CASE WHEN v.location IS NOT NULL THEN ST_X(v.location::geometry) END AS longitude,
        v.id AS volunteer_profile_id
      FROM users u
      LEFT JOIN volunteers v ON v.user_id = u.id
      WHERE u.email = $1
    `,
    [email]
  );
  return result.rows[0] || null;
}

async function getVolunteerProfileByUserId(userId, client = null) {
  const runner = client || { query };
  const result = await runner.query(
    `
      SELECT
        v.id,
        v.user_id,
        v.skills,
        v.languages,
        v.availability,
        v.is_available,
        ST_Y(v.location::geometry) AS latitude,
        ST_X(v.location::geometry) AS longitude
      FROM volunteers v
      WHERE v.user_id = $1
    `,
    [userId]
  );
  return result.rows[0] || null;
}

async function getCompanyById(companyId) {
  const result = await query(
    "SELECT id, name, details FROM companies WHERE id = $1",
    [companyId]
  );
  return result.rows[0] || null;
}

async function getDefaultCompanyId() {
  const result = await query(
    "SELECT id FROM companies ORDER BY id ASC LIMIT 1"
  );
  return result.rows[0]?.id || null;
}

async function getUserFromRequest(request) {
  const authHeader = request.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await getUserById(payload.sub);
    return user ? userRowToClient(user) : null;
  } catch (error) {
    return null;
  }
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
  return async (request, response, next) => {
    const user = request.user || (await getUserFromRequest(request));
    if (!user) {
      response.status(401).json({ error: "Authentication required." });
      return;
    }
    if (!roles.includes(user.role)) {
      response.status(403).json({ error: "You do not have access to this route." });
      return;
    }
    request.user = user;
    next();
  };
}

function roleHome(role) {
  if (role === "admin") {
    return "/admin.html";
  }
  if (role === "ngo_worker") {
    return "/report.html";
  }
  if (role === "csr_partner") {
    return "/impact.html";
  }
  return "/intelligence.html";
}

async function fetchAvailableVolunteers() {
  const result = await query(
    `
      SELECT
        v.id AS volunteer_profile_id,
        v.user_id,
        v.skills,
        v.languages,
        v.availability,
        v.is_available,
        ST_Y(v.location::geometry) AS latitude,
        ST_X(v.location::geometry) AS longitude,
        u.name,
        u.email,
        u.role,
        u.base_location,
        u.company_id
      FROM volunteers v
      JOIN users u ON u.id = v.user_id
      WHERE v.is_available = TRUE
    `
  );

  return result.rows.map((row) => ({
    volunteerProfileId: row.volunteer_profile_id,
    id: row.user_id,
    name: row.name,
    email: row.email,
    role: row.role,
    skills: row.skills || [],
    languages: row.languages || [],
    availability:
      typeof row.availability === "object" ? row.availability.label || "" : "",
    baseLocation: row.base_location,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    companyId: row.company_id
  }));
}

async function fetchTaskRows(options = {}) {
  const clauses = [];
  const params = [];

  if (!options.includeCompleted) {
    clauses.push("t.status IN ('open', 'in_progress')");
  }

  if (options.type) {
    params.push(options.type);
    clauses.push(`t.type = $${params.length}`);
  }

  if (options.severity) {
    params.push(options.severity);
    clauses.push(`t.severity = $${params.length}`);
  }

  if (options.id) {
    params.push(options.id);
    clauses.push(`t.id = $${params.length}`);
  }

  if (options.companyId) {
    params.push(options.companyId);
    clauses.push(`t.sponsor_company_id = $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await query(
    `
      SELECT
        t.*,
        ST_Y(t.location::geometry) AS latitude,
        ST_X(t.location::geometry) AS longitude,
        ngo.name AS ngo_name
      FROM tasks t
      LEFT JOIN users ngo ON ngo.id = t.ngo_id
      ${where}
      ORDER BY
        CASE t.severity WHEN 'critical' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END,
        t.updated_at DESC
    `,
    params
  );

  return result.rows;
}

async function fetchAssignedUsersByTask(taskIds) {
  if (!taskIds.length) {
    return new Map();
  }

  const result = await query(
    `
      SELECT
        a.task_id,
        u.id,
        u.name,
        u.email,
        u.role,
        u.skills,
        u.languages,
        u.availability,
        u.base_location,
        u.company_id,
        ST_Y(v.location::geometry) AS latitude,
        ST_X(v.location::geometry) AS longitude
      FROM assignments a
      JOIN volunteers v ON v.id = a.volunteer_id
      JOIN users u ON u.id = v.user_id
      WHERE a.task_id = ANY($1::int[]) AND a.status IN ('active', 'completed')
      ORDER BY a.assigned_at ASC
    `,
    [taskIds]
  );

  const map = new Map();
  result.rows.forEach((row) => {
    const current = map.get(row.task_id) || [];
    current.push(userRowToClient(row));
    map.set(row.task_id, current);
  });
  return map;
}

function computeVolunteerScore(task, volunteer) {
  const overlap = (task.required_skills || []).filter((skill) =>
    (volunteer.skills || []).some(
      (volunteerSkill) => volunteerSkill.toLowerCase() === String(skill).toLowerCase()
    )
  ).length;

  const distanceKm = haversineKm(
    task.latitude,
    task.longitude,
    volunteer.latitude,
    volunteer.longitude
  );

  const distanceBoost = distanceKm === null ? 0 : Math.max(0, 12 - distanceKm);
  const languageBoost = (volunteer.languages || []).some((language) =>
    ["Marathi", "Hindi"].includes(language)
  )
    ? 0.6
    : 0;

  return {
    score:
      overlap * 3 +
      distanceBoost * 0.4 +
      languageBoost +
      severityWeight(task.severity),
    distanceKm
  };
}

async function buildTaskPayloads(taskRows, currentUser = null) {
  const taskIds = taskRows.map((task) => task.id);
  const assignedByTask = await fetchAssignedUsersByTask(taskIds);
  const volunteers = await fetchAvailableVolunteers();

  return taskRows.map((task) => {
    const assignedUsers = assignedByTask.get(task.id) || [];
    const assignedIds = new Set(assignedUsers.map((user) => user.id));

    const buddySuggestions = volunteers
      .filter((volunteer) => !assignedIds.has(volunteer.id))
      .map((volunteer) => {
        const result = computeVolunteerScore(task, volunteer);
        return {
          volunteer,
          score: result.score,
          distanceKm: result.distanceKm
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, 2)
      .map((entry) => entry.volunteer);

    const distanceKm =
      currentUser && currentUser.latitude !== null && currentUser.longitude !== null
        ? haversineKm(
            currentUser.latitude,
            currentUser.longitude,
            Number(task.latitude),
            Number(task.longitude)
          )
        : null;

    return {
      id: task.id,
      needId: task.id,
      title: task.title,
      type: task.type,
      locationName: task.location_name,
      latitude: Number(task.latitude),
      longitude: Number(task.longitude),
      severity: task.severity,
      status: task.status,
      requiredSkills: task.required_skills || [],
      assignedVolunteerIds: task.assigned_volunteer_ids || [],
      sponsorCompanyId: task.sponsor_company_id,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      completedAt: task.completed_at,
      notes: task.description,
      assignedUsers,
      buddySuggestions,
      distanceKm: distanceKm === null ? null : Number(distanceKm.toFixed(1))
    };
  });
}

async function createTaskRecord(data, client = null) {
  const runner = client || { query };
  const result = await runner.query(
    `
      INSERT INTO tasks (
        ngo_id, type, severity, title, description, status, source, location_name, location,
        required_skills, sponsor_company_id, metadata, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        ST_SetSRID(ST_MakePoint($9, $10), 4326)::geography,
        $11::text[], $12, $13::jsonb, NOW(), NOW()
      )
      RETURNING
        id,
        ngo_id,
        type,
        severity,
        title,
        description,
        status,
        source,
        location_name,
        required_skills,
        sponsor_company_id,
        metadata,
        created_at,
        updated_at,
        ST_Y(location::geometry) AS latitude,
        ST_X(location::geometry) AS longitude
    `,
    [
      data.ngoId || null,
      data.type,
      data.severity,
      data.title,
      data.description,
      data.status || "open",
      data.source || "manual",
      data.locationName,
      data.longitude,
      data.latitude,
      data.requiredSkills || [],
      data.sponsorCompanyId || null,
      JSON.stringify(data.metadata || {})
    ]
  );
  return result.rows[0];
}

async function createSurveyRecord(payload, client = null) {
  const runner = client || { query };
  await runner.query(
    `
      INSERT INTO surveys (
        raw_text, parsed_needs, location, confidence, source, task_id, created_at
      )
      VALUES (
        $1, $2::jsonb,
        ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
        $5, $6, $7, NOW()
      )
    `,
    [
      payload.rawText,
      JSON.stringify(payload.parsedNeeds || {}),
      payload.longitude,
      payload.latitude,
      payload.confidence,
      payload.source,
      payload.taskId
    ]
  );
}

async function createReviewRecord(payload, client = null) {
  const runner = client || { query };
  await runner.query(
    `
      INSERT INTO reviews (
        source_type, source_id, raw_text, confidence, status
      )
      VALUES ($1, $2, $3, $4, 'pending')
    `,
    [payload.sourceType, payload.sourceId, payload.rawText, payload.confidence]
  );
}

async function performMockOcr(file) {
  const fileHint = (file?.originalname || "").toLowerCase();
  const matchedArea = getAreaMatch(fileHint);
  const area = matchedArea ? matchedArea[1].label : "Shivajinagar";
  const lowConfidence = /(hand|scan|rough|low|blur)/.test(fileHint);
  const text = lowConfidence
    ? `हस्तलिखित सर्वेक्षण: ${area} मध्ये पाणी आणि औषधांची कमतरता. 11 कुटुंबे प्रतीक्षेत आहेत.`
    : `Community survey from ${area} notes water shortage, tanker delay, and volunteer support needed.`;

  const averageConfidence = lowConfidence ? 0.74 : 0.89;
  return {
    text,
    words: text.split(/\s+/).map((word, index) => ({
      text: word,
      confidence: clamp(averageConfidence - index * 0.005, 0.52, 0.95)
    })),
    averageConfidence
  };
}

async function transcribeAudio(file) {
  if (openai) {
    const stream = fs.createReadStream(file.path);
    const transcription = await openai.audio.transcriptions.create({
      file: stream,
      model: process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1"
    });

    return {
      text: transcription.text || "",
      provider: "openai",
      model: process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1",
      confidence: 0.86
    };
  }

  const fileHint = (file?.originalname || "").toLowerCase();
  const matchedArea = getAreaMatch(fileHint);
  const area = matchedArea ? matchedArea[1].label : "Yerawada";

  return {
    text: `Voice report from ${area}: families need medical support and clean water after repeated fever complaints in the lane.`,
    provider: "mock",
    model: "mock-whisper",
    confidence: 0.81
  };
}

async function createTaskFromIntake(parsedNeed, ngoId = null) {
  const defaultCompanyId = await getDefaultCompanyId();
  const task = await createTaskRecord({
    ngoId,
    type: parsedNeed.type,
    severity: parsedNeed.severity,
    title: parsedNeed.title,
    description: parsedNeed.description,
    status: "open",
    source: parsedNeed.source,
    locationName: parsedNeed.locationName,
    latitude: parsedNeed.latitude,
    longitude: parsedNeed.longitude,
    requiredSkills: parsedNeed.requiredSkills,
    sponsorCompanyId: defaultCompanyId,
    metadata: {
      confidence: parsedNeed.confidence,
      language: parsedNeed.language,
      extractedText: parsedNeed.extractedText
    }
  });

  await createSurveyRecord({
    rawText: parsedNeed.extractedText || parsedNeed.description,
    parsedNeeds: {
      type: parsedNeed.type,
      severity: parsedNeed.severity,
      locationName: parsedNeed.locationName
    },
    latitude: parsedNeed.latitude,
    longitude: parsedNeed.longitude,
    confidence: parsedNeed.confidence,
    source: parsedNeed.source,
    taskId: task.id
  });

  if (parsedNeed.needsReview) {
    await createReviewRecord({
      sourceType: parsedNeed.source,
      sourceId: task.id,
      rawText: parsedNeed.extractedText || parsedNeed.description,
      confidence: parsedNeed.confidence
    });
  }

  return task;
}

async function handleManualNeedCreation(request, response) {
  const { type, severity, description, locationName, latitude, longitude } = request.body;

  if (!description) {
    response.status(400).json({ error: "Description is required." });
    return;
  }

  const detectedType = type || detectType(description);
  const detectedSeverity = severity || detectSeverity(description);
  const matchedLocation = getAreaMatch(locationName || description)?.[1];

  const parsed = {
    type: detectedType,
    severity: detectedSeverity,
    title: `${titleCase(detectedType)} support - ${locationName || matchedLocation?.label || "Pune"}`,
    description,
    source: "manual",
    locationName: locationName || matchedLocation?.label || "Central Pune",
    latitude: latitude ? Number(latitude) : matchedLocation?.latitude || 18.5204,
    longitude: longitude ? Number(longitude) : matchedLocation?.longitude || 73.8567,
    requiredSkills: SKILL_KEYWORDS[detectedType] || ["community outreach"],
    confidence: 0.97,
    needsReview: false,
    language: inferLanguage(description),
    extractedText: description
  };

  const task = await createTaskFromIntake(parsed, request.user.id);
  response.status(201).json({
    need: {
      id: task.id,
      title: task.title,
      description: task.description,
      needsReview: false
    },
    task
  });
}

async function handleSurveyUpload(request, response) {
  if (!request.file) {
    response.status(400).json({ error: "Image upload is required." });
    return;
  }

  const ocr = await performMockOcr(request.file);
  const parsed = extractNeedFromText(ocr.text, "survey", ocr.averageConfidence);
  const task = await createTaskFromIntake(parsed, request.user.id);

  response.status(201).json({
    need: {
      id: task.id,
      title: task.title,
      description: task.description,
      needsReview: parsed.needsReview,
      type: parsed.type,
      severity: parsed.severity
    },
    task,
    ocr: {
      text: ocr.text,
      words: ocr.words,
      averageConfidence: ocr.averageConfidence
    }
  });
}

async function handleVoiceUpload(request, response) {
  if (!request.file) {
    response.status(400).json({ error: "Audio upload is required." });
    return;
  }

  const transcript = await transcribeAudio(request.file);
  const parsed = extractNeedFromText(transcript.text, "voice", transcript.confidence);
  const task = await createTaskFromIntake(parsed, request.user.id);

  response.status(201).json({
    need: {
      id: task.id,
      title: task.title,
      description: task.description,
      type: parsed.type,
      severity: parsed.severity,
      needsReview: parsed.needsReview
    },
    task,
    transcript
  });
}

async function handleWhatsappWebhook(request, response) {
  const from = request.body.From || "unknown";
  const body = String(request.body.Body || "").trim();
  const mediaUrl = request.body.MediaUrl0 || null;
  const channel = from.startsWith("whatsapp:") ? "whatsapp" : "sms";

  await logMessage(from, body || "[media]", "incoming", channel, {}, mediaUrl);

  const current = whatsappSessions.get(from) || {
    step: "location",
    payload: {}
  };

  let reply = "";

  if (!body && mediaUrl) {
    const parsed = extractNeedFromText(
      "Image-based intake received from WhatsApp.",
      "whatsapp",
      0.74
    );
    const task = await createTaskFromIntake(parsed);
    reply = `Thanks. We received your photo and created need #${task.id}. A coordinator will review it shortly.`;
    whatsappSessions.delete(from);
  } else if (current.step === "location") {
    current.payload.locationName = body;
    current.step = "type";
    reply = "Thanks. What type of help is needed? Reply with water, food, shelter, medical, sanitation, or volunteer.";
    whatsappSessions.set(from, current);
  } else if (current.step === "type") {
    current.payload.type = detectType(body);
    current.step = "severity";
    reply = "Understood. How urgent is this need? Reply with critical, urgent, or stable.";
    whatsappSessions.set(from, current);
  } else if (current.step === "severity") {
    current.payload.severity = detectSeverity(body);
    const location = getAreaMatch(current.payload.locationName || "")?.[1] || AREA_COORDINATES.kasba;
    const description = `WhatsApp intake from ${current.payload.locationName}: ${current.payload.type} support requested with ${current.payload.severity} urgency.`;
    const task = await createTaskRecord({
      ngoId: null,
      type: current.payload.type,
      severity: current.payload.severity,
      title: `${titleCase(current.payload.type)} support - ${current.payload.locationName}`,
      description,
      status: "open",
      source: channel,
      locationName: current.payload.locationName || location.label,
      latitude: location.latitude,
      longitude: location.longitude,
      requiredSkills: SKILL_KEYWORDS[current.payload.type] || ["community outreach"],
      sponsorCompanyId: await getDefaultCompanyId(),
      metadata: {
        conversationChannel: channel,
        from
      }
    });
    reply = `Thanks. The need has been recorded with ID #${task.id}. A KindredPune coordinator will follow up.`;
    whatsappSessions.delete(from);
  } else {
    reply = "Welcome to KindredPune. Please share the location or neighborhood for the need you want to report.";
    whatsappSessions.set(from, { step: "location", payload: {} });
  }

  await logMessage(from, reply, "outgoing", channel, {
    state: whatsappSessions.get(from)?.step || "completed"
  });

  response.type("text/xml").send(createTwimlResponse(reply));
}

function createTwimlResponse(message) {
  if (twilio) {
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(message);
    return twiml.toString();
  }
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`;
}

async function logMessage(fromUser, body, direction, channel, parsedData = {}, mediaUrl = null) {
  await query(
    `
      INSERT INTO messages (from_user, body, media_url, direction, channel, parsed_data, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
    `,
    [fromUser, body, mediaUrl, direction, channel, JSON.stringify(parsedData)]
  );
}

async function getSilentNeedAlerts() {
  const result = await query(
    `
      SELECT DISTINCT ON (base.type, COALESCE(base.location_name, 'Unknown'))
        base.id,
        base.type,
        COALESCE(base.location_name, 'Unknown') AS location_name,
        CASE
          WHEN BOOL_OR(neighbor.severity = 'critical') THEN 'critical'
          ELSE 'urgent'
        END AS severity,
        COUNT(neighbor.id)::int AS evidence_count,
        MIN(neighbor.updated_at) AS start_at,
        MAX(neighbor.updated_at) AS end_at,
        ST_Y(base.location::geometry) AS latitude,
        ST_X(base.location::geometry) AS longitude
      FROM tasks base
      JOIN tasks neighbor
        ON neighbor.status IN ('open', 'in_progress')
       AND neighbor.updated_at >= NOW() - INTERVAL '5 days'
       AND neighbor.type = base.type
       AND ST_DWithin(base.location, neighbor.location, 3000)
      WHERE base.status IN ('open', 'in_progress')
        AND base.updated_at >= NOW() - INTERVAL '5 days'
      GROUP BY base.id, base.type, base.location_name, base.location
      HAVING COUNT(neighbor.id) >= $1
      ORDER BY base.type, COALESCE(base.location_name, 'Unknown'), COUNT(neighbor.id) DESC
    `,
    [SILENT_NEED_THRESHOLD]
  );

  return result.rows.map((row) => ({
    id: `alert-${row.type}-${row.location_name}`.replace(/\s+/g, "-").toLowerCase(),
    type: row.type,
    severity: row.severity,
    title: `Silent Need Alert - ${titleCase(row.type)} near ${row.location_name}`,
    locationName: row.location_name,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    evidenceCount: row.evidence_count,
    explanation: `${row.evidence_count} ${row.type} reports from ${new Date(
      row.start_at
    ).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short"
    })} to ${new Date(row.end_at).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short"
    })} within roughly 3 km of ${row.location_name}.`
  }));
}

async function computeOverview() {
  const [openNeeds, matched, volunteerCount, alerts] = await Promise.all([
    query(
      "SELECT COUNT(*)::int AS count FROM tasks WHERE status IN ('open', 'in_progress')"
    ),
    query(
      "SELECT COUNT(*)::int AS count FROM tasks WHERE status IN ('open', 'in_progress') AND is_assigned = TRUE"
    ),
    query("SELECT COUNT(*)::int AS count FROM volunteers WHERE is_available = TRUE"),
    getSilentNeedAlerts()
  ]);

  const openCount = openNeeds.rows[0].count;
  const matchedCount = matched.rows[0].count;

  return {
    wardsLive: 11,
    openNeeds: openCount,
    criticalClusters: alerts.length,
    responseCycle: "17 min",
    volunteerReadiness: `${Math.round(
      (matchedCount / Math.max(openCount, 1)) * 100
    )}%`,
    activeVolunteers: volunteerCount.rows[0].count
  };
}

async function computeCSRStats(companyId, filters = {}) {
  const params = [companyId];
  const dateClauses = [];

  if (filters.from) {
    params.push(filters.from);
    dateClauses.push(`c.date >= $${params.length}`);
  }

  if (filters.to) {
    params.push(filters.to);
    dateClauses.push(`c.date <= $${params.length}`);
  }

  const dateWhere = dateClauses.length ? `AND ${dateClauses.join(" AND ")}` : "";

  const [
    companyResult,
    totalsResult,
    categoriesResult,
    monthlyResult,
    reportResult,
    receiptResult,
    volunteerResult
  ] =
    await Promise.all([
      getCompanyById(companyId),
      query(
        `
          SELECT
            COALESCE(SUM(c.volunteer_hours), 0)::float AS volunteer_hours,
            COALESCE(SUM(c.funds), 0)::float AS funds,
            COALESCE(SUM(c.people_served), 0)::int AS people_served,
            COUNT(DISTINCT c.task_id)::int AS tasks_completed
          FROM contributions c
          WHERE c.company_id = $1 ${dateWhere}
        `,
        params
      ),
      query(
        `
          SELECT
            COALESCE(c.details->>'category', t.type, 'other') AS category,
            COUNT(*)::int AS total
          FROM contributions c
          LEFT JOIN tasks t ON t.id = c.task_id
          WHERE c.company_id = $1 ${dateWhere}
          GROUP BY category
          ORDER BY total DESC
        `,
        params
      ),
      query(
        `
          SELECT
            TO_CHAR(DATE_TRUNC('month', c.date), 'Mon') AS month,
            COALESCE(SUM(c.volunteer_hours), 0)::float AS hours
          FROM contributions c
          WHERE c.company_id = $1 ${dateWhere}
          GROUP BY DATE_TRUNC('month', c.date)
          ORDER BY DATE_TRUNC('month', c.date)
        `,
        params
      ),
      query(
        `
          SELECT id, file_path, generated_at
          FROM csr_reports
          WHERE company_id = $1
          ORDER BY generated_at DESC
          LIMIT 5
        `,
        [companyId]
      ),
      query(
        `
          SELECT
            t.title,
            t.location_name,
            t.completed_at,
            COUNT(a.id)::int AS volunteers
          FROM tasks t
          LEFT JOIN assignments a ON a.task_id = t.id AND a.status IN ('active', 'completed')
          WHERE t.sponsor_company_id = $1 AND t.status IN ('completed', 'resolved')
          GROUP BY t.id
          ORDER BY t.completed_at DESC NULLS LAST, t.updated_at DESC
          LIMIT 6
        `,
        [companyId]
      ),
      query(
        `
          SELECT COUNT(DISTINCT v.user_id)::int AS volunteers_engaged
          FROM assignments a
          JOIN volunteers v ON v.id = a.volunteer_id
          JOIN tasks t ON t.id = a.task_id
          WHERE t.sponsor_company_id = $1
        `,
        [companyId]
      )
    ]);

  const totals = totalsResult.rows[0];
  const categories = Object.fromEntries(
    categoriesResult.rows.map((row) => [row.category, row.total])
  );
  const monthlyHours = monthlyResult.rows.map((row) => ({
    month: row.month,
    hours: Number(row.hours),
    height: clamp(Number(row.hours) * 4, 18, 100)
  }));
  const receiptLines = receiptResult.rows.map((row) => ({
    title: row.title,
    locationName: row.location_name,
    volunteers: row.volunteers,
    completedAt: row.completed_at
      ? new Date(row.completed_at).toLocaleDateString("en-IN")
      : "Pending"
  }));

  return {
    company: companyResult,
    totals: {
      volunteerHours: Number(totals.volunteer_hours || 0),
      funds: Number(totals.funds || 0),
      peopleServed: Number(totals.people_served || 0),
      tasksFunded: Number(totals.tasks_completed || 0),
      communitiesHelped: Math.max(Number(totals.tasks_completed || 0) * 2, 0),
      volunteersEngaged: Number(volunteerResult.rows[0].volunteers_engaged || 0),
      resourcesMoved: Math.round(Number(totals.funds || 0) / 1000)
    },
    categories,
    monthlyHours,
    narrative: `${companyResult.name} contributed ${Number(
      totals.volunteer_hours || 0
    ).toFixed(1)} volunteer hours and ${Number(totals.tasks_completed || 0)} completed task flows tied to visible ward outcomes.`,
    recentReports: reportResult.rows.map((row) => ({
      id: row.id,
      generatedAt: row.generated_at,
      filePath: row.file_path,
      downloadUrl: `${REPORT_BASE_URL}/${row.file_path.replace(/\\/g, "/")}`
    })),
    receiptLines
  };
}

async function generateReportPdf(companyId, stats, filters = {}) {
  const templateSource = await fsp.readFile(
    path.join(TEMPLATES_DIR, "csr-report.hbs"),
    "utf8"
  );
  const template = Handlebars.compile(templateSource);

  const metricCards = [
    {
      label: "Volunteer hours",
      value: stats.totals.volunteerHours.toFixed(1),
      description: "Logged through funded field and support work."
    },
    {
      label: "Tasks completed",
      value: stats.totals.tasksFunded,
      description: "Closed task flows linked to partner support."
    },
    {
      label: "People served",
      value: stats.totals.peopleServed,
      description: "Estimated direct beneficiaries across completed tasks."
    },
    {
      label: "Funds tracked",
      value: `₹${stats.totals.funds.toLocaleString("en-IN")}`,
      description: "Contribution volume recorded in the reporting layer."
    }
  ];

  const html = template({
    company: stats.company,
    narrative: stats.narrative,
    generatedAt: new Date().toLocaleString("en-IN"),
    metricCards,
    monthlyHours: stats.monthlyHours.length
      ? stats.monthlyHours
      : [{ month: "Apr", hours: 0, height: 18 }],
    receiptLines: stats.receiptLines.length
      ? stats.receiptLines
      : [
          {
            title: "No completed tasks linked yet",
            locationName: "Awaiting activity",
            volunteers: 0,
            completedAt: "Pending"
          }
        ],
    categorySummary: Object.entries(stats.categories).map(([label, value]) => ({
      label: titleCase(label),
      value
    }))
  });

  const filename = createFilename(`csr-report-${companyId}`, "pdf");
  const reportPath = path.join(REPORTS_DIR, filename);

  if (puppeteer) {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
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
  } else {
    const doc = new PDFDocument({ margin: 48 });
    const stream = fs.createWriteStream(reportPath);
    doc.pipe(stream);
    doc.fontSize(24).text(`${stats.company.name} Impact Report`);
    doc.moveDown(0.5);
    doc.fontSize(12).text(stats.narrative);
    doc.moveDown();
    metricCards.forEach((card) => {
      doc.fontSize(14).text(`${card.label}: ${card.value}`);
      doc.fontSize(11).text(card.description);
      doc.moveDown(0.4);
    });
    doc.moveDown();
    doc.fontSize(16).text("Receipt Lines");
    stats.receiptLines.forEach((line, index) => {
      doc.fontSize(12).text(
        `${index + 1}. ${line.title} · ${line.locationName} · ${line.volunteers} volunteers`
      );
    });
    doc.end();
    await new Promise((resolve) => stream.on("finish", resolve));
  }

  const relativeFilePath = `generated-reports/${filename}`;
  await query(
    `
      INSERT INTO csr_reports (company_id, file_path, generated_at, filters)
      VALUES ($1, $2, NOW(), $3::jsonb)
    `,
    [companyId, relativeFilePath, JSON.stringify(filters)]
  );

  return {
    filePath: relativeFilePath,
    downloadUrl: `${REPORT_BASE_URL}/${relativeFilePath}`
  };
}

app.get("/api/health", async (request, response) => {
  const [users, tasks, companies] = await Promise.all([
    query("SELECT COUNT(*)::int AS count FROM users"),
    query("SELECT COUNT(*)::int AS count FROM tasks"),
    query("SELECT COUNT(*)::int AS count FROM companies")
  ]);

  response.json({
    ok: true,
    users: users.rows[0].count,
    tasks: tasks.rows[0].count,
    companies: companies.rows[0].count
  });
});

app.post("/api/signup", async (request, response) => {
  const { name, email, password, role, skills, languages, availability, baseLocation } =
    request.body;

  if (!name || !email || !password || !role) {
    response.status(400).json({ error: "Name, email, password, and role are required." });
    return;
  }

  const allowedRoles = ["volunteer", "ngo_worker", "csr_partner"];
  if (!allowedRoles.includes(role)) {
    response.status(400).json({ error: "Invalid role." });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await getUserByEmail(normalizedEmail);
  if (existing) {
    response.status(409).json({ error: "An account with this email already exists." });
    return;
  }

  const coords = getAreaMatch(baseLocation || "")?.[1] || AREA_COORDINATES.kasba;
  const passwordHash = await bcrypt.hash(password, 10);
  const skillsArray = normalizeArray(skills);
  const languagesArray = normalizeArray(languages || "Marathi, Hindi");

  const createdUser = await withTransaction(async (client) => {
    const defaultCompanyId =
      role === "csr_partner" ? await getDefaultCompanyId() : null;
    const inserted = await client.query(
      `
        INSERT INTO users (
          name, email, password_hash, role, skills, languages, availability, base_location, company_id
        )
        VALUES ($1, $2, $3, $4, $5::text[], $6::text[], $7::jsonb, $8, $9)
        RETURNING id
      `,
      [
        name.trim(),
        normalizedEmail,
        passwordHash,
        role,
        skillsArray,
        languagesArray,
        JSON.stringify(availabilityLabelToJson(availability)),
        baseLocation || coords.label,
        defaultCompanyId
      ]
    );

    if (role === "volunteer") {
      await client.query(
        `
          INSERT INTO volunteers (
            user_id, skills, languages, availability, location, is_available
          )
          VALUES (
            $1, $2::text[], $3::text[], $4::jsonb,
            ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography,
            TRUE
          )
        `,
        [
          inserted.rows[0].id,
          skillsArray,
          languagesArray,
          JSON.stringify(availabilityLabelToJson(availability)),
          coords.longitude,
          coords.latitude
        ]
      );
    }

    return getUserById(inserted.rows[0].id, client);
  });

  const clientUser = userRowToClient(createdUser);
  response.status(201).json({
    token: createToken(clientUser),
    user: clientUser,
    redirectTo: roleHome(clientUser.role)
  });
});

app.post("/api/login", async (request, response) => {
  const { email, password } = request.body;

  if (!email || !password) {
    response.status(400).json({ error: "Email and password are required." });
    return;
  }

  const user = await getUserByEmail(String(email).trim().toLowerCase());
  if (!user) {
    response.status(401).json({ error: "Invalid email or password." });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    response.status(401).json({ error: "Invalid email or password." });
    return;
  }

  const clientUser = userRowToClient(user);
  response.json({
    token: createToken(clientUser),
    user: clientUser,
    redirectTo: roleHome(clientUser.role)
  });
});

app.get("/api/me", requireAuth, async (request, response) => {
  response.json({
    user: request.user,
    redirectTo: roleHome(request.user.role)
  });
});

app.put("/api/profile", requireAuth, async (request, response) => {
  const { name, skills, languages, availability, baseLocation } = request.body;
  const skillsArray = normalizeArray(skills || request.user.skills);
  const languagesArray = normalizeArray(languages || request.user.languages);
  const coords = getAreaMatch(baseLocation || "")?.[1];

  const updated = await withTransaction(async (client) => {
    await client.query(
      `
        UPDATE users
        SET
          name = $2,
          skills = $3::text[],
          languages = $4::text[],
          availability = $5::jsonb,
          base_location = $6
        WHERE id = $1
      `,
      [
        request.user.id,
        name || request.user.name,
        skillsArray,
        languagesArray,
        JSON.stringify(availabilityLabelToJson(availability || request.user.availability)),
        baseLocation || request.user.baseLocation
      ]
    );

    const volunteerProfile = await getVolunteerProfileByUserId(request.user.id, client);
    if (volunteerProfile) {
      await client.query(
        `
          UPDATE volunteers
          SET
            skills = $2::text[],
            languages = $3::text[],
            availability = $4::jsonb,
            location = CASE
              WHEN $5::float IS NULL OR $6::float IS NULL THEN location
              ELSE ST_SetSRID(ST_MakePoint($6, $5), 4326)::geography
            END
          WHERE user_id = $1
        `,
        [
          request.user.id,
          skillsArray,
          languagesArray,
          JSON.stringify(availabilityLabelToJson(availability || request.user.availability)),
          coords ? coords.latitude : null,
          coords ? coords.longitude : null
        ]
      );
    }

    return getUserById(request.user.id, client);
  });

  response.json({ user: userRowToClient(updated) });
});

app.get("/api/overview", async (request, response) => {
  response.json(await computeOverview());
});

app.get("/api/issues", async (request, response) => {
  const [taskRows, alerts] = await Promise.all([
    fetchTaskRows({ includeCompleted: false }),
    getSilentNeedAlerts()
  ]);

  response.json({
    issues: taskRows.map(taskRowToIssue),
    alerts
  });
});

app.get("/api/tasks", async (request, response) => {
  const currentUser = await getUserFromRequest(request);
  const taskRows = await fetchTaskRows({
    type: request.query.type,
    severity: request.query.severity
  });
  const tasks = await buildTaskPayloads(taskRows, currentUser);
  response.json({ tasks, currentUser });
});

app.post("/api/tasks", requireAuth, requireRole(["ngo_worker", "admin"]), handleManualNeedCreation);

app.post("/api/manual-need", requireAuth, requireRole(["ngo_worker", "admin"]), handleManualNeedCreation);

app.put("/api/tasks/:id", requireAuth, requireRole(["ngo_worker", "admin"]), async (request, response) => {
  const { title, description, severity, status } = request.body;
  const result = await query(
    `
      UPDATE tasks
      SET
        title = COALESCE($2, title),
        description = COALESCE($3, description),
        severity = COALESCE($4, severity),
        status = COALESCE($5, status),
        completed_at = CASE
          WHEN COALESCE($5, status) IN ('completed', 'resolved') THEN COALESCE(completed_at, NOW())
          ELSE completed_at
        END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, title, description, severity, status
    `,
    [request.params.id, title || null, description || null, severity || null, status || null]
  );

  if (!result.rows[0]) {
    response.status(404).json({ error: "Task not found." });
    return;
  }

  response.json({ task: result.rows[0] });
});

app.post("/api/tasks/:id/volunteer", requireAuth, requireRole(["volunteer", "admin"]), async (request, response) => {
  const volunteerProfile = await getVolunteerProfileByUserId(request.user.id);
  if (!volunteerProfile) {
    response.status(400).json({ error: "Volunteer profile not found for this account." });
    return;
  }

  const taskRows = await fetchTaskRows({ id: Number(request.params.id), includeCompleted: true });
  const task = taskRows[0];

  if (!task) {
    response.status(404).json({ error: "Task not found." });
    return;
  }

  await withTransaction(async (client) => {
    await client.query(
      `
        INSERT INTO assignments (task_id, volunteer_id, assigned_at, status, match_score)
        VALUES ($1, $2, NOW(), 'active', 8.5)
        ON CONFLICT DO NOTHING
      `,
      [task.id, volunteerProfile.id]
    );

    await client.query(
      `
        UPDATE tasks
        SET
          assigned_volunteer_ids = (
            SELECT ARRAY(
              SELECT DISTINCT unnest(assigned_volunteer_ids || $2::integer[])
            )
          ),
          is_assigned = TRUE,
          status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
          updated_at = NOW()
        WHERE id = $1
      `,
      [task.id, [request.user.id]]
    );
  });

  const updatedTask = await buildTaskPayloads(
    await fetchTaskRows({ id: task.id, includeCompleted: true }),
    request.user
  );

  response.json({ task: updatedTask[0] });
});

app.post("/api/tasks/:id/complete", requireAuth, async (request, response) => {
  const taskRows = await fetchTaskRows({ id: Number(request.params.id), includeCompleted: true });
  const task = taskRows[0];

  if (!task) {
    response.status(404).json({ error: "Task not found." });
    return;
  }

  const assignedUsers = await fetchAssignedUsersByTask([task.id]);
  const assignedToTask = assignedUsers.get(task.id) || [];
  const allowed =
    request.user.role === "admin" ||
    request.user.role === "ngo_worker" ||
    assignedToTask.some((user) => user.id === request.user.id);

  if (!allowed) {
    response.status(403).json({ error: "You cannot complete this task." });
    return;
  }

  await query(
    `
      UPDATE tasks
      SET status = 'completed', completed_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `,
    [task.id]
  );

  const updatedTask = await buildTaskPayloads(
    await fetchTaskRows({ id: task.id, includeCompleted: true }),
    request.user
  );

  response.json({ task: updatedTask[0] });
});

app.post("/api/surveys", requireAuth, requireRole(["ngo_worker", "admin"]), upload.single("image"), handleSurveyUpload);

app.post("/api/ocr-upload", requireAuth, requireRole(["ngo_worker", "admin"]), upload.single("image"), handleSurveyUpload);

app.post("/api/voice", requireAuth, requireRole(["ngo_worker", "admin"]), upload.single("audio"), handleVoiceUpload);

app.post("/api/audio-upload", requireAuth, requireRole(["ngo_worker", "admin"]), upload.single("audio"), handleVoiceUpload);

app.get("/api/review-queue", requireAuth, requireRole(["admin"]), async (request, response) => {
  const result = await query(
    `
      SELECT
        r.id AS review_id,
        r.source_type,
        r.source_id,
        r.raw_text,
        r.confidence,
        r.created_at,
        t.id,
        t.title,
        t.description,
        t.severity,
        t.source,
        t.location_name
      FROM reviews r
      JOIN tasks t ON t.id = r.source_id
      WHERE r.status = 'pending'
      ORDER BY r.created_at DESC
    `
  );

  response.json({
    items: result.rows.map((row) => ({
      id: row.id,
      reviewId: row.review_id,
      source: row.source,
      title: row.title,
      description: row.description,
      severity: row.severity,
      locationName: row.location_name,
      confidence: Number(row.confidence),
      rawText: row.raw_text
    }))
  });
});

app.put("/api/needs/:id", requireAuth, requireRole(["admin", "ngo_worker"]), async (request, response) => {
  const { title, description, severity, locationName } = request.body;

  const result = await withTransaction(async (client) => {
    const updatedTask = await client.query(
      `
        UPDATE tasks
        SET
          title = COALESCE($2, title),
          description = COALESCE($3, description),
          severity = COALESCE($4, severity),
          location_name = COALESCE($5, location_name),
          updated_at = NOW()
        WHERE id = $1
        RETURNING id, title, description, severity, location_name
      `,
      [request.params.id, title || null, description || null, severity || null, locationName || null]
    );

    if (!updatedTask.rows[0]) {
      return null;
    }

    await client.query(
      `
        UPDATE reviews
        SET
          corrected_text = COALESCE($2, corrected_text),
          status = 'approved',
          reviewer_user_id = $3,
          resolved_at = NOW()
        WHERE source_id = $1 AND status = 'pending'
      `,
      [
        request.params.id,
        description || title || null,
        request.user.id
      ]
    );

    return updatedTask.rows[0];
  });

  if (!result) {
    response.status(404).json({ error: "Need not found." });
    return;
  }

  response.json({
    need: {
      id: result.id,
      title: result.title,
      description: result.description,
      severity: result.severity,
      locationName: result.location_name
    }
  });
});

app.get("/api/alerts", async (request, response) => {
  response.json({ alerts: await getSilentNeedAlerts() });
});

app.post("/api/match", requireAuth, requireRole(["admin"]), async (request, response) => {
  const openTasks = await fetchTaskRows({ includeCompleted: false });
  const volunteers = await fetchAvailableVolunteers();

  const assignments = [];
  const usedVolunteerProfileIds = new Set();

  for (const task of openTasks) {
    if (task.is_assigned) {
      continue;
    }

    const ranked = volunteers
      .filter((volunteer) => !usedVolunteerProfileIds.has(volunteer.volunteerProfileId))
      .map((volunteer) => {
        const result = computeVolunteerScore(task, volunteer);
        return {
          volunteer,
          score: result.score,
          distanceKm: result.distanceKm
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, 2);

    if (!ranked.length) {
      continue;
    }

    assignments.push({
      task,
      volunteers: ranked
    });

    ranked.forEach((entry) => usedVolunteerProfileIds.add(entry.volunteer.volunteerProfileId));
  }

  await withTransaction(async (client) => {
    for (const assignment of assignments) {
      for (const volunteer of assignment.volunteers) {
        await client.query(
          `
            INSERT INTO assignments (task_id, volunteer_id, assigned_at, status, match_score)
            VALUES ($1, $2, NOW(), 'active', $3)
            ON CONFLICT DO NOTHING
          `,
          [assignment.task.id, volunteer.volunteer.volunteerProfileId, volunteer.score]
        );
      }

      await client.query(
        `
          UPDATE tasks
          SET
            assigned_volunteer_ids = $2::integer[],
            is_assigned = TRUE,
            status = 'in_progress',
            updated_at = NOW()
          WHERE id = $1
        `,
        [
          assignment.task.id,
          assignment.volunteers.map((entry) => entry.volunteer.id)
        ]
      );
    }
  });

  response.json({
    matches: assignments.map((assignment) => ({
      taskId: assignment.task.id,
      taskTitle: assignment.task.title,
      locationName: assignment.task.location_name,
      volunteers: assignment.volunteers.map((entry) => ({
        id: entry.volunteer.id,
        name: entry.volunteer.name,
        score: Number(entry.score.toFixed(2)),
        distanceKm: entry.distanceKm === null ? null : Number(entry.distanceKm.toFixed(1))
      }))
    }))
  });
});

app.get("/api/admin-summary", requireAuth, requireRole(["admin"]), async (request, response) => {
  const [overview, alerts, openTasks] = await Promise.all([
    computeOverview(),
    getSilentNeedAlerts(),
    buildTaskPayloads(await fetchTaskRows({ includeCompleted: false }), request.user)
  ]);

  response.json({
    metrics: [
      { label: "Open needs", value: overview.openNeeds },
      {
        label: "Review queue",
        value: (
          await query("SELECT COUNT(*)::int AS count FROM reviews WHERE status = 'pending'")
        ).rows[0].count
      },
      { label: "Alerts raised", value: alerts.length },
      { label: "Volunteer coverage", value: overview.volunteerReadiness }
    ],
    alerts,
    openTasks: openTasks.slice(0, 6)
  });
});

app.get("/api/companies/:id/csr-stats", requireAuth, requireRole(["csr_partner", "admin"]), async (request, response) => {
  const companyId =
    request.user.role === "csr_partner"
      ? request.user.companyId || Number(request.params.id)
      : Number(request.params.id);

  const stats = await computeCSRStats(companyId, {
    from: request.query.from,
    to: request.query.to
  });
  if (!stats.company) {
    response.status(404).json({ error: "Company not found." });
    return;
  }
  response.json(stats);
});

app.get("/api/csr-report", requireAuth, requireRole(["csr_partner", "admin"]), async (request, response) => {
  const companyId =
    request.user.role === "csr_partner"
      ? request.user.companyId || (await getDefaultCompanyId())
      : Number(request.query.companyId) || (await getDefaultCompanyId());

  response.json(
    await computeCSRStats(companyId, {
      from: request.query.from,
      to: request.query.to
    })
  );
});

app.post("/api/companies/:id/report", requireAuth, requireRole(["csr_partner", "admin"]), async (request, response) => {
  const companyId =
    request.user.role === "csr_partner"
      ? request.user.companyId || Number(request.params.id)
      : Number(request.params.id);

  const filters = {
    from: request.body.from || null,
    to: request.body.to || null
  };

  const stats = await computeCSRStats(companyId, filters);
  if (!stats.company) {
    response.status(404).json({ error: "Company not found." });
    return;
  }
  const generated = await generateReportPdf(companyId, stats, filters);
  response.status(201).json(generated);
});

app.get("/api/reports/:companyId", requireAuth, requireRole(["csr_partner", "admin"]), async (request, response) => {
  const companyId =
    request.user.role === "csr_partner"
      ? request.user.companyId || Number(request.params.companyId)
      : Number(request.params.companyId);

  const result = await query(
    `
      SELECT id, file_path, generated_at
      FROM csr_reports
      WHERE company_id = $1
      ORDER BY generated_at DESC
    `,
    [companyId]
  );

  response.json({
    reports: result.rows.map((row) => ({
      id: row.id,
      generatedAt: row.generated_at,
      downloadUrl: `${REPORT_BASE_URL}/${row.file_path.replace(/\\/g, "/")}`
    }))
  });
});

app.post("/api/whatsapp", handleWhatsappWebhook);

app.post("/api/twilio-webhook", async (request, response) => {
  request.body.From = request.body.From || request.body.from;
  request.body.Body = request.body.Body || request.body.body;
  return handleWhatsappWebhook(request, response);
});

app.get("/api/messages/:userId/history", requireAuth, requireRole(["admin", "ngo_worker"]), async (request, response) => {
  const result = await query(
    `
      SELECT from_user, body, media_url, direction, channel, parsed_data, timestamp
      FROM messages
      WHERE from_user = $1
      ORDER BY timestamp DESC
      LIMIT 50
    `,
    [request.params.userId]
  );
  response.json({ messages: result.rows });
});

app.use(express.static(__dirname));

app.use((error, request, response, next) => {
  console.error(error);
  response.status(500).json({
    error: "Something went wrong.",
    detail: process.env.NODE_ENV === "production" ? undefined : error.message
  });
});

async function ensureDirectories() {
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
  await fsp.mkdir(REPORTS_DIR, { recursive: true });
}

async function start() {
  await ensureDirectories();
  // await initDatabase();

  app.listen(PORT, () => {
    console.log(`KindredPune server running on http://localhost:${PORT}`);
    console.log("Demo accounts: admin@kindredpune.org / kindred123");
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  pool.end().catch(() => {});
  process.exit(1);
});
