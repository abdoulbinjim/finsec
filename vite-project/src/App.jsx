import { useEffect, useMemo, useRef, useState } from "react";

function saveSession({ token, user }) {
  localStorage.setItem("token", token);
  localStorage.setItem("role", user?.role || "");
  localStorage.setItem("me", JSON.stringify(user || {}));
}
function getMe() {
  try {
    return JSON.parse(localStorage.getItem("me") || "{}");
  } catch {
    return {};
  }
}

/* ------------------ unique profile helpers (ANY user) ------------------ */
function roleLabel(meOrRole) {
  const r = typeof meOrRole === "string" ? meOrRole : meOrRole?.role;
  return String(r || "USER").toUpperCase();
}

function avatarSeed(me) {
  const s = `${me?.email || ""}|${me?.name || ""}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(16).slice(0, 6).toUpperCase();
}

function shortId(me) {
  if (me?.id) return String(me.id).slice(0, 6).toUpperCase();
  return avatarSeed(me);
}

function profileBadge(me, fallbackRole) {
  return `${roleLabel(me?.role || fallbackRole)} • ${me?.name || "Unknown"} • ${me?.department || "-"}`;
}



/* ------------------ auth helpers ------------------ */
function saveToken(token, role) {
  localStorage.setItem("token", token);
  localStorage.setItem("role", role);
}
function getToken() {
  return localStorage.getItem("token") || "";
}
function getRole() {
  return localStorage.getItem("role") || "";
}
function clearAuth() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("me");
}

/* ------------------ api helper ------------------ */
async function api(path, { method = "GET", body, token } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { ok: false, error: "Bad JSON response", raw: text };
  }

  if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}`, data };
  return data;
}

/* ------------------ tiny UI helpers ------------------ */
function Spinner() {
  return <span className="spinner" />;
}

function Toast({ kind = "warn", title = "System", message = "" }) {
  const dot = kind === "good" ? "good" : kind === "bad" ? "bad" : "warn";
  return (
    <div className={`toast ${kind}`}>
      <div className={`dot ${dot}`} />
      <div>
        <b>{title}</b>
        <p>{message}</p>
      </div>
    </div>
  );
}

/* ------------------ “AI-ish” nudge generator (frontend-only) ------------------ */
function generateCoachNudge({ action, template, phase }) {
  const subj = template?.subject || "this email";
  const from = template?.fromEmail || "the sender";
  const url = template?.landingUrl || "";

  const base = {
    CLICKED: `You clicked a suspicious link. Next time, slow down and verify the full domain before taking action.`,
    REPORTED: `Great call reporting it. Reporting early reduces risk and helps your team respond faster.`,
    IGNORED: `Ignoring can be safe, but reporting is better when you suspect phishing. If unsure, report.`,
    OPENED: `Opening/engaging increases risk. If the message feels urgent or unusual, verify through a trusted channel.`,
  }[action] || `Good job. Stay alert and verify before acting.`;

  const phaseLine = phase ? `(${phase} phase)` : "";
  const urlLine = url ? `Also: the link domain matters — inspect: ${url}` : "";

  return `${phaseLine}: About "${subj}" from ${from}. ${base} ${urlLine}`.trim();
}

/* ------------------ AI Coach Quiz ------------------ */
function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
function inferCompanyFromEmail(fromEmail) {
  const domain = String(fromEmail || "").split("@")[1] || "";
  const core = domain.split(".")[0] || "";
  return core ? core.toLowerCase() : "your company";
}
function makeAiQuizFromTemplate(template) {
  const subj = template?.subject || "this message";
  const from = template?.fromEmail || "unknown@sender.com";
  const url = template?.landingUrl || "https://example.com/login";
  const host = safeHost(url) || "unknown-domain.com";
  const company = inferCompanyFromEmail(from);

  // 3 questions. Pass = >= 2 correct.
  return [
    {
      id: "q1",
      type: "mcq",
      question: `AI Bot: Before clicking, what is the FIRST thing you should verify about the link in "${subj}"?`,
      options: [
        "That the email uses bold text",
        "The full domain/hostname matches the real organization domain",
        "That the message has emojis",
        "That the email was sent during work hours",
      ],
      correctIndex: 1,
      explain: `Correct: always verify the full domain (hostname). In this drill the link is: ${host}`,
    },
    {
      id: "q2",
      type: "mcq",
      question: `AI Bot: The sender is "${from}". The link is "${host}". What is the safest next action?`,
      options: [
        "Click quickly so you don't miss the deadline",
        "Reply to the email asking for password confirmation",
        "Report it (or verify via a trusted channel) before taking any action",
        "Forward it to friends to confirm if it’s real",
      ],
      correctIndex: 2,
      explain: "Correct: report/verify via trusted channel. Do not interact with the link.",
    },
    {
      id: "q3",
      type: "short",
      question: `AI Bot: In one line, name ONE step you would do to verify a suspicious message like this (mention domain, internal portal, or calling the real org).`,
      minLen: 6,
      // simple validator (not strict AI): contains at least one keyword
      keywords: ["domain", "hostname", "url", "portal", "call", "verify", "it", "security", "helpdesk", "report"],
      explain: `Example: "Hover the link and check the domain, then report to IT/security."`,
    },
  ];
}

