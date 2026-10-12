import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAR1NEHhZwUujpGEjb-IvTV2A04PTQuYLE",
  authDomain: "edutrace-ug.firebaseapp.com",
  projectId: "edutrace-ug",
  storageBucket: "edutrace-ug.firebasestorage.app",
  messagingSenderId: "219055117140",
  appId: "1:219055117140:web:97ec99de8e25b6f9266ec1"
};

const W = {
  profile: "https://edutraceug-school-profile-worker.anubisdigital114-9df.workers.dev",
  roster: "https://edutraceug-roster-worker.anubisdigital114-9df.workers.dev",
  teachers: "https://edutraceug-teachers-worker.anubisdigital114-9df.workers.dev",
  marks: "https://edutraceug-marks-worker.anubisdigital114-9df.workers.dev",
  email: "https://edutraceug-email-worker.anubisdigital114-9df.workers.dev",
  phones: "https://edutraceug-phone-worker.anubisdigital114-9df.workers.dev",
  ledger: "https://edutraceug-ledger-worker.anubisdigital114-9df.workers.dev"
};

const ROLE_ROUTES = {
  schoolAdmin: "/school-admin.html",
  teacher: "/teacher.html",
  student: "/student.html",
  parent: "/parent.html"
};

// ===== Constants (fixed classes, subjects, combinations) =====
const CLASSES = ["Senior 1", "Senior 2", "Senior 3", "Senior 4", "Senior 5", "Senior 6"];

const CORE_S1_S4 = ["English", "Mathematics", "History", "Geography", "Physics", "Biology", "Chemistry"];
const CORE_S5_S6 = ["General Paper"];
const A_LEVEL_SUBJECTS = [
  "Subsidiary ICT", "Subsidiary Mathematics", "Physics", "Chemistry", "Mathematics",
  "Biology", "Economics", "Divinity", "Computer Science", "Literature", "Agriculture",
  "Geography", "History"
];
const ELECTIVES = {
  religious: ["CRE", "IRE"],
  language: ["Luganda", "Kiswahili", "Literature", "French"],
  vocational: ["ICT", "Agriculture", "Art and Design", "Performing Arts"]
};

const A_LEVEL_COMBINATIONS = [
  { code: "PCM", name: "Physics, Chemistry, Mathematics" },
  { code: "PCB", name: "Physics, Chemistry, Biology" },
  { code: "BCM", name: "Biology, Chemistry, Mathematics" },
  { code: "HEG", name: "History, Economics, Geography" },
  { code: "MEG", name: "Mathematics, Economics, Geography" },
  { code: "HEL", name: "History, Economics, Literature" },
  { code: "HED", name: "History, Economics, Divinity" },
  { code: "PEM", name: "Physics, Economics, Mathematics" },
  { code: "EGD", name: "Economics, Geography, Divinity" },
  { code: "ICT", name: "Computer Science, Economics, Mathematics" },
  { code: "AGR", name: "Agriculture, Biology, Chemistry" },
  { code: "CDF", name: "Computer Science, Divinity, Literature" }
];

// Helpers
function normaliseClass(name) {
  if (!name) return "";
  const s = String(name).trim().toLowerCase()
    .replace(/^senior\s*/, "")
    .replace(/^s\.?\s*/, "")
    .replace(/^s/, "");
  const n = parseInt(s, 10);
  if (n >= 1 && n <= 6) return "Senior " + n;
  return "";
}
function classBand(name) {
  const c = normaliseClass(name);
  if (c === "Senior 1" || c === "Senior 2") return "S1-S2";
  if (c === "Senior 3" || c === "Senior 4") return "S3-S4";
  if (c === "Senior 5" || c === "Senior 6") return "S5-S6";
  return "";
}

const S = {
  user: null, claims: null, schoolId: null, school: null,
  terms: [], structure: { classes: [] }, types: [], scoring: null,
  config: null, currentTermId: null, view: "dashboard", teachers: []
};

// Wizard state
const WZ = {
  step: 1,
  totalSteps: 8,
  opened: false,
  step4Done: false,
  electives: { "S1-S2": [], "S3-S4": [], "S5-S6": [] },
  page: { heroImages: [], headTeacher: "", leaders: [] },
  assign: {}, // class -> { subject: teacherUid }
  term: {}
};

// Roster list state
const RS = {
  rows: [],          // loaded student rows
  original: new Map(), // id -> row snapshot (for dirty tracking)
  classes: []        // available classes
};

const $ = (id) => document.getElementById(id);
const q = (sel, root = document) => root.querySelector(sel);
const qa = (sel, root = document) => [...root.querySelectorAll(sel)];

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function fmtBytes(n) {
  if (!n && n !== 0) return "—";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

function toast(msg, kind = "info", ms = 4000) {
  const icons = { success: "fa-circle-check", error: "fa-circle-exclamation", warn: "fa-triangle-exclamation", info: "fa-circle-info" };
  const t = document.createElement("div");
  t.className = `toast ${kind}`;
  t.innerHTML = `<i class="fa-solid ${icons[kind] || icons.info}"></i><span>${esc(msg)}</span>`;
  $("toastWrap").appendChild(t);
  setTimeout(() => {
    t.style.opacity = "0"; t.style.transition = "opacity .3s";
    setTimeout(() => t.remove(), 300);
  }, ms);
}

function setBtn(btn, on) {
  if (!btn) return;
  btn.classList.toggle("loading", on);
  btn.disabled = on;
}

function confirmDialog(title, msg, okLabel = "Confirm", danger = true) {
  return new Promise((resolve) => {
    $("confirmTitle").textContent = title;
    $("confirmMsg").textContent = msg;
    const yes = $("confirmYes");
    yes.textContent = okLabel;
    yes.className = "btn " + (danger ? "btn-red" : "btn-primary");
    $("confirmBack").classList.add("show");
    const done = (ok) => {
      $("confirmBack").classList.remove("show");
      yes.removeEventListener("click", onYes);
      $("confirmNo").removeEventListener("click", onNo);
      resolve(ok);
    };
    const onYes = () => done(true);
    const onNo = () => done(false);
    yes.addEventListener("click", onYes);
    $("confirmNo").addEventListener("click", onNo);
  });
}

function openModal({ title, body, foot, wide = "" }) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = body;
  $("modalFoot").innerHTML = foot || "";
  $("modal").className = "modal" + (wide ? " " + wide : "");
  $("modalBack").classList.add("show");
}
function closeModal() {
  $("modalBack").classList.remove("show");
  $("modalBody").innerHTML = "";
  $("modalFoot").innerHTML = "";
}

class ApiError extends Error {
  constructor(message, status, body) { super(message); this.status = status; this.body = body; }
}

async function idToken() {
  if (!S.user) throw new Error("Not signed in");
  return S.user.getIdToken();
}

async function api(url, options = {}) {
  const token = await idToken();
  const headers = { Authorization: `Bearer ${token}`, ...(options.headers || {}) };
  let res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    const fresh = await S.user.getIdToken(true);
    res = await fetch(url, { ...options, headers: { Authorization: `Bearer ${fresh}`, ...(options.headers || {}) } });
  }
  if (!res.ok) throw await apiError(res);
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

async function apiError(res) {
  let message = `Request failed (${res.status})`;
  let body = null;
  try {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      body = await res.json();
      if (body && body.error) message = body.error;
    }
  } catch {}
  return new ApiError(message, res.status, body);
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

