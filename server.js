const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const PDFDocument = require("pdfkit");

let OpenAI;
let twilio;

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

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "kindred-dev-secret";
const DECAY_LAMBDA = Number(process.env.DECAY_LAMBDA || 0.12);
const SILENT_NEED_THRESHOLD = Number(process.env.SILENT_NEED_THRESHOLD || 2);
const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(__dirname, "uploads");
const DATA_FILE = path.join(DATA_DIR, "db.json");
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

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(UPLOAD_DIR));

function isoDaysAgo(days, hours = 0) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000 - hours * 60 * 60 * 1000).toISOString();
}

function titleCase(value) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function haversineKm(aLat, aLng, bLat, bLng) {
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

function getAreaMatch(text = "") {
  const normalized = text.toLowerCase();
  return Object.entries(AREA_COORDINATES).find(([key]) => normalized.includes(key.replaceAll("_", " ")));
}

function detectType(text = "") {
  const normalized = text.toLowerCase();
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return type;
    }
  }
  return "volunteer";
}

function detectSeverity(text = "") {
  const normalized = text.toLowerCase();
  if (/(critical|urgent|severe|outbreak|immediate|collapsed|danger)/.test(normalized)) {
    return "critical";
  }
  if (/(queue|delay|shortage|overflow|stalled|needed)/.test(normalized)) {
    return "urgent";
  }
  return "stable";
}

