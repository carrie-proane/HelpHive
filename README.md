HelpHive is a civic response and coordination app built around one idea: bring NGO desks, volunteers, admins, and CSR partners into a shared operating layer so community needs are easier to capture, route, review, assign, and report.

The product combines:

- a public landing experience
- role-based authentication
- a live intelligence map and task feed
- NGO intake flows for OCR, audio, WhatsApp, and manual reports
- explainable volunteer matching
- an admin review queue for low-confidence extractions
- a CSR dashboard with exportable PDF reporting


At a high level, the app turns incoming community signals into structured tasks:

1. A need is captured through WhatsApp, handwritten survey upload, voice note, or manual entry.
2. The backend extracts structured information such as need type, severity, locality, and skills needed.
3. The task appears in the shared intelligence/task views.
4. Volunteers can opt in, admins can run matching, and NGO workers can complete tasks.
5. Low-confidence OCR or transcription results are pushed into an admin review queue.
6. CSR partners can view contribution metrics and generate branded PDF reports.


- `Volunteer`: views live tasks, volunteers for work, and marks assigned work complete.
- `NGO worker`: reports new needs through OCR, voice, or manual entry and monitors operational flows.
- `Admin`: monitors system health, reviews low-confidence items, runs volunteer matching, and sees alerts.
- `CSR partner`: views company-level impact metrics and exports CSR reports.


- `frontend/index.html`: public landing page and product overview
- `frontend/intelligence.html`: map, ward/task visibility, and volunteer-facing task lane
- `frontend/community.html`: public narrative/community page
- `frontend/impact.html`: public impact page plus CSR-style metrics surface
- `frontend/join.html`: public signup/join funnel
- `frontend/login.html`: shared login screen
- `frontend/signup.html`: account creation for volunteer, NGO, and corporate roles
- `frontend/profile.html`: editable role profile
- `frontend/admin.html`: admin dashboard, alerts, matching, and review queue
- `frontend/report.html`: NGO intake desk for OCR, voice, and manual needs

There are also route aliases used by the app:

- `/admin-dashboard.html` -> admin dashboard
- `/field-desk.html` -> NGO field desk
- `/my-tasks.html` -> volunteer task view
- `/csr-dashboard.html` -> CSR dashboard

## Core Features

### 1. Intelligence Layer

- Leaflet-based live map of issues
- severity overlays and NGO filters
- task feed with details modal
- volunteer fit summaries and role-aware task actions

### 2. Need Intake

- `POST /api/surveys`: image upload + OCR pipeline
- `POST /api/voice`: audio upload/recording + Gemini transcription
- `POST /api/manual-need`: quick manual task creation
- `POST /api/whatsapp`: conversational WhatsApp intake flow

### 3. OCR And AI Extraction

- Tesseract OCR for multilingual survey extraction
- optional Gemini multimodal extraction to enrich OCR results
- confidence scoring and low-confidence word detection
- structured extraction for need type, severity, location, evidence, and skills

### 4. Volunteer Matching

Matching takes into account more than distance. The backend also weighs:

- required and complementary skills
- language fit
- medical training
- communication style
- base geography
- buddy requirements for higher-risk tasks

### 5. Admin Review Queue

Low-confidence OCR or transcription results are stored for human correction. Admins can:

- inspect flagged items
- correct text, severity, and location
- approve updates back into the live task record

### 6. CSR Reporting

- company-specific impact stats
- contribution totals
- recent receipts/history
- PDF report generation using Handlebars + Puppeteer

## Tech Stack

### Frontend

- plain HTML/CSS/JavaScript
- Leaflet for maps
- responsive role-aware navigation and page guards

### Backend

- Node.js
- Express
- Sequelize
- PostgreSQL
- PostGIS or JSONB location storage mode

### Integrations

- Google Gemini via `@google/genai`
- Tesseract.js
- Twilio WhatsApp
- Puppeteer
- Handlebars

## Project Structure

