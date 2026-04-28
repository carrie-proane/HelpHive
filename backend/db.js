require("dotenv").config();

const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.PGSSLMODE === "require"
      ? { rejectUnauthorized: false }
      : false
});

const AREA_COORDINATES = {
  shivajinagar: { latitude: 18.5314, longitude: 73.8446, label: "Shivajinagar" },
  kasba: { latitude: 18.5204, longitude: 73.8567, label: "Kasba Peth" },
  kasba_peth: { latitude: 18.5204, longitude: 73.8567, label: "Kasba Peth" },
  pimpri: { latitude: 18.6298, longitude: 73.7997, label: "Pimpri" },
  kothrud: { latitude: 18.5074, longitude: 73.8077, label: "Kothrud" },
  yerawada: { latitude: 18.5538, longitude: 73.8893, label: "Yerawada" },
  hadapsar: { latitude: 18.5089, longitude: 73.9259, label: "Hadapsar" },
  camp: { latitude: 18.5169, longitude: 73.8785, label: "Camp" }
};

function isoDaysAgo(days, hours = 0) {
  return new Date(
    Date.now() - days * 24 * 60 * 60 * 1000 - hours * 60 * 60 * 1000
  ).toISOString();
}

async function query(text, params = []) {
  return pool.query(text, params);
}

async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function createSchema() {
  await query("CREATE EXTENSION IF NOT EXISTS postgis");

  await query(`
    CREATE TABLE IF NOT EXISTS companies (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('volunteer', 'ngo_worker', 'admin', 'csr_partner')),
      skills TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      languages TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      availability JSONB NOT NULL DEFAULT '{}'::jsonb,
      base_location TEXT,
      company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS volunteers (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      skills TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      languages TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      availability JSONB NOT NULL DEFAULT '{}'::jsonb,
      location GEOGRAPHY(POINT, 4326),
      is_available BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      ngo_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('critical', 'urgent', 'stable')),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'resolved')),
      source TEXT NOT NULL DEFAULT 'manual',
      location_name TEXT,
      location GEOGRAPHY(POINT, 4326) NOT NULL,
      required_skills TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      is_assigned BOOLEAN NOT NULL DEFAULT FALSE,
      assigned_volunteer_ids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
      sponsor_company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS assignments (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      volunteer_id INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
      match_score NUMERIC(10, 3) NOT NULL DEFAULT 0
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS surveys (
      id SERIAL PRIMARY KEY,
      raw_text TEXT NOT NULL,
      parsed_needs JSONB NOT NULL DEFAULT '{}'::jsonb,
      location GEOGRAPHY(POINT, 4326),
      confidence NUMERIC(10, 3),
      source TEXT NOT NULL,
      task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS contributions (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      volunteer_hours DECIMAL(10, 2) NOT NULL DEFAULT 0,
      funds DECIMAL(12, 2) NOT NULL DEFAULT 0,
      people_served INTEGER NOT NULL DEFAULT 0,
      task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      date TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS csr_reports (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      filters JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      from_user TEXT NOT NULL,
      body TEXT NOT NULL,
      media_url TEXT,
      direction TEXT NOT NULL DEFAULT 'incoming' CHECK (direction IN ('incoming', 'outgoing')),
      channel TEXT NOT NULL DEFAULT 'whatsapp',
      parsed_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      raw_text TEXT NOT NULL,
      confidence NUMERIC(10, 3) NOT NULL,
      corrected_text TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
      reviewer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    )
  `);

  await query(
    "CREATE INDEX IF NOT EXISTS volunteers_location_gix ON volunteers USING GIST (location)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS tasks_location_gix ON tasks USING GIST (location)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS surveys_location_gix ON surveys USING GIST (location)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS tasks_status_updated_idx ON tasks (status, updated_at DESC)"
  );
  await query(
    "CREATE UNIQUE INDEX IF NOT EXISTS assignments_task_volunteer_uidx ON assignments (task_id, volunteer_id)"
  );
}