onAuthStateChanged(auth, async (user) => {
  if (!user) { location.replace("/account.html"); return; }
  S.user = user;
  let claims;
  try { claims = (await user.getIdTokenResult(true)).claims; }
  catch { claims = (await user.getIdTokenResult()).claims; }
  S.claims = claims;

  if (claims.role !== "schoolAdmin") {
    const target = ROLE_ROUTES[claims.role];
    if (target) location.replace(target);
    else { await signOut(auth); location.replace("/account.html"); }
    return;
  }
  S.schoolId = claims.schoolId;

  try {
    await loadInitial();
    paintHeader();
    bindShell();
    initWizard();
    showView(location.hash.replace(/^#\/?/, "") || "dashboard");
    maybeAutoOpenWizard();
  } catch (err) {
    console.error(err);
    toast(err.message || "Failed to load", "error", 8000);
  }
});

async function loadInitial() {
  const sid = S.schoolId;
  const [school, termsData, configData, scoringData, structure, teachers] = await Promise.all([
    api(`${W.profile}/school/id/${encodeURIComponent(sid)}`).catch(() => null),
    api(`${W.teachers}/schools/${encodeURIComponent(sid)}/terms`),
    api(`${W.marks}/schools/${encodeURIComponent(sid)}/config`),
    api(`${W.teachers}/schools/${encodeURIComponent(sid)}/scoring-mode`),
    api(`${W.teachers}/schools/${encodeURIComponent(sid)}/structure`).catch(() => ({ classes: [] })),
    api(`${W.teachers}/schools/${encodeURIComponent(sid)}/teachers`).catch(() => ({ teachers: [] }))
  ]);
  S.school = school;
  S.terms = termsData.terms || [];
  S.config = configData;
  S.types = configData.assessmentTypes || [];
  S.scoring = scoringData;
  S.structure = structure;
  S.teachers = teachers.teachers || [];
  const cur = S.terms.find((t) => t.isCurrent);
  S.currentTermId = cur ? cur.id : (S.terms[0] && S.terms[0].id) || null;

  // Merge streams (and student counts) into CLASSES constant
  const routeMap = {};
  const countMap = {};
  (S.structure.classes || []).forEach((c) => {
    const canon = normaliseClass(c.class);
    if (!canon) return;
    routeMap[canon] = (routeMap[canon] || []).concat(c.streams || []);
    if (typeof c.students === "number") countMap[canon] = (countMap[canon] || 0) + c.students;
  });
  S.structure.classes = CLASSES.map((c) => ({
    class: c,
    streams: [...new Set(routeMap[c] || [])],
    students: countMap[c] || 0,
    subjects: []
  }));
}

function paintHeader() {
  if (S.school) {
    $("schoolName").textContent = S.school.name || "School";
    if (S.school.logoUrl) $("schoolLogo").src = S.school.logoUrl;
    if (S.school.themeColor) {
      const root = document.documentElement;
      root.style.setProperty("--primary", S.school.themeColor);
      root.style.setProperty("--primary-dark", darken(S.school.themeColor, .15));
      root.style.setProperty("--primary-light", lighten(S.school.themeColor, .9));
    }
  }
  const email = S.user.email || "";
  $("userName").textContent = email.split("@")[0] || "Admin";
  $("userAvatar").textContent = (email[0] || "A").toUpperCase();
}

function darken(hex, a) {
  const c = hex.replace("#", ""); const n = parseInt(c, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.floor(r * (1 - a))); g = Math.max(0, Math.floor(g * (1 - a))); b = Math.max(0, Math.floor(b * (1 - a)));
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function lighten(hex, a) {
  const c = hex.replace("#", ""); const n = parseInt(c, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.min(255, Math.floor(r + (255 - r) * a)); g = Math.min(255, Math.floor(g + (255 - g) * a)); b = Math.min(255, Math.floor(b + (255 - b) * a));
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function bindShell() {
  qa(".snav-item").forEach((n) => n.addEventListener("click", () => showView(n.dataset.view)));
  qa("[data-goto]").forEach((n) => n.addEventListener("click", () => showView(n.dataset.goto)));

  $("menuBtn").addEventListener("click", () => {
    $("sidebar").classList.toggle("open");
    $("sidebarBack").classList.toggle("show");
  });
  $("sidebarBack").addEventListener("click", () => {
    $("sidebar").classList.remove("open");
    $("sidebarBack").classList.remove("show");
  });
  $("logoutBtn").addEventListener("click", async () => { await signOut(auth); location.replace("/account.html"); });
  $("modalClose").addEventListener("click", closeModal);
  $("modalBack").addEventListener("click", (e) => { if (e.target === $("modalBack")) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModal(); $("confirmBack").classList.remove("show"); } });
}

function showView(name) {
  if (!name) name = "dashboard";
  S.view = name;
  qa(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === name));
  qa(".snav-item").forEach((n) => n.classList.toggle("active", n.dataset.view === name));
  location.hash = "#/" + name;
  $("sidebar").classList.remove("open");
  $("sidebarBack").classList.remove("show");

  switch (name) {
    case "dashboard": renderDashboard(); break;
    case "profile": renderProfile(); break;
    case "appearance": renderAppearance(); break;
    case "content": renderContent(); break;
    case "roster": renderRoster(); break;
    case "teachers": renderTeachers(); break;
    case "structure": renderStructure(); break;
    case "terms": renderTerms(); break;
    case "types": renderTypes(); break;
    case "scoring": renderScoring(); break;
    case "sheets": renderSheets(); break;
    case "reports": renderReports(); break;
    case "notes": renderNotes(); break;
    case "holds": renderHolds(); break;
    case "email": break;
    case "phones": renderPhones(); break;
    case "ledger": renderLedger(); break;
    case "audit": renderAudit(); break;
  }
}

// ====================== WIZARD ======================

function lsKey(key) {
  return `edutrace_wizard_${key}_${S.schoolId}`;
}

function initWizard() {
  const classOptions = CLASSES.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  $("wzStudentClass").innerHTML = `<option value="">Select class</option>` + classOptions;
  $("wzAssignClass").innerHTML = `<option value="">Select class</option>` + classOptions;

  renderElectivesGrid("wzElectivesS1S2", "S1-S2");
  renderElectivesGrid("wzElectivesS3S4", "S3-S4");
  renderElectivesGrid("wzElectivesS5S6", "S5-S6");

  try {
    WZ.opened = localStorage.getItem(lsKey("opened")) === "true";
    WZ.step4Done = localStorage.getItem(lsKey("step4")) === "true";
    const savedElectives = localStorage.getItem(lsKey("electives"));
    if (savedElectives) WZ.electives = JSON.parse(savedElectives);
  } catch {}

  $("wizardClose").onclick = closeWizard;
  $("wizardBack").onclick = () => goWizardStep(WZ.step - 1);
  $("wizardNext").onclick = onWizardNext;

  setupDrop("wzLogoDrop", "wzLogoInput", async (file) => {
    if (file.size > 5 * 1024 * 1024) { toast("Logo too large (max 5 MB)", "error"); return; }
    const fd = new FormData(); fd.append("file", file);
    try {
      const token = await idToken();
      const res = await fetch(`${W.profile}/school/id/${encodeURIComponent(S.schoolId)}/logo`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Upload failed");
      const updated = await res.json();
      S.school = updated;
      $("wzLogoPreview").src = updated.logoUrl;
      paintHeader();
      toast("Logo updated", "success");
    } catch (err) { toast(err.message, "error", 6000); }
  });

  let studentFile = null;
  setupDrop("wzStudentDrop", "wzStudentInput", (file) => {
    const ok = /\.(xlsx|xls|xlsm|csv)$/i.test(file.name);
    if (!ok) { toast("Only .xlsx, .xls, .xlsm or .csv", "error"); return; }
    if (file.size > 25 * 1024 * 1024) { toast("Max 25 MB", "error"); return; }
    studentFile = file;
    $("wzStudentFileInfo").innerHTML = `<div class="file-pill"><i class="fa-solid fa-file-excel" style="color:var(--green)"></i> <b>${esc(file.name)}</b> <span style="color:var(--muted)">${fmtBytes(file.size)}</span></div>`;
    $("wzStudentUpload").disabled = false;
  });
  $("wzStudentUpload").onclick = async () => {
    if (!studentFile) return;
    const cls = $("wzStudentClass").value;
    if (!cls) { toast("Pick a class", "warn"); return; }
    const stream = $("wzStudentStream").value.trim();
    const btn = $("wzStudentUpload"); setBtn(btn, true);
    $("wzStudentResult").innerHTML = `<div class="card"><div class="card-body"><div class="skel h20 w50"></div><div class="skel h40"></div></div></div>`;
    try {
      const token = await idToken();
      let offset = 0, batchId = null;
      let allCreated = 0, allUpdated = 0, allUnchanged = 0, allRejected = [], processedRows = 0;
      while (true) {
        const fd = new FormData();
        fd.append("file", studentFile);
        fd.append("schoolId", S.schoolId);
        fd.append("class", cls);
        fd.append("stream", stream);
        fd.append("recordType", "student");
        if (batchId) fd.append("batchId", batchId);
        if (offset > 0) fd.append("offset", String(offset));
        const res = await fetch(`${W.roster}/upload-roster`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
        batchId = data.batchId || batchId;
        allCreated += data.created || 0;
        allUpdated += data.updated || 0;
        allUnchanged += data.unchanged || 0;
        if (data.rejected) allRejected.push(...data.rejected);
        processedRows += data.processed || 0;
        $("wzStudentResult").innerHTML = `<div class="card"><div class="card-body"><div style="font-weight:800;margin-bottom:8px">Processing… ${processedRows} rows</div><div class="skel h40"></div></div></div>`;
        if (!data.remaining || data.remaining === 0) break;
        offset = data.nextOffset;
      }
      $("wzStudentResult").innerHTML = `
        <div class="card" style="border-left:4px solid var(--green)"><div class="card-body">
          <h3 style="font-size:1rem;font-weight:800;margin-bottom:12px"><i class="fa-solid fa-circle-check" style="color:var(--green)"></i> Upload complete</h3>
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">
            <span class="pill green">${allCreated} created</span>
            <span class="pill blue">${allUpdated} updated</span>
            <span class="pill grey">${allUnchanged} unchanged</span>
            ${allRejected.length ? `<span class="pill red">${allRejected.length} rejected</span>` : ""}
          </div>
        </div></div>`;
      toast("Student roster uploaded", "success");
      await loadInitial();
    } catch (err) {
      $("wzStudentResult").innerHTML = `<div class="card" style="border-left:4px solid var(--red)"><div class="card-body"><div style="font-weight:800;color:var(--red)"><i class="fa-solid fa-circle-xmark"></i> Upload failed</div><p style="font-size:.88rem;margin-top:6px">${esc(err.message)}</p></div></div>`;
    } finally { setBtn(btn, false); }
  };
  $("wzStudentSkip").onclick = () => goWizardStep(3);

  let teacherFile = null;
  setupDrop("wzTeacherDrop", "wzTeacherInput", (file) => {
    const ok = /\.(xlsx|xls|xlsm|csv)$/i.test(file.name);
    if (!ok) { toast("Only .xlsx, .xls, .xlsm or .csv", "error"); return; }
    if (file.size > 25 * 1024 * 1024) { toast("Max 25 MB", "error"); return; }
    teacherFile = file;
    $("wzTeacherFileInfo").innerHTML = `<div class="file-pill"><i class="fa-solid fa-file-excel" style="color:var(--green)"></i> <b>${esc(file.name)}</b> <span style="color:var(--muted)">${fmtBytes(file.size)}</span></div>`;
    $("wzTeacherUpload").disabled = false;
  });
  $("wzTeacherUpload").onclick = async () => {
    if (!teacherFile) return;
    const btn = $("wzTeacherUpload"); setBtn(btn, true);
    $("wzTeacherResult").innerHTML = `<div class="card"><div class="card-body"><div class="skel h20 w50"></div><div class="skel h40"></div></div></div>`;
    try {
      const token = await idToken();
      let offset = 0, batchId = null;
      let allCreated = 0, allUpdated = 0, allUnchanged = 0, allRejected = [], processedRows = 0;
      while (true) {
        const fd = new FormData();
        fd.append("file", teacherFile);
        fd.append("schoolId", S.schoolId);
        fd.append("recordType", "teacher");
        if (batchId) fd.append("batchId", batchId);
        if (offset > 0) fd.append("offset", String(offset));
        const res = await fetch(`${W.roster}/upload-roster`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
        batchId = data.batchId || batchId;
        allCreated += data.created || 0;
        allUpdated += data.updated || 0;
        allUnchanged += data.unchanged || 0;
        if (data.rejected) allRejected.push(...data.rejected);
        processedRows += data.processed || 0;
        $("wzTeacherResult").innerHTML = `<div class="card"><div class="card-body"><div style="font-weight:800;margin-bottom:8px">Processing… ${processedRows} rows</div><div class="skel h40"></div></div></div>`;
        if (!data.remaining || data.remaining === 0) break;
        offset = data.nextOffset;
      }
      $("wzTeacherResult").innerHTML = `
        <div class="card" style="border-left:4px solid var(--green)"><div class="card-body">
          <h3 style="font-size:1rem;font-weight:800;margin-bottom:12px"><i class="fa-solid fa-circle-check" style="color:var(--green)"></i> Upload complete</h3>
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">
            <span class="pill green">${allCreated} created</span>
            <span class="pill blue">${allUpdated} updated</span>
            <span class="pill grey">${allUnchanged} unchanged</span>
            ${allRejected.length ? `<span class="pill red">${allRejected.length} rejected</span>` : ""}
          </div>
        </div></div>`;
      toast("Teacher roster uploaded", "success");
      await loadInitial();
    } catch (err) {
      $("wzTeacherResult").innerHTML = `<div class="card" style="border-left:4px solid var(--red)"><div class="card-body"><div style="font-weight:800;color:var(--red)"><i class="fa-solid fa-circle-xmark"></i> Upload failed</div><p style="font-size:.88rem;margin-top:6px">${esc(err.message)}</p></div></div>`;
    } finally { setBtn(btn, false); }
  };
  $("wzTeacherSkip").onclick = () => goWizardStep(4);

  $("wzTermSave").onclick = async () => {
    const name = $("wzTermName").value.trim();
    if (!name) { toast("Term name required", "warn"); return; }
    const btn = $("wzTermSave"); setBtn(btn, true);
    try {
      await api(`${W.teachers}/schools/${encodeURIComponent(S.schoolId)}/terms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          year: parseInt($("wzTermYear").value, 10),
          startDate: $("wzTermStart").value,
          endDate: $("wzTermEnd").value,
          isCurrent: $("wzTermCurrent").checked
        })
      });
      closeWizard();
      toast("Term saved", "success");
      await loadInitial();
      paintHeader();
      renderDashboard();
    } catch (err) { toast(err.message, "error", 6000); }
    finally { setBtn(btn, false); }
  };

  $("wzAssignClass").onchange = renderAssignListForClass;
  $("wzAssignSave").onclick = saveAssignments;

  setupDrop("wzHeroDrop", "wzHeroInput", async (file) => {
    if (file.size > 10 * 1024 * 1024) { toast("Hero image too large (max 10 MB)", "error"); return; }
    const fd = new FormData(); fd.append("file", file);
    try {
      const token = await idToken();
      const res = await fetch(`${W.profile}/school/id/${encodeURIComponent(S.schoolId)}/hero`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Upload failed");
      const updated = await res.json();
      S.school = updated;
      WZ.page.heroImages = updated.heroImages || [];
      renderWzHeroGrid();
      toast("Hero image added", "success");
    } catch (err) { toast(err.message, "error", 6000); }
  });
  $("wzAddLeader").onclick = () => {
    WZ.page.leaders.push({ name: "", role: "" });
    renderWzLeaders();
  };
  $("wzPageSave").onclick = saveWzPage;

  goWizardStep(WZ.step, true);
}

function renderElectivesGrid(containerId, band) {
  const el = $(containerId);
  if (!el) return;
  const selected = new Set(WZ.electives[band] || []);
  const groups = [
    { key: "religious", items: ELECTIVES.religious },
    { key: "language", items: ELECTIVES.language },
    { key: "vocational", items: ELECTIVES.vocational }
  ];
  el.innerHTML = groups.map((g) => `
    <div style="grid-column:1/-1;margin-top:4px;font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:var(--muted)">${g.key}</div>
    ${g.items.map((s) => `
      <label class="check" style="margin:0;font-size:.84rem">
        <input type="checkbox" data-band="${band}" data-subject="${esc(s)}" ${selected.has(s) ? "checked" : ""}>
        <span>${esc(s)}</span>
      </label>
    `).join("")}
  `).join("");
  qa(`[data-band="${band}"]`, el).forEach((cb) => {
    cb.onchange = () => {
      const set = new Set(WZ.electives[band] || []);
      if (cb.checked) set.add(cb.dataset.subject);
      else set.delete(cb.dataset.subject);
      WZ.electives[band] = [...set];
      try { localStorage.setItem(lsKey("electives"), JSON.stringify(WZ.electives)); } catch {}
    };
  });
}

function goWizardStep(step, silent) {
  if (step < 1) step = 1;
  if (step > WZ.totalSteps) step = WZ.totalSteps;
  if (step === 6) step = WZ.step < 6 ? 7 : 5;
  WZ.step = step;
  qa(".wizard-step").forEach((s) => s.classList.toggle("active", parseInt(s.dataset.wzStep, 10) === step));
  const shown = step > 6 ? step - 1 : step;
  $("wizardStepLabel").textContent = `Step ${shown} of ${WZ.totalSteps - 1}`;
  $("wizardBar").style.width = (shown / (WZ.totalSteps - 1) * 100) + "%";
  $("wizardBack").style.visibility = step === 1 ? "hidden" : "visible";
  $("wizardNext").innerHTML = step === WZ.totalSteps
    ? `<span class="btn-label">Finish</span> <i class="fa-solid fa-check"></i>`
    : `Next <i class="fa-solid fa-arrow-right"></i>`;

  if (step === 1) renderWzStep1();
  if (step === 2) renderWzStep2();
  if (step === 3) renderWzStep3();
  if (step === 4) renderWzStep4();
  if (step === 5) renderWzStep5();
  if (step === 6) renderWzStep6();
  if (step === 7) renderWzStep7();
  if (step === 8) renderWzStep8();

  if (!silent) {
    $("wizardBody").scrollTop = 0;
  }
}

function renderWzStep1() {
  const s = S.school || {};
  $("wzName").value = s.name || "";
  const unesc = (v) => v.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const secText = (t) => { const x = (s.sections || []).find((z) => z.title === t); return x ? unesc((x.blocks || []).map((b) => (b.runs || []).map((r) => r.text || "").join("")).join("\n")) : ""; };
  $("wzMotto").value = secText("Motto");
  $("wzVision").value = secText("Vision");
  if (s.logoUrl) $("wzLogoPreview").src = s.logoUrl;
}

function renderWzStep2() {}
function renderWzStep3() {}

function renderWzStep4() {
  renderElectivesGrid("wzElectivesS1S2", "S1-S2");
  renderElectivesGrid("wzElectivesS3S4", "S3-S4");
  renderElectivesGrid("wzElectivesS5S6", "S5-S6");
}

function renderWzStep5() {
  const cur = S.terms.find((t) => t.isCurrent);
  if (cur) {
    $("wzTermName").value = cur.name || "";
    $("wzTermYear").value = cur.year || new Date().getFullYear();
    $("wzTermStart").value = cur.startDate || "";
    $("wzTermEnd").value = cur.endDate || "";
    $("wzTermCurrent").checked = true;
  } else {
    $("wzTermYear").value = new Date().getFullYear();
  }
}

function renderWzStep6() {
  renderAssignListForClass();
}

function renderWzStep7() {
  WZ.page.heroImages = (S.school && S.school.heroImages) || [];
  WZ.page.headTeacher = (S.school && S.school.headTeacher) || "";
  WZ.page.leaders = (S.school && S.school.leaders) || [];
  $("wzHeadTeacher").value = WZ.page.headTeacher;
  renderWzHeroGrid();
  renderWzLeaders();
}

function renderWzHeroGrid() {
  const el = $("wzHeroGrid");
  const imgs = WZ.page.heroImages || [];
  if (!imgs.length) { el.innerHTML = ""; return; }
  el.innerHTML = imgs.map((url, i) => `
    <div class="wz-img-card">
      <img src="${esc(url)}" alt="">
      <div class="wz-img-actions"><button class="btn btn-outline btn-sm" data-wz-del-hero="${i}" type="button"><i class="fa-solid fa-trash"></i></button></div>
    </div>
  `).join("");
  qa("[data-wz-del-hero]", el).forEach((b) => b.onclick = async () => {
    const i = parseInt(b.dataset.wzDelHero, 10);
    try {
      const updated = await api(`${W.profile}/school/id/${encodeURIComponent(S.schoolId)}/hero/${i}`, { method: "DELETE" });
      S.school = updated;
      WZ.page.heroImages = updated.heroImages || [];
      renderWzHeroGrid();
      toast("Removed", "success");
    } catch (err) { toast(err.message, "error"); }
  });
}

function renderWzLeaders() {
  const el = $("wzLeadersList");
  if (!WZ.page.leaders.length) { el.innerHTML = ""; return; }
  el.innerHTML = WZ.page.leaders.map((l, i) => `
    <div class="wz-leaders-row">
      <input type="text" data-leader-name="${i}" maxlength="200" placeholder="Name" value="${esc(l.name || "")}">
      <input type="text" data-leader-role="${i}" maxlength="100" placeholder="Role" value="${esc(l.role || "")}">
      <button data-leader-del="${i}" type="button" aria-label="Remove"><i class="fa-solid fa-trash"></i></button>
    </div>
  `).join("");
  qa("[data-leader-name]").forEach((inp) => inp.oninput = () => {
    const i = parseInt(inp.dataset.leaderName, 10);
    WZ.page.leaders[i].name = inp.value;
  });
  qa("[data-leader-role]").forEach((inp) => inp.oninput = () => {
    const i = parseInt(inp.dataset.leaderRole, 10);
    WZ.page.leaders[i].role = inp.value;
  });
  qa("[data-leader-del]").forEach((b) => b.onclick = () => {
    const i = parseInt(b.dataset.leaderDel, 10);
    WZ.page.leaders.splice(i, 1);
    renderWzLeaders();
  });
}

async function saveWzPage() {
  const btn = $("wzPageSave"); setBtn(btn, true);
  try {
    const payload = {
      headTeacher: $("wzHeadTeacher").value.trim(),
      leaders: WZ.page.leaders.filter((l) => l.name || l.role)
    };
    const updated = await api(`${W.profile}/school/id/${encodeURIComponent(S.schoolId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    S.school = updated;
    toast("School page saved", "success");
  } catch (err) { toast(err.message, "error", 6000); }
  finally { setBtn(btn, false); }
}

function subjectsForClass(cls) {
  const band = classBand(cls);
  if (!band) return [];
  if (band === "S5-S6") {
    const electives = WZ.electives["S5-S6"] || [];
    return [...CORE_S5_S6, ...A_LEVEL_SUBJECTS, ...electives];
  }
  const electives = WZ.electives[band] || [];
  return [...CORE_S1_S4, ...electives];
}

function renderAssignListForClass() {
  const cls = $("wzAssignClass").value;
  const el = $("wzAssignList");
  if (!cls) { el.innerHTML = `<p style="color:var(--muted);font-size:.86rem">Select a class to see its subjects.</p>`; return; }
  const subjects = [...new Set(subjectsForClass(cls))];
  const teachers = S.teachers || [];
  if (!subjects.length) {
    el.innerHTML = `<p style="color:var(--muted);font-size:.86rem">No subjects found for this class.</p>`;
    return;
  }
  const existing = {};
  teachers.forEach((t) => {
    (t.assignments || []).forEach((a) => {
      if (normaliseClass(a.class) === cls) {
        existing[a.subject] = t.uid;
      }
    });
  });
  WZ.assign[cls] = existing;
  el.innerHTML = subjects.map((sub) => `
    <div class="wz-assign-row">
      <label>${esc(sub)}</label>
      <select data-assign-sub="${esc(sub)}">
        <option value="">— Unassigned —</option>
        ${teachers.map((t) => `<option value="${esc(t.uid)}" ${existing[sub] === t.uid ? "selected" : ""}>${esc(t.email.split("@")[0])}</option>`).join("")}
      </select>
    </div>
  `).join("");
  qa("[data-assign-sub]", el).forEach((sel) => sel.onchange = () => {
    WZ.assign[cls][sel.dataset.assignSub] = sel.value;
  });
}

async function saveAssignments() {
  const cls = $("wzAssignClass").value;
  if (!cls) { toast("Pick a class first", "warn"); return; }
  const btn = $("wzAssignSave"); setBtn(btn, true);
  try {
    const assignMap = WZ.assign[cls] || {};
    const streams = ((S.structure.classes || []).find((c) => c.class === cls) || {}).streams || [];
    const streamList = streams.length ? streams : [""];

    const byTeacher = {};
    Object.entries(assignMap).forEach(([subject, uid]) => {
      if (!uid) return;
      if (!byTeacher[uid]) byTeacher[uid] = [];
      for (const st of streamList) {
        byTeacher[uid].push({ class: cls, stream: st, subject });
      }
    });

    for (const t of S.teachers) {
      const existing = (t.assignments || []).filter((a) => normaliseClass(a.class) !== cls);
      const newOnes = byTeacher[t.uid] || [];
      const merged = [...existing, ...newOnes];

      const key = (a) => `${a.class}|${a.stream || ""}|${a.subject}`;
      const a = merged.slice().sort((x, y) => key(x).localeCompare(key(y)));
      const b = (t.assignments || []).slice().sort((x, y) => key(x).localeCompare(key(y)));
      if (JSON.stringify(a) === JSON.stringify(b)) continue;

      await api(`${W.teachers}/schools/${encodeURIComponent(S.schoolId)}/teachers/${encodeURIComponent(t.uid)}/assignments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments: merged })
      });
    }

    toast("Assignments saved", "success");
    await loadInitial();
    renderAssignListForClass();
  } catch (err) { toast(err.message, "error", 6000); }
  finally { setBtn(btn, false); }
}

function computeWizardStatus() {
  const school = S.school || {};
  const hasName = !!(school.name && school.name.trim());

  let hasStudents = false;
  if (S.structure && Array.isArray(S.structure.classes)) {
    const total = S.structure.classes.reduce((n, c) => n + (typeof c.students === "number" ? c.students : 0), 0);
    if (total > 0) hasStudents = true;
    else hasStudents = S.structure.classes.some((c) => c.streams && c.streams.length);
  }
  const hasTeachers = (S.teachers || []).length > 0;
  const hasTerm = (S.terms || []).some((t) => t.isCurrent) || (S.terms || []).length > 0;
  const hasAssignments = (S.teachers || []).some((t) => (t.assignments || []).length > 0);
  const hasPage = !!((school.heroImages && school.heroImages.length) || (school.headTeacher && school.headTeacher.trim()));

  const required = { step2: hasStudents, step3: hasTeachers, step5: hasTerm, step6: true };
  const optional = { step1: hasName, step4: WZ.step4Done, step7: hasPage };

  let missedRequired = 0;
  if (!required.step2) missedRequired++;
  if (!required.step3) missedRequired++;
  if (!required.step5) missedRequired++;
  if (!required.step6) missedRequired++;

  const firstMissed = [];
  if (!required.step2) firstMissed.push(2);
  if (!required.step3) firstMissed.push(3);
  if (!required.step5) firstMissed.push(5);
  if (!required.step6) firstMissed.push(6);

  const allRequiredDone = missedRequired === 0;
  return { required, optional, missedRequired, firstMissed, allRequiredDone, hasPage };
}

function renderWzStep8() {
  const status = computeWizardStatus();
  const items = [
    { step: 1, label: "School identity", done: status.optional.step1, optional: true },
    { step: 2, label: "Student roster", done: status.required.step2, optional: false },
    { step: 3, label: "Teacher roster", done: status.required.step3, optional: false },
    { step: 4, label: "Subjects", done: status.optional.step4, optional: true },
    { step: 5, label: "Current term", done: status.required.step5, optional: false },
    { step: 7, label: "School page", done: status.optional.step7, optional: true }
  ];
  $("wzSummaryList").innerHTML = items.map((it) => `
    <li class="${it.done ? "done" : "missed"}">
      <i class="fa-solid ${it.done ? "fa-circle-check" : "fa-circle-minus"}"></i>
      <span class="wz-label">${esc(it.label)}${it.optional ? " <em style=\"color:var(--muted);font-weight:400\">(optional)</em>" : ""}</span>
      <span class="wz-state">${it.done ? "Done" : "Skipped"}</span>
    </li>
  `).join("");

  const optionalNote = $("wzOptionalNote");
  const optionalPending = items.filter((i) => i.optional && !i.done);
  if (optionalPending.length) {
    optionalNote.style.display = "";
    optionalNote.innerHTML = `<b>Add these to finish your school page:</b> ${optionalPending.map((i) => i.label).join(", ")}. You can do this anytime from the sidebar.`;
  } else {
    optionalNote.style.display = "none";
  }
}

function onWizardNext() {
  if (WZ.step === 8) { closeWizard(); return; }
  if (WZ.step === 4) {
    WZ.step4Done = true;
    try {
      localStorage.setItem(lsKey("step4"), "true");
      localStorage.setItem(lsKey("electives"), JSON.stringify(WZ.electives));
    } catch {}
  }
  if (WZ.step === 1) {
    saveWzStep1().then(() => goWizardStep(2)).catch(() => goWizardStep(2));
    return;
  }
  goWizardStep(WZ.step + 1);
}

async function saveWzStep1() {
  const name = $("wzName").value.trim();
  if (!name) return;
  const hdr = { "Content-Type": "application/json" };
  const base = `${W.profile}/school/id/${encodeURIComponent(S.schoolId)}`;
  const updated = await api(base, { method: "PATCH", headers: hdr, body: JSON.stringify({ name }) });
  S.school = { ...(S.school || {}), ...(updated || {}), name };
  for (const [title, text] of [["Motto", $("wzMotto").value.trim()], ["Vision", $("wzVision").value.trim()]]) {
    const existing = (S.school.sections || []).find((s) => s.title === title);
    if (!text && !existing) continue;
    const body = JSON.stringify({ title, blocks: text ? [{ type: "paragraph", runs: [{ text }] }] : [] });
    S.school = existing
      ? await api(`${base}/sections/${encodeURIComponent(existing.id)}`, { method: "PATCH", headers: hdr, body })
      : await api(`${base}/sections`, { method: "POST", headers: hdr, body });
  }
  paintHeader();
}

function closeWizard() {
  $("wizardOverlay").classList.remove("show");
  try { localStorage.setItem(lsKey("step"), String(WZ.step)); } catch {}
  renderDashboard();
}

function openWizard(step) {
  $("wizardOverlay").classList.add("show");
  goWizardStep(step || 1);
}

function maybeAutoOpenWizard() {
  let opened = false;
  try { opened = localStorage.getItem(lsKey("opened")) === "true"; } catch {}
  if (opened) return;
  try { localStorage.setItem(lsKey("opened"), "true"); } catch {}
  const status = computeWizardStatus();
  if (!status.allRequiredDone) {
    openWizard(1);
  }
}

// ====================== END WIZARD ======================

async function renderDashboard() {
  $("dashSub").textContent = S.school ? S.school.name : "School overview";
  $("dashStats").innerHTML = `
    <div class="stat"><div class="skel h20"></div><div class="skel h40"></div></div>
    <div class="stat"><div class="skel h20"></div><div class="skel h40"></div></div>
    <div class="stat"><div class="skel h20"></div><div class="skel h40"></div></div>
    <div class="stat"><div class="skel h20"></div><div class="skel h40"></div></div>`;

  const status = computeWizardStatus();
  const banner = $("wzDashBanner");
  if (!status.allRequiredDone) {
    const missed = status.missedRequired;
    banner.innerHTML = `
      <div class="wz-banner">
        <div class="wz-banner-text"><b>Setup not finished:</b> ${missed} step${missed > 1 ? "s" : ""} left.</div>
        <button class="btn btn-primary btn-sm" id="wzContinueBtn" type="button">Continue from step ${status.firstMissed[0] || 1}</button>
      </div>`;
    $("wzContinueBtn").onclick = () => openWizard(status.firstMissed[0] || 1);
  } else if (!status.optional.step7 && !status.optional.step4) {
    banner.innerHTML = `
      <div class="wz-banner" style="background:#F0F9F2;border-color:#C8E6C9;border-left-color:var(--green)">
        <div class="wz-banner-text" style="font-weight:500">All required steps are complete. <b>Add these to finish your school page:</b> subjects, school page details.</div>
        <button class="btn btn-outline btn-sm" id="wzContinueBtn" type="button">Continue setup</button>
      </div>`;
    $("wzContinueBtn").onclick = () => openWizard(4);
  } else if (!status.optional.step7) {
    banner.innerHTML = `
      <div class="wz-banner" style="background:#F0F9F2;border-color:#C8E6C9;border-left-color:var(--green)">
        <div class="wz-banner-text" style="font-weight:500">All required steps are complete. <b>Add school page details</b> to finish your public page.</div>
        <button class="btn btn-outline btn-sm" id="wzContinueBtn" type="button">Continue setup</button>
      </div>`;
    $("wzContinueBtn").onclick = () => openWizard(7);
  } else if (!status.optional.step4) {
    banner.innerHTML = `
      <div class="wz-banner" style="background:#F0F9F2;border-color:#C8E6C9;border-left-color:var(--green)">
        <div class="wz-banner-text" style="font-weight:500">All required steps are complete. <b>Tick electives</b> to complete your subjects list.</div>
        <button class="btn btn-outline btn-sm" id="wzContinueBtn" type="button">Continue setup</button>
      </div>`;
    $("wzContinueBtn").onclick = () => openWizard(4);
  } else {
    banner.innerHTML = "";
  }

  const curTerm = S.terms.find((t) => t.id === S.currentTermId);

  $("dashStats").innerHTML = `
    <div class="stat">
      <div class="label">Current Term</div>
      <div class="value sm">${esc(curTerm ? curTerm.name + (curTerm.year ? ", " + curTerm.year : "") : "—")}</div>
      <div class="sub">${curTerm && curTerm.startDate ? fmtDate(curTerm.startDate) + " → " + fmtDate(curTerm.endDate) : "No dates set"}</div>
    </div>
    <div class="stat green">
      <div class="label">Teachers</div>
      <div class="value">${S.teachers.length}</div>
      <div class="sub">${S.teachers.filter((t) => (t.assignments || []).length > 0).length} with assignments</div>
    </div>
    <div class="stat yellow">
      <div class="label">Classes</div>
      <div class="value">${CLASSES.length}</div>
      <div class="sub">S1 to S6</div>
    </div>
    <div class="stat ${S.scoring && S.scoring.mode === "cbc" ? "green" : ""}">
      <div class="label">Scoring Mode</div>
      <div class="value sm">${esc((S.scoring && S.scoring.mode) === "cbc" ? "CBC" : "Percentage")}</div>
      <div class="sub">${S.types.length} assessment types</div>
    </div>
  `;
  $("dashRefresh").onclick = async () => {
    await loadInitial(); paintHeader(); renderDashboard();
    toast("Refreshed", "success");
  };
}

function renderProfile() {
  const s = S.school || {};
  $("pfName").value = s.name || "";
  $("pfPhone").value = s.phone || "";
  $("pfEmail").value = s.email || "";
  $("pfLocation").value = s.location || "";
  const color = s.themeColor || "#3570BC";
  $("pfColor").value = color;
  $("pfColorText").value = color;
  qa("#colorPicker .color-swatch").forEach((sw) => sw.classList.toggle("active", sw.dataset.color === color));

  qa("#colorPicker .color-swatch").forEach((sw) => {
    sw.onclick = () => {
      const c = sw.dataset.color;
      $("pfColor").value = c;
      $("pfColorText").value = c;
      qa("#colorPicker .color-swatch").forEach((x) => x.classList.remove("active"));
      sw.classList.add("active");
    };
  });
  $("pfColor").oninput = (e) => {
    $("pfColorText").value = e.target.value;
    qa("#colorPicker .color-swatch").forEach((x) => x.classList.remove("active"));
  };
  $("pfColorText").oninput = (e) => {
    const v = e.target.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) $("pfColor").value = v;
  };

  $("profileForm").onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("pfSave"); setBtn(btn, true);
    try {
      const body = {
        name: $("pfName").value.trim(),
        phone: $("pfPhone").value.trim(),
        email: $("pfEmail").value.trim(),
        location: $("pfLocation").value.trim(),
        themeColor: $("pfColor").value.toLowerCase()
      };
      const updated = await api(`${W.profile}/school/id/${encodeURIComponent(S.schoolId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      S.school = updated; paintHeader();
      toast("Profile saved", "success");
    } catch (err) { toast(err.message, "error", 6000); }
    finally { setBtn(btn, false); }
  };

  renderSlugSection();
}

function renderSlugSection() {
  const el = $("slugSection");
  const current = S.school && S.school.slug;
  if (current) {
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:14px;border:1px solid var(--border);background:var(--light)">
        <i class="fa-solid fa-link" style="color:var(--primary);font-size:1.2rem"></i>
        <div style="flex:1;min-width:200px">
          <div style="font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:4px">Your school URL</div>
          <div style="font-weight:800;font-size:1rem">https://${esc(current)}.edutraceug.com</div>
          <div style="font-size:.8rem;color:var(--muted);margin-top:4px">This cannot be changed after it's set.</div>
        </div>
        <a href="https://${esc(current)}.edutraceug.com" target="_blank" rel="noopener" class="btn btn-outline btn-sm"><i class="fa-solid fa-arrow-up-right-from-square"></i> Visit</a>
      </div>`;
  } else {
    el.innerHTML = `
      <div class="field">
        <label for="slugInput">Choose your slug <span class="hint">lowercase, hyphens, 3-32 chars</span></label>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <input type="text" id="slugInput" placeholder="e.g. majet-secondary" maxlength="32" style="flex:1;min-width:200px;padding:11px 12px;border:2px solid var(--border);font-family:inherit;font-size:.9rem">
          <button class="btn btn-primary" id="slugSave" type="button"><span class="spinner"></span><span class="btn-label">Set slug</span></button>
        </div>
        <div class="err" id="slugErr" style="color:var(--red);font-size:.78rem;font-weight:600;margin-top:5px"></div>
      </div>`;
    $("slugSave").onclick = async () => {
      const v = $("slugInput").value.trim().toLowerCase();
      if (!/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(v)) {
        $("slugErr").textContent = "Must be lowercase alphanumeric with optional hyphens (3-32 chars).";
        return;
      }
      $("slugErr").textContent = "";
      const btn = $("slugSave"); setBtn(btn, true);
      try {
        const updated = await api(`${W.profile}/school/id/${encodeURIComponent(S.schoolId)}/slug`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: v })
        });
        S.school = updated;
        toast("Slug set successfully", "success");
        renderSlugSection();
      } catch (err) { $("slugErr").textContent = err.message; }
      finally { setBtn(btn, false); }
    };
  }
}

function renderAppearance() {
  if (S.school && S.school.logoUrl) $("logoPreview").src = S.school.logoUrl;

  setupDrop("logoDrop", "logoInput", async (file) => {
    if (file.size > 5 * 1024 * 1024) { toast("Logo too large (max 5 MB)", "error"); return; }
    const fd = new FormData(); fd.append("file", file);
    try {
      const token = await idToken();
      const res = await fetch(`${W.profile}/school/id/${encodeURIComponent(S.schoolId)}/logo`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Upload failed");
      const updated = await res.json();
      S.school = updated; $("logoPreview").src = updated.logoUrl;
      paintHeader();
      toast("Logo updated", "success");
    } catch (err) { toast(err.message, "error", 6000); }
  });

  setupDrop("heroDrop", "heroInput", async (file) => {
    if (file.size > 10 * 1024 * 1024) { toast("Hero image too large (max 10 MB)", "error"); return; }
    const fd = new FormData(); fd.append("file", file);
    try {
      const token = await idToken();
      const res = await fetch(`${W.profile}/school/id/${encodeURIComponent(S.schoolId)}/hero`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Upload failed");
      const updated = await res.json();
      S.school = updated; renderHeroGrid();
      toast("Hero image added", "success");
    } catch (err) { toast(err.message, "error", 6000); }
  });

  renderHeroGrid();
}

function renderHeroGrid() {
  const imgs = (S.school && S.school.heroImages) || [];
  $("heroCount").textContent = `${imgs.length} / 5`;
  if (!imgs.length) {
    $("heroGrid").innerHTML = `<div class="empty" style="grid-column:1/-1"><i class="fa-solid fa-images"></i><h3>No hero images yet</h3><p>Add a wide photo to make your school page stand out.</p></div>`;
    return;
  }
  $("heroGrid").innerHTML = imgs.map((url, i) => `
    <div class="img-card">
      <img src="${esc(url)}" alt="" loading="lazy">
      <div class="img-actions">
        <button class="btn btn-outline btn-sm" data-del-hero="${i}" type="button"><i class="fa-solid fa-trash"></i> Remove</button>
      </div>
    </div>
  `).join("");
  qa("[data-del-hero]").forEach((b) => b.onclick = async () => {
    const i = parseInt(b.dataset.delHero, 10);
    const ok = await confirmDialog("Remove hero image", "Remove this image from your school's hero slider?", "Remove");
    if (!ok) return;
    try {
      const updated = await api(`${W.profile}/school/id/${encodeURIComponent(S.schoolId)}/hero/${i}`, { method: "DELETE" });
      S.school = updated; renderHeroGrid();
      toast("Removed", "success");
    } catch (err) { toast(err.message, "error"); }
  });
}

function setupDrop(dropId, inputId, handler) {
  const drop = $(dropId), input = $(inputId);
  if (!drop || !input) return;
  drop.onclick = () => input.click();
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("dragover"); };
  drop.ondragleave = () => drop.classList.remove("dragover");
  drop.ondrop = (e) => {
    e.preventDefault(); drop.classList.remove("dragover");
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handler(f);
  };
  input.onchange = (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) handler(f);
    input.value = "";
  };
}

function renderContent() {
  const sections = (S.school && S.school.sections) || [];
  const list = $("sectionsList");
  if (!sections.length) {
    list.innerHTML = `<div class="empty"><i class="fa-solid fa-file-lines"></i><h3>No sections yet</h3><p>Add your first section — About Us, Admissions, Fees, Contact, anything.</p><button class="btn btn-primary btn-sm" id="emptyAddSection" type="button"><i class="fa-solid fa-plus"></i> Add section</button></div>`;
    $("emptyAddSection").onclick = openAddSection;
    return;
  }
  list.innerHTML = sections.map((sec) => `
    <div class="block-preview">
      <h4>${esc(sec.title)}</h4>
      <p>${sec.blocks ? sec.blocks.length + " block(s)" : "No blocks"}</p>
      <div class="block-edit-actions">
        <button class="btn btn-outline btn-sm" data-edit-sec="${esc(sec.id)}" type="button"><i class="fa-solid fa-pen"></i> Edit</button>
        <button class="btn btn-red btn-sm" data-del-sec="${esc(sec.id)}" type="button"><i class="fa-solid fa-trash"></i> Delete</button>
      </div>
    </div>
  `).join("");
  qa("[data-edit-sec]").forEach((b) => b.onclick = () => openEditSection(b.dataset.editSec));
  qa("[data-del-sec]").forEach((b) => b.onclick = async () => {
    const ok = await confirmDialog("Delete section", "This will remove it from your public page.", "Delete");
    if (!ok) return;
    try {
      const updated = await api(`${W.profile}/school/id/${encodeURIComponent(S.schoolId)}/sections/${encodeURIComponent(b.dataset.delSec)}`, { method: "DELETE" });
      S.school = updated; renderContent(); toast("Deleted", "success");
    } catch (err) { toast(err.message, "error"); }
  });
  $("addSectionBtn").onclick = openAddSection;
}

function openAddSection() {
  openModal({
    title: "Add section",
    body: `
      <div class="field"><label for="secTitle">Section title</label><input type="text" id="secTitle" maxlength="200" placeholder="e.g. About Us"></div>
      <div class="field"><label for="secBody">Content <span class="hint">plain text, one paragraph</span></label><textarea id="secBody" rows="6" maxlength="4000"></textarea></div>
    `,
    foot: `<button class="btn btn-outline" id="secCancel" type="button">Cancel</button><button class="btn btn-primary" id="secSave" type="button"><span class="spinner"></span><span class="btn-label">Save</span></button>`
  });
  $("secCancel").onclick = closeModal;
  $("secSave").onclick = async () => {
    const title = $("secTitle").value.trim();
    const body = $("secBody").value.trim();
    if (!title) { toast("Title required", "warn"); return; }
    const blocks = body ? [{ type: "paragraph", runs: [{ text: body }] }] : [];
    const btn = $("secSave"); setBtn(btn, true);
    try {
      const updated = await api(`${W.profile}/school/id/${encodeURIComponent(S.schoolId)}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, blocks })
      });
      S.school = updated; closeModal(); renderContent(); toast("Section added", "success");
    } catch (err) { toast(err.message, "error"); }
    finally { setBtn(btn, false); }
  };
}

function openEditSection(id) {
  const sec = ((S.school && S.school.sections) || []).find((s) => s.id === id);
  if (!sec) return;
  const text = (sec.blocks || []).map((b) => {
    if (b.type === "heading") return b.text || "";
    if (b.type === "paragraph") return (b.runs || []).map((r) => r.text || "").join("");
    if (b.type === "list") return (b.items || []).join("\n");
    return "";
  }).join("\n\n");
  openModal({
    title: "Edit section",
    body: `
      <div class="field"><label for="secTitle">Section title</label><input type="text" id="secTitle" maxlength="200" value="${esc(sec.title)}"></div>
      <div class="field"><label for="secBody">Content</label><textarea id="secBody" rows="6" maxlength="4000">${esc(text)}</textarea></div>
    `,
    foot: `<button class="btn btn-outline" id="secCancel" type="button">Cancel</button><button class="btn btn-primary" id="secSave" type="button"><span class="spinner"></span><span class="btn-label">Save</span></button>`
  });
  $("secCancel").onclick = closeModal;
  $("secSave").onclick = async () => {
    const title = $("secTitle").value.trim();
    const body = $("secBody").value.trim();
    if (!title) { toast("Title required", "warn"); return; }
    const blocks = body ? [{ type: "paragraph", runs: [{ text: body }] }] : [];
    const btn = $("secSave"); setBtn(btn, true);
    try {
      const updated = await api(`${W.profile}/school/id/${encodeURIComponent(S.schoolId)}/sections/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, blocks })
      });
      S.school = updated; closeModal(); renderContent(); toast("Updated", "success");
    } catch (err) { toast(err.message, "error"); }
    finally { setBtn(btn, false); }
  };
}

function renderRoster() {
  $("rsClass").innerHTML = `<option value="">Select class</option>` + CLASSES.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  let selectedFile = null;
  const fileInfo = $("rsFileInfo");
  const uploadBtn = $("rsUploadBtn");
  const clearBtn = $("rsClearBtn");
  const result = $("rsResult");

  $("rsType").onchange = () => {
    const t = $("rsType").value;
    $("rsClass").disabled = t === "teacher";
    if (t === "teacher") $("rsClass").value = "";
  };

  setupDrop("rsDrop", "rsInput", (file) => {
    const ok = /\.(xlsx|xls|xlsm|csv)$/i.test(file.name);
    if (!ok) { toast("Only .xlsx, .xls, .xlsm or .csv", "error"); return; }
    if (file.size > 25 * 1024 * 1024) { toast("Max 25 MB", "error"); return; }
    selectedFile = file;
    fileInfo.innerHTML = `<div class="file-pill"><i class="fa-solid fa-file-excel" style="color:var(--green)"></i> <b>${esc(file.name)}</b> <span style="color:var(--muted)">${fmtBytes(file.size)}</span></div>`;
    uploadBtn.disabled = false;
    clearBtn.disabled = false;
  });

  clearBtn.onclick = () => {
    selectedFile = null;
    fileInfo.innerHTML = "";
    uploadBtn.disabled = true;
    clearBtn.disabled = true;
    result.innerHTML = "";
  };

  uploadBtn.onclick = async () => {
    if (!selectedFile) return;
    const recordType = $("rsType").value;
    const fileClass = $("rsClass").value.trim();
    const fileStream = $("rsStream").value.trim();

    if (recordType === "student" && !fileClass) {
      toast("Class is required for student rosters", "warn"); return;
    }

    setBtn(uploadBtn, true);
    result.innerHTML = `<div class="card"><div class="card-body"><div class="skel h20 w50"></div><div class="skel h40"></div><div class="skel h40"></div></div></div>`;

    try {
      const token = await idToken();
      let offset = 0;
      let batchId = null;
      let allCreated = 0, allUpdated = 0, allUnchanged = 0;
      const allRejected = [];
      let processedRows = 0;

      while (true) {
        const fd = new FormData();
        fd.append("file", selectedFile);
        fd.append("schoolId", S.schoolId);
        fd.append("class", fileClass);
        fd.append("stream", fileStream);
        fd.append("recordType", recordType);
        if (batchId) fd.append("batchId", batchId);
        if (offset > 0) fd.append("offset", String(offset));

        const res = await fetch(`${W.roster}/upload-roster`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);

        batchId = data.batchId || batchId;
        allCreated += data.created || 0;
        allUpdated += data.updated || 0;
        allUnchanged += data.unchanged || 0;
        if (data.rejected) allRejected.push(...data.rejected);
        processedRows += data.processed || 0;

        result.innerHTML = `<div class="card"><div class="card-body">
          <div style="font-weight:800;margin-bottom:8px">Processing… ${processedRows} rows</div>
          <div class="skel h40"></div>
        </div></div>`;

        if (!data.remaining || data.remaining === 0) break;
        offset = data.nextOffset;
      }

      result.innerHTML = `
        <div class="card" style="border-left:4px solid var(--green)">
          <div class="card-body">
            <h3 style="font-size:1rem;font-weight:800;margin-bottom:12px"><i class="fa-solid fa-circle-check" style="color:var(--green)"></i> Upload complete</h3>
            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">
              <span class="pill green">${allCreated} created</span>
              <span class="pill blue">${allUpdated} updated</span>
              <span class="pill grey">${allUnchanged} unchanged</span>
              ${allRejected.length ? `<span class="pill red">${allRejected.length} rejected</span>` : ""}
            </div>
            ${allRejected.length ? `<details style="margin-top:8px"><summary style="cursor:pointer;font-weight:700;font-size:.85rem">Rejected rows (${allRejected.length})</summary><ul style="margin:10px 0 0 20px;list-style:disc;font-size:.82rem;color:var(--red);max-height:240px;overflow-y:auto">${allRejected.slice(0, 100).map((r) => `<li>Row ${r.row}: ${esc(r.reason)}</li>`).join("")}${allRejected.length > 100 ? `<li>…and ${allRejected.length - 100} more</li>` : ""}</ul></details>` : ""}
          </div>
        </div>`;
      toast("Roster uploaded", "success");
      await loadInitial();
      paintHeader();
      await loadRosterLists();
    } catch (err) {
      result.innerHTML = `<div class="card" style="border-left:4px solid var(--red)"><div class="card-body"><div style="font-weight:800;color:var(--red)"><i class="fa-solid fa-circle-xmark"></i> Upload failed</div><p style="font-size:.88rem;margin-top:6px">${esc(err.message)}</p></div></div>`;
    } finally {
      setBtn(uploadBtn, false);
    }
  };

  $("rsListRefresh").onclick = () => loadRosterLists();
  loadRosterLists();
}

async function loadRosterLists() {
  const el = $("rsLists");
  el.innerHTML = `<div class="skel h20 w50"></div><div class="skel h80"></div>`;
  try {
    const token = await idToken();
    const res = await fetch(`${W.roster}/roster/list`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ schoolId: S.schoolId })
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load roster");
    const data = await res.json();
    RS.rows = data.rows || [];
    RS.original.clear();
    RS.rows.forEach((r) => RS.original.set(r.id, { ...r }));
    renderRosterGroups();
  } catch (err) {
    el.innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><h3>Couldn't load roster</h3><p>${esc(err.message)}</p></div>`;
  }
}

function renderRosterGroups() {
  const el = $("rsLists");
  if (!RS.rows.length) {
    el.innerHTML = `<div class="empty"><i class="fa-solid fa-users-slash"></i><h3>No students yet</h3><p>Upload a student roster to get started.</p></div>`;
    return;
  }

  const byClass = {};
  RS.rows.forEach((r) => {
    const c = r.class || "Unknown";
    if (!byClass[c]) byClass[c] = [];
    byClass[c].push(r);
  });

  const classOrder = CLASSES.filter((c) => byClass[c]).concat(Object.keys(byClass).filter((c) => !CLASSES.includes(c)));

  el.innerHTML = classOrder.map((cls) => {
    const students = byClass[cls].sort((a, b) => (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName));
    const streamSet = [...new Set(students.map((s) => s.stream).filter(Boolean))];
    return `
      <details class="rs-group" data-class="${esc(cls)}">
        <summary>
          <span class="rs-title">${esc(cls)}</span>
          ${streamSet.length ? streamSet.map((s) => `<span class="pill blue">${esc(s)}</span>`).join("") : ""}
          <span class="pill grey">${students.length}</span>
        </summary>
        <div class="table-wrap">
          <table class="tbl rs-tbl">
            <thead><tr>
              <th>Student ID</th><th>First name</th><th>Last name</th>
              <th>Class</th><th>Stream</th><th>Gender</th><th>Subjects</th><th>Extra</th><th></th>
            </tr></thead>
            <tbody>
              ${students.map((r) => rosterRowHtml(r)).join("")}
            </tbody>
          </table>
        </div>
        <div class="rs-foot">
          <span class="rs-dirty" data-dirty>No unsaved changes</span>
          <button class="btn btn-outline btn-sm" data-revert type="button">Revert all</button>
          <button class="btn btn-green btn-sm" data-save type="button"><span class="spinner"></span><span class="btn-label">Save changes</span></button>
        </div>
      </details>
    `;
  }).join("");

  // Wire up editable inputs and action buttons
  qa(".rs-group").forEach((group) => {
    const cls = group.dataset.class;
    const saveBtn = q("[data-save]", group);
    const revertBtn = q("[data-revert]", group);
    const dirtyLabel = q("[data-dirty]", group);
    const inputs = qa(".rs-in", group);

    const updateDirty = () => {
      let n = 0;
      inputs.forEach((inp) => {
        const tr = inp.closest("tr");
        const id = tr.dataset.id;
        const field = inp.dataset.field;
        const orig = RS.original.get(id);
        if (!orig) return;
        const dirty = String(inp.value || "") !== String(orig[field] || "");
        tr.classList.toggle("dirty", dirty);
        if (dirty) n++;
      });
      dirtyLabel.textContent = n ? `${n} unsaved change${n > 1 ? "s" : ""}` : "No unsaved changes";
      saveBtn.disabled = n === 0;
      revertBtn.disabled = n === 0;
    };

    inputs.forEach((inp) => inp.addEventListener("input", updateDirty));
    updateDirty();

    saveBtn.onclick = async () => {
      const token = await idToken();
      const byId = {};
      inputs.forEach((inp) => {
        const tr = inp.closest("tr");
        const id = tr.dataset.id;
        if (!byId[id]) byId[id] = { id, fields: {} };
        byId[id].fields[inp.dataset.field] = inp.value;
      });

      setBtn(saveBtn, true);
      try {
        for (const { id, fields } of Object.values(byId)) {
          const orig = RS.original.get(id);
          if (!orig) continue;
          const dirty = Object.entries(fields).some(([k, v]) => String(v || "") !== String(orig[k] || ""));
          if (!dirty) continue;
          const res = await fetch(`${W.roster}/roster/update`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ schoolId: S.schoolId, id, fields })
          });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Update failed");
        }
        toast("Roster saved", "success");
        await loadRosterLists();
      } catch (err) {
        toast(err.message, "error", 6000);
      } finally {
        setBtn(saveBtn, false);
      }
    };

    revertBtn.onclick = () => {
      inputs.forEach((inp) => {
        const tr = inp.closest("tr");
        const id = tr.dataset.id;
        const orig = RS.original.get(id);
        if (orig) inp.value = orig[inp.dataset.field] || "";
      });
      updateDirty();
    };
  });

  // Delete buttons
  qa("[data-del-student]").forEach((b) => {
    b.onclick = async () => {
      const id = b.dataset.delStudent;
      const row = RS.rows.find((r) => r.id === id);
      if (!row) return;
      const ok = await confirmDialog("Remove student", `Remove ${row.firstName} ${row.lastName} from the roster? This cannot be undone.`, "Remove");
      if (!ok) return;
      try {
        const token = await idToken();
        const res = await fetch(`${W.roster}/roster/delete`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ schoolId: S.schoolId, id })
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Delete failed");
        toast("Student removed", "success");
        await loadRosterLists();
      } catch (err) { toast(err.message, "error"); }
    };
  });
}

function rosterRowHtml(r) {
  const subjectText = Array.isArray(r.subjects) ? r.subjects.join(", ") : "";
  return `
    <tr data-id="${esc(r.id)}">
      <td><input class="rs-in" data-field="studentId" value="${esc(r.studentId || "")}" maxlength="40"></td>
      <td><input class="rs-in" data-field="firstName" value="${esc(r.firstName || "")}" maxlength="80"></td>
      <td><input class="rs-in" data-field="lastName" value="${esc(r.lastName || "")}" maxlength="80"></td>
      <td><input class="rs-in" data-field="class" value="${esc(r.class || "")}" maxlength="30"></td>
      <td><input class="rs-in" data-field="stream" value="${esc(r.stream || "")}" maxlength="30"></td>
      <td>
        <select class="rs-in" data-field="gender">
          <option value="" ${!r.gender ? "selected" : ""}>—</option>
          <option value="Male" ${r.gender === "Male" ? "selected" : ""}>Male</option>
          <option value="Female" ${r.gender === "Female" ? "selected" : ""}>Female</option>
        </select>
      </td>
      <td><input class="rs-in" data-field="subjectsText" value="${esc(subjectText)}" maxlength="500" placeholder="comma separated"></td>
      <td><input class="rs-in" data-field="extraDetail" value="${esc(r.extraDetail || "")}" maxlength="200"></td>
      <td class="actions"><button class="btn btn-red btn-sm" data-del-student="${esc(r.id)}" type="button"><i class="fa-solid fa-trash"></i></button></td>
    </tr>
  `;
}

async function renderTeachers() {
  const list = $("teachersList");
  list.innerHTML = `<div class="card-body"><div class="skel h20 w50"></div><div class="skel h40"></div><div class="skel h40"></div></div>`;
  try {
    const data = await api(`${W.teachers}/schools/${encodeURIComponent(S.schoolId)}/teachers`);
    S.teachers = data.teachers || [];
    if (!S.teachers.length) {
      list.innerHTML = `<div class="empty"><i class="fa-solid fa-user-tie"></i><h3>No teachers yet</h3><p>Upload your teacher roster first, then they can sign up.</p><button class="btn btn-primary btn-sm" data-goto="roster" type="button"><i class="fa-solid fa-upload"></i> Upload roster</button></div>`;
      qa("[data-goto]", list).forEach((b) => b.onclick = () => showView(b.dataset.goto));
      return;
    }
    list.innerHTML = `
      <div class="table-wrap">
        <table class="tbl">
          <thead><tr>
            <th>Teacher</th><th>Assignments</th><th>Class Teacher</th><th>Role</th><th>Permissions</th><th></th>
          </tr></thead>
          <tbody>
            ${S.teachers.map((t) => `
              <tr data-uid="${esc(t.uid)}">
                <td>
                  <div style="font-weight:700">${esc(t.email.split("@")[0])}</div>
                  <div style="font-size:.78rem;color:var(--muted)">${esc(t.email)}</div>
                </td>
                <td>${(t.assignments || []).length ? `<span class="pill blue">${(t.assignments || []).length}</span>` : `<span class="pill grey">none</span>`}</td>
                <td>${t.classTeacherOf ? `<span class="pill green">${esc(t.classTeacherOf.class)}${t.classTeacherOf.stream ? " " + esc(t.classTeacherOf.stream) : ""}</span>` : `<span class="pill grey">—</span>`}</td>
                <td>${t.isDoS ? `<span class="pill yellow">DoS</span> ` : ""}${t.isBursar ? `<span class="pill yellow">Bursar</span>` : ""}${!t.isDoS && !t.isBursar ? `<span class="pill grey">—</span>` : ""}</td>
                <td>
                  ${t.permissions.canEnterMarks ? `<span class="pill green" title="Can enter marks"><i class="fa-solid fa-pen"></i></span>` : ""}
                  ${t.permissions.canUploadHoliday ? `<span class="pill blue" title="Can upload holiday work"><i class="fa-solid fa-umbrella-beach"></i></span>` : ""}
                  ${t.permissions.canReadParentReports ? `<span class="pill yellow" title="Can read parent reports"><i class="fa-solid fa-eye"></i></span>` : ""}
                </td>
                <td class="actions">
                  <button class="btn btn-outline btn-sm" data-act="edit" data-uid="${esc(t.uid)}" type="button"><i class="fa-solid fa-pen"></i></button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>`;
    qa("[data-act=edit]", list).forEach((b) => b.onclick = () => openTeacherEdit(b.dataset.uid));
    $("teachersRefresh").onclick = renderTeachers;
  } catch (err) {
    list.innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><h3>Couldn't load teachers</h3><p>${esc(err.message)}</p></div>`;
  }
}

function openTeacherEdit(uid) {
  const t = S.teachers.find((x) => x.uid === uid);
  if (!t) return;

  const classOptionsHtml = CLASSES.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");

  openModal({
    title: t.email.split("@")[0],
    wide: "wide",
    body: `
      <div class="grid2">
        <div style="display:none">
          <h3 style="font-size:.8rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:10px">Assignments</h3>
          <div id="assignList" style="max-height:300px;overflow-y:auto;border:1px solid var(--border);padding:10px"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:6px;margin-top:10px">
            <select id="asClass" style="padding:8px;border:2px solid var(--border);font-size:.82rem"><option value="">Class</option>${classOptionsHtml}</select>
            <select id="asStream" style="padding:8px;border:2px solid var(--border);font-size:.82rem"><option value="">Stream</option></select>
            <select id="asSubject" style="padding:8px;border:2px solid var(--border);font-size:.82rem"><option value="">Subject</option></select>
            <button class="btn btn-primary btn-sm" id="addAssign" type="button"><i class="fa-solid fa-plus"></i></button>
          </div>
        </div>
        <div>
          <h3 style="font-size:.8rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:10px">Class teacher</h3>
          <select id="ctClass" style="width:100%;padding:8px;border:2px solid var(--border);font-size:.85rem;margin-bottom:8px"><option value="">Not a class teacher</option>${classOptionsHtml}</select>
          <select id="ctStream" style="width:100%;padding:8px;border:2px solid var(--border);font-size:.85rem;margin-bottom:14px"><option value="">Stream (optional)</option></select>

          <h3 style="font-size:.8rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:10px">Roles</h3>
          <label class="check"><input type="checkbox" id="isDos" ${t.isDoS ? "checked" : ""}><span>Director of Studies (DoS)</span></label>
          <label class="check"><input type="checkbox" id="isBursar" ${t.isBursar ? "checked" : ""}><span>Bursar</span></label>

          <h3 style="font-size:.8rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin:14px 0 10px">Permissions</h3>
          <label class="check"><input type="checkbox" id="canMarks" ${t.permissions.canEnterMarks ? "checked" : ""}><span>Enter marks</span></label>
          <label class="check"><input type="checkbox" id="canHoliday" ${t.permissions.canUploadHoliday ? "checked" : ""}><span>Upload holiday work</span></label>
          <label class="check"><input type="checkbox" id="canParent" ${t.permissions.canReadParentReports ? "checked" : ""}><span>Read parent reports</span></label>
        </div>
      </div>
    `,
    foot: `<button class="btn btn-outline" id="teCancel" type="button">Close</button><button class="btn btn-primary" id="teSave" type="button"><span class="spinner"></span><span class="btn-label">Save</span></button>`
  });

  let assignments = [...(t.assignments || [])];
  let classTeacherOf = t.classTeacherOf ? { ...t.classTeacherOf } : null;

  function renderAssignList() {
    const list = $("assignList");
    if (!list) return;
    if (!assignments.length) {
      list.innerHTML = `<div style="color:var(--muted);font-size:.85rem;text-align:center;padding:20px">No assignments yet</div>`;
      return;
    }
    list.innerHTML = assignments.map((a, i) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:.85rem">
        <span><b>${esc(a.subject)}</b> — ${esc(a.class)}${a.stream ? " " + esc(a.stream) : ""}</span>
        <button class="btn btn-red btn-sm" data-rm="${i}" type="button"><i class="fa-solid fa-trash"></i></button>
      </div>
    `).join("");
    qa("[data-rm]", list).forEach((b) => b.onclick = () => {
      assignments.splice(parseInt(b.dataset.rm, 10), 1);
      renderAssignList();
    });
  }
  renderAssignList();

  $("asClass").onchange = () => {
    const cls = $("asClass").value;
    const streamSel = $("asStream");
    const subjSel = $("asSubject");
    streamSel.innerHTML = `<option value="">Stream</option>`;
    subjSel.innerHTML = `<option value="">Subject</option>`;
    if (cls) {
      const streams = (S.structure.classes.find((c) => c.class === cls) || {}).streams || [];
      streams.forEach((s) => streamSel.insertAdjacentHTML("beforeend", `<option value="${esc(s)}">${esc(s)}</option>`));
      const subjects = [...new Set(subjectsForClass(cls))];
      subjects.forEach((s) => subjSel.insertAdjacentHTML("beforeend", `<option value="${esc(s)}">${esc(s)}</option>`));
    }
  };

  $("addAssign").onclick = () => {
    const cls = $("asClass").value;
    const stream = $("asStream").value;
    const subject = $("asSubject").value;
    if (!cls || !subject) { toast("Pick class and subject", "warn"); return; }
    if (assignments.some((a) => a.class === cls && (a.stream || "") === stream && a.subject === subject)) {
      toast("Already assigned", "warn"); return;
    }
    assignments.push({ class: cls, stream, subject });
    renderAssignList();
  };

  if (classTeacherOf) {
    $("ctClass").value = classTeacherOf.class;
    $("ctClass").dispatchEvent(new Event("change"));
    setTimeout(() => { if (classTeacherOf.stream) $("ctStream").value = classTeacherOf.stream; }, 0);
  }
  $("ctClass").onchange = () => {
    const cls = $("ctClass").value;
    const s = $("ctStream");
    s.innerHTML = `<option value="">Stream (optional)</option>`;
    if (cls) {
      const streams = (S.structure.classes.find((c) => c.class === cls) || {}).streams || [];
      streams.forEach((x) => s.insertAdjacentHTML("beforeend", `<option value="${esc(x)}">${esc(x)}</option>`));
    }
  };
  $("ctClass").dispatchEvent(new Event("change"));
  if (classTeacherOf && classTeacherOf.stream) {
    setTimeout(() => { $("ctStream").value = classTeacherOf.stream; }, 50);
  }

  $("teCancel").onclick = closeModal;

  $("teSave").onclick = async () => {
    const btn = $("teSave"); setBtn(btn, true);
    try {
      const ctClass = $("ctClass").value;
      const ctStream = $("ctStream").value;
      const newCt = ctClass ? { class: ctClass, stream: ctStream } : null;

      await api(`${W.teachers}/schools/${encodeURIComponent(S.schoolId)}/teachers/${encodeURIComponent(uid)}/assignments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments })
      });

      await api(`${W.teachers}/schools/${encodeURIComponent(S.schoolId)}/teachers/${encodeURIComponent(uid)}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isDoS: $("isDos").checked,
          isBursar: $("isBursar").checked,
          permissions: {
            canEnterMarks: $("canMarks").checked,
            canUploadHoliday: $("canHoliday").checked,
            canReadParentReports: $("canParent").checked
          }
        })
      });

      const ctChanged =
        (newCt === null && classTeacherOf !== null) ||
        (newCt !== null && (!classTeacherOf || classTeacherOf.class !== newCt.class || (classTeacherOf.stream || "") !== (newCt.stream || "")));
      if (ctChanged) {
        await api(`${W.teachers}/schools/${encodeURIComponent(S.schoolId)}/teachers/${encodeURIComponent(uid)}/class-teacher`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classTeacherOf: newCt })
        });
      }

      closeModal();
      toast("Saved", "success");
      renderTeachers();
    } catch (err) { toast(err.message, "error", 6000); }
    finally { setBtn(btn, false); }
  };
}

async function renderStructure() {
  const c = $("structContent");
  c.innerHTML = `<div class="skel h20 w50"></div><div class="skel h80"></div><div class="skel h80"></div>`;
  try {
    const data = await api(`${W.teachers}/schools/${encodeURIComponent(S.schoolId)}/structure`);
    const routeMap = {};
    (data.classes || []).forEach((cl) => {
      const canon = normaliseClass(cl.class);
      if (canon) routeMap[canon] = (routeMap[canon] || []).concat(cl.streams || []);
    });
    const merged = CLASSES.map((cl) => ({
      class: cl,
      streams: [...new Set(routeMap[cl] || [])],
      subjects: subjectsForClass(cl)
    }));
    S.structure.classes = merged;

    c.innerHTML = merged.map((cl) => `
      <div style="margin-bottom:16px;border:1px solid var(--border);background:#fff">
        <div style="padding:12px 16px;background:var(--light);border-bottom:1px solid var(--border);font-weight:800">${esc(cl.class)}</div>
        <div style="padding:14px 16px">
          <div style="margin-bottom:10px"><b style="font-size:.75rem;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">Streams:</b> ${cl.streams.length ? cl.streams.map((s) => `<span class="pill blue" style="margin-left:6px">${esc(s)}</span>`).join("") : `<span class="pill grey" style="margin-left:6px">none</span>`}</div>
          <div><b style="font-size:.75rem;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">Subjects:</b> ${cl.subjects.length ? cl.subjects.map((s) => `<span class="pill green" style="margin-left:6px">${esc(s)}</span>`).join("") : `<span class="pill grey" style="margin-left:6px">none</span>`}</div>
        </div>
      </div>
    `).join("");
    $("structRefresh").onclick = renderStructure;
  } catch (err) {
    c.innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><h3>Couldn't load structure</h3><p>${esc(err.message)}</p></div>`;
  }
}

async function renderTerms() {
  const list = $("termsList");
  list.innerHTML = `<div class="card-body"><div class="skel h20 w50"></div><div class="skel h40"></div><div class="skel h40"></div></div>`;
  try {
    const data = await api(`${W.teachers}/schools/${encodeURIComponent(S.schoolId)}/terms`);
    S.terms = data.terms || [];
    if (!S.terms.length) {
      list.innerHTML = `<div class="empty"><i class="fa-solid fa-calendar-days"></i><h3>No terms yet</h3><p>Create your first term to start recording marks.</p></div>`;
      $("addTermBtn").onclick = openAddTerm;
      return;
    }
    list.innerHTML = `
      <div class="table-wrap">
        <table class="tbl">
          <thead><tr><th>Name</th><th>Year</th><th>Dates</th><th>Status</th><th>Weights</th><th></th></tr></thead>
          <tbody>
            ${S.terms.map((t) => `
              <tr>
                <td><b>${esc(t.name)}</b></td>
                <td>${t.year || "—"}</td>
                <td>${t.startDate ? fmtDate(t.startDate) + " → " + fmtDate(t.endDate) : "—"}</td>
                <td>${t.isCurrent ? `<span class="pill green">Current</span>` : `<span class="pill grey">—</span>`}</td>
                <td>${t.weightsSet ? `<span class="pill blue">${t.weights.length} types</span>` : `<span class="pill grey">not set</span>`}</td>
                <td class="actions">
                  <button class="btn btn-outline btn-sm" data-edit-term="${esc(t.id)}" type="button"><i class="fa-solid fa-pen"></i></button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>`;
    qa("[data-edit-term]").forEach((b) => b.onclick = () => openEditTerm(b.dataset.editTerm));
    $("addTermBtn").onclick = openAddTerm;
  } catch (err) {
    list.innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><h3>Couldn't load terms</h3><p>${esc(err.message)}</p></div>`;
  }
}

function openAddTerm() {
  openModal({
    title: "Add term",
    body: `
      <div class="grid2">
        <div class="field"><label for="tName">Term name</label><input type="text" id="tName" maxlength="60" placeholder="e.g. Term 1"></div>
        <div class="field"><label for="tYear">Year</label><input type="number" id="tYear" min="2000" max="2100" value="${new Date().getFullYear()}"></div>
        <div class="field"><label for="tStart">Start date</label><input type="date" id="tStart"></div>
        <div class="field"><label for="tEnd">End date</label><input type="date" id="tEnd"></div>
      </div>
      <label class="check"><input type="checkbox" id="tCurrent"><span>Set as current term</span></label>
    `,
    foot: `<button class="btn btn-outline" id="tCancel" type="button">Cancel</button><button class="btn btn-primary" id="tSave" type="button"><span class="spinner"></span><span class="btn-label">Create</span></button>`
  });
  $("tCancel").onclick = closeModal;
  $("tSave").onclick = async () => {
    const btn = $("tSave"); setBtn(btn, true);
    try {
      await api(`${W.teachers}/schools/${encodeURIComponent(S.schoolId)}/terms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: $("tName").value.trim(),
          year: parseInt($("tYear").value, 10),
          startDate: $("tStart").value,
          endDate: $("tEnd").value,
          isCurrent: $("tCurrent").checked
        })
      });
      closeModal(); await loadInitial(); renderTerms(); toast("Term created", "success");
    } catch (err) { toast(err.message, "error", 6000); }
    finally { setBtn(btn, false); }
  };
}

function openEditTerm(id) {
  const t = S.terms.find((x) => x.id === id);
  if (!t) return;

  openModal({
    title: "Edit term",
    wide: "wide",
    body: `
      <div class="tabs">
        <div class="tab active" data-tab="meta">Details</div>
        <div class="tab" data-tab="weights">Weights</div>
      </div>
      <div data-panel="meta" style="padding-top:16px">
        <div class="grid2">
          <div class="field"><label for="tName">Term name</label><input type="text" id="tName" maxlength="60" value="${esc(t.name)}"></div>
          <div class="field"><label for="tYear">Year</label><input type="number" id="tYear" min="2000" max="2100" value="${t.year || ""}"></div>
          <div class="field"><label for="tStart">Start date</label><input type="date" id="tStart" value="${esc(t.startDate || "")}"></div>
          <div class="field"><label for="tEnd">End date</label><input type="date" id="tEnd" value="${esc(t.endDate || "")}"></div>
        </div>
        <label class="check"><input type="checkbox" id="tCurrent" ${t.isCurrent ? "checked" : ""}><span>Set as current term</span></label>
      </div>
      <div data-panel="weights" style="padding-top:16px;display:none">
        <p style="font-size:.85rem;color:var(--muted);margin-bottom:12px">Assign a weight (%) to each assessment type. Weights must add up to 100.</p>
        <div id="weightsList"></div>
        <div style="margin-top:10px;font-weight:700;font-size:.9rem" id="weightsTotal">Total: 0</div>
      </div>
    `,
    foot: `<button class="btn btn-outline" id="tCancel" type="button">Cancel</button><button class="btn btn-primary" id="tSave" type="button"><span class="spinner"></span><span class="btn-label">Save</span></button>`
  });

  qa("[data-tab]").forEach((tab) => tab.onclick = () => {
    qa("[data-tab]").forEach((x) => x.classList.toggle("active", x === tab));
    qa("[data-panel]").forEach((p) => p.style.display = p.dataset.panel === tab.dataset.tab ? "" : "none");
  });

  const weightMap = new Map((t.weights || []).map((w) => [w.typeId, w.weight]));
  function renderWeights() {
    const active = S.types.filter((x) => !x.archived);
    $("weightsList").innerHTML = active.map((x) => `
      <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border)">
        <span style="flex:1;font-weight:600">${esc(x.name)}</span>
        <input type="number" data-wid="${esc(x.id)}" min="0" max="100" step="0.5" value="${weightMap.get(x.id) || 0}" style="width:90px;padding:6px 8px;border:2px solid var(--border);font-size:.85rem;text-align:right">
        <span style="color:var(--muted);font-size:.8rem">%</span>
      </div>
    `).join("");
    qa("[data-wid]").forEach((i) => i.oninput = updateTotal);
    updateTotal();
  }
  function updateTotal() {
    let total = 0;
    qa("[data-wid]").forEach((i) => total += parseFloat(i.value) || 0);
    $("weightsTotal").textContent = `Total: ${total.toFixed(1)}`;
    $("weightsTotal").style.color = Math.abs(total - 100) < 0.01 ? "var(--green)" : "var(--red)";
  }
  renderWeights();

  $("tCancel").onclick = closeModal;
  $("tSave").onclick = async () => {
    const btn = $("tSave"); setBtn(btn, true);
    try {
      await api(`${W.teachers}/schools/${encodeURIComponent(S.schoolId)}/terms/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: $("tName").value.trim(),
          year: parseInt($("tYear").value, 10),
          startDate: $("tStart").value,
          endDate: $("tEnd").value,
          isCurrent: $("tCurrent").checked
        })
      });
      const weights = [];
      qa("[data-wid]").forEach((i) => {
        const w = parseFloat(i.value) || 0;
        if (w > 0) weights.push({ typeId: i.dataset.wid, weight: w });
      });
      await api(`${W.teachers}/schools/${encodeURIComponent(S.schoolId)}/terms/${encodeURIComponent(id)}/weights`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weights })
      });
      closeModal(); await loadInitial(); renderTerms(); toast("Term saved", "success");
    } catch (err) { toast(err.message, "error", 6000); }
    finally { setBtn(btn, false); }
  };
}

