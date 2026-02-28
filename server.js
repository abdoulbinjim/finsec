const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

/* -------------------- helpers -------------------- */
function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: "Missing token" });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: "Invalid token" });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== "ADMIN") return res.status(403).json({ ok: false, error: "Admin only" });
  next();
}

// Never leak passwordHash
function safeUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    department: u.department,
    role: u.role,
    workloadLevel: u.workloadLevel,
    createdAt: u.createdAt,
  };
}

/* -------------------- “Option A AI” nudge generator -------------------- */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function genNudge({ action, category, difficulty, fromEmail, landingUrl }) {
  const cat = String(category || "").toLowerCase();
  const diff = Number(difficulty || 1);

  const urgencyLines = [
    "Urgency is a classic trick. Slow down and verify via an internal channel.",
    "If it’s “urgent”, it’s exactly when you should double-check the sender and process.",
    "Pressure removes thinking. Take 20 seconds and confirm the request properly.",
  ];

  const urlLines = [
    "Check the full domain before clicking. Look for subtle misspellings.",
    "Hover links, read the domain, and confirm it matches the real company site.",
    "When in doubt: don’t click. Report it and verify separately.",
  ];

  const attachmentLines = [
    "Unexpected attachments are common malware carriers. Verify before opening.",
    "Zip files and random documents are risky. Confirm the sender via another channel.",
    "If you didn’t ask for it, don’t open it. Report first.",
  ];

  const genericLines = [
    "Pause. Verify the sender and follow the normal workflow.",
    "If something feels off, don’t proceed—report it.",
    "Treat unexpected requests as suspicious until verified.",
  ];

  let theme = genericLines;

  if (cat.includes("urg")) theme = urgencyLines;
  else if (cat.includes("url") || String(landingUrl || "").includes("http")) theme = urlLines;
  else if (cat.includes("attach")) theme = attachmentLines;

  const contextBits = [];
  if (fromEmail) contextBits.push(`Sender: ${fromEmail}`);
  if (landingUrl) contextBits.push(`Link: ${landingUrl}`);
  if (diff >= 3) contextBits.push("Difficulty: High");

  const context = contextBits.length ? ` (${contextBits.join(" • ")})` : "";

  const actionPrefix =
    action === "CLICKED"
      ? "You clicked the link."
      : action === "OPENED"
      ? "You opened the message."
      : action === "IGNORED"
      ? "You ignored the message."
      : action === "REPORTED"
      ? "Good call—reported."
      : "Action recorded.";

  return `${actionPrefix} ${pick(theme)}${context}`;
}

/* -------------------- AI Coach quiz generator -------------------- */
function cuidMini(prefix = "q") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function genQuiz({ template, moduleTopic }) {
  const subject = template?.subject || "this message";
  const from = template?.fromEmail || "the sender";
  const url = template?.landingUrl || "";
  const cat = String(template?.category || "").toLowerCase();

  // We store marking scheme in DB, but will sanitize before sending to frontend.
  // Passing rule: 2/3 minimum.
  const questions = [];

  // Q1 (always)
  questions.push({
    id: cuidMini("mcq"),
    type: "mcq",
    question: `FinSec AI: What is the safest first step before trusting "${subject}" from ${from}?`,
    options: [
      "Verify sender + check the full domain/process before acting",
      "Click the link quickly to see where it goes",
      "Reply immediately to show compliance",
      "Forward to a random coworker for opinion",
    ],
    correctIndex: 1,
  });

  // Q2 (URL-focused if link exists)
  if (url) {
    questions.push({
      id: cuidMini("mcq"),
      type: "mcq",
      question: `FinSec AI: When you see a link, what should you check?`,
      options: [
        "The full domain (and subtle misspellings) before clicking",
        "Only the page design after opening it",
        "The emoji count in the email",
        "Nothing—links are always safe if they look normal",
      ],
      correctIndex: 1
    });
  } else {
    questions.push({
      id: cuidMini("mcq"),
      type: "mcq",
      question: `FinSec AI: If there is no link but the email requests action, what should you do?`,
      options: [
        "Verify using a trusted channel (official portal / known contact) before acting",
        "Follow it immediately if it sounds urgent",
        "Share your password to prove it’s you",
        "Ignore forever even if unsure",
      ],
      correctIndex: 1
    });
  }

  // Q3 (short answer)
  const accept = [];
  if (moduleTopic?.toLowerCase().includes("url")) {
    accept.push("domain", "hover", "misspell", "verify", "confirm");
  } else if (cat.includes("urg")) {
    accept.push("verify", "policy", "confirm", "manager", "channel");
  } else {
    accept.push("verify", "report", "confirm", "trusted");
  }

  questions.push({
    id: cuidMini("short"),
    type: "short",
    question: `FinSec AI: In ONE sentence, what will you do next time before taking action?`,
    accept, // keyword-based grading
  });

  return questions;
}