async function seedDatabase() {
  const existing = await query("SELECT COUNT(*)::int AS count FROM users");
  if (existing.rows[0].count > 0) {
    return;
  }

  const passwordHash = await bcrypt.hash("kindred123", 10);

  await withTransaction(async (client) => {
    const companyRows = await client.query(
      `
        INSERT INTO companies (name, details)
        VALUES
          ($1, $2::jsonb),
          ($3, $4::jsonb)
        RETURNING id, name
      `,
      [
        "Sunrise CSR Collective",
        JSON.stringify({ sector: "Water and health" }),
        "Aurora Impact Partners",
        JSON.stringify({ sector: "Food and sanitation" })
      ]
    );

    const companies = Object.fromEntries(
      companyRows.rows.map((row) => [row.name, row.id])
    );

    const userDefinitions = [
      {
        name: "Asha Kulkarni",
        email: "admin@helphive.org",
        role: "admin",
        skills: ["coordination", "governance", "review"],
        languages: ["Marathi", "Hindi", "English"],
        availability: { label: "Full-time" },
        baseLocation: "Shivajinagar",
        companyId: null
      },
      {
        name: "Meera Patil",
        email: "ngo@helphive.org",
        role: "ngo_worker",
        skills: ["community outreach", "survey intake", "routing"],
        languages: ["Marathi", "Hindi"],
        availability: { label: "Weekdays 8 AM - 6 PM" },
        baseLocation: "Kasba Peth",
        companyId: null
      },
      {
        name: "Aditya Kale",
        email: "volunteer@helphive.org",
        role: "volunteer",
        skills: ["logistics", "meal distribution", "marathi"],
        languages: ["Marathi", "Hindi"],
        availability: { label: "Weekends and evenings" },
        baseLocation: "Kothrud",
        companyId: null
      },
      {
        name: "Fatima Shaikh",
        email: "buddy@helphive.org",
        role: "volunteer",
        skills: ["medical", "triage", "marathi"],
        languages: ["Marathi", "Hindi", "Urdu"],
        availability: { label: "Mornings" },
        baseLocation: "Yerawada",
        companyId: null
      },
      {
        name: "Rohan Deshpande",
        email: "csr@helphive.org",
        role: "csr_partner",
        skills: ["reporting", "funding"],
        languages: ["English", "Hindi"],
        availability: { label: "Business hours" },
        baseLocation: "Camp",
        companyId: companies["Sunrise CSR Collective"]
      }
    ];

    const users = {};

    for (const user of userDefinitions) {
      const inserted = await client.query(
        `
          INSERT INTO users (
            name, email, password_hash, role, skills, languages, availability, base_location, company_id
          )
          VALUES ($1, $2, $3, $4, $5::text[], $6::text[], $7::jsonb, $8, $9)
          RETURNING id, email
        `,
        [
          user.name,
          user.email,
          passwordHash,
          user.role,
          user.skills,
          user.languages,
          JSON.stringify(user.availability),
          user.baseLocation,
          user.companyId
        ]
      );
      users[user.email] = inserted.rows[0].id;
    }

    const volunteerDefs = [
      {
        email: "volunteer@helphive.org",
        latitude: AREA_COORDINATES.kothrud.latitude,
        longitude: AREA_COORDINATES.kothrud.longitude,
        skills: ["logistics", "meal distribution", "marathi"],
        languages: ["Marathi", "Hindi"],
        availability: { label: "Weekends and evenings" }
      },
      {
        email: "buddy@helphive.org",
        latitude: AREA_COORDINATES.yerawada.latitude,
        longitude: AREA_COORDINATES.yerawada.longitude,
        skills: ["medical", "triage", "marathi"],
        languages: ["Marathi", "Hindi", "Urdu"],
        availability: { label: "Mornings" }
      }
    ];

    const volunteerIds = {};

    for (const volunteer of volunteerDefs) {
      const inserted = await client.query(
        `
          INSERT INTO volunteers (
            user_id, skills, languages, availability, location, is_available
          )
          VALUES (
            $1, $2::text[], $3::text[], $4::jsonb,
            ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography, TRUE
          )
          RETURNING id
        `,
        [
          users[volunteer.email],
          volunteer.skills,
          volunteer.languages,
          JSON.stringify(volunteer.availability),
          volunteer.longitude,
          volunteer.latitude
        ]
      );
      volunteerIds[volunteer.email] = inserted.rows[0].id;
    }

    const taskDefinitions = [
      {
        title: "Water shortage - Shivajinagar",
        description:
          "Handwritten lane survey and follow-up calls show water refill gaps across 14 households.",
        type: "water",
        severity: "critical",
        locationName: "Shivajinagar",
        latitude: AREA_COORDINATES.shivajinagar.latitude,
        longitude: AREA_COORDINATES.shivajinagar.longitude,
        source: "survey",
        status: "open",
        ngoId: users["ngo@helphive.org"],
        requiredSkills: ["logistics", "marathi", "community outreach"],
        sponsorCompanyId: companies["Sunrise CSR Collective"],
        metadata: { confidence: 0.74, extractedText: "पाणी कमी आहे शिवाजीनगर 14 घरे" },
        updatedAt: isoDaysAgo(0, 4)
      },
      {
        title: "Waste overflow - Pimpri",
        description:
          "Morning desk notes show drain blockage and overflow near the market road.",
        type: "sanitation",
        severity: "urgent",
        locationName: "Pimpri",
        latitude: AREA_COORDINATES.pimpri.latitude,
        longitude: AREA_COORDINATES.pimpri.longitude,
        source: "whatsapp",
        status: "open",
        ngoId: users["ngo@helphive.org"],
        requiredSkills: ["logistics", "community outreach"],
        sponsorCompanyId: companies["Aurora Impact Partners"],
        metadata: { confidence: 0.91 },
        updatedAt: isoDaysAgo(0, 6)
      },
      {
        title: "Volunteers needed - Kothrud kitchen",
        description:
          "Evening meal packing needs two more local volunteers with logistics experience.",
        type: "volunteer",
        severity: "stable",
        locationName: "Kothrud",
        latitude: AREA_COORDINATES.kothrud.latitude,
        longitude: AREA_COORDINATES.kothrud.longitude,
        source: "manual",
        status: "open",
        ngoId: users["ngo@helphive.org"],
        requiredSkills: ["meal distribution", "logistics"],
        sponsorCompanyId: companies["Aurora Impact Partners"],
        metadata: { confidence: 0.95 },
        updatedAt: isoDaysAgo(0, 2)
      },
      {
        title: "Fever cluster - Yerawada",
        description:
          "Audio reports mention repeated fever and medicine shortages in a compact lane cluster.",
        type: "medical",
        severity: "critical",
        locationName: "Yerawada",
        latitude: AREA_COORDINATES.yerawada.latitude,
        longitude: AREA_COORDINATES.yerawada.longitude,
        source: "voice",
        status: "in_progress",
        ngoId: users["ngo@helphive.org"],
        requiredSkills: ["medical", "triage", "marathi"],
        sponsorCompanyId: companies["Sunrise CSR Collective"],
        metadata: { confidence: 0.86 },
        updatedAt: isoDaysAgo(0, 5),
        completedAt: null
      },
      {
        title: "Purification support - Kasba Peth",
        description:
          "Two handwritten survey sheets mention muddy water and poor purification access.",
        type: "water",
        severity: "urgent",
        locationName: "Kasba Peth",
        latitude: AREA_COORDINATES.kasba.latitude,
        longitude: AREA_COORDINATES.kasba.longitude,
        source: "survey",
        status: "open",
        ngoId: users["ngo@helphive.org"],
        requiredSkills: ["logistics", "marathi", "community outreach"],
        sponsorCompanyId: companies["Sunrise CSR Collective"],
        metadata: { confidence: 0.82 },
        updatedAt: isoDaysAgo(1, 3)
      },
      {
        title: "Ration restock - Hadapsar",
        description:
          "WhatsApp intake requests dry ration support for 23 households after wage disruption.",
        type: "food",
        severity: "urgent",
        locationName: "Hadapsar",
        latitude: AREA_COORDINATES.hadapsar.latitude,
        longitude: AREA_COORDINATES.hadapsar.longitude,
        source: "whatsapp",
        status: "completed",
        ngoId: users["ngo@helphive.org"],
        requiredSkills: ["meal distribution", "logistics"],
        sponsorCompanyId: companies["Sunrise CSR Collective"],
        metadata: { confidence: 0.93 },
        updatedAt: isoDaysAgo(0, 8),
        completedAt: isoDaysAgo(0, 2)
      }
    ];

    const taskIds = {};

    for (const task of taskDefinitions) {
      const inserted = await client.query(
        `
          INSERT INTO tasks (
            ngo_id, type, severity, title, description, status, source, location_name, location,
            required_skills, is_assigned, sponsor_company_id, metadata, created_at, updated_at, completed_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            ST_SetSRID(ST_MakePoint($9, $10), 4326)::geography,
            $11::text[], $12, $13, $14::jsonb, $15, $16, $17
          )
          RETURNING id, title
        `,
        [
          task.ngoId,
          task.type,
          task.severity,
          task.title,
          task.description,
          task.status,
          task.source,
          task.locationName,
          task.longitude,
          task.latitude,
          task.requiredSkills,
          task.status !== "open",
          task.sponsorCompanyId,
          JSON.stringify(task.metadata),
          task.updatedAt,
          task.updatedAt,
          task.completedAt
        ]
      );
      taskIds[task.title] = inserted.rows[0].id;
    }

    await client.query(
      `
        INSERT INTO assignments (task_id, volunteer_id, assigned_at, status, match_score)
        VALUES
          ($1, $2, NOW(), 'active', 9.4),
          ($1, $3, NOW(), 'active', 7.8),
          ($4, $2, NOW(), 'completed', 8.6),
          ($4, $3, NOW(), 'completed', 8.1)
      `,
      [
        taskIds["Fever cluster - Yerawada"],
        volunteerIds["buddy@helphive.org"],
        volunteerIds["volunteer@helphive.org"],
        taskIds["Ration restock - Hadapsar"]
      ]
    );

    await client.query(
      `
        UPDATE tasks
        SET assigned_volunteer_ids = $2::integer[], is_assigned = TRUE
        WHERE id = $1
      `,
      [
        taskIds["Fever cluster - Yerawada"],
        [users["buddy@helphive.org"], users["volunteer@helphive.org"]]
      ]
    );

    await client.query(
      `
        UPDATE tasks
        SET assigned_volunteer_ids = $2::integer[], is_assigned = TRUE
        WHERE id = $1
      `,
      [
        taskIds["Ration restock - Hadapsar"],
        [users["buddy@helphive.org"], users["volunteer@helphive.org"]]
      ]
    );

    await client.query(
      `
        INSERT INTO surveys (raw_text, parsed_needs, location, confidence, source, task_id, created_at)
        VALUES
          (
            $1,
            $2::jsonb,
            ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
            $5,
            'survey',
            $6,
            NOW()
          ),
          (
            $7,
            $8::jsonb,
            ST_SetSRID(ST_MakePoint($9, $10), 4326)::geography,
            $11,
            'voice',
            $12,
            NOW()
          )
      `,
      [
        "पाणी कमी आहे शिवाजीनगर 14 घरे",
        JSON.stringify({ type: "water", locationName: "Shivajinagar" }),
        AREA_COORDINATES.shivajinagar.longitude,
        AREA_COORDINATES.shivajinagar.latitude,
        0.74,
        taskIds["Water shortage - Shivajinagar"],
        "Families need medical support and clean water after repeated fever complaints in the lane.",
        JSON.stringify({ type: "medical", locationName: "Yerawada" }),
        AREA_COORDINATES.yerawada.longitude,
        AREA_COORDINATES.yerawada.latitude,
        0.86,
        taskIds["Fever cluster - Yerawada"]
      ]
    );

    await client.query(
      `
        INSERT INTO reviews (
          source_type, source_id, raw_text, confidence, corrected_text, status
        )
        VALUES ($1, $2, $3, $4, NULL, 'pending')
      `,
      [
        "survey",
        taskIds["Water shortage - Shivajinagar"],
        "पाणी कमी आहे शिवाजीनगर 14 घरे",
        0.74
      ]
    );

    await client.query(
      `
        INSERT INTO messages (from_user, body, media_url, direction, channel, parsed_data, timestamp)
        VALUES
          ($1, $2, NULL, 'incoming', 'whatsapp', $3::jsonb, $4),
          ($5, $6, NULL, 'outgoing', 'whatsapp', $7::jsonb, $8)
      `,
      [
        "whatsapp:+919999999999",
        "Pimpri drain overflow near market road. Need sanitation support today.",
        JSON.stringify({ type: "sanitation", locationName: "Pimpri" }),
        isoDaysAgo(0, 6),
        "whatsapp:+919999999999",
        "Thanks. We have recorded your report and queued it for the field desk.",
        JSON.stringify({ state: "completed" }),
        isoDaysAgo(0, 6)
      ]
    );

    await client.query(
      `
        INSERT INTO contributions (
          company_id, volunteer_hours, funds, people_served, task_id, details, date
        )
        VALUES
          ($1, 28.5, 45000, 96, $2, $3::jsonb, $4),
          ($1, 14.0, 18000, 52, $5, $6::jsonb, $7),
          ($8, 12.0, 15000, 40, $9, $10::jsonb, $11)
      `,
      [
        companies["Sunrise CSR Collective"],
        taskIds["Ration restock - Hadapsar"],
        JSON.stringify({ category: "food", month: "Mar" }),
        isoDaysAgo(20),
        taskIds["Fever cluster - Yerawada"],
        JSON.stringify({ category: "medical", month: "Apr" }),
        isoDaysAgo(6),
        companies["Aurora Impact Partners"],
        taskIds["Waste overflow - Pimpri"],
        JSON.stringify({ category: "sanitation", month: "Apr" }),
        isoDaysAgo(4)
      ]
    );
  });
}

async function initDatabase() {
  await createSchema();
  await seedDatabase();
}

module.exports = {
  pool,
  query,
  withTransaction,
  initDatabase
};