async function renderTypes() {
  const list = $("typesList");
  list.innerHTML = `<div class="card-body"><div class="skel h20 w50"></div><div class="skel h40"></div></div>`;
  try {
    const data = await api(`${W.teachers}/schools/${encodeURIComponent(S.schoolId)}/assessment-types?includeArchived=true`);
    S.types = data.assessmentTypes || [];
    list.innerHTML = `
      <div class="table-wrap">
        <table class="tbl">
          <thead><tr><th>Name</th><th>Order</th><th>Type</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${S.types.map((t) => `
              <tr>
                <td><b>${esc(t.name)}</b></td>
                <td>${t.order}</td>
                <td>${t.seed ? `<span class="pill blue">NCDC default</span>` : `<span class="pill grey">custom</span>`}</td>
                <td>${t.archived ? `<span class="pill red">archived</span>` : `<span class="pill green">active</span>`}</td>
                <td class="actions">
                  ${t.archived
                    ? `<span style="color:var(--muted);font-size:.78rem">no actions</span>`
                    : `<button class="btn btn-outline btn-sm" data-edit-type="${esc(t.id)}" type="button"><i class="fa-solid fa-pen"></i></button>
                       <button class="btn btn-red btn-sm" data-arch-type="${esc(t.id)}" type="button"><i class="fa-solid fa-box-archive"></i></button>`}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>`;
    qa("[data-edit-type]").forEach((b) => b.onclick = () => openTypeEdit(b.dataset.editType));
    qa("[data-arch-type]").forEach((b) => b.onclick = () => archiveType(b.dataset.archType));
    $("addTypeBtn").onclick = openAddType;
  } catch (err) {
    list.innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><h3>Couldn't load assessment types</h3><p>${esc(err.message)}</p></div>`;
  }
}

