# FinSec – Interactive Phishing Training Platform

FinSec is an interactive phishing simulation and just-in-time training platform built for FinTech environments. It enables administrators to simulate phishing attacks, measure employee behavior, and enforce contextual security training after risky actions.

---

## 📁 Project Structure
```

finsec/
├── server.js              # Backend entry point (Express)
├── prisma/                # Prisma schema + migrations
├── vite-project/          # React frontend (Vite)
├── package.json           # Backend dependencies
├── .env                   # Environment variables (DO NOT COMMIT)
└── README.md
```

---

## ⚙️ Requirements

- Node.js (v18+ recommended)
- npm
- Git
- SQLite (default) OR PostgreSQL

---

## 🚀 Installation & Setup

### Step 1 — Clone Repository

```bash
git clone https://github.com/YOUR_USERNAME/finsec.git
cd finsec
```

---

## 🔧 Backend Setup (Root Folder)

### Step 2 — Install Dependencies

```bash
npm install
```

### Step 3 — Create Environment File

Create a file named:

```
.env
```

Inside the root folder.

### Option A — SQLite (Recommended for Local Development)

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="dev_secret_change_me"
```

### Option B — PostgreSQL

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/finsec?schema=public"
JWT_SECRET="dev_secret_change_me"
```

---

### Step 4 — Generate Prisma Client

```bash
npx prisma generate
```

### Step 5 — Run Database Migration

```bash
npx prisma migrate dev
```

### Step 6 — Start Backend Server

```bash
node server.js
```

Backend runs on:

```
http://localhost:3000
```

---

## 💻 Frontend Setup

Open a *new terminal window*.

### Step 7 — Navigate to Frontend

```bash
cd vite-project
```

### Step 8 — Install Frontend Dependencies

```bash
npm install
```

### Step 9 — Start Frontend

```bash
npm run dev
```

Frontend runs on:

```
http://localhost:5173
```

---

## 🔐 Default Demo Accounts

*Admin*
```
Email: admin@fintechdemo.com
Password: Admin12345!
```

*Employee*
```
Email: user1@fintechdemo.com
Password: User12345!
```

---

## 🧠 System Flow

### Admin Capabilities

- Create employees
- Create phishing templates
- Create campaigns (Baseline / Post)
- Assign drills
- Monitor metrics (click rate, report rate, completion status)

### Employee Flow

1. Employee receives phishing drill.
2. Employee chooses one action:
   - Open Link
   - Report Phishing
   - Ignore
3. If employee clicks a suspicious link:
   - AI Coach training is triggered.
   - Quiz must score ≥ 2/3.
   - Training must be acknowledged.
   - Next drill unlocks only after completion.

---

## 🔄 What “Refresh Training” Does

When clicked, it calls:

```
GET /employee/training/pending
```

The backend checks if a TrainingCompletion record exists where:

```
acknowledgedAt = null
```

If such record exists:
- Training is still pending.
- Drills remain locked.

If no pending training exists:
- User can proceed to the next drill.

---

## 🗄 Database Tables

- *User*
- *Campaign*
- *PhishingTemplate*
- *Assignment*
- *TrainingModule*
- *TrainingCompletion*
- *Nudge*

---

## 🛠 Technology Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- ORM: Prisma
- Database: SQLite / PostgreSQL
- Authentication: JWT
- Password Security: bcrypt

---

## 📄 Research Paper

You can read the full MSc paper here:

[Download FinSec Research Paper](docs/FINSEC RESEARCH PAPER.pdf)

---

## 🎓 Academic Context

Developed as part of an MSc research project at:

*Arab Academy of Science, Technology & Maritime Transport (AASTMT)*  
Smart Village, Giza, Egypt  

*Authors*
- Abdulqudus Jimoh  
- Mohamed Ashraf  
- Mubarak Jimoh  

*Supervisor*
- Ahmed Maher