function inferLanguage(text = "", fallback = "Marathi / Hindi mix") {
  const normalized = text.toLowerCase();
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

function extractNeedFromText(text, source, confidence = 0.84) {
  const matchedArea = getAreaMatch(text);
  const location = matchedArea
    ? matchedArea[1]
    : { latitude: 18.5204, longitude: 73.8567, label: "Central Pune" };
  const type = detectType(text);
  const severity = detectSeverity(text);
  const summary = text.trim().slice(0, 140) || "Need reported";

  return {
    id: createId("need"),
    type,
    description: text.trim() || "Need intake pending review.",
    title: `${titleCase(type)} support - ${location.label}`,
    locationName: location.label,
    latitude: location.latitude,
    longitude: location.longitude,
    severity,
    source,
    timestamp: new Date().toISOString(),
    status: "open",
    ngo: type === "water" || type === "medical" ? "Jeevan Dhara" : type === "sanitation" ? "Seva Setu" : "Nagrik Mitra",
    confidence,
    needsReview: confidence < 0.8,
    explanation: summary,
    language: inferLanguage(text),
    extractedText: text
  };
}

function mapNeedToTask(need) {
  return {
    id: createId("task"),
    needId: need.id,
    title: need.title,
    type: need.type,
    locationName: need.locationName,
    latitude: need.latitude,
    longitude: need.longitude,
    severity: need.severity,
    status: "open",
    requiredSkills: SKILL_KEYWORDS[need.type] || ["community outreach"],
    assignedVolunteerIds: [],
    buddySuggestionIds: [],
    sponsorCompanyId: need.type === "water" || need.type === "medical" ? "company_sunrise" : "company_aurora",
    createdAt: need.timestamp,
    updatedAt: need.timestamp,
    notes: need.description
  };
}

function calculateCurrentIntensity(item) {
  const ageHours = Math.max(
    0,
    (Date.now() - new Date(item.timestamp || item.updatedAt || Date.now()).getTime()) / (1000 * 60 * 60)
  );
  const base = SEVERITY_SCORES[item.severity] || 0.48;
  return Number((base * Math.exp(-DECAY_LAMBDA * ageHours)).toFixed(3));
}

function average(list) {
  if (!list.length) {
    return 0;
  }
  return list.reduce((total, value) => total + value, 0) / list.length;
}

async function ensureStorage() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });

  if (!fs.existsSync(DATA_FILE)) {
    const passwordHash = await bcrypt.hash("kindred123", 10);
    const seed = {
      meta: {
        seededAt: new Date().toISOString(),
        version: 1
      },
      companies: [
        { id: "company_sunrise", name: "Sunrise CSR Collective" },
        { id: "company_aurora", name: "Aurora Impact Partners" }
      ],
      users: [
        {
          id: "user_admin",
          name: "Asha Kulkarni",
          email: "admin@kindredpune.org",
          passwordHash,
          role: "admin",
          skills: ["coordination", "governance", "review"],
          languages: ["Marathi", "Hindi", "English"],
          availability: "Full-time",
          baseLocation: "Shivajinagar",
          latitude: 18.5314,
          longitude: 73.8446,
          companyId: null
        },
        {
          id: "user_ngo",
          name: "Meera Patil",
          email: "ngo@kindredpune.org",
          passwordHash,
          role: "ngo_worker",
          skills: ["community outreach", "survey intake", "routing"],
          languages: ["Marathi", "Hindi"],
          availability: "Weekdays 8 AM - 6 PM",
          baseLocation: "Kasba Peth",
          latitude: 18.5204,
          longitude: 73.8567,
          companyId: null
        },
        {
          id: "user_volunteer_1",
          name: "Aditya Kale",
          email: "volunteer@kindredpune.org",
          passwordHash,
          role: "volunteer",
          skills: ["logistics", "meal distribution", "marathi"],
          languages: ["Marathi", "Hindi"],
          availability: "Weekends and evenings",
          baseLocation: "Kothrud",
          latitude: 18.5074,
          longitude: 73.8077,
          companyId: null
        },
        {
          id: "user_volunteer_2",
          name: "Fatima Shaikh",
          email: "buddy@kindredpune.org",
          passwordHash,
          role: "volunteer",
          skills: ["medical", "triage", "marathi"],
          languages: ["Marathi", "Hindi", "Urdu"],
          availability: "Mornings",
          baseLocation: "Yerawada",
          latitude: 18.5538,
          longitude: 73.8893,
          companyId: null
        },
        {
          id: "user_csr",
          name: "Rohan Deshpande",
          email: "csr@kindredpune.org",
          passwordHash,
          role: "csr_partner",
          skills: ["reporting", "funding"],
          languages: ["English", "Hindi"],
          availability: "Business hours",
          baseLocation: "Camp",
          latitude: 18.5169,
          longitude: 73.8785,
          companyId: "company_sunrise"
        }
      ],
      needs: [
        {
          id: "need_water_1",
          type: "water",
          title: "Water shortage - Shivajinagar",
          description: "Handwritten lane survey and follow-up calls show water refill gaps across 14 households.",
          locationName: "Shivajinagar",
          latitude: 18.5314,
          longitude: 73.8446,
          severity: "critical",
          source: "ocr",
          timestamp: isoDaysAgo(0, 4),
          status: "open",
          ngo: "Jeevan Dhara",
          confidence: 0.74,
          needsReview: true,
          explanation: "14 reports of low water access captured across the last 2 days.",
          language: "Devanagari",
          extractedText: "पाणी कमी आहे शिवाजीनगर 14 घरे"
        },
        {
          id: "need_sanitation_1",
          type: "sanitation",
          title: "Waste overflow - Pimpri",
          description: "Morning desk notes show drain blockage and overflow near the market road.",
          locationName: "Pimpri",
          latitude: 18.6298,
          longitude: 73.7997,
          severity: "urgent",
          source: "whatsapp",
          timestamp: isoDaysAgo(0, 6),
          status: "open",
          ngo: "Seva Setu",
          confidence: 0.91,
          needsReview: false,
          explanation: "8 messages and 3 follow-up notes in the last 24 hours.",
          language: "Marathi"
        },
        {
          id: "need_volunteer_1",
          type: "volunteer",
          title: "Volunteers needed - Kothrud kitchen",
          description: "Evening meal packing needs two more local volunteers with logistics experience.",
          locationName: "Kothrud",
          latitude: 18.5074,
          longitude: 73.8077,
          severity: "stable",
          source: "manual",
          timestamp: isoDaysAgo(0, 2),
          status: "open",
          ngo: "Nagrik Mitra",
          confidence: 0.95,
          needsReview: false,
          explanation: "Coordinator flagged a repeat gap during the dinner shift.",
          language: "English"
        },
        {
          id: "need_medical_1",
          type: "medical",
          title: "Fever cluster - Yerawada",
          description: "Audio reports mention repeated fever and medicine shortages in a compact lane cluster.",
          locationName: "Yerawada",
          latitude: 18.5538,
          longitude: 73.8893,
          severity: "critical",
          source: "audio",
          timestamp: isoDaysAgo(0, 5),
          status: "open",
          ngo: "Jeevan Dhara",
          confidence: 0.86,
          needsReview: false,
          explanation: "12 illness mentions within the last 5 days.",
          language: "Hindi"
        },
        {
          id: "need_water_2",
          type: "water",
          title: "Purification support - Kasba Peth",
          description: "Two handwritten survey sheets mention muddy water and poor purification access.",
          locationName: "Kasba Peth",
          latitude: 18.5204,
          longitude: 73.8567,
          severity: "urgent",
          source: "ocr",
          timestamp: isoDaysAgo(1, 3),
          status: "open",
          ngo: "Jeevan Dhara",
          confidence: 0.82,
          needsReview: false,
          explanation: "Repeated low-confidence water quality mentions.",
          language: "Devanagari"
        },
        {
          id: "need_food_1",
          type: "food",
          title: "Ration restock - Hadapsar",
          description: "WhatsApp intake requests dry ration support for 23 households after wage disruption.",
          locationName: "Hadapsar",
          latitude: 18.5089,
          longitude: 73.9259,
          severity: "urgent",
          source: "sms",
          timestamp: isoDaysAgo(0, 9),
          status: "resolved",
          ngo: "Nagrik Mitra",
          confidence: 0.93,
          needsReview: false,
          explanation: "Case resolved with 3 completed volunteer runs.",
          language: "Marathi"
        }
      ],
      tasks: [],
      messages: [
        {
          id: "message_1",
          channel: "whatsapp",
          from: "whatsapp:+919999999999",
          body: "Pimpri drain overflow near market road. Need sanitation support today.",
          mediaUrl: null,
          createdAt: isoDaysAgo(0, 6)
        }
      ],
      alerts: [],
      corrections: []
    };

    seed.tasks = [
      {
        id: "task_1",
        needId: "need_water_1",
        title: "Water shortage - Shivajinagar",
        type: "water",
        locationName: "Shivajinagar",
        latitude: 18.5314,
        longitude: 73.8446,
        severity: "critical",
        status: "open",
        requiredSkills: ["logistics", "marathi", "community outreach"],
        assignedVolunteerIds: [],
        buddySuggestionIds: ["user_volunteer_2"],
        sponsorCompanyId: "company_sunrise",
        createdAt: isoDaysAgo(0, 4),
        updatedAt: isoDaysAgo(0, 4),
        notes: "Needs tanker routing support plus field validation."
      },
      {
        id: "task_2",
        needId: "need_sanitation_1",
        title: "Waste overflow - Pimpri",
        type: "sanitation",
        locationName: "Pimpri",
        latitude: 18.6298,
        longitude: 73.7997,
        severity: "urgent",
        status: "open",
        requiredSkills: ["logistics", "community outreach"],
        assignedVolunteerIds: [],
        buddySuggestionIds: ["user_volunteer_1"],
        sponsorCompanyId: "company_aurora",
        createdAt: isoDaysAgo(0, 6),
        updatedAt: isoDaysAgo(0, 6),
        notes: "Coordinate sweep crew and resident updates."
      },
      {
        id: "task_3",
        needId: "need_volunteer_1",
        title: "Volunteers needed - Kothrud kitchen",
        type: "volunteer",
        locationName: "Kothrud",
        latitude: 18.5074,
        longitude: 73.8077,
        severity: "stable",
        status: "open",
        requiredSkills: ["meal distribution", "logistics"],
        assignedVolunteerIds: [],
        buddySuggestionIds: ["user_volunteer_1"],
        sponsorCompanyId: "company_aurora",
        createdAt: isoDaysAgo(0, 2),
        updatedAt: isoDaysAgo(0, 2),
        notes: "Evening shift coverage gap."
      },
      {
        id: "task_4",
        needId: "need_medical_1",
        title: "Fever cluster - Yerawada",
        type: "medical",
        locationName: "Yerawada",
        latitude: 18.5538,
        longitude: 73.8893,
        severity: "critical",
        status: "in_progress",
        requiredSkills: ["medical", "triage", "marathi"],
        assignedVolunteerIds: ["user_volunteer_2"],
        buddySuggestionIds: ["user_volunteer_1"],
        sponsorCompanyId: "company_sunrise",
        createdAt: isoDaysAgo(0, 5),
        updatedAt: isoDaysAgo(0, 3),
        notes: "Medicine distribution and symptom logging."
      },
      {
        id: "task_5",
        needId: "need_food_1",
        title: "Ration restock - Hadapsar",
        type: "food",
        locationName: "Hadapsar",
        latitude: 18.5089,
        longitude: 73.9259,
        severity: "urgent",
        status: "completed",
        requiredSkills: ["meal distribution", "logistics"],
        assignedVolunteerIds: ["user_volunteer_1", "user_volunteer_2"],
        buddySuggestionIds: [],
        sponsorCompanyId: "company_sunrise",
        createdAt: isoDaysAgo(1, 6),
        updatedAt: isoDaysAgo(0, 8),
        completedAt: isoDaysAgo(0, 2),
        notes: "Dry ration kits delivered to 23 households."
      }
    ];

    await fsp.writeFile(DATA_FILE, JSON.stringify(seed, null, 2));
  }
}