function gradeAiQuiz(quizQuestions = [], quizAnswers = {}) {
  let score = 0;
  const details = [];

  for (const q of (quizQuestions || [])) {
    if (!q?.id) continue;

    // ===== MCQ =====
    if (q.type === "mcq") {
      const picked = Number(quizAnswers?.[q.id]?.answerIndex);

      // accept both correctIndex and correctAnswerIndex
      const correctRaw =
        q.correctIndex ?? q.correctAnswerIndex ?? q.correct ?? null;

      const correct = Number(correctRaw);

      // handle 0-based OR 1-based correctIndex safely
      const ok =
      Number.isFinite(picked) &&
      Number.isFinite(correct) &&
      picked === correct;


      details.push({ id: q.id, ok, type: "mcq" });
      if (ok) score++;
      continue;
    }

    // ===== SHORT =====
    if (q.type === "short") {
      const text = String(quizAnswers?.[q.id]?.text || "")
        .trim()
        .toLowerCase();

      const minLen = Number(q.minLen ?? 6);

      // accept keywords OR accept[]
      const words = (q.keywords || q.accept || [])
        .map((k) => String(k).toLowerCase())
        .filter(Boolean);

      const okLen = text.length >= minLen;
      const okKey = words.length === 0 ? true : words.some((k) => text.includes(k));
      const ok = okLen && okKey;

      details.push({ id: q.id, ok, type: "short" });
      if (ok) score++;
      continue;
    }

    // unknown type
    details.push({ id: q.id, ok: false, type: q.type });
  }

  const total = quizQuestions.length;
  const passed = total > 0 && score === total;
  return { score, total, passed, details };
}



/* ------------------ root app ------------------ */
export default function App() {
  const [route, setRoute] = useState("login"); // login | employee | admin
  const [token, setToken] = useState(getToken());
  const [role, setRole] = useState(getRole());
  const [me, setMe] = useState(getMe());


  useEffect(() => {
    const r = getRole();
    const t = getToken();
    if (t && r) setRoute(r === "ADMIN" ? "admin" : "employee");
  }, []);

  function logout() {
    clearAuth();
    setToken("");
    setRole("");
    setRoute("login");
  }

  return (
  <div className="container appShell">
    <Topbar setRoute={setRoute} token={token} role={role} me={me} logout={logout} />

    <div className="page">
      <div className="grid">
        {route === "login" && (
          <Login
            onLoggedIn={({ token, user }) => {
              saveSession({ token, user });
              setToken(token);
              setRole(user?.role || "");
              setMe(user || {});
              setRoute(user?.role === "ADMIN" ? "admin" : "employee");
            }}
          />
        )}

        {route === "employee" && <Employee token={token} me={me} />}
        {route === "admin" && <Admin token={token} />}
      </div>
    </div>
  </div>
);

}

function Topbar({ setRoute, token, role, me, logout }) {
  return (
    <div className="topbar">
      <div className="brand">
        <h1>FinSec 1.0</h1>
        <div className="sub">Built by Abdulqudus Jimoh • Mohamed Ashraf • Mubarak Jimoh</div>
        <div className="sub" style={{ opacity: 0.85 }}>
          AASTMT
        </div>
      </div>

      {token ? (
        <>
        <span
  className="pill"
  style={{
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 4,
    minWidth: 260,
  }}
>
  {/* Primary identity */}
  <div>
    <b>{roleLabel(me?.role || role)}</b> •{" "}
    {me?.name || "Unknown"} •{" "}
    <span className="kbd">{me?.department || "-"}</span>
  </div>

  {/* Secondary metadata */}
  <div className="small" style={{ opacity: 0.75 }}>
    ID: <span className="kbd">{shortId(me)}</span>{" "}
    • Seed: <span className="kbd">{avatarSeed(me)}</span>
  </div>
</span>



          <button
            className="btn"
            onClick={() => setRoute("employee")}
            disabled={role !== "EMPLOYEE"}
            style={{ opacity: role !== "EMPLOYEE" ? 0.45 : 1 }}
            title={role !== "EMPLOYEE" ? "Login as EMPLOYEE to access" : ""}
          >
            Employee
          </button>

          <button
            className="btn"
            onClick={() => setRoute("admin")}
            disabled={role !== "ADMIN"}
            style={{ opacity: role !== "ADMIN" ? 0.45 : 1 }}
            title={role !== "ADMIN" ? "Login as ADMIN to access" : ""}
          >
            Admin
          </button>

          <button className="btn btnDanger" onClick={logout}>
            Logout
          </button>
        </>
      ) : (
        <span className="pill">Login to begin</span>
      )}
    </div>
  );
}

/* ------------------ login ------------------ */
function Login({ onLoggedIn }) {
  const [email, setEmail] = useState("user1@fintechdemo.com");
  const [password, setPassword] = useState("User12345!");
  const [status, setStatus] = useState({ kind: "warn", text: "Enter your credentials to access our FinSec 1.0." });
  const [loading, setLoading] = useState(false);

  async function login() {
    setLoading(true);
    setStatus({ kind: "warn", text: "Signing you in..." });

    const data = await api("/auth/login", { method: "POST", body: { email, password } });

    if (!data.ok) {
      setStatus({ kind: "bad", text: data.error || "Login failed" });
      setLoading(false);
      return;
    }

    const userRole = data.user?.role || "EMPLOYEE";
    setStatus({ kind: "good", text: "Logged in" });
    onLoggedIn({ token: data.token, user: data.user });
    setLoading(false);
  }

  return (
    <div className="card">
      <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Welcome to FinSec 1.0</div>
        <div className="small" style={{ opacity: 0.9 }}>
          Phishing simulation + just-in-time coaching + baseline vs post evaluation.
        </div>
      </div>

      <div className="cardHint">
        Demo accounts: <span className="kbd">admin@fintechdemo.com / Admin12345!</span> and{" "}
        <span className="kbd">user1@fintechdemo.com / User12345!</span>
      </div>

      <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
        <div className="field">
          <label>Email</label>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className="field">
          <label>Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        <button className="btn btnPrimary btnInline glow" onClick={login} disabled={loading}>
          {loading ? <Spinner /> : null}
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <Toast kind={status.kind} title="AJ, Ashraf & Mubarak are saying:" message={status.text} />
      </div>
    </div>
  );
}