function openAddType() {
  openModal({
    title: "Add assessment type",
    body: `<div class="field"><label for="tyName">Name</label><input type="text" id="tyName" maxlength="40" placeholder="e.g. Projects"></div>`,
    foot: `<button class="btn btn-outline" id="tyCancel" type="button">Cancel</button><button class="btn btn-primary" id="tySave" type="button"><span class="spinner"></span><span class="btn-label">Create</span></button>`
  });
  $("tyCancel").onclick = closeModal;
  $("tySave").onclick = async () => {
    const btn = $("tySave"); setBtn(btn, true);
    try {
      await api(`${W.teachers}/schools/${encodeURIComponent(S.schoolId)}/assessment-types`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: $("tyName").value.trim() })
      });
      closeModal(); renderTypes(); toast("Type added", "success");
    } catch (err) { toast(err.message, "error"); }
    finally { setBtn(btn, false); }
  };
}

function openTypeEdit(id) {
  const t = S.types.find((x) => x.id === id);
  if (!t) return;
  openModal({
    title: "Edit assessment type",
    body: `
      <div class="field"><label for="tyName">Name</label><input type="text" id="tyName" maxlength="40" value="${esc(t.name)}"></div>
      <div class="field"><label for="tyOrder">Order</label><input type="number" id="tyOrder" min="0" max="10000" value="${t.order}"></div>
    `,
    foot: `<button class="btn btn-outline" id="tyCancel" type="button">Cancel</button><button class="btn btn-primary" id="tySave" type="button"><span class="spinner"></span><span class="btn-label">Save</span></button>`
  });
  $("tyCancel").onclick = closeModal;
  $("tySave").onclick = async () => {
    const btn = $("tySave"); setBtn(btn, true);
    try {
      await api(`${W.teachers}/schools/${encodeURIComponent(S.schoolId)}/assessment-types/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: $("tyName").value.trim(), order: parseInt($("tyOrder").value, 10) })
      });
      closeModal(); renderTypes(); toast("Updated", "success");
    } catch (err) { toast(err.message, "error"); }
    finally { setBtn(btn, false); }
  };
}

async function archiveType(id) {
  const ok = await confirmDialog("Archive assessment type", "It will be hidden from new marks. Existing marks are kept.", "Archive");
  if (!ok) return;
  try {
    await api(`${W.teachers}/schools/${encodeURIComponent(S.schoolId)}/assessment-types/${encodeURIComponent(id)}`, { method: "DELETE" });
    renderTypes(); toast("Archived", "success");
  } catch (err) { toast(err.message, "error"); }
}

function renderScoring() {
  const mode = (S.scoring && S.scoring.mode) || "percentage";
  qa('input[name="scoringMode"]').forEach((r) => r.checked = r.value === mode);
  const cbcLevels = (S.scoring && S.scoring.cbcLevels) || [];
  const wrap = $("cbcLevelsWrap");
  wrap.style.display = mode === "cbc" ? "" : "none";

  qa('input[name="scoringMode"]').forEach((r) => r.onchange = () => {
    wrap.style.display = r.value === "cbc" && r.checked ? "" : "none";
  });

  function renderCbcLevels(levels) {
    $("cbcLevelsList").innerHTML = levels.map((l, i) => `
      <div style="display:grid;grid-template-columns:60px 1fr 1fr auto;gap:8px;margin-bottom:8px">
        <input type="number" data-lvl="level" min="1" max="10" value="${l.level}" style="padding:8px;border:2px solid var(--border);font-size:.85rem">
        <input type="text" data-lvl="label" maxlength="40" value="${esc(l.label)}" placeholder="Label" style="padding:8px;border:2px solid var(--border);font-size:.85rem">
        <input type="text" data-lvl="descriptor" maxlength="200" value="${esc(l.descriptor || "")}" placeholder="Descriptor (optional)" style="padding:8px;border:2px solid var(--border);font-size:.85rem">
        <button class="btn btn-red btn-sm" data-rm-lvl="${i}" type="button"><i class="fa-solid fa-trash"></i></button>
      </div>
    `).join("");
    qa("[data-rm-lvl]").forEach((b) => b.onclick = () => {
      const idx = parseInt(b.dataset.rmLvl, 10);
      const list = [...qa("[data-lvl=level]")].map((el, i) => ({
        level: parseInt(el.value, 10),
        label: qa("[data-lvl=label]")[i].value,
        descriptor: qa("[data-lvl=descriptor]")[i].value
      }));
      list.splice(idx, 1);
      renderCbcLevels(list);
    });
  }
  renderCbcLevels(cbcLevels.length ? cbcLevels : [
    { level: 1, label: "Beginning", descriptor: "" },
    { level: 2, label: "Developing", descriptor: "" },
    { level: 3, label: "Achieved", descriptor: "" }
  ]);

  $("addCbcLevel").onclick = () => {
    const list = [...qa("[data-lvl=level]")].map((el, i) => ({
      level: parseInt(el.value, 10),
      label: qa("[data-lvl=label]")[i].value,
      descriptor: qa("[data-lvl=descriptor]")[i].value
    }));
    list.push({ level: list.length + 1, label: "", descriptor: "" });
    renderCbcLevels(list);
  };

  $("scoringSave").onclick = async () => {
    const btn = $("scoringSave"); setBtn(btn, true);
    try {
      const selectedMode = qa('input[name="scoringMode"]').find((r) => r.checked).value;
      const body = { mode: selectedMode };
      if (selectedMode === "cbc") {
        body.cbcLevels = [...qa("[data-lvl=level]")].map((el, i) => ({
          level: parseInt(el.value, 10),
          label: qa("[data-lvl=label]")[i].value.trim(),
          descriptor: qa("[data-lvl=descriptor]")[i].value.trim()
        }));
      }
      S.scoring = await api(`${W.teachers}/schools/${encodeURIComponent(S.schoolId)}/scoring-mode`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      await loadInitial();
      renderScoring();
      toast("Scoring saved", "success");
    } catch (err) { toast(err.message, "error", 6000); }
    finally { setBtn(btn, false); }
  };

  renderMaxScores();
  renderGradingScale();

  $("publishRank").checked = !!(S.config && S.config.publishRank);
  $("rankSave").onclick = async () => {
    const btn = $("rankSave"); setBtn(btn, true);
    try {
      await api(`${W.marks}/schools/${encodeURIComponent(S.schoolId)}/config/publish-rank`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termId: S.currentTermId, publishRank: $("publishRank").checked })
      });
      toast("Saved", "success");
      await loadInitial();
    } catch (err) { toast(err.message, "error"); }
    finally { setBtn(btn, false); }
  };
}

function renderMaxScores() {
  const body = $("maxScoresBody");
  if (!S.config) { body.innerHTML = `<div class="skel h60"></div>`; return; }
  const maxScores = S.config.maxScores || {};
  const cur = S.terms.find((t) => t.id === S.currentTermId);
  body.innerHTML = `
    <p style="font-size:.85rem;color:var(--muted);margin-bottom:12px">For term <b>${esc(cur ? cur.name : "—")}</b>. These apply when a new mark is entered.</p>
    <div>
      ${S.types.map((t) => `
        <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border)">
          <span style="flex:1;font-weight:600">${esc(t.name)}</span>
          <input type="number" data-ms="${esc(t.id)}" min="1" max="1000" value="${maxScores[t.id] || 100}" style="width:90px;padding:6px 8px;border:2px solid var(--border);font-size:.85rem;text-align:right">
        </div>
      `).join("")}
    </div>
    <button class="btn btn-primary btn-sm" id="msSave" type="button" style="margin-top:14px"><span class="spinner"></span><span class="btn-label">Save max scores</span></button>
  `;
  $("msSave").onclick = async () => {
    const btn = $("msSave"); setBtn(btn, true);
    try {
      const payload = {};
      qa("[data-ms]").forEach((i) => payload[i.dataset.ms] = parseFloat(i.value) || 100);
      await api(`${W.marks}/schools/${encodeURIComponent(S.schoolId)}/config/max-scores`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termId: S.currentTermId, maxScores: payload })
      });
      await loadInitial();
      renderMaxScores();
      toast("Max scores saved", "success");
    } catch (err) { toast(err.message, "error", 6000); }
    finally { setBtn(btn, false); }
  };
}

function renderGradingScale() {
  const body = $("gradingScaleBody");
  const scale = (S.config && S.config.gradingScale) || { bands: [] };
  const bands = scale.bands || [];

  function listHtml(items) {
    return items.map((b, i) => `
      <div style="display:grid;grid-template-columns:70px 70px 80px 80px 1fr auto;gap:8px;margin-bottom:8px;align-items:center">
        <input type="number" data-b="min" min="0" max="100" value="${b.min}" placeholder="Min" style="padding:8px;border:2px solid var(--border);font-size:.85rem">
        <input type="number" data-b="max" min="0" max="100" value="${b.max}" placeholder="Max" style="padding:8px;border:2px solid var(--border);font-size:.85rem">
        <input type="text" data-b="grade" maxlength="10" value="${esc(b.grade || "")}" placeholder="Grade" style="padding:8px;border:2px solid var(--border);font-size:.85rem">
        <input type="number" data-b="points" min="0" max="20" value="${b.points != null ? b.points : ""}" placeholder="Points" style="padding:8px;border:2px solid var(--border);font-size:.85rem">
        <input type="text" data-b="descriptor" maxlength="60" value="${esc(b.descriptor || "")}" placeholder="Descriptor" style="padding:8px;border:2px solid var(--border);font-size:.85rem">
        <button class="btn btn-red btn-sm" data-rm-b="${i}" type="button"><i class="fa-solid fa-trash"></i></button>
      </div>
    `).join("");
  }

  body.innerHTML = `
    <p style="font-size:.85rem;color:var(--muted);margin-bottom:12px">Bands must not overlap and should cover the full 0-100 range.</p>
    <div id="bandsList">${listHtml(bands)}</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
      <button class="btn btn-outline btn-sm" id="addBand" type="button"><i class="fa-solid fa-plus"></i> Add band</button>
      <button class="btn btn-primary btn-sm" id="bandsSave" type="button"><span class="spinner"></span><span class="btn-label">Save scale</span></button>
    </div>
  `;

  function readBands() {
    return [...qa("[data-b=min]")].map((el, i) => ({
      min: parseFloat(qa("[data-b=min]")[i].value) || 0,
      max: parseFloat(qa("[data-b=max]")[i].value) || 0,
      grade: qa("[data-b=grade]")[i].value.trim(),
      points: qa("[data-b=points]")[i].value === "" ? null : parseFloat(qa("[data-b=points]")[i].value),
      descriptor: qa("[data-b=descriptor]")[i].value.trim()
    }));
  }

  $("addBand").onclick = () => {
    const cur = readBands();
    cur.push({ min: 0, max: 100, grade: "", points: null, descriptor: "" });
    $("bandsList").innerHTML = listHtml(cur);
    bindBandDeletes();
  };
  function bindBandDeletes() {
    qa("[data-rm-b]").forEach((b) => b.onclick = () => {
      const cur = readBands();
      cur.splice(parseInt(b.dataset.rmB, 10), 1);
      $("bandsList").innerHTML = listHtml(cur);
      bindBandDeletes();
    });
  }
  bindBandDeletes();

  $("bandsSave").onclick = async () => {
    const btn = $("bandsSave"); setBtn(btn, true);
    try {
      await api(`${W.marks}/schools/${encodeURIComponent(S.schoolId)}/config/grading-scale`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bands: readBands() })
      });
      await loadInitial();
      renderGradingScale();
      toast("Grading scale saved", "success");
    } catch (err) { toast(err.message, "error", 6000); }
    finally { setBtn(btn, false); }
  };
}

async function renderSheets() {
  const sel = $("sheetsTerm");
  sel.innerHTML = S.terms.map((t) => `<option value="${esc(t.id)}"${t.id === S.currentTermId ? " selected" : ""}>${esc(t.name)}${t.year ? ", " + t.year : ""}</option>`).join("");
  if (!sel.value && S.terms[0]) sel.value = S.terms[0].id;

  const list = $("sheetsList");
  list.innerHTML = `<div class="card-body"><div class="skel h20 w50"></div><div class="skel h40"></div></div>`;

  const termId = sel.value;
  try {
    const data = await api(`${W.marks}/schools/${encodeURIComponent(S.schoolId)}/sheets?termId=${encodeURIComponent(termId)}`);
    const sheets = data.sheets || [];
    if (!sheets.length) {
      list.innerHTML = `<div class="empty"><i class="fa-solid fa-inbox"></i><h3>No sheets yet</h3><p>Teachers will appear here once they start entering marks.</p></div>`;
      return;
    }
    list.innerHTML = `
      <div class="table-wrap">
        <table class="tbl">
          <thead><tr><th>Subject</th><th>Class</th><th>Stream</th><th>Status</th><th>Updated</th><th></th></tr></thead>
          <tbody>
            ${sheets.map((s) => `
              <tr>
                <td><b>${esc(s.subject)}</b></td>
                <td>${esc(s.class)}</td>
                <td>${esc(s.stream || "—")}</td>
                <td>${
                  s.status === "locked" ? `<span class="pill red">Locked</span>` :
                  s.status === "submitted" ? `<span class="pill yellow">Submitted</span>` :
                  `<span class="pill green">Open</span>`
                }</td>
                <td style="font-size:.82rem;color:var(--muted)">${fmtDateTime(s.updatedAt || s.submittedAt || s.lockedAt)}</td>
                <td class="actions">
                  ${s.status !== "open" ? `<button class="btn btn-green btn-sm" data-reopen="${esc(s.id)}" data-class="${esc(s.class)}" data-stream="${esc(s.stream || "")}" data-subject="${esc(s.subject)}" type="button"><i class="fa-solid fa-lock-open"></i> Reopen</button>` : ""}
                  ${s.status === "open" ? `<button class="btn btn-red btn-sm" data-lock="${esc(s.id)}" data-class="${esc(s.class)}" data-stream="${esc(s.stream || "")}" data-subject="${esc(s.subject)}" type="button"><i class="fa-solid fa-lock"></i> Lock</button>` : ""}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
    qa("[data-reopen]").forEach((b) => b.onclick = () => sheetAction("reopen", b));
    qa("[data-lock]").forEach((b) => b.onclick = () => sheetAction("lock", b));
    sel.onchange = renderSheets;
    $("sheetsRefresh").onclick = renderSheets;
  } catch (err) {
    list.innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><h3>Couldn't load sheets</h3><p>${esc(err.message)}</p></div>`;
  }
}

async function sheetAction(action, btn) {
  const isLock = action === "lock";
  const label = isLock ? "Lock" : "Reopen";
  const ok = await confirmDialog(
    `${label} sheet`,
    isLock ? "Teachers won't be able to edit until you reopen." : "Teachers can edit again.",
    label,
    isLock
  );
  if (!ok) return;
  try {
    await api(`${W.marks}/schools/${encodeURIComponent(S.schoolId)}/sheets/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        termId: $("sheetsTerm").value,
        class: btn.dataset.class,
        stream: btn.dataset.stream,
        subject: btn.dataset.subject
      })
    });
    renderSheets();
    toast(`Sheet ${isLock ? "locked" : "reopened"}`, "success");
  } catch (err) { toast(err.message, "error"); }
}

function renderReports() {
  $("repClass").innerHTML = `<option value="">Select class</option>` + CLASSES.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  $("repTerm").innerHTML = S.terms.map((t) => `<option value="${esc(t.id)}"${t.id === S.currentTermId ? " selected" : ""}>${esc(t.name)}${t.year ? ", " + t.year : ""}</option>`).join("");
  $("repList").innerHTML = `<div class="empty"><i class="fa-solid fa-chart-line"></i><h3>Pick a class and term</h3><p>Then click Load to view results.</p></div>`;

  $("repLoad").onclick = async () => {
    const cls = $("repClass").value;
    const stream = $("repStream").value.trim();
    const termId = $("repTerm").value;
    if (!cls || !termId) { toast("Pick class and term", "warn"); return; }
    const list = $("repList");
    list.innerHTML = `<div class="card-body"><div class="skel h20 w50"></div><div class="skel h40"></div><div class="skel h40"></div></div>`;
    try {
      const params = new URLSearchParams({ class: cls, termId });
      if (stream) params.set("stream", stream);
      const data = await api(`${W.marks}/schools/${encodeURIComponent(S.schoolId)}/reports/class?${params}`);
      const students = data.students || [];
      if (!students.length) {
        list.innerHTML = `<div class="empty"><i class="fa-solid fa-users-slash"></i><h3>No students</h3><p>No students in this class/stream for the selected term.</p></div>`;
        return;
      }
      const isCbc = data.scoringMode === "cbc";
      const subjectSet = new Set();
      students.forEach((s) => (s.subjects || []).forEach((sub) => subjectSet.add(sub.name)));
      const subjectList = [...subjectSet].sort();
      const showRank = data.publishRank;

      list.innerHTML = `
        <div style="padding:14px 18px;background:var(--light);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div><b>${students.length}</b> students · ${esc(cls)}${stream ? " " + esc(stream) : ""}</div>
          <button class="btn btn-outline btn-sm" id="repExport" type="button"><i class="fa-solid fa-file-csv"></i> Export CSV</button>
        </div>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr>
              <th>Student</th>
              ${showRank ? "<th>Pos</th>" : ""}
              ${subjectList.map((s) => `<th style="text-align:center">${esc(s)}${isCbc ? "" : " %"}</th>`).join("")}
              <th style="text-align:center">Overall</th>
              <th></th>
            </tr></thead>
            <tbody>
              ${students.map((s) => {
                const subjMap = {};
                (s.subjects || []).forEach((sub) => subjMap[sub.name] = sub);
                return `
                  <tr>
                    <td><b>${esc(s.lastName)}</b> ${esc(s.firstName)}</td>
                    ${showRank ? `<td><b>${s.position || "—"}</b></td>` : ""}
                    ${subjectList.map((name) => {
                      const sub = subjMap[name];
                      if (!sub) return `<td style="text-align:center;color:var(--muted)">—</td>`;
                      if (isCbc) return `<td style="text-align:center">${sub.level ? esc(sub.level.label) : "—"}</td>`;
                      return `<td style="text-align:center">${sub.pct != null ? sub.pct.toFixed(1) : "—"}${sub.grade ? ` <span class="pill ${sub.grade.grade === "A" ? "green" : sub.grade.grade === "B" ? "blue" : sub.grade.grade === "C" ? "yellow" : "red"}">${esc(sub.grade.grade)}</span>` : ""}</td>`;
                    }).join("")}
                    <td style="text-align:center"><b>${isCbc ? (s.rollup && s.rollup.rows && s.rollup.rows[0] ? esc(s.rollup.rows[0].label) : "—") : (s.overall && s.overall.pct != null ? s.overall.pct.toFixed(1) + "%" : "—")}</b></td>
                    <td class="actions">
                      <button class="btn btn-outline btn-sm" data-view-card="${esc(s.rosterId)}" data-term="${esc(termId)}" type="button"><i class="fa-solid fa-file-lines"></i></button>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      `;
      qa("[data-view-card]").forEach((b) => b.onclick = () => viewReportCard(b.dataset.viewCard, b.dataset.term));
      $("repExport").onclick = () => exportCsv(students, subjectList, isCbc, cls, stream);
    } catch (err) {
      list.innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><h3>Couldn't load report</h3><p>${esc(err.message)}</p></div>`;
    }
  };
}

function exportCsv(students, subjectList, isCbc, cls, stream) {
  const header = ["Student", ...subjectList, "Overall"];
  const rows = students.map((s) => {
    const subjMap = {};
    (s.subjects || []).forEach((sub) => subjMap[sub.name] = sub);
    const line = [`${s.lastName} ${s.firstName}`];
    subjectList.forEach((name) => {
      const sub = subjMap[name];
      if (!sub) line.push("");
      else if (isCbc) line.push(sub.level ? sub.level.label : "");
      else line.push(sub.pct != null ? sub.pct.toFixed(1) : "");
    });
    line.push(isCbc ? (s.rollup && s.rollup.rows && s.rollup.rows[0] ? s.rollup.rows[0].label : "") : (s.overall && s.overall.pct != null ? s.overall.pct.toFixed(1) + "%" : ""));
    return line;
  });
  const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `report_${cls}${stream ? "_" + stream : ""}.csv`.replace(/[^\w.-]+/g, "_");
  document.body.appendChild(a); a.click(); a.remove();
  toast("CSV downloaded", "success");
}

async function viewReportCard(rid, termId) {
  openModal({
    title: "Report Card",
    wide: "wider",
    body: `<div class="skel h60"></div><div class="skel h60"></div>`,
    foot: `<button class="btn btn-outline" id="rcClose" type="button">Close</button>`
  });
  $("rcClose").onclick = closeModal;
  try {
    const token = await idToken();
    const res = await fetch(`${W.marks}/schools/${encodeURIComponent(S.schoolId)}/reports/card/${encodeURIComponent(rid)}?termId=${encodeURIComponent(termId)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Could not load report card");
    const html = await res.text();
    $("modalBody").innerHTML = `<iframe class="report-frame" id="rcFrame"></iframe>`;
    $("rcFrame").srcdoc = html;
  } catch (err) {
    $("modalBody").innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><h3>Couldn't load</h3><p>${esc(err.message)}</p></div>`;
  }
}

function renderNotes() {
  $("noteClass").innerHTML = `<option value="">Select class</option>` + CLASSES.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  $("notesList").innerHTML = `<div class="empty"><i class="fa-solid fa-comment-dots"></i><h3>Pick a class</h3><p>Then click Load to see students.</p></div>`;

  $("noteLoad").onclick = async () => {
    const cls = $("noteClass").value;
    const stream = $("noteStream").value.trim();
    if (!cls) { toast("Pick a class", "warn"); return; }
    const list = $("notesList");
    list.innerHTML = `<div class="card-body"><div class="skel h20 w50"></div><div class="skel h40"></div></div>`;
    try {
      const params = new URLSearchParams({ class: cls, termId: S.currentTermId });
      if (stream) params.set("stream", stream);
      const data = await api(`${W.marks}/schools/${encodeURIComponent(S.schoolId)}/reports/class?${params}`);
      const students = data.students || [];
      if (!students.length) {
        list.innerHTML = `<div class="empty"><i class="fa-solid fa-users-slash"></i><h3>No students</h3></div>`;
        return;
      }
      list.innerHTML = `
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>Student</th><th>Overall</th><th></th></tr></thead>
            <tbody>
              ${students.map((s) => `
                <tr>
                  <td><b>${esc(s.lastName)}</b> ${esc(s.firstName)}</td>
                  <td>${s.overall && s.overall.pct != null ? s.overall.pct.toFixed(1) + "%" : "—"}</td>
                  <td class="actions"><button class="btn btn-primary btn-sm" data-note="${esc(s.rosterId)}" type="button"><i class="fa-solid fa-pen"></i> Write note</button></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
      qa("[data-note]").forEach((b) => b.onclick = () => openNoteEditor(b.dataset.note, students.find((x) => x.rosterId === b.dataset.note)));
    } catch (err) {
      list.innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><h3>Couldn't load</h3><p>${esc(err.message)}</p></div>`;
    }
  };
}

function openNoteEditor(rid, student) {
  openModal({
    title: `${student.lastName} ${student.firstName}`,
    body: `
      <div class="field"><label for="ntConduct">Conduct</label><input type="text" id="ntConduct" maxlength="200" placeholder="e.g. Excellent"></div>
      <div class="field"><label for="ntComment">Comment</label><textarea id="ntComment" rows="5" maxlength="2000"></textarea></div>
    `,
    foot: `<button class="btn btn-outline" id="ntCancel" type="button">Cancel</button><button class="btn btn-primary" id="ntSave" type="button"><span class="spinner"></span><span class="btn-label">Save note</span></button>`
  });
  $("ntCancel").onclick = closeModal;
  $("ntSave").onclick = async () => {
    const btn = $("ntSave"); setBtn(btn, true);
    try {
      await api(`${W.marks}/schools/${encodeURIComponent(S.schoolId)}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          termId: S.currentTermId,
          rosterId: rid,
          conduct: $("ntConduct").value.trim(),
          comment: $("ntComment").value.trim()
        })
      });
      closeModal(); toast("Note saved", "success");
    } catch (err) { toast(err.message, "error"); }
    finally { setBtn(btn, false); }
  };
}

async function renderHolds() {
  const list = $("holdsList");
  list.innerHTML = `<div class="card-body"><div class="skel h20 w50"></div><div class="skel h40"></div></div>`;
  try {
    const data = await api(`${W.marks}/schools/${encodeURIComponent(S.schoolId)}/holds`);
    const holds = data.holds || [];
    if (!holds.length) {
      list.innerHTML = `<div class="empty"><i class="fa-solid fa-lock-open"></i><h3>No active holds</h3><p>No reports are currently withheld.</p></div>`;
      $("addHoldBtn").onclick = openAddHold;
      return;
    }
    list.innerHTML = `
      <div class="table-wrap">
        <table class="tbl">
          <thead><tr><th>Student ID</th><th>Term</th><th>Reason</th><th>Set</th><th></th></tr></thead>
          <tbody>
            ${holds.map((h) => `
              <tr>
                <td style="font-family:monospace;font-size:.8rem">${esc(h.rosterId)}</td>
                <td>${esc(h.termId || "All")}</td>
                <td>${esc(h.reason || "—")}</td>
                <td style="font-size:.82rem;color:var(--muted)">${fmtDateTime(h.at)}</td>
                <td class="actions"><button class="btn btn-red btn-sm" data-del-hold="${esc(h.rosterId)}" type="button"><i class="fa-solid fa-trash"></i> Remove</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>`;
    qa("[data-del-hold]").forEach((b) => b.onclick = async () => {
      const ok = await confirmDialog("Remove hold", "The report will be visible again.", "Remove");
      if (!ok) return;
      try {
        await api(`${W.marks}/schools/${encodeURIComponent(S.schoolId)}/holds/${encodeURIComponent(b.dataset.delHold)}`, { method: "DELETE" });
        renderHolds(); toast("Hold removed", "success");
      } catch (err) { toast(err.message, "error"); }
    });
    $("addHoldBtn").onclick = openAddHold;
  } catch (err) {
    list.innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><h3>Couldn't load holds</h3><p>${esc(err.message)}</p></div>`;
  }
}

function openAddHold() {
  openModal({
    title: "Add report hold",
    body: `
      <div class="field"><label for="hdRoster">Roster ID <span class="hint">the student's ID</span></label><input type="text" id="hdRoster" maxlength="40"></div>
      <div class="field"><label for="hdTerm">Term <span class="hint">leave empty for all terms</span></label><select id="hdTerm"><option value="">All terms</option>${S.terms.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}${t.year ? ", " + t.year : ""}</option>`).join("")}</select></div>
      <div class="field"><label for="hdReason">Reason</label><input type="text" id="hdReason" maxlength="300" placeholder="e.g. Outstanding fees"></div>
    `,
    foot: `<button class="btn btn-outline" id="hdCancel" type="button">Cancel</button><button class="btn btn-primary" id="hdSave" type="button"><span class="spinner"></span><span class="btn-label">Add hold</span></button>`
  });
  $("hdCancel").onclick = closeModal;
  $("hdSave").onclick = async () => {
    const rid = $("hdRoster").value.trim();
    if (!rid) { toast("Roster ID required", "warn"); return; }
    const btn = $("hdSave"); setBtn(btn, true);
    try {
      await api(`${W.marks}/schools/${encodeURIComponent(S.schoolId)}/holds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rosterId: rid,
          termId: $("hdTerm").value || null,
          reason: $("hdReason").value.trim()
        })
      });
      closeModal(); renderHolds(); toast("Hold added", "success");
    } catch (err) { toast(err.message, "error"); }
    finally { setBtn(btn, false); }
  };
}

$("emSend").onclick = async () => {
  const group = $("emGroup").value;
  const subject = $("emSubject").value.trim() || "Message from your school";
  const body = $("emBody").value.trim();
  if (!body) { toast("Message body required", "warn"); return; }
  const ok = await confirmDialog("Send message", `Send to all ${group} at your school?`, "Send", false);
  if (!ok) return;
  const btn = $("emSend"); setBtn(btn, true);
  try {
    const result = await api(`${W.email}/send-bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schoolId: S.schoolId,
        recipientGroup: group,
        subject,
        content: { blocks: [{ type: "paragraph", runs: [{ text: body }] }] }
      })
    });
    toast(`Sent to ${result.sent} recipients`, "success");
    $("emBody").value = "";
    $("emSubject").value = "";
  } catch (err) { toast(err.message, "error", 8000); }
  finally { setBtn(btn, false); }
};

async function renderAudit() {
  const list = $("auditList");
  list.innerHTML = `<div class="card-body"><div class="skel h20 w50"></div><div class="skel h40"></div></div>`;
  try {
    const data = await api(`${W.marks}/schools/${encodeURIComponent(S.schoolId)}/audit-log?limit=100`);
    const entries = data.entries || [];
    if (!entries.length) {
      list.innerHTML = `<div class="empty"><i class="fa-solid fa-clipboard-list"></i><h3>No activity yet</h3></div>`;
      return;
    }
    list.innerHTML = `
      <div class="table-wrap">
        <table class="tbl">
          <thead><tr><th>When</th><th>Action</th><th>By</th><th>Details</th></tr></thead>
          <tbody>
            ${entries.map((e) => `
              <tr>
                <td style="font-size:.82rem;color:var(--muted);white-space:nowrap">${fmtDateTime(e.at)}</td>
                <td><span class="pill blue">${esc(e.action || "—")}</span></td>
                <td style="font-size:.8rem;font-family:monospace">${esc((e.by || "").slice(0, 10))}…</td>
                <td style="font-size:.82rem;color:var(--muted)">${esc(e.class || "")}${e.class && e.subject ? " · " : ""}${esc(e.subject || "")}${e.count ? " · " + e.count + " items" : ""}${e.target ? " · " + esc(e.target.slice(0, 12)) : ""}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>`;
    $("auditRefresh").onclick = renderAudit;
  } catch (err) {
    list.innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><h3>Couldn't load audit log</h3><p>${esc(err.message)}</p></div>`;
  }
}

(function () {
  const KEY = "edutrace_cookie_consent_v1";
  const b = $("cookie");
  let v = null;
  try { v = localStorage.getItem(KEY); } catch {}
  if (!v) b.classList.add("show");
  function set(x) {
    try { localStorage.setItem(KEY, x); } catch {}
    b.classList.remove("show");
    if (x === "allow" && typeof window.__edutraceAnalytics === "function") window.__edutraceAnalytics();
  }
  $("cookieAllow").addEventListener("click", () => set("allow"));
  $("cookieReject").addEventListener("click", () => set("reject"));
})();

// ====================== PHONES ======================
const PH = { items: [] };
const raw = (v) => String(v == null ? "" : v); // worker already HTML-escapes these
const decode = (s) => { const t = document.createElement("textarea"); t.innerHTML = s; return t.value; };

async function renderPhones() {
  const list = $("phList");
  list.innerHTML = `<div class="card-body"><div class="skel h20 w50"></div><div class="skel h40"></div></div>`;
  $("phRole").onchange = renderPhones;
  $("phRefresh").onclick = renderPhones;
  $("phSearch").oninput = paintPhones;
  try {
    const role = $("phRole").value;
    const data = await api(`${W.phones}/schools/${encodeURIComponent(S.schoolId)}/phones${role ? "?role=" + encodeURIComponent(role) : ""}`);
    PH.items = data.items || [];
    paintPhones();
  } catch (err) {
    list.innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><h3>Couldn't load numbers</h3><p>${esc(err.message)}</p></div>`;
  }
}

function paintPhones() {
  const list = $("phList");
  const term = $("phSearch").value.trim().toLowerCase();
  const items = PH.items.filter((p) => !term || `${p.firstName} ${p.lastName} ${p.phone} ${p.childName || ""}`.toLowerCase().includes(term));
  if (!items.length) {
    list.innerHTML = `<div class="empty"><i class="fa-solid fa-phone-slash"></i><h3>No numbers yet</h3><p>Numbers appear here once people enter them.</p></div>`;
    return;
  }
  const pillOf = { teacher: "blue", student: "green", parent: "yellow" };
  list.innerHTML = `
    <div style="padding:12px 18px;background:var(--light);border-bottom:1px solid var(--border);font-size:.85rem"><b>${items.length}</b> number${items.length === 1 ? "" : "s"}</div>
    <div class="table-wrap">
      <table class="tbl">
        <thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Class / Child</th><th>Updated</th></tr></thead>
        <tbody>
          ${items.map((p) => `
            <tr>
              <td><b>${raw(p.lastName)}</b> ${raw(p.firstName)}</td>
              <td><span class="pill ${pillOf[p.role] || "grey"}">${esc(p.role)}</span></td>
              <td><a href="tel:${esc(p.phone)}" style="font-weight:700;color:var(--primary)">${esc(p.phone)}</a></td>
              <td style="font-size:.85rem">${p.role === "parent"
                ? (p.childName ? `Parent of ${raw(p.childName)} (${raw(p.childClass || "")} ${raw(p.childStream || "")})` : "—")
                : (p.class ? `${raw(p.class)} ${raw(p.stream || "")}` : "—")}</td>
              <td style="font-size:.82rem;color:var(--muted)">${fmtDate(p.updatedAt)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

// ====================== LEDGER ======================
const LD = { roster: null };

async function ledgerRoster() {
  if (LD.roster) return LD.roster;
  const token = await idToken();
  const res = await fetch(`${W.roster}/roster/list`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ schoolId: S.schoolId })
  });
  if (!res.ok) throw new Error("Could not load students");
  LD.roster = (await res.json()).rows || [];
  return LD.roster;
}

function renderLedger() {
  $("ledClass").innerHTML = `<option value="">Select class</option>` + CLASSES.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  $("ledList").innerHTML = `<div class="empty"><i class="fa-solid fa-book"></i><h3>Pick a class</h3><p>Then click Load to see its ledger entries.</p></div>`;
  $("ledLoad").onclick = loadLedger;
  $("ledAdd").onclick = openLedgerEntry;
}

async function loadLedger() {
  const cls = $("ledClass").value;
  if (!cls) { toast("Pick a class", "warn"); return; }
  const list = $("ledList");
  list.innerHTML = `<div class="card-body"><div class="skel h20 w50"></div><div class="skel h40"></div></div>`;
  try {
    const data = await api(`${W.ledger}/schools/${encodeURIComponent(S.schoolId)}/ledger?class=${encodeURIComponent(cls)}`);
    const entries = data.entries || [];
    if (!entries.length) {
      list.innerHTML = `<div class="empty"><i class="fa-solid fa-book"></i><h3>No entries</h3><p>No ledger entries for ${esc(cls)}.</p></div>`;
      return;
    }
    list.innerHTML = `
      <div style="padding:12px 18px;background:var(--light);border-bottom:1px solid var(--border);font-size:.85rem">Latest ${entries.length} entries</div>
      <div class="table-wrap">
        <table class="tbl">
          <thead><tr><th>Date</th><th>Student</th><th>Stream</th><th>Offence</th><th>Punishment</th><th>Commitment</th><th></th></tr></thead>
          <tbody>
            ${entries.map((e) => `
              <tr>
                <td style="white-space:nowrap">${fmtDate(e.date)}</td>
                <td><b>${raw(e.studentName)}</b></td>
                <td>${raw(e.stream) || "—"}</td>
                <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${raw(e.offence)}</td>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${raw(e.punishment)}</td>
                <td>${e.hasCommitment ? `<span class="pill green">Written</span>` : `<span class="pill grey">Pending</span>`}</td>
                <td class="actions"><button class="btn btn-outline btn-sm" data-led-open="${esc(e.rosterId)}" data-name="${esc(e.studentName)}" type="button"><i class="fa-solid fa-folder-open"></i> Open</button></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
    qa("[data-led-open]").forEach((b) => b.onclick = () => openStudentLedger(b.dataset.ledOpen, b.dataset.name));
  } catch (err) {
    list.innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><h3>Couldn't load ledger</h3><p>${esc(err.message)}</p></div>`;
  }
}

async function openStudentLedger(rosterId, name) {
  openModal({
    title: decode(name || "Student ledger"),
    wide: "wide",
    body: `<div class="skel h60"></div><div class="skel h60"></div>`,
    foot: `<button class="btn btn-outline" id="ldClose" type="button">Close</button>`
  });
  $("ldClose").onclick = closeModal;
  try {
    const data = await api(`${W.ledger}/schools/${encodeURIComponent(S.schoolId)}/ledger/students/${encodeURIComponent(rosterId)}`);
    const entries = data.entries || [];
    $("modalBody").innerHTML = entries.length ? entries.map((e) => `
      <div style="border:1px solid var(--border);margin-bottom:14px">
        <div style="padding:10px 14px;background:var(--light);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <b>${fmtDate(e.date)}</b>
          <span style="font-size:.78rem;color:var(--muted)">Recorded ${fmtDateTime(e.recordedAt)}</span>
        </div>
        <div style="padding:12px 14px;font-size:.88rem;line-height:1.6">
          <div><b>Offence:</b> ${raw(e.offence)}</div>
          <div><b>Punishment:</b> ${raw(e.punishment)}</div>
          ${e.remarks ? `<div><b>Remarks:</b> ${raw(e.remarks)}</div>` : ""}
          <div style="margin-top:8px"><b>Student's commitment:</b> ${e.commitment
            ? `${raw(e.commitment.text)} <span style="color:var(--muted);font-size:.78rem">(${fmtDateTime(e.commitment.at)})</span>`
            : `<span class="pill grey">not written yet</span>`}</div>
          ${(e.notes || []).length ? `<div style="margin-top:8px"><b>Notes:</b>${e.notes.map((n) => `<div style="padding:6px 0;border-top:1px solid var(--border)">${raw(n.text)} <span style="color:var(--muted);font-size:.75rem">${fmtDateTime(n.at)}</span></div>`).join("")}</div>` : ""}
          <div style="display:flex;gap:8px;margin-top:10px">
            <input type="text" data-note-input="${esc(e.id)}" maxlength="2000" placeholder="Add a note" style="flex:1;padding:8px;border:2px solid var(--border);font-size:.85rem">
            <button class="btn btn-primary btn-sm" data-note-add="${esc(e.id)}" type="button"><span class="spinner"></span><span class="btn-label">Add note</span></button>
          </div>
        </div>
      </div>`).join("") : `<div class="empty"><i class="fa-solid fa-book"></i><h3>No entries</h3></div>`;

    qa("[data-note-add]").forEach((b) => b.onclick = async () => {
      const input = q(`[data-note-input="${b.dataset.noteAdd}"]`);
      const text = input.value.trim();
      if (!text) { toast("Write a note first", "warn"); return; }
      setBtn(b, true);
      try {
        await api(`${W.ledger}/schools/${encodeURIComponent(S.schoolId)}/ledger/entries/${encodeURIComponent(b.dataset.noteAdd)}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text })
        });
        toast("Note added", "success");
        openStudentLedger(rosterId, name);
      } catch (err) { toast(err.message, "error"); setBtn(b, false); }
    });
  } catch (err) {
    $("modalBody").innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><h3>Couldn't load</h3><p>${esc(err.message)}</p></div>`;
  }
}

async function openLedgerEntry() {
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  openModal({
    title: "New ledger entry",
    body: `
      <div class="grid2">
        <div class="field"><label for="leClass">Class</label><select id="leClass"><option value="">Select class</option>${CLASSES.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}</select></div>
        <div class="field"><label for="leStudent">Student</label><select id="leStudent"><option value="">Select class first</option></select></div>
        <div class="field"><label for="leDate">Date</label><input type="date" id="leDate" value="${today}"></div>
      </div>
      <div class="field"><label for="leOffence">Offence</label><textarea id="leOffence" rows="3" maxlength="1000"></textarea></div>
      <div class="field"><label for="lePunishment">Punishment</label><textarea id="lePunishment" rows="3" maxlength="1000"></textarea></div>
      <div class="field"><label for="leRemarks">Remarks <span class="hint">optional</span></label><textarea id="leRemarks" rows="3" maxlength="2000"></textarea></div>`,
    foot: `<button class="btn btn-outline" id="leCancel" type="button">Cancel</button><button class="btn btn-primary" id="leSave" type="button"><span class="spinner"></span><span class="btn-label">Save entry</span></button>`
  });
  $("leCancel").onclick = closeModal;

  $("leClass").onchange = async () => {
    const cls = $("leClass").value;
    const sel = $("leStudent");
    if (!cls) { sel.innerHTML = `<option value="">Select class first</option>`; return; }
    sel.innerHTML = `<option value="">Loading…</option>`;
    try {
      const rows = (await ledgerRoster())
        .filter((r) => normaliseClass(r.class) === cls)
        .sort((a, b) => (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName));
      sel.innerHTML = `<option value="">Select student</option>` + rows.map((r) =>
        `<option value="${esc(r.id)}">${esc(r.lastName)} ${esc(r.firstName)}${r.stream ? " (" + esc(r.stream) + ")" : ""}</option>`).join("");
    } catch (err) { sel.innerHTML = `<option value="">Could not load</option>`; toast(err.message, "error"); }
  };
  if ($("ledClass").value) { $("leClass").value = $("ledClass").value; $("leClass").onchange(); }

  $("leSave").onclick = async () => {
    const rosterId = $("leStudent").value;
    const offence = $("leOffence").value.trim();
    const punishment = $("lePunishment").value.trim();
    if (!rosterId || !offence || !punishment) { toast("Student, offence and punishment are required", "warn"); return; }
    const ok = await confirmDialog("Save entry", "Ledger entries are permanent. They cannot be edited or deleted.", "Save entry", false);
    if (!ok) return;
    const btn = $("leSave"); setBtn(btn, true);
    try {
      await api(`${W.ledger}/schools/${encodeURIComponent(S.schoolId)}/ledger/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rosterId, date: $("leDate").value, offence, punishment, remarks: $("leRemarks").value.trim() })
      });
      closeModal();
      toast("Entry saved", "success");
      if ($("ledClass").value) loadLedger();
    } catch (err) { toast(err.message, "error", 6000); }
    finally { setBtn(btn, false); }
  };
  }
