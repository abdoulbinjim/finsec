# FinSec – Interactive Phishing Training Platform

FinSec is an interactive phishing simulation and just-in-time training platform built for FinTech environments.

================================================================================
PROJECT STRUCTURE
================================================================================

finsec/
│
├── server.js              # Backend entry point
├── prisma/                # Prisma schema + migrations
├── vite-project/          # React frontend (Vite)
├── package.json           # Backend dependencies
├── .env                   # Environment variables (DO NOT COMMIT)
└── README.md

================================================================================
REQUIREMENTS
================================================================================

- Node.js (v18+ recommended)
- npm
- Git
- SQLite (default) OR PostgreSQL

================================================================================
INSTALLATION & SETUP
================================================================================

STEP 1 — Clone Repository

git clone https://github.com/YOUR_USERNAME/finsec.git
cd finsec


================================================================================
BACKEND SETUP (ROOT FOLDER)
================================================================================

STEP 2 — Install Dependencies

npm install


STEP 3 — Create Environment File

Create a file named:

.env

Inside the root folder.

OPTION A — SQLite (Recommended for Local)

DATABASE_URL="file:./dev.db"
JWT_SECRET="dev_secret_change_me"


OPTION B — PostgreSQL

DATABASE_URL="postgresql://postgres:password@localhost:5432/finsec?schema=public"
JWT_SECRET="dev_secret_change_me"


STEP 4 — Generate Prisma Client

npx prisma generate


STEP 5 — Run Database Migration

npx prisma migrate dev


STEP 6 — Start Backend Server

node server.js

Backend runs on:

http://localhost:3000


================================================================================
FRONTEND SETUP
================================================================================

Open a NEW terminal.

STEP 7 — Navigate to Frontend

cd vite-project


STEP 8 — Install Frontend Dependencies

npm install


STEP 9 — Start Frontend

npm run dev

Frontend runs on:

http://localhost:5173


================================================================================
DEFAULT DEMO ACCOUNTS
================================================================================

Admin:
admin@fintechdemo.com
Admin12345!

Employee:
user1@fintechdemo.com
User12345!


================================================================================
SYSTEM FLOW
================================================================================

ADMIN:
- Create employees
- Create phishing templates
- Create campaigns (Baseline / Post)
- Assign drills
- View metrics

EMPLOYEE:
- Receives phishing drill
- Chooses:
    Open Link
    Report Phishing
    Ignore
- If CLICKED:
    → AI Coach training is triggered
    → Quiz must score ≥ 2/3
    → Training must be acknowledged
    → Next drill unlocks

================================================================================
WHAT "REFRESH TRAINING" DOES
================================================================================

Calls:
GET /employee/training/pending

Checks database for:
TrainingCompletion record where acknowledgedAt = null

If exists:
- Training still pending
- Drills remain blocked

If not:
- User can proceed to next drill

================================================================================
DATABASE TABLES
================================================================================

User
Campaign
PhishingTemplate
Assignment
TrainingModule
TrainingCompletion
Nudge

================================================================================
TECH STACK
================================================================================

Frontend: React + Vite
Backend: Node.js + Express
ORM: Prisma
Database: SQLite / PostgreSQL
Auth: JWT
Password Security: bcrypt

================================================================================
ACADEMIC CONTEXT
================================================================================

Arab Academy of Science, Technology & Maritime Transport (AASTMT)
Smart Village, Giza, Egypt

Authors:
Abdulqudus Jimoh
Mohamed Ashraf
Mubarak Jimoh

Supervisor:
Ahmed Maher