function sanitizeQuestions(qs) {
  if (!Array.isArray(qs)) return [];
  return qs.map((q) => {
    const safe = {
      id: q.id,
      type: q.type,
      question: q.question,
    };
    if (q.type === "mcq") safe.options = Array.isArray(q.options) ? q.options : [];
    return safe;
  });
}

function gradeQuiz(storedQuestions, userAnswers) {
  const qs = Array.isArray(storedQuestions) ? storedQuestions : [];
  const answers = Array.isArray(userAnswers) ? userAnswers : [];
  const map = new Map(answers.map((a) => [a.id, a]));

  let score = 0;
  let total = qs.length;

  for (const q of qs) {
    const a = map.get(q.id);

    if (q.type === "mcq") {
      if (!a || typeof a.answerIndex !== "number") continue;
      if (a.answerIndex === q.correctIndex) score += 1;
      continue;
    }

    if (q.type === "short") {
      const text = String(a?.text || "").toLowerCase();
      const accept = Array.isArray(q.accept) ? q.accept : [];
      const hit = accept.some((kw) => text.includes(String(kw).toLowerCase()));
      if (hit && text.trim().length >= 6) score += 1;
      continue;
    }
  }

  const passMark = Math.ceil((2 / 3) * total); // 2/3
  const passed = score >= passMark;

  return { score, total, passed };
}

function sanitizePendingTraining(pending) {
  if (!pending) return null;

  const out = { ...pending };

  // Prisma returns objects; we can safely replace jitQuestions
  if (out.jitQuestions) out.jitQuestions = sanitizeQuestions(out.jitQuestions);
  return out;
}

/* -------------------- health -------------------- */
app.get("/health", (req, res) => {
  res.json({ ok: true, message: "Backend is running (production MVP)" });
});

// PUBLIC redirect (no auth) so opening in new tab works
app.get("/r/:assignmentId", async (req, res) => {
  try {
    const { assignmentId } = req.params;

    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { template: true },
    });

    if (!assignment || !assignment.template) {
      return res.status(404).send("Not found");
    }

    const url = assignment.template.landingUrl || "https://example.com";

    // Optional: mark as clicked / log event
    // await prisma.assignment.update({ where: { id: assignmentId }, data: { clicked: true } });

    return res.redirect(url);
  } catch (e) {
    console.error("GET /r/:assignmentId error:", e);
    return res.status(500).send("Server error");
  }
});


/* -------------------- AUTH -------------------- */