/* ------------------ employee ------------------ */
function Employee({ token, me }) {
  const [assignment, setAssignment] = useState(null);

  // JIT suggestion returned immediately after risky action
  const [jit, setJit] = useState(null);

  // Backend-enforced training gate: /employee/training/pending -> { pending }
  const [pendingTraining, setPendingTraining] = useState(null);

  // Backend may explicitly block next drill: { blockedByTraining: true }
  const [blockedByTraining, setBlockedByTraining] = useState(false);

  // AI Coach Quiz state (frontend-only grading)
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizResult, setQuizResult] = useState(null);
  const [quizBusy, setQuizBusy] = useState(false);

  // local questions used when backend does not provide jitQuestions
  const [localQuiz, setLocalQuiz] = useState([]);

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState({ kind: "warn", text: "Ready. Load next drill." });

  const gateRef = useRef(null);
  const inflightRef = useRef(false);

  const emailBox = useMemo(() => assignment?.template || null, [assignment]);
  const decisionLocked = !!assignment?.action;

  // Use backend quiz if it exists, else local quiz (generated)
  const quizQuestions = localQuiz;


  const quizPassed =
    !!pendingTraining?.quizPassedAt ||
    !!pendingTraining?.jitAnswers?.passed ||
    !!quizResult?.passed;

  function resetQuizUI() {
    setQuizAnswers({});
    setQuizResult(null);
    setQuizBusy(false);
  }

  function ensureLocalQuiz() {
    // Only generate if empty
    if (localQuiz?.length) return;
    const q = makeAiQuizFromTemplate(emailBox || {});
    setLocalQuiz(q);
  }

  async function refreshPendingTraining({ silent = false } = {}) {
    if (!token) {
      if (!silent) setToast({ kind: "bad", text: "You are not logged in. Logout and login again." });
      return;
    }

    const t = await api("/employee/training/pending", { token });
    if (!t.ok) {
      if (!silent) setToast({ kind: "bad", text: t.error });
      return;
    }

    setPendingTraining(t.pending || null);
    setBlockedByTraining(!!t.pending);

    if (t.pending) {
      // clean UI when new pending training appears
      setQuizResult(null);
      setQuizAnswers({});
      ensureLocalQuiz();
      // jump user to gate so they don't get confused
      setTimeout(() => {
        gateRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  }

  async function loadNext({ force = false } = {}) {
    if (!token) {
      setToast({ kind: "bad", text: "Missing token. Please logout and login again." });
      return;
    }
    if (inflightRef.current && !force) return;

    inflightRef.current = true;
    setBusy(true);
    setToast({ kind: "warn", text: "Loading your next drill..." });

    const data = await api("/employee/assignments/next", { token });

    if (!data.ok) {
      setToast({ kind: "bad", text: data.error });
      setBusy(false);
      inflightRef.current = false;
      return;
    }

    if (data.blockedByTraining) {
      // block drill until training done
      setAssignment(null);
      setJit(null);
      setBlockedByTraining(true);
      resetQuizUI();
      setLocalQuiz([]); // regenerate per-drill based on template, once we have it again

      await refreshPendingTraining();
      setToast({ kind: "warn", text: "AI Coach required. Complete the questions and acknowledge to unlock drills." });

      setBusy(false);
      inflightRef.current = false;
      return;
    }

    // unlocked state
    setBlockedByTraining(false);
    setPendingTraining(null);
    setJit(null);
    resetQuizUI();
    setLocalQuiz([]);
    setAssignment(data.assignment || null);

    if (data.assignment) {
      setToast({ kind: "good", text: "Drill loaded. Make one decision." });
    } else {
      setToast({ kind: "warn", text: "No pending drill." });
    }

    setBusy(false);
    inflightRef.current = false;
  }

  async function submitAction(action) {
    if (!token) {
      setToast({ kind: "bad", text: "Missing token. Please logout and login again." });
      return;
    }
    if (!assignment?.id) return;

    setBusy(true);
    setToast({ kind: "warn", text: `Submitting: ${action}...` });

    const data = await api(`/employee/assignments/${assignment.id}/action`, {
      method: "POST",
      token,
      body: { action },
    });

    if (!data.ok) {
      setToast({ kind: "bad", text: data.error });
      setBusy(false);
      return;
    }

    setAssignment(data.assignment || null);
    setJit(data.jitTrainingSuggestion || null);

    // If user CLICKED, backend will usually create pending training (gate)
    if (action === "CLICKED") {
      resetQuizUI();
      setLocalQuiz([]); // regenerate based on this drill’s template
      ensureLocalQuiz();
      await refreshPendingTraining();
      setBlockedByTraining(true);

      setToast({
        kind: "warn",
        text: "CLICKED detected → FinSec AI locked the system. Answer the questions, submit, then acknowledge.",
      });

      setBusy(false);
      return;
    }

    // Other actions: just show AI coach nudge
    setBlockedByTraining(false);
    setPendingTraining(null);
    const coach = generateCoachNudge({ action, template: emailBox, phase: assignment?.phase });
    setToast({ kind: "good", text: `Recorded. ${coach}` });

    setBusy(false);
  }

  function setMcq(qId, answerIndex) {
    setQuizAnswers((prev) => ({ ...prev, [qId]: { ...(prev[qId] || {}), answerIndex } }));
  }
  function setShort(qId, text) {
    setQuizAnswers((prev) => ({ ...prev, [qId]: { ...(prev[qId] || {}), text } }));
  }

  function isQuizComplete() {
    if (!Array.isArray(quizQuestions) || quizQuestions.length === 0) return true;
    return quizQuestions.every((q) => {
      const a = quizAnswers[q.id];
      if (!a) return false;
      if (q.type === "mcq") return typeof a.answerIndex === "number";
      if (q.type === "short") return String(a.text || "").trim().length >= (q.minLen ?? 6);
      return true;
    });
  }

  async function submitQuiz() {
    if (!token) {
      setToast({ kind: "bad", text: "Missing token. Please logout and login again." });
      return;
    }

    // If backend didn’t return pendingTraining yet, still allow quiz but tell them to Refresh
    if (!blockedByTraining) {
      setToast({ kind: "warn", text: "No training gate is active right now." });
      return;
    }

    if (!Array.isArray(quizQuestions) || quizQuestions.length === 0) {
      ensureLocalQuiz();
      setToast({ kind: "warn", text: "AI Coach questions loaded. Answer them and submit again." });
      return;
    }

    if (!isQuizComplete()) {
      setToast({ kind: "warn", text: "Answer all questions first." });
      return;
    }

    setQuizBusy(true);
    setToast({ kind: "warn", text: "FinSec AI is grading your answers..." });

    // frontend-only grading (NO backend endpoint required)
    const result = gradeAiQuiz(quizQuestions, quizAnswers);
    setQuizResult(result);
    //setQuizPassed(result.passed);


    if (result.passed) {
      setToast({
        kind: "good",
        text: `Questions passed  (${result.score}/${result.total}). Now click “Acknowledge Training” to unlock.`,
      });
    } else {
      setToast({
        kind: "warn",
        text: `Not passed yet (${result.score}/${result.total}). Fix your answers and submit again.`,
      });
    }

    setQuizBusy(false);
  }

  async function acknowledgeTraining() {
    if (!token) {
      setToast({ kind: "bad", text: "Missing token. Please logout and login again." });
      return;
    }

    // Force pass before acknowledge (for the demo / UX)
    if (quizQuestions?.length && !quizPassed) {
      setToast({ kind: "warn", text: "Pass the AI Coach quiz first, then acknowledge." });
      return;
    }

    const completionId = pendingTraining?.id || jit?.completionId;
    if (!completionId) {
      setToast({
        kind: "bad",
        text: "No pending training ID found. Click “Refresh Training” once, then try again.",
      });
      return;
    }

    setBusy(true);
    setToast({ kind: "warn", text: "Acknowledging training..." });

    const res = await api("/employee/training/acknowledge", {
      method: "POST",
      token,
      body: { completionId },
    });

    if (!res.ok) {
      setToast({ kind: "bad", text: res.error });
      setBusy(false);
      return;
    }

    setPendingTraining(null);
    setBlockedByTraining(false);
    setJit(null);
    resetQuizUI();
    setLocalQuiz([]);
    setToast({ kind: "good", text: "Training acknowledged. Loading next drill..." });

    setBusy(false);

    // auto-load next drill
    setTimeout(() => {
      loadNext({ force: true });
    }, 250);
  }

  useEffect(() => {
    // One auto-load on mount
    loadNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the drill changes, regenerate local quiz if we’re gated
  useEffect(() => {
    if (blockedByTraining) {
      setLocalQuiz([]);
      ensureLocalQuiz();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockedByTraining, assignment?.id]);

  return (
    <div className="grid">
      <div className="row">
        <div>
          <h3 style={{ margin: 0 }}>Employee</h3>

<div className="small" style={{ opacity: 0.9, marginTop: 6 }}>
  Signed in as:{" "}
  <span className="kbd">{profileBadge(me, "EMPLOYEE")}</span> •{" "}
  <b>{me?.email}</b> • ID:{" "}
  <span className="kbd">{shortId(me)}</span> • Seed:{" "}
  <span className="kbd">{avatarSeed(me)}</span>
</div>

<div className="small" style={{ marginTop: 6 }}>
  Exercise.
</div>

        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button className="btn btnInline" onClick={() => loadNext()} disabled={busy || blockedByTraining}>
            {busy ? <Spinner /> : null}
            Load Next Drill
          </button>

          <button className="btn btnInline btnGhost" onClick={() => refreshPendingTraining()} disabled={busy}>
            {busy ? <Spinner /> : null}
            Refresh Training
          </button>
        </div>
      </div>

      <Toast kind={toast.kind} title="FinSec 1.0" message={toast.text} />

      {/* Backend-enforced training gate */}
      {blockedByTraining && (
        <div className="card" ref={gateRef}>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div>
              <h4 className="cardTitle" style={{ marginBottom: 6 }}>
                AI Coach Required
              </h4>
              <div className="cardHint" style={{ marginBottom: 0 }}>
                You clicked a suspicious link, so drills are locked. Answer the AI bot questions, submit, then acknowledge to unlock.
              </div>
            </div>

            <button
              className="btn btnPrimary btnInline glow"
              onClick={acknowledgeTraining}
              disabled={
                busy ||
                quizBusy ||
                (Array.isArray(quizQuestions) && quizQuestions.length > 0 && !quizPassed)
              }
              title={!quizPassed && quizQuestions?.length ? "Pass the AI Coach quiz first" : ""}
            >
              {busy ? <Spinner /> : null}
              Acknowledge Training
            </button>
          </div>

          <div className="hr" />

          {/* Training content */}
          {pendingTraining ? (
            <div className="email">
              <div className="emailHeader">
                <div className="line">
                  <div className="label">Topic</div>
                  <div>
                    <b>{pendingTraining.module?.topic || "Training"}</b>
                  </div>
                </div>
                <div className="line">
                  <div className="label">Duration</div>
                  <div>
                    <span className="kbd">{pendingTraining.module?.durationSeconds ?? 20}s</span>
                  </div>
                </div>
              </div>

              <div className="emailBody">{pendingTraining.module?.content || "Training content missing."}</div>

              <div className="small" style={{ marginTop: 10 }}>
                CompletionId: <span className="kbd">{pendingTraining.id}</span>
              </div>
              <div className="small" style={{ marginTop: 6 }}>
                Linked Assignment: <span className="kbd">{pendingTraining.assignmentId || "-"}</span>
              </div>
            </div>
          ) : (
            <div className="email">
              <div className="emailBody">
                Pending training hasn’t loaded yet. Click <b>Refresh Training</b> once.
              </div>
            </div>
          )}

          {/* AI Coach Quiz */}
          <div className="hr" />

          <div className="row">
            <div>
              <h4 className="cardTitle" style={{ marginBottom: 6 }}>
                AI Bot Questions
              </h4>
              <div className="cardHint" style={{ marginBottom: 0 }}>
                This is frontend-only “AI” grading (fast + reliable). Pass to unlock acknowledgement.
              </div>
            </div>

            <button
              className="btn btnInline btnPrimary glow"
              onClick={submitQuiz}
              disabled={quizBusy || busy}
              title={!quizQuestions?.length ? "Loading questions..." : ""}
            >
              {quizBusy ? <Spinner /> : null}
              Submit Answers
            </button>
          </div>

          {!quizQuestions?.length ? (
            <div className="email" style={{ marginTop: 12 }}>
              <div className="emailBody">
                Loading AI bot questions...
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
              {quizQuestions.map((q, idx) => (
                <div key={q.id} className="email">
                  <div className="emailHeader">
                    <div className="line">
                      <div className="label">Q{idx + 1}</div>
                      <div>
                        <b>{q.question}</b>
                      </div>
                    </div>
                  </div>

                  {q.type === "mcq" ? (
                    <div className="emailBody" style={{ display: "grid", gap: 10 }}>
                      {(q.options || []).map((opt, i) => {
                        const picked = Number(quizAnswers?.[q.id]?.answerIndex) === i;
                        return (
                          <button
                            key={`${q.id}-${i}`}
                            className={`btn btnInline ${picked ? "btnPrimary glow" : "btnGhost"}`}
                            style={{
                              justifyContent: "flex-start",
                              textAlign: "left",
                              width: "100%",
                              padding: "10px 12px",
                            }}
                            onClick={() => setMcq(q.id, i)}
                            disabled={quizBusy || busy}
                            title={picked ? "Selected" : "Select"}
                          >
                            <span className="kbd" style={{ marginRight: 10 }}>
                              {String.fromCharCode(65 + i)}
                            </span>
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="emailBody">
                      <div className="small" style={{ opacity: 0.85, marginBottom: 8 }}>
                        Short answer (1 line):
                      </div>
                      <textarea
                        className="input"
                        rows={3}
                        value={quizAnswers?.[q.id]?.text || ""}
                        onChange={(e) => setShort(q.id, e.target.value)}
                        disabled={quizBusy || busy}
                        placeholder="Type your answer..."
                        style={{ width: "100%", resize: "vertical" }}
                      />
                    </div>
                  )}
                </div>
              ))}

              {/* Quiz Result */}
              <div className="row" style={{ marginTop: 2 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span className="badge">
                    Status:{" "}
                    <strong>{quizPassed ? "PASSED " : quizResult ? "NOT PASSED " : "IN PROGRESS"}</strong>
                  </span>

                  {quizResult ? (
                    <span className="badge">
                      Score: <strong>{quizResult.score}/{quizResult.total}</strong>
                    </span>
                  ) : null}

                  <span className="badge">
                    Complete: <strong>{isQuizComplete() ? "Yes" : "No"}</strong>
                  </span>
                </div>

                <span className="badge">
                  Unlock rule: <strong>Pass quiz → then acknowledge</strong>
                </span>
              </div>

              {quizResult?.details?.length ? (
                <div className="email">
                  <div className="emailBody">
                    <b>AI Bot feedback:</b>
                    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                      {quizResult.details.map((d, i) => (
                        <div key={d.id} className="small" style={{ opacity: 0.92 }}>
                          • Q{i + 1}: <b>{d.ok ? "Correct " : "Wrong "}</b> — {d.explain}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Assignment meta row */}
      {assignment?.id && (
        <div className="row">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span className="badge">
              Phase: <strong>{assignment.phase || "-"}</strong>
            </span>
            <span className="badge">
              Assignment: <strong className="kbd">{assignment.id.slice(0, 10)}…</strong>
            </span>
          </div>

          {decisionLocked ? (
            <span className="badge">
              Decision: <strong>{assignment.action}</strong>
            </span>
          ) : (
            <span className="badge">
              Awaiting decision <strong>…</strong>
            </span>
          )}
        </div>
      )}

      <div className="grid twoCol">
        {/* Drill */}
        <div className="card">
          <h4 className="cardTitle">Phishing Drill</h4>
          <div className="cardHint">Goal: Baseline vs Post Evaluation.</div>

          {!assignment ? (
            <div className="email">
              <div className="emailBody">
                No assignment yet.
              </div>
            </div>
          ) : (
            <>
              <div className="email">
                <div className="emailHeader">
                  <div className="line">
                    <div className="label">Subject</div>
                    <div>{emailBox?.subject || "(template subject missing)"}</div>
                  </div>

                  <div className="small" style={{ marginLeft: 72, opacity: 0.85 }}>
                    Received: {new Date().toLocaleString()} • Inbox
                  </div>

                  <div className="line">
                    <div className="label">From</div>
                    <div>{emailBox?.fromEmail || "(template from missing)"}</div>
                  </div>
                </div>

                <div className="emailBody">{emailBox?.body || "Template body not returned."}</div>

                {emailBox?.landingUrl && (
                  <div className="small" style={{ marginTop: 10 }}>
                    Link: <span className="kbd">{emailBox.landingUrl}</span>
                  </div>
                )}
              </div>

              <div className="actions">
                <button
                type="button"     
                className="btn btnDanger btnInline"
                onClick={async () => {
                  await submitAction("CLICKED");
                  
                  const url = emailBox?.landingUrl;
                  if (url) window.open(url, "_blank", "noopener,noreferrer");
                }}
                disabled={busy || decisionLocked}
                >
                  Open Link
                  
                  </button>




                <button
                  className="btn btnPrimary btnInline glow"
                  onClick={() => submitAction("REPORTED")}
                  disabled={busy || decisionLocked || blockedByTraining}
                  title={decisionLocked ? "Decision already recorded for this drill" : ""}
                >
                  {busy ? <Spinner /> : null}
                  Report Phishing
                </button>

                <button
                  className="btn btnInline"
                  onClick={() => submitAction("IGNORED")}
                  disabled={busy || decisionLocked || blockedByTraining}
                  title={decisionLocked ? "Decision already recorded for this drill" : ""}
                >
                  {busy ? <Spinner /> : null}
                  Ignore
                </button>
              </div>

              {decisionLocked && (
                <div style={{ marginTop: 12 }}>
                  <span className="badge">
                    This drill is complete. If AI Coach appears, pass quiz → acknowledge → next drill loads automatically.
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Training / Coach */}
        <div className="card">
          <h4 className="cardTitle">Just-In-Time Training</h4>
          <div className="cardHint">Shown immediately after risky behavior.</div>

          {jit ? (
            <div className="email">
              <div className="emailHeader">
                <div className="line">
                  <div className="label">Topic</div>
                  <div>
                    <b>{jit.topic}</b>
                  </div>
                </div>
                <div className="line">
                  <div className="label">Duration</div>
                  <div>
                    <span className="kbd">{jit.durationSeconds}s</span>
                  </div>
                </div>
              </div>

              <div className="emailBody">{jit.message}</div>

              {jit.completionId && (
                <div className="small" style={{ marginTop: 10 }}>
                  CompletionId: <span className="kbd">{jit.completionId}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="email">
              <div className="emailBody">No new training triggered yet.</div>
            </div>
          )}

          <div className="hr" />

          <h4 className="cardTitle">Pending Training</h4>
          {pendingTraining ? (
            <div className="email">
              <div className="emailBody">
                Training is pending. Pass the Finsec AI questions on the left, then acknowledge to unlock.
              </div>
            </div>
          ) : (
            <div className="email">
              <div className="emailBody">No pending training. You can load drills.</div>
            </div>
          )}
        </div>
      </div>

      <div className="small" style={{ opacity: 0.85 }}>
        FinSec 1.0, 2026
        <span className="kbd"></span>
      </div>
    </div>
  );
}

/* ------------------ admin ------------------ */
function Admin({ token }) {
  const [toast, setToast] = useState({ kind: "warn", text: "Ready." });
  const [busy, setBusy] = useState(false);
  const [campaignName, setCampaignName] = useState("");
const [campaignStatus, setCampaignStatus] = useState("INACTIVE");


  const [metrics, setMetrics] = useState(null);

    // ---- Create Employee (Frontend) ----
  const [newEmp, setNewEmp] = useState({
    name: "",
    email: "",
    department: "",
    workloadLevel: "MEDIUM",
    password: "",
  });

    function updateNewEmp(key, value) {
    setNewEmp((p) => ({ ...p, [key]: value }));
  }

  async function createEmployeeFromUI() {
    if (!newEmp.name || !newEmp.email || !newEmp.department || !newEmp.password) {
      setToast({ kind: "bad", text: "Fill Name, Email, Department, and Password." });
      return;
    }

    setBusy(true);
    setToast({ kind: "warn", text: "Creating employee..." });

    const data = await api("/admin/users", {
      method: "POST",
      token,
      body: {
        name: newEmp.name.trim(),
        email: newEmp.email.trim().toLowerCase(),
        department: newEmp.department.trim(),
        workloadLevel: newEmp.workloadLevel || "MEDIUM",
        password: newEmp.password,
      },
    });

    if (!data.ok) {
      setToast({ kind: "bad", text: data?.error || data?.data?.error || "Failed to create employee" });
      setBusy(false);
      return;
    }

    setToast({ kind: "good", text: `Employee created (${data.user.email})` });

    // reset form
    setNewEmp({ name: "", email: "", department: "", workloadLevel: "MEDIUM", password: "" });

    // refresh lists so employee appears in dropdown
    await loadPicklists();

    //try to auto-select the newly created employee in the dropdown
    const createdId = data?.user?.id;
    if (createdId) setSelectedUserId(createdId);

    setBusy(false);
  }


const [tpl, setTpl] = useState({
  category: "",
  subject: "",
  fromEmail: "",
  body: "",
  difficulty: 1,
  landingUrl: "",
});

  const [campaigns, setCampaigns] = useState([]);
  const [users, setUsers] = useState([]);
  const [templates, setTemplates] = useState([]);

  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [phase, setPhase] = useState("baseline");

  const [modules, setModules] = useState([]);

  async function loadMetrics() {
    setBusy(true);
    setToast({ kind: "warn", text: "Loading metrics..." });

    const data = await api("/admin/metrics/by-phase", { token });
    if (!data.ok) {
      setToast({ kind: "bad", text: data.error });
      setBusy(false);
      return;
    }
    setMetrics(data);
    setToast({ kind: "good", text: "Metrics updated" });
    setBusy(false);
  }

  async function loadModules() {
    const data = await api("/admin/training-modules", { token });
    if (data.ok) setModules(data.modules || []);
  }

  async function loadPicklists() {
    setBusy(true);
    setToast({ kind: "warn", text: "Loading campaigns, users, templates..." });

    const [c, u, t] = await Promise.all([
      api("/admin/campaigns", { token }),
      api("/admin/users", { token }),
      api("/admin/templates", { token }),
    ]);

    if (!c.ok) {
      setToast({ kind: "bad", text: c.error });
      setBusy(false);
      return;
    }
    if (!u.ok) {
      setToast({ kind: "bad", text: u.error });
      setBusy(false);
      return;
    }
    if (!t.ok) {
      setToast({ kind: "bad", text: t.error });
      setBusy(false);
      return;
    }

    setCampaigns(c.campaigns || []);
    setUsers((u.users || []).filter((x) => x.role === "EMPLOYEE"));
    setTemplates(t.templates || []);

    const firstCampaign = (c.campaigns || [])[0]?.id || "";
    const firstUser = ((u.users || []).filter((x) => x.role === "EMPLOYEE")[0] || {}).id || "";
    const firstTemplate = (t.templates || [])[0]?.id || "";

    setSelectedCampaignId((prev) => prev || firstCampaign);
    setSelectedUserId((prev) => prev || firstUser);
    setSelectedTemplateId((prev) => prev || firstTemplate);

    setToast({ kind: "good", text: "Lists loaded" });
    setBusy(false);
  }

  async function createAssignment() {
    if (!selectedCampaignId || !selectedUserId || !selectedTemplateId) {
      setToast({ kind: "bad", text: "Select Campaign, Employee, and Template first." });
      return;
    }

    setBusy(true);
    setToast({ kind: "warn", text: "Creating assignment..." });

    const data = await api("/admin/assignments", {
      method: "POST",
      token,
      body: {
        campaignId: selectedCampaignId,
        userId: selectedUserId,
        templateId: selectedTemplateId,
        phase,
      },
    });

    if (!data.ok) {
      setToast({ kind: "bad", text: data.error });
      setBusy(false);
      return;
    }

    setToast({ kind: "good", text: `Assignment created (${phase})` });
    await loadMetrics();
    setBusy(false);
  }

  useEffect(() => {
    loadMetrics();
    loadModules();
    loadPicklists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const baseline = metrics?.results?.baseline;
  const post = metrics?.results?.post;

  return (
    
    <div className="grid">
      <div className="row">
        <div>
          <h3 style={{ margin: 0 }}>Admin</h3>
          <div className="small">Create drills + view baseline vs post metrics.</div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btnInline" onClick={loadPicklists} disabled={busy}>
            {busy ? <Spinner /> : null}
            Refresh Lists
          </button>

          <button className="btn btnPrimary btnInline glow" onClick={loadMetrics} disabled={busy}>
            {busy ? <Spinner /> : null}
            Refresh Metrics
          </button>
        </div>
      </div>

      <Toast kind={toast.kind} title="FinSec 1.0" message={toast.text} />
            <div className="card">
        <h4 className="cardTitle">Create Employee</h4>
        <div className="cardHint"></div>

        <div className="grid3" style={{ marginTop: 10 }}>
          <div className="field">
            <label>Full Name</label>
            <input
              className="input"
              value={newEmp.name}
              onChange={(e) => updateNewEmp("name", e.target.value)}
              placeholder="e.g., User One"
            />
          </div>

          <div className="field">
            <label>Email</label>
            <input
              className="input"
              value={newEmp.email}
              onChange={(e) => updateNewEmp("email", e.target.value)}
              placeholder="e.g., user2@fintechdemo.com"
            />
          </div>

          <div className="field">
            <label>Department</label>
            <input
              className="input"
              value={newEmp.department}
              onChange={(e) => updateNewEmp("department", e.target.value)}
              placeholder="e.g., Operations"
            />
          </div>
        </div>

        <div className="grid3" style={{ marginTop: 10 }}>
          <div className="field">
            <label>Workload Level</label>
            <select
              className="input"
              value={newEmp.workloadLevel}
              onChange={(e) => updateNewEmp("workloadLevel", e.target.value)}
            >
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
            </select>
          </div>

          <div className="field">
            <label>Temporary Password</label>
            <input
              className="input"
              type="password"
              value={newEmp.password}
              onChange={(e) => updateNewEmp("password", e.target.value)}
              placeholder="e.g., User12345!"
            />
          </div>

          <div className="field" style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              className="btn btnPrimary btnInline glow"
              onClick={createEmployeeFromUI}
              disabled={busy}
              style={{ width: "100%" }}
            >
              {busy ? <Spinner /> : null}
              Create Employee
            </button>
          </div>
        </div>

        <div className="small" style={{ marginTop: 10, opacity: 0.85 }}>
          Tip: After creating a user, switch to Login and sign in with that email/password.
        </div>
      </div>

      {/* ---------------- Create Campaign ---------------- */}
<div className="card">
  <h4 className="cardTitle">Create Campaign</h4>
  <div className="cardHint">
    Campaigns group phishing drills (baseline vs post).
  </div>

  <div className="grid3" style={{ marginTop: 10 }}>
    <div className="field">
      <label>Campaign Name</label>
      <input
        className="input"
        placeholder="e.g. Q1 Awareness"
        value={campaignName || ""}
        onChange={(e) => setCampaignName(e.target.value)}
      />
    </div>

    <div className="field">
      <label>Status</label>
      <select
        className="input"
        value={campaignStatus || "INACTIVE"}
        onChange={(e) => setCampaignStatus(e.target.value)}
      >
        <option value="INACTIVE">INACTIVE</option>
        <option value="ACTIVE">ACTIVE</option>
      </select>
    </div>

    <div className="field" style={{ display: "flex", alignItems: "flex-end" }}>
      <button
        className="btn btnPrimary btnInline glow"
        disabled={busy}
        onClick={async () => {
          if (!campaignName) {
            setToast({ kind: "bad", text: "Campaign name is required" });
            return;
          }

          setBusy(true);
          const res = await api("/admin/campaigns", {
            method: "POST",
            token,
            body: { name: campaignName, status: campaignStatus },
          });

          if (!res.ok) {
            setToast({ kind: "bad", text: res.error });
            setBusy(false);
            return;
          }

          setToast({ kind: "good", text: "Campaign created" });
          setCampaignName("");
          await loadPicklists();
          setBusy(false);
        }}
      >
        Create Campaign
      </button>
    </div>
  </div>
</div>

{/* ---------------- Create Template ---------------- */}
<div className="card">
  <h4 className="cardTitle">Create Phishing Template</h4>
  <div className="cardHint">
    This is the fake email employees will receive.
  </div>

  <div className="grid3" style={{ marginTop: 10 }}>
    <div className="field">
      <label>Category</label>
      <input
        className="input"
        placeholder="e.g. Urgency / Finance / IT"
        value={tpl.category}
        onChange={(e) => setTpl({ ...tpl, category: e.target.value })}
      />
    </div>

    <div className="field">
      <label>Subject</label>
      <input
        className="input"
        placeholder="e.g. Action Required"
        value={tpl.subject}
        onChange={(e) => setTpl({ ...tpl, subject: e.target.value })}
      />
    </div>

    <div className="field">
      <label>From Email</label>
      <input
        className="input"
        placeholder="e.g. it-support@company.com"
        value={tpl.fromEmail}
        onChange={(e) => setTpl({ ...tpl, fromEmail: e.target.value })}
      />
    </div>
  </div>

  <div className="grid3" style={{ marginTop: 10 }}>
    <div className="field">
      <label>Difficulty</label>
      <select
        className="input"
        value={tpl.difficulty}
        onChange={(e) => setTpl({ ...tpl, difficulty: Number(e.target.value) })}
      >
        <option value={1}>1 (Easy)</option>
        <option value={2}>2</option>
        <option value={3}>3 (Hard)</option>
      </select>
    </div>

    <div className="field">
      <label>Landing URL (optional)</label>
      <input
        className="input"
        placeholder="https://fake-login.com"
        value={tpl.landingUrl}
        onChange={(e) => setTpl({ ...tpl, landingUrl: e.target.value })}
      />
    </div>
  </div>

  <div className="field" style={{ marginTop: 10 }}>
    <label>Email Body</label>
    <textarea
      className="input"
      rows={4}
      placeholder="Email content goes here..."
      value={tpl.body}
      onChange={(e) => setTpl({ ...tpl, body: e.target.value })}
    />
  </div>

  <button
    className="btn btnPrimary btnInline glow"
    disabled={busy}
    style={{ marginTop: 10 }}
    onClick={async () => {
      const { category, subject, fromEmail, body } = tpl;
      if (!category || !subject || !fromEmail || !body) {
        setToast({ kind: "bad", text: "Fill all required template fields" });
        return;
      }

      setBusy(true);
      const res = await api("/admin/templates", {
        method: "POST",
        token,
        body: tpl,
      });

      if (!res.ok) {
        setToast({ kind: "bad", text: res.error });
        setBusy(false);
        return;
      }

      setToast({ kind: "good", text: "Template created" });
      setTpl({ category: "", subject: "", fromEmail: "", body: "", difficulty: 1, landingUrl: "" });
      await loadPicklists();
      setBusy(false);
    }}
  >
    Create Template
  </button>
</div>


      <div className="card">
        <h4 className="cardTitle">Create Assignment</h4>
        <div className="cardHint">Pick from dropdowns (no manual IDs).</div>

        <div className="grid3">
          <div className="field">
            <label>Campaign</label>
            <select className="input" value={selectedCampaignId} onChange={(e) => setSelectedCampaignId(e.target.value)}>
              {campaigns.length === 0 ? (
                <option value="">No campaigns found</option>
              ) : (
                campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.status})
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="field">
            <label>Employee</label>
            <select className="input" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
              {users.length === 0 ? (
                <option value="">No employees found</option>
              ) : (
                users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} • {u.email} • {u.department}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="field">
            <label>Template</label>
            <select className="input" value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
              {templates.length === 0 ? (
                <option value="">No templates found</option>
              ) : (
                templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.category} • L{t.difficulty} • {t.subject}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span className="badge">
              Phase:
              <select
                value={phase}
                onChange={(e) => setPhase(e.target.value)}
                style={{
                  marginLeft: 10,
                  background: "rgba(0,0,0,.25)",
                  border: "1px solid rgba(255,255,255,.12)",
                  color: "rgba(255,255,255,.9)",
                  borderRadius: 10,
                  padding: "6px 10px",
                }}
              >
                <option value="baseline">baseline</option>
                <option value="post">post</option>
              </select>
            </span>

            <span className="badge">
              TrainingTriggered: <strong>{metrics?.trainingTriggered ?? 0}</strong>
            </span>
          </div>

          <button className="btn btnPrimary btnInline glow" onClick={createAssignment} disabled={busy}>
            {busy ? <Spinner /> : null}
            Create Assignment
          </button>
        </div>
      </div>

      <div className="grid twoCol">
        <MetricCard title="Baseline" data={baseline} />
        <MetricCard title="Post" data={post} />
      </div>

      <div className="card">
        <h4 className="cardTitle">Training Modules (DB)</h4>
        <div className="cardHint">These are the micro-trainings your system can trigger.</div>

        {modules.length === 0 ? (
          <div className="small">No modules loaded.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {modules.slice(0, 6).map((m) => (
              <div key={m.id} className="email">
                <div className="emailHeader">
                  <div className="line">
                    <div className="label">Topic</div>
                    <div>
                      <b>{m.topic}</b>
                    </div>
                  </div>
                  <div className="line">
                    <div className="label">Duration</div>
                    <div>
                      <span className="kbd">{m.durationSeconds}s</span>
                    </div>
                  </div>
                </div>
                <div className="emailBody">{m.content}</div>
                <div className="small" style={{ marginTop: 10 }}>
                  Id: <span className="kbd">{m.id}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ title, data }) {
  const clickPct = data?.total ? (data.clicked / data.total) * 100 : 0;
  const reportPct = data?.total ? (data.reported / data.total) * 100 : 0;

  return (
    <div className="card">
      <h4 className="cardTitle">{title}</h4>

      {!data ? (
        <div className="email">
          <div className="emailBody">No data yet.</div>
        </div>
      ) : (
        <div className="metricGrid">
          <div className="metricRow">
            <span>Total</span>
            <b>{data.total}</b>
          </div>

          <div className="metricRow">
            <span>Clicked</span>
            <b>{data.clicked}</b>
          </div>
          <div className="metricBar">
            <div style={{ width: `${Math.min(100, clickPct)}%` }} />
          </div>
          <div className="metricRow">
            <span>Click rate</span>
            <b>{data.clickRate.toFixed(2)}</b>
          </div>

          <div className="hr" />

          <div className="metricRow">
            <span>Reported</span>
            <b>{data.reported}</b>
          </div>
          <div className="metricBar">
            <div style={{ width: `${Math.min(100, reportPct)}%` }} />
          </div>
          <div className="metricRow">
            <span>Report rate</span>
            <b>{data.reportRate.toFixed(2)}</b>
          </div>
        </div>
      )}
    </div>
  );
}