async function readDb() {
  const raw = await fsp.readFile(DATA_FILE, "utf8");
  return JSON.parse(raw);
}

async function writeDb(data) {
  await fsp.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

async function updateDb(updater) {
  const data = await readDb();
  const next = await updater(data);
  const result = next || data;
  await writeDb(result);
  return result;
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  const { passwordHash, ...safeUser } = user;
  return safeUser;
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

async function getUserFromRequest(request) {
  const authHeader = request.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const data = await readDb();
    return data.users.find((user) => user.id === payload.sub) || null;
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

function getRoleHome(role) {
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

function createReviewCorrection(existingNeed, updates, actor) {
  return {
    id: createId("correction"),
    needId: existingNeed.id,
    actorId: actor.id,
    before: {
      title: existingNeed.title,
      description: existingNeed.description,
      severity: existingNeed.severity,
      locationName: existingNeed.locationName
    },
    after: {
      title: updates.title || existingNeed.title,
      description: updates.description || existingNeed.description,
      severity: updates.severity || existingNeed.severity,
      locationName: updates.locationName || existingNeed.locationName
    },
    createdAt: new Date().toISOString()
  };
}

async function performMockOcr(file) {
  const fileHint = (file.originalname || "").toLowerCase();
  const matchedArea = getAreaMatch(fileHint);
  const area = matchedArea ? matchedArea[1].label : "Shivajinagar";
  const isLowConfidence = /(hand|scan|rough|low)/.test(fileHint);
  const text = isLowConfidence
    ? `हस्तलिखित सर्वेक्षण: ${area} मध्ये पाणी आणि औषधांची कमतरता. 11 कुटुंबे प्रतीक्षेत आहेत.`
    : `Community survey from ${area} notes water shortage, tanker delay, and volunteer support needed.`;
  const words = text.split(/\s+/).map((word, index) => ({
    text: word,
    confidence: clamp((isLowConfidence ? 0.68 : 0.9) - index * 0.003, 0.52, 0.95)
  }));

  return {
    text,
    words,
    averageConfidence: Number(average(words.map((word) => word.confidence)).toFixed(2))
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
      model: process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1",
      confidence: 0.86,
      provider: "openai"
    };
  }

  const fileHint = (file.originalname || "").toLowerCase();
  const matchedArea = getAreaMatch(fileHint);
  const area = matchedArea ? matchedArea[1].label : "Yerawada";

  return {
    text: `Voice report from ${area}: families need medical support and clean water after repeated fever complaints in the lane.`,
    model: "mock-whisper",
    confidence: 0.8,
    provider: "mock"
  };
}

function createTwimlResponse(message) {
  if (twilio) {
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(message);
    return twiml.toString();
  }

  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`;
}

async function rebuildAlerts() {
  await updateDb((data) => {
    const now = Date.now();
    const recentNeeds = data.needs.filter((need) => {
      const ageDays = (now - new Date(need.timestamp).getTime()) / (1000 * 60 * 60 * 24);
      return need.status !== "resolved" && ageDays <= 5;
    });

    const clusters = [];
    for (const need of recentNeeds) {
      const existingCluster = clusters.find(
        (cluster) =>
          cluster.type === need.type &&
          haversineKm(
            cluster.center.latitude,
            cluster.center.longitude,
            need.latitude,
            need.longitude
          ) <= 3
      );

      if (existingCluster) {
        existingCluster.items.push(need);
        existingCluster.center = {
          latitude: average(existingCluster.items.map((item) => item.latitude)),
          longitude: average(existingCluster.items.map((item) => item.longitude))
        };
        continue;
      }

      clusters.push({
        type: need.type,
        label: need.locationName,
        center: {
          latitude: need.latitude,
          longitude: need.longitude
        },
        items: [need]
      });
    }

    data.alerts = [];

    clusters.forEach((cluster) => {
      const items = cluster.items;
      if (items.length < SILENT_NEED_THRESHOLD) {
        return;
      }

      const first = items[0];
      const counts = items.length;
      const start = new Date(
        Math.min(...items.map((item) => new Date(item.timestamp).getTime()))
      ).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      const end = new Date(
        Math.max(...items.map((item) => new Date(item.timestamp).getTime()))
      ).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

      data.alerts.push({
        id: `alert_${first.type}_${cluster.label.replace(/[^a-z0-9]/gi, "_")}`,
        type: first.type,
        severity: items.some((item) => item.severity === "critical") ? "critical" : "urgent",
        title: `Silent Need Alert - ${titleCase(first.type)} near ${cluster.label}`,
        locationName: cluster.label,
        latitude: cluster.center.latitude,
        longitude: cluster.center.longitude,
        evidenceCount: counts,
        explanation: `${counts} ${first.type} reports from ${start} to ${end} within roughly 3 km of ${cluster.label}.`,
        relatedNeedIds: items.map((item) => item.id),
        createdAt: new Date().toISOString()
      });
    });

    return data;
  });
}

function buildTaskResponse(task, data, currentUser) {
  const assignedUsers = task.assignedVolunteerIds
    .map((userId) => data.users.find((user) => user.id === userId))
    .filter(Boolean)
    .map(sanitizeUser);
  const buddies = task.buddySuggestionIds
    .map((userId) => data.users.find((user) => user.id === userId))
    .filter(Boolean)
    .map(sanitizeUser);

  const distanceKm =
    currentUser && currentUser.latitude && currentUser.longitude
      ? haversineKm(currentUser.latitude, currentUser.longitude, task.latitude, task.longitude)
      : null;

  return {
    ...task,
    assignedUsers,
    buddySuggestions: buddies,
    distanceKm: distanceKm ? Number(distanceKm.toFixed(1)) : null
  };
}

function buildIssueResponse(need) {
  return {
    id: need.id,
    lat: need.latitude,
    lng: need.longitude,
    type: need.type,
    severity: need.severity,
    label: need.title,
    updated: new Date(need.timestamp).toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit"
    }),
    ngo: need.ngo,
    locationName: need.locationName,
    source: need.source,
    currentIntensity: calculateCurrentIntensity(need),
    needsReview: need.needsReview
  };
}

async function createNeedAndTask({ text, source, confidence, createdBy }) {
  const need = extractNeedFromText(text, source, confidence);
  const task = mapNeedToTask(need);

  await updateDb((data) => {
    data.needs.unshift({
      ...need,
      createdBy: createdBy ? createdBy.id : null
    });
    data.tasks.unshift(task);
    return data;
  });

  await rebuildAlerts();

  return { need, task };
}

app.get("/api/health", async (request, response) => {
  const data = await readDb();
  response.json({
    ok: true,
    users: data.users.length,
    needs: data.needs.length,
    tasks: data.tasks.length,
    alerts: data.alerts.length
  });
});

app.post("/api/signup", async (request, response) => {
  const { name, email, password, role, skills, baseLocation, availability } = request.body;

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
  const locationMatch = getAreaMatch(baseLocation || "");
  const passwordHash = await bcrypt.hash(password, 10);
  let createdUser;

  try {
    await updateDb((data) => {
      if (data.users.some((user) => user.email === normalizedEmail)) {
        throw new Error("exists");
      }

      const coords = locationMatch ? locationMatch[1] : AREA_COORDINATES.kasba;
      createdUser = {
        id: createId("user"),
        name: String(name).trim(),
        email: normalizedEmail,
        passwordHash,
        role,
        skills: Array.isArray(skills)
          ? skills
          : String(skills || "")
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
        languages: ["Marathi", "Hindi"],
        availability: availability || "To be updated",
        baseLocation: baseLocation || coords.label,
        latitude: coords.latitude,
        longitude: coords.longitude,
        companyId: role === "csr_partner" ? "company_sunrise" : null
      };

      data.users.push(createdUser);
      return data;
    });
  } catch (error) {
    if (error.message === "exists") {
      response.status(409).json({ error: "An account with this email already exists." });
      return;
    }

    throw error;
  }

  const token = createToken(createdUser);
  response.status(201).json({
    token,
    user: sanitizeUser(createdUser),
    redirectTo: getRoleHome(createdUser.role)
  });
});

app.post("/api/login", async (request, response) => {
  const { email, password } = request.body;

  if (!email || !password) {
    response.status(400).json({ error: "Email and password are required." });
    return;
  }

  const data = await readDb();
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = data.users.find((item) => item.email === normalizedEmail);

  if (!user) {
    response.status(401).json({ error: "Invalid email or password." });
    return;
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    response.status(401).json({ error: "Invalid email or password." });
    return;
  }

  response.json({
    token: createToken(user),
    user: sanitizeUser(user),
    redirectTo: getRoleHome(user.role)
  });
});

app.get("/api/me", requireAuth, async (request, response) => {
  response.json({
    user: sanitizeUser(request.user),
    redirectTo: getRoleHome(request.user.role)
  });
});

app.put("/api/profile", requireAuth, async (request, response) => {
  const { name, skills, languages, availability, baseLocation } = request.body;
  let updatedUser;
  const matchedArea = getAreaMatch(baseLocation || "");

  await updateDb((data) => {
    const user = data.users.find((item) => item.id === request.user.id);
    if (!user) {
      return data;
    }

    user.name = name || user.name;
    user.skills = Array.isArray(skills)
      ? skills
      : String(skills || user.skills.join(","))
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
    user.languages = Array.isArray(languages)
      ? languages
      : String(languages || user.languages.join(","))
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
    user.availability = availability || user.availability;

    if (baseLocation) {
      user.baseLocation = baseLocation;
      if (matchedArea) {
        user.latitude = matchedArea[1].latitude;
        user.longitude = matchedArea[1].longitude;
      }
    }

    updatedUser = sanitizeUser(user);
    return data;
  });

  response.json({ user: updatedUser });
});

app.get("/api/overview", async (request, response) => {
  const data = await readDb();
  const openNeeds = data.needs.filter((need) => need.status !== "resolved");
  const openTasks = data.tasks.filter((task) => task.status !== "completed");
  const matchedTasks = data.tasks.filter((task) => task.assignedVolunteerIds.length > 0);

  response.json({
    wardsLive: 11,
    openNeeds: openNeeds.length,
    criticalClusters: data.alerts.length,
    responseCycle: "2h 14m",
    volunteerReadiness: `${Math.round((matchedTasks.length / Math.max(openTasks.length, 1)) * 100)}%`,
    activeVolunteers: data.users.filter((user) => user.role === "volunteer").length
  });
});

app.get("/api/issues", async (request, response) => {
  const data = await readDb();
  const issues = data.needs
    .filter((need) => need.status !== "resolved")
    .map(buildIssueResponse);
  response.json({ issues, alerts: data.alerts });
});

app.get("/api/tasks", async (request, response) => {
  const user = await getUserFromRequest(request);
  const data = await readDb();
  const type = request.query.type;
  const severity = request.query.severity;
  const tasks = data.tasks
    .filter((task) => (type ? task.type === type : true))
    .filter((task) => (severity ? task.severity === severity : true))
    .map((task) => buildTaskResponse(task, data, user));

  response.json({ tasks, currentUser: sanitizeUser(user) });
});

app.post("/api/tasks/:id/volunteer", requireAuth, requireRole(["volunteer", "admin"]), async (request, response) => {
  let updatedTask;

  await updateDb((data) => {
    const task = data.tasks.find((item) => item.id === request.params.id);
    if (!task) {
      return data;
    }

    if (!task.assignedVolunteerIds.includes(request.user.id)) {
      task.assignedVolunteerIds.push(request.user.id);
    }
    task.status = task.status === "open" ? "in_progress" : task.status;
    task.updatedAt = new Date().toISOString();
    updatedTask = buildTaskResponse(task, data, request.user);
    return data;
  });

  if (!updatedTask) {
    response.status(404).json({ error: "Task not found." });
    return;
  }

  response.json({ task: updatedTask });
});

app.post("/api/tasks/:id/complete", requireAuth, async (request, response) => {
  let updatedTask;

  await updateDb((data) => {
    const task = data.tasks.find((item) => item.id === request.params.id);
    if (!task) {
      return data;
    }

    const canComplete =
      request.user.role === "admin" ||
      request.user.role === "ngo_worker" ||
      task.assignedVolunteerIds.includes(request.user.id);

    if (!canComplete) {
      throw new Error("forbidden");
    }

    task.status = "completed";
    task.completedAt = new Date().toISOString();
    task.updatedAt = task.completedAt;
    updatedTask = buildTaskResponse(task, data, request.user);

    const need = data.needs.find((item) => item.id === task.needId);
    if (need) {
      need.status = "resolved";
    }

    return data;
  }).catch((error) => {
    if (error.message === "forbidden") {
      response.status(403).json({ error: "You cannot complete this task." });
      updatedTask = null;
      return null;
    }
    throw error;
  });

  if (response.headersSent) {
    return;
  }

  if (!updatedTask) {
    response.status(404).json({ error: "Task not found." });
    return;
  }

  await rebuildAlerts();
  response.json({ task: updatedTask });
});

app.post(
  "/api/ocr-upload",
  requireAuth,
  requireRole(["ngo_worker", "admin"]),
  upload.single("image"),
  async (request, response) => {
    if (!request.file) {
      response.status(400).json({ error: "Image upload is required." });
      return;
    }

    const result = await performMockOcr(request.file);
    const { need, task } = await createNeedAndTask({
      text: result.text,
      source: "ocr",
      confidence: result.averageConfidence,
      createdBy: request.user
    });

    response.status(201).json({
      need,
      task,
      ocr: {
        text: result.text,
        averageConfidence: result.averageConfidence,
        words: result.words
      }
    });
  }
);

app.post(
  "/api/audio-upload",
  requireAuth,
  requireRole(["ngo_worker", "admin"]),
  upload.single("audio"),
  async (request, response) => {
    if (!request.file) {
      response.status(400).json({ error: "Audio upload is required." });
      return;
    }

    const transcript = await transcribeAudio(request.file);
    const { need, task } = await createNeedAndTask({
      text: transcript.text,
      source: "audio",
      confidence: transcript.confidence,
      createdBy: request.user
    });

    response.status(201).json({
      need,
      task,
      transcript
    });
  }
);

app.post("/api/manual-need", requireAuth, requireRole(["ngo_worker", "admin"]), async (request, response) => {
  const { description } = request.body;

  if (!description) {
    response.status(400).json({ error: "Description is required." });
    return;
  }

  const { need, task } = await createNeedAndTask({
    text: description,
    source: "manual",
    confidence: 0.96,
    createdBy: request.user
  });

  response.status(201).json({ need, task });
});

app.post("/api/twilio-webhook", async (request, response) => {
  const bodyText = String(request.body.Body || "").trim();
  const mediaUrl = request.body.MediaUrl0 || null;
  const channel = request.body.From?.startsWith("whatsapp:") ? "whatsapp" : "sms";

  await updateDb((data) => {
    data.messages.unshift({
      id: createId("message"),
      channel,
      from: request.body.From || "unknown",
      body: bodyText,
      mediaUrl,
      createdAt: new Date().toISOString()
    });
    return data;
  });

  if (bodyText || mediaUrl) {
    const sourceText = bodyText || `Image received from ${channel} intake.`;
    await createNeedAndTask({
      text: sourceText,
      source: channel,
      confidence: mediaUrl ? 0.72 : 0.88
    });
  }

  response.type("text/xml").send(
    createTwimlResponse("Thanks. Your report is now in the KindredPune review flow.")
  );
});

app.get("/api/review-queue", requireAuth, requireRole(["admin"]), async (request, response) => {
  const data = await readDb();
  const items = data.needs
    .filter((need) => need.needsReview)
    .map((need) => ({
      ...need,
      linkedTask: data.tasks.find((task) => task.needId === need.id) || null
    }));
  response.json({ items, corrections: data.corrections });
});

app.put("/api/needs/:id", requireAuth, requireRole(["admin", "ngo_worker"]), async (request, response) => {
  const updates = request.body;
  let updatedNeed;

  await updateDb((data) => {
    const need = data.needs.find((item) => item.id === request.params.id);
    if (!need) {
      return data;
    }

    if (need.needsReview) {
      data.corrections.unshift(createReviewCorrection(need, updates, request.user));
    }

    need.title = updates.title || need.title;
    need.description = updates.description || need.description;
    need.severity = updates.severity || need.severity;
    need.locationName = updates.locationName || need.locationName;
    need.needsReview = false;
    need.confidence = 1;
    need.updatedAt = new Date().toISOString();
    updatedNeed = need;

    const linkedTask = data.tasks.find((task) => task.needId === need.id);
    if (linkedTask) {
      linkedTask.title = need.title;
      linkedTask.severity = need.severity;
      linkedTask.locationName = need.locationName;
      linkedTask.updatedAt = need.updatedAt;
    }

    return data;
  });

  if (!updatedNeed) {
    response.status(404).json({ error: "Need not found." });
    return;
  }

  await rebuildAlerts();
  response.json({ need: updatedNeed });
});

app.get("/api/alerts", async (request, response) => {
  const data = await readDb();
  response.json({ alerts: data.alerts });
});

app.post("/api/match", requireAuth, requireRole(["admin"]), async (request, response) => {
  let matches = [];

  await updateDb((data) => {
    const volunteers = data.users.filter((user) => user.role === "volunteer");
    const openTasks = data.tasks.filter((task) => task.status !== "completed");
    const usedVolunteerIds = new Set();

    matches = openTasks.map((task) => {
      const scored = volunteers
        .filter((volunteer) => !usedVolunteerIds.has(volunteer.id))
        .map((volunteer) => {
          const skillOverlap = volunteer.skills.filter((skill) =>
            task.requiredSkills.some((required) => required.toLowerCase() === skill.toLowerCase())
          ).length;
          const distanceScore = 1 / Math.max(haversineKm(volunteer.latitude, volunteer.longitude, task.latitude, task.longitude), 1);
          const totalScore = skillOverlap * 2.5 + distanceScore;
          return {
            volunteer,
            totalScore,
            distanceKm: haversineKm(volunteer.latitude, volunteer.longitude, task.latitude, task.longitude)
          };
        })
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, 2);

      const picked = scored.map((entry) => entry.volunteer);
      picked.forEach((volunteer) => usedVolunteerIds.add(volunteer.id));

      if (picked.length) {
        task.assignedVolunteerIds = picked.map((volunteer) => volunteer.id);
        task.buddySuggestionIds = picked.slice(1).map((volunteer) => volunteer.id);
        task.status = "in_progress";
        task.updatedAt = new Date().toISOString();
      }

      return {
        taskId: task.id,
        taskTitle: task.title,
        locationName: task.locationName,
        volunteers: picked.map((volunteer) => sanitizeUser(volunteer))
      };
    });

    return data;
  });

  response.json({ matches });
});

app.get("/api/admin-summary", requireAuth, requireRole(["admin"]), async (request, response) => {
  const data = await readDb();
  const openNeeds = data.needs.filter((need) => need.status !== "resolved");
  const openTasks = data.tasks.filter((task) => task.status !== "completed");

  response.json({
    metrics: [
      { label: "Open needs", value: openNeeds.length },
      { label: "Review queue", value: data.needs.filter((need) => need.needsReview).length },
      { label: "Alerts raised", value: data.alerts.length },
      { label: "Volunteer coverage", value: `${Math.round((data.tasks.filter((task) => task.assignedVolunteerIds.length > 0).length / Math.max(openTasks.length, 1)) * 100)}%` }
    ],
    alerts: data.alerts,
    openTasks: openTasks.map((task) => buildTaskResponse(task, data, request.user)).slice(0, 6)
  });
});

app.get("/api/csr-report", requireAuth, requireRole(["csr_partner", "admin"]), async (request, response) => {
  const data = await readDb();
  const requestedCompanyId = request.query.companyId || request.user.companyId || "company_sunrise";
  const company = data.companies.find((item) => item.id === requestedCompanyId) || data.companies[0];
  const completedTasks = data.tasks.filter(
    (task) => task.status === "completed" && task.sponsorCompanyId === company.id
  );
  const categories = {};

  for (const task of completedTasks) {
    categories[task.type] = (categories[task.type] || 0) + 1;
  }

  const volunteersEngaged = new Set(
    completedTasks.flatMap((task) => task.assignedVolunteerIds)
  ).size;

  response.json({
    company,
    totals: {
      tasksFunded: completedTasks.length,
      communitiesHelped: completedTasks.length * 3 + 5,
      volunteersEngaged,
      resourcesMoved: completedTasks.length * 27
    },
    categories,
    narrative: `${company.name} backed ${completedTasks.length} completed task flows across Pune with visible field closure.`,
    receiptLines: completedTasks.map((task) => ({
      title: task.title,
      locationName: task.locationName,
      completedAt: task.completedAt || task.updatedAt,
      volunteers: task.assignedVolunteerIds.length
    }))
  });
});

app.get("/api/csr-report/:companyId/receipt", requireAuth, requireRole(["csr_partner", "admin"]), async (request, response) => {
  const data = await readDb();
  const company = data.companies.find((item) => item.id === request.params.companyId);

  if (!company) {
    response.status(404).json({ error: "Company not found." });
    return;
  }

  const completedTasks = data.tasks.filter(
    (task) => task.status === "completed" && task.sponsorCompanyId === company.id
  );

  response.setHeader("Content-Type", "application/pdf");
  response.setHeader(
    "Content-Disposition",
    `attachment; filename="${company.name.toLowerCase().replace(/\s+/g, "-")}-impact-receipt.pdf"`
  );

  const doc = new PDFDocument({ margin: 48 });
  doc.pipe(response);
  doc.fontSize(24).text("KindredPune Impact Receipt", { underline: false });
  doc.moveDown(0.4);
  doc.fontSize(14).text(`Partner: ${company.name}`);
  doc.text(`Generated: ${new Date().toLocaleString("en-IN")}`);
  doc.moveDown();
  doc.fontSize(16).text("Completed Tasks");
  doc.moveDown(0.5);

  completedTasks.forEach((task, index) => {
    doc.fontSize(12).text(`${index + 1}. ${task.title}`);
    doc.text(`Location: ${task.locationName}`);
    doc.text(`Completed: ${new Date(task.completedAt || task.updatedAt).toLocaleDateString("en-IN")}`);
    doc.text(`Volunteers engaged: ${task.assignedVolunteerIds.length}`);
    doc.moveDown(0.5);
  });

  if (!completedTasks.length) {
    doc.fontSize(12).text("No completed tasks are linked to this partner yet.");
  }

  doc.end();
});

app.use(express.static(__dirname));

app.use((error, request, response, next) => {
  console.error(error);
  response.status(500).json({
    error: "Something went wrong.",
    detail: process.env.NODE_ENV === "production" ? undefined : error.message
  });
});

async function start() {
  await ensureStorage();
  await rebuildAlerts();

  setInterval(() => {
    rebuildAlerts().catch((error) => {
      console.error("Failed to rebuild alerts:", error);
    });
  }, 60 * 1000);

  app.listen(PORT, () => {
    console.log(`KindredPune server running on http://localhost:${PORT}`);
    console.log("Demo accounts: admin@kindredpune.org / kindred123");
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