// ✅ NEW: return the current logged-in user profile
app.get("/auth/me", authRequired, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });
    res.json({ ok: true, user: safeUser(user) });
  } catch (e) {
    console.error("GET /auth/me error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.post("/auth/admin/register", async (req, res) => {
  try {
    const { email, name, department, password } = req.body || {};
    if (!email || !name || !department || !password)
      return res.status(400).json({ ok: false, error: "Missing fields" });

    const existingAdmin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    if (existingAdmin) return res.status(400).json({ ok: false, error: "Admin already exists" });

    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        department,
        role: "ADMIN",
        passwordHash,
      },
    });

    const token = signToken(admin);
    res.json({ ok: true, token, user: safeUser(admin) });
  } catch (e) {
    console.error("POST /auth/admin/register error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ ok: false, error: "Missing email/password" });

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return res.status(401).json({ ok: false, error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ ok: false, error: "Invalid credentials" });

    const token = signToken(user);
    res.json({
      ok: true,
      token,
      user: safeUser(user),
    });
  } catch (e) {
    console.error("POST /auth/login error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

/* -------------------- ADMIN: users -------------------- */
app.post("/admin/users", authRequired, adminOnly, async (req, res) => {
  try {
    const { email, name, department, workloadLevel, password } = req.body || {};
    if (!email || !name || !department || !password)
      return res.status(400).json({ ok: false, error: "Missing fields" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        department,
        workloadLevel: workloadLevel || "MEDIUM",
        role: "EMPLOYEE",
        passwordHash,
      },
    });

    res.json({ ok: true, user: safeUser(user) });
  } catch (e) {
    if (String(e).includes("Unique constraint"))
      return res.status(400).json({ ok: false, error: "Email already exists" });
    console.error("POST /admin/users error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.get("/admin/users", authRequired, adminOnly, async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, department: true, role: true, workloadLevel: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ ok: true, users });
});

/* -------------------- ADMIN: templates -------------------- */
app.post("/admin/templates", authRequired, adminOnly, async (req, res) => {
  try {
    const { category, difficulty, subject, fromEmail, body, landingUrl } = req.body || {};
    if (!category || !subject || !fromEmail || !body)
      return res.status(400).json({ ok: false, error: "Missing fields" });

    const tpl = await prisma.phishingTemplate.create({
      data: {
        category,
        difficulty: difficulty || 1,
        subject,
        fromEmail,
        body,
        landingUrl: landingUrl || null,
      },
    });

    res.json({ ok: true, template: tpl });
  } catch (e) {
    console.error("POST /admin/templates error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.get("/admin/templates", authRequired, adminOnly, async (req, res) => {
  const templates = await prisma.phishingTemplate.findMany({ orderBy: { createdAt: "desc" } });
  res.json({ ok: true, templates });
});

/* -------------------- ADMIN: training modules -------------------- */
app.post("/admin/training-modules", authRequired, adminOnly, async (req, res) => {
  try {
    const { topic, durationSeconds, content } = req.body || {};
    if (!topic || !content) return res.status(400).json({ ok: false, error: "topic and content are required" });

    const mod = await prisma.trainingModule.create({
      data: {
        topic,
        durationSeconds: durationSeconds || 20,
        content,
      },
    });

    res.json({ ok: true, module: mod });
  } catch (e) {
    console.error("POST /admin/training-modules error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.get("/admin/training-modules", authRequired, adminOnly, async (req, res) => {
  const modules = await prisma.trainingModule.findMany({ orderBy: { createdAt: "desc" } });
  res.json({ ok: true, modules });
});

/* -------------------- ADMIN: campaigns -------------------- */
app.post("/admin/campaigns", authRequired, adminOnly, async (req, res) => {
  try {
    const { name, frequencyDays, targetDepartment, status } = req.body || {};
    if (!name) return res.status(400).json({ ok: false, error: "Missing name" });

    const campaign = await prisma.campaign.create({
      data: {
        name,
        frequencyDays: frequencyDays || 30,
        targetDepartment: targetDepartment || null,
        status: status || "INACTIVE",
        createdById: req.user.sub,
      },
    });

    res.json({ ok: true, campaign });
  } catch (e) {
    console.error("POST /admin/campaigns error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.get("/admin/campaigns", authRequired, adminOnly, async (req, res) => {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { email: true, name: true } } },
  });
  res.json({ ok: true, campaigns });
});

/* -------------------- ADMIN: create assignment -------------------- */
app.post("/admin/assignments", authRequired, adminOnly, async (req, res) => {
  try {
    const { campaignId, userId, templateId, phase } = req.body || {};
    if (!campaignId || !userId || !templateId) {
      return res.status(400).json({ ok: false, error: "campaignId, userId, templateId required" });
    }

    const assignment = await prisma.assignment.create({
      data: {
        campaignId,
        userId,
        templateId,
        phase: phase || "baseline",
        sentAt: new Date(),
      },
      include: { template: true },
    });

    res.json({ ok: true, assignment });
  } catch (e) {
    console.error("POST /admin/assignments error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

/* -------------------- EMPLOYEE: next assignment -------------------- */
app.get("/employee/assignments/next", authRequired, async (req, res) => {
  try {
    const userId = req.user.sub;

    // Gate: if there is pending training -> block next drill
    const pendingTraining = await prisma.trainingCompletion.findFirst({
      where: { userId, assignmentId: { not: null }, acknowledgedAt: null },
      orderBy: { completedAt: "desc" },
      include: { module: true, assignment: { include: { template: true } } },
    });

    if (pendingTraining) {
      return res.json({
        ok: true,
        assignment: null,
        blockedByTraining: true,
        pendingTraining: sanitizePendingTraining(pendingTraining),
      });
    }

    const assignment = await prisma.assignment.findFirst({
      where: { userId, completedAt: null },
      orderBy: { createdAt: "asc" },
      include: { template: true },
    });

    if (!assignment) return res.json({ ok: true, assignment: null });

    res.json({ ok: true, assignment });
  } catch (e) {
    console.error("GET /employee/assignments/next error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

/* -------------------- EMPLOYEE: action on assignment -------------------- */
app.post("/employee/assignments/:id/action", authRequired, async (req, res) => {
  try {
    const userId = req.user.sub;
    const id = req.params.id;
    const { action } = req.body || {};
    if (!action) return res.status(400).json({ ok: false, error: "Missing action" });

    const assignment = await prisma.assignment.findUnique({
      where: { id },
      include: { template: true },
    });

    if (!assignment || assignment.userId !== userId) {
      return res.status(404).json({ ok: false, error: "Assignment not found" });
    }

    let scoreImpact = 0;
    if (action === "CLICKED") scoreImpact = +5;
    if (action === "OPENED") scoreImpact = +2;
    if (action === "IGNORED") scoreImpact = +1;
    if (action === "REPORTED") scoreImpact = -3;

    const updated = await prisma.assignment.update({
      where: { id },
      data: { action, completedAt: new Date(), scoreImpact },
    });

    let jitTrainingSuggestion = null;

    // If clicked: create a pending trainingCompletion (acknowledgedAt = null) + attach AI Coach quiz
    if (action === "CLICKED") {
      const module = await prisma.trainingModule.findFirst({
        where: { topic: "URL Checking" },
        orderBy: { createdAt: "desc" },
      });

      if (module) {
        // Generate AI Coach quiz (with marking scheme)
        const quiz = genQuiz({ template: assignment.template, moduleTopic: module.topic });

        const completion = await prisma.trainingCompletion.create({
          data: {
            userId,
            moduleId: module.id,
            assignmentId: id,
            acknowledgedAt: null,

            // store the quiz in DB
            jitQuestions: quiz,
            jitAnswers: null,
            quizPassedAt: null,
          },
          include: { module: true },
        });

        // AI-like nudge message
        const nudgeMessage = genNudge({
          action,
          category: assignment.template?.category,
          difficulty: assignment.template?.difficulty,
          fromEmail: assignment.template?.fromEmail,
          landingUrl: assignment.template?.landingUrl,
        });

        await prisma.nudge.create({
          data: {
            userId,
            channel: "IN_APP",
            message: nudgeMessage,
            reason: "Clicked phishing link",
          },
        });

        jitTrainingSuggestion = {
          completionId: completion.id,
          moduleId: module.id,
          topic: module.topic,
          message: module.content,
          durationSeconds: module.durationSeconds,
          aiNudge: nudgeMessage,

          // return sanitized quiz for UI
          quiz: sanitizeQuestions(quiz),
        };
      }
    }

    res.json({ ok: true, assignment: updated, jitTrainingSuggestion });
  } catch (e) {
    console.error("POST /employee/assignments/:id/action error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

/* -------------------- EMPLOYEE: training gate -------------------- */
app.get("/employee/training/pending", authRequired, async (req, res) => {
  try {
    const userId = req.user.sub;

    const pending = await prisma.trainingCompletion.findFirst({
      where: { userId, assignmentId: { not: null }, acknowledgedAt: null },
      orderBy: { completedAt: "desc" },
      include: { module: true, assignment: { include: { template: true } } },
    });

    res.json({ ok: true, pending: sanitizePendingTraining(pending) });
  } catch (e) {
    console.error("GET /employee/training/pending error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

/* -------------------- EMPLOYEE: AI Coach quiz answer -------------------- */
app.post("/employee/training/answer", authRequired, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { completionId, answers } = req.body || {};
    if (!completionId) return res.status(400).json({ ok: false, error: "completionId is required" });

    const tc = await prisma.trainingCompletion.findUnique({
      where: { id: completionId },
      include: { module: true, assignment: { include: { template: true } } },
    });

    if (!tc || tc.userId !== userId) return res.status(404).json({ ok: false, error: "Training not found" });

    const storedQuestions = tc.jitQuestions;
    if (!Array.isArray(storedQuestions) || storedQuestions.length === 0) {
      return res.status(400).json({ ok: false, error: "No AI Coach quiz found for this training" });
    }

    const result = gradeQuiz(storedQuestions, Array.isArray(answers) ? answers : []);
    const now = new Date();

    const updated = await prisma.trainingCompletion.update({
      where: { id: completionId },
      data: {
        jitAnswers: {
          answers: Array.isArray(answers) ? answers : [],
          result,
          submittedAt: now.toISOString(),
        },
        quizPassedAt: result.passed ? now : null,
      },
      include: { module: true },
    });

    res.json({
      ok: true,
      result,
      completion: {
        id: updated.id,
        quizPassedAt: updated.quizPassedAt,
        acknowledgedAt: updated.acknowledgedAt,
      },
    });
  } catch (e) {
    console.error("POST /employee/training/answer error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.post("/employee/training/acknowledge", authRequired, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { completionId } = req.body || {};
    if (!completionId) return res.status(400).json({ ok: false, error: "completionId is required" });

    const found = await prisma.trainingCompletion.findUnique({ where: { id: completionId } });
    if (!found || found.userId !== userId) return res.status(404).json({ ok: false, error: "Training not found" });

    const hasQuiz = Array.isArray(found.jitQuestions) && found.jitQuestions.length > 0;
    if (hasQuiz && !found.quizPassedAt) {
      await prisma.trainingCompletion.update({
        where: { id: completionId },
        data: {
          quizPassedAt: new Date(),
    },
  });
}

    const updated = await prisma.trainingCompletion.update({
      where: { id: completionId },
      data: { acknowledgedAt: new Date() },
      include: { module: true },
    });

    res.json({ ok: true, completion: updated });
  } catch (e) {
    console.error("POST /employee/training/acknowledge error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

/* -------------------- ADMIN: metrics -------------------- */
app.get("/admin/metrics/overview", authRequired, adminOnly, async (req, res) => {
  const totalAssignments = await prisma.assignment.count();
  const clicked = await prisma.assignment.count({ where: { action: "CLICKED" } });
  const reported = await prisma.assignment.count({ where: { action: "REPORTED" } });

  res.json({
    ok: true,
    totalAssignments,
    clickRate: totalAssignments ? clicked / totalAssignments : 0,
    reportRate: totalAssignments ? reported / totalAssignments : 0,
  });
});

app.get("/admin/metrics/by-phase", authRequired, adminOnly, async (req, res) => {
  try {
    const phases = ["baseline", "post"];
    const results = {};

    for (const phase of phases) {
      const total = await prisma.assignment.count({ where: { phase } });
      const clicked = await prisma.assignment.count({ where: { phase, action: "CLICKED" } });
      const reported = await prisma.assignment.count({ where: { phase, action: "REPORTED" } });
      const ignored = await prisma.assignment.count({ where: { phase, action: "IGNORED" } });
      const opened = await prisma.assignment.count({ where: { phase, action: "OPENED" } });

      results[phase] = {
        total,
        clicked,
        reported,
        ignored,
        opened,
        clickRate: total ? clicked / total : 0,
        reportRate: total ? reported / total : 0,
      };
    }

    const trainingTriggered = await prisma.trainingCompletion.count({
      where: { assignmentId: { not: null } },
    });

    const pendingTrainingCount = await prisma.trainingCompletion.count({
      where: { assignmentId: { not: null }, acknowledgedAt: null },
    });

    res.json({ ok: true, results, trainingTriggered, pendingTrainingCount });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

/* -------------------- start -------------------- */
app.listen(PORT, async() => {
  console.log(`Backend listening on http://localhost:${PORT}`);
  await seedIfEmpty();
});

/* -------------------- DEV AUTO-SEED (SAFE) -------------------- */
async function seedIfEmpty() {
  const campaignCount = await prisma.campaign.count();
  const templateCount = await prisma.phishingTemplate.count();

  if (campaignCount === 0) {
    await prisma.campaign.create({
      data: {
        name: "Baseline Phishing Simulation",
        frequencyDays: 30,
        status: "ACTIVE",
        createdById: (await prisma.user.findFirst({ where: { role: "ADMIN" } }))?.id,
      },
    });
    console.log("✅ Seeded default campaign");
  }

  if (templateCount === 0) {
    await prisma.phishingTemplate.create({
      data: {
        category: "URL",
        difficulty: 2,
        subject: "Password Expiry Notice",
        fromEmail: "it-support@fintechdemo.com",
        body: "Your password expires today. Please click the link below to reset immediately.",
        landingUrl: "https://secure-fintechdemo-login.com",
      },
    });
    console.log("✅ Seeded default phishing template");
  }
}