```text
kindredPune/
├── backend/
│   ├── data/db.json                 # seed data and initial users/tasks
│   ├── templates/csr-report.hbs     # CSR PDF template
│   ├── Dockerfile                   # backend container image
│   ├── package.json                 # backend dependencies/scripts
│   └── server.js                    # main API + static server
├── frontend/
│   ├── index.html                   # landing page
│   ├── intelligence.html            # map + tasks
│   ├── report.html                  # NGO intake desk
│   ├── admin.html                   # admin dashboard
│   ├── impact.html                  # impact / CSR view
│   ├── login.html
│   ├── signup.html
│   ├── profile.html
│   ├── styles.css
│   ├── main.js                      # shared frontend logic
│   └── firebase.json                # hosting rewrites
├── scripts/
│   └── dev-local.js                 # local Postgres helper script
├── docker-compose.yml               # postgres + backend
├── .env.example
└── README.md
```

## Backend API Overview

### Auth And User

- `POST /api/signup`
- `POST /api/login`
- `GET /api/me`
- `PUT /api/profile`

### Health And Overview

- `GET /api/health`
- `GET /api/overview`
- `GET /api/issues`
- `GET /api/tasks`
- `GET /api/alerts`

### Task Actions

- `POST /api/tasks/:id/volunteer`
- `POST /api/tasks/:id/complete`
- `POST /api/match`

### Intake

- `POST /api/surveys`
- `POST /api/voice`
- `POST /api/manual-need`
- `POST /api/whatsapp`

### Admin

- `GET /api/admin-summary`
- `GET /api/review-queue`
- `PUT /api/needs/:id`

### CSR

- `GET /api/companies`
- `GET /api/companies/:id/csr-stats`
- `GET /api/csr-report`
- `POST /api/companies/:id/report`

## Database Model

The backend builds and seeds its own schema. Important entities include:

- `users`
- `volunteers`
- `companies`
- `tasks`
- `assignments`
- `contributions`
- `csr_reports`
- `messages`
- `reviews`
- `intake_sessions`

Location fields can be stored as PostGIS geography points or JSONB depending on `DB_LOCATION_MODE`.

## Preloaded Accounts

The app ships with preloaded accounts in the seed data:

- `admin@helphive.org` / `kindred123`
- `ngo@helphive.org` / `kindred123`
- `volunteer@helphive.org` / `kindred123`
- `csr@helphive.org` / `kindred123`

Additional seeded volunteer:

- `buddy@helphive.org` / `kindred123`

## Deployment And Local Setup Notes

These notes matter for deployment and for running the stack locally:

- `frontend/main.js` hardcodes `API_URL` to a Cloud Run backend:
  `https://backend-service-321419338933.us-central1.run.app`
- That means the frontend will call the deployed backend unless `API_URL` is changed.
- If you want the UI to talk to your local backend, update `frontend/main.js` to point at your local server origin.
- The repo root does not contain a `package.json`; the active Node app lives under `backend/`.
- `backend/package.json` exists, but its `dev` script points to `scripts/dev-local.js`, while that script currently lives at the repo root. So the direct, reliable startup command is `node server.js` from inside `backend/`, or `docker compose up --build` from the repo root.
- The Docker setup builds from the repo root so the backend container can serve both `backend/` and `frontend/`.

## Hosting Notes

- `frontend/firebase.json` contains hosting rewrites for the alias pages.
- `frontend/public/index.html` is a Firebase hosting placeholder and is separate from the main product UI under `frontend/`.

## How The Frontend Works

`frontend/main.js` is the shared client controller for nearly all pages. It handles:

- session storage and JWT-based auth state
- role normalization and role-aware navigation
- page guards and redirects
- city switching for Pune, Mumbai, Delhi, and Bangalore
- task rendering and actions
- map rendering and refresh loops
- admin, intake, profile, and CSR dashboard interactions

## How The Backend Works

`backend/server.js` is the heart of the app. It:

- loads environment configuration
- connects to PostgreSQL with Sequelize
- creates and seeds the schema on startup
- serves the frontend files
- exposes all API endpoints
- runs OCR/transcription/extraction pipelines
- logs WhatsApp interactions
- generates CSR PDFs

## Summary

This project is a role-based civic operations platform that brings need intake, volunteer coordination, review workflows, and CSR reporting into one operating surface.
