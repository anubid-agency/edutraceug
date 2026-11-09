// ================================================================
// edutraceug - Teacher Extras Extension Script (teacher-extras.js)
// Standalone extension module for teacher portal (teacher.html)
// Endpoint: https://edutraceug-extras-worker.anubisdigital114-9df.workers.dev
//
// IMPORTANT: load with <script type="module" src="teacher-extras.js"></script>
// so the imports below resolve.
// ================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

(function () {
  "use strict";

  const EXTRAS_BASE = "https://edutraceug-extras-worker.anubisdigital114-9df.workers.dev";
  const POINTS_BASE = "https://edutraceug-points-worker.anubisdigital114-9df.workers.dev";
  const TEACHERS_BASE = "https://edutraceug-teachers-worker.anubisdigital114-9df.workers.dev";

  const auth = getAuth(initializeApp({
    apiKey: "AIzaSyAR1NEHhZwUujpGEjb-IvTV2A04PTQuYLE",
    authDomain: "edutrace-ug.firebaseapp.com",
    projectId: "edutrace-ug",
    storageBucket: "edutrace-ug.firebasestorage.app",
    messagingSenderId: "219055117140",
    appId: "1:219055117140:web:97ec99de8e25b6f9266ec1"
  }));

  const TE = { schoolId: null };

  onAuthStateChanged(auth, async (u) => {
    if (u) TE.schoolId = (await u.getIdTokenResult()).claims.schoolId;
  });

  const $ = (id) => document.getElementById(id);
  const q = (sel, root = document) => root.querySelector(sel);
  const qa = (sel, root = document) => [...root.querySelectorAll(sel)];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function toast(msg, kind = "info", ms = 4000) {
    const wrap = $("toastWrap") || document.body;
    const icons = { success: "fa-circle-check", error: "fa-circle-exclamation", warn: "fa-triangle-exclamation", info: "fa-circle-info" };
    const t = document.createElement("div");
    t.className = `toast ${kind}`;
    t.innerHTML = `<i class="fa-solid ${icons[kind] || icons.info}"></i><span>${esc(msg)}</span>`;
    wrap.appendChild(t);
    setTimeout(() => {
      t.style.opacity = "0";
      t.style.transition = "opacity .3s";
      setTimeout(() => t.remove(), 300);
    }, ms);
  }

  async function getAuthToken() {
    return auth.currentUser ? auth.currentUser.getIdToken() : null;
  }

  async function apiExtras(path, options = {}, base = EXTRAS_BASE) {
    const token = await getAuthToken();
    const headers = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };
    if (options.body && !(options.body instanceof FormData) && typeof options.body === "object") {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }
    const res = await fetch(`${base}${path}`, { ...options, headers });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Request failed with status ${res.status}`);
    }
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return res.json();
    return res.text();
  }

  // ================================================================
  // Initialization & UI Injection
  // ================================================================

  function initTeacherExtras() {
    injectHeaderExtrasButton();
  }

  function injectHeaderExtrasButton() {
    const headerInner = q(".header-inner") || q("header");
    if (!headerInner || $("teacherExtrasBtn")) return;

    const btn = document.createElement("button");
    btn.id = "teacherExtrasBtn";
    btn.className = "btn btn-outline btn-sm";
    btn.style.marginLeft = "auto";
    btn.style.marginRight = "10px";
    btn.innerHTML = `<i class="fa-solid fa-layer-group"></i> Extras`;
    btn.onclick = openExtrasModal;

    const logoutBtn = $("logoutBtn");
    if (logoutBtn) headerInner.insertBefore(btn, logoutBtn);
    else headerInner.appendChild(btn);
  }

  function openExtrasModal() {
    let modalBack = $("teacherExtrasModal");
    if (!modalBack) {
      modalBack = document.createElement("div");
      modalBack.id = "teacherExtrasModal";
      modalBack.className = "modal-back";
      modalBack.innerHTML = `
        <div class="modal" style="max-width:760px">
          <div class="modal-head">
            <h2>Teacher Resources</h2>
            <button class="close" id="teacherModalClose" type="button"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="modal-body" id="teacherModalBody" style="padding:20px">
            <div style="display:flex;gap:8px;border-bottom:1px solid var(--border);margin-bottom:16px">
              <button class="te-tab" data-te-tab="resources" type="button" style="padding:8px 14px;border:none;border-bottom:3px solid var(--primary);background:none;font-weight:800;font-size:.85rem;cursor:pointer">Resources</button>
              <button class="te-tab" data-te-tab="points" type="button" style="padding:8px 14px;border:none;border-bottom:3px solid transparent;background:none;font-weight:700;font-size:.85rem;color:var(--muted);cursor:pointer">S5/S6 Points</button>
            </div>
            <div id="teacherTabBody"></div>
          </div>
        </div>
      `;
      document.body.appendChild(modalBack);
      $("teacherModalClose").onclick = () => modalBack.classList.remove("show");
      modalBack.onclick = (e) => { if (e.target === modalBack) modalBack.classList.remove("show"); };
      qa(".te-tab", modalBack).forEach((b) => {
        b.onclick = () => {
          qa(".te-tab", modalBack).forEach((x) => {
            x.style.borderBottomColor = "transparent";
            x.style.fontWeight = "700";
            x.style.color = "var(--muted)";
          });
          b.style.borderBottomColor = "var(--primary)";
          b.style.fontWeight = "800";
          b.style.color = "";
          if (b.dataset.teTab === "points") loadPointsTab();
          else loadResourcesTab();
        };
      });
    }

    modalBack.classList.add("show");
    loadResourcesTab();
  }

  async function ensureSchoolId() {
    if (TE.schoolId) return TE.schoolId;
    if (auth.currentUser) {
      try {
        const r = await auth.currentUser.getIdTokenResult();
        TE.schoolId = r.claims.schoolId;
      } catch {}
    }
    return TE.schoolId;
  }

  // ================================================================
  // Resources tab (materials + datasets)
  // ================================================================

  async function loadResourcesTab() {
    const body = $("teacherTabBody");
    if (!body) return;
    body.innerHTML = `<div class="skel h40"></div><div class="skel h80"></div>`;
    const schoolId = await ensureSchoolId();
    if (!schoolId) {
      body.innerHTML = `<div style="color:var(--red)">School context missing. Please sign in again.</div>`;
      return;
    }

    try {
      const [matData, dsData] = await Promise.all([
        apiExtras(`/schools/${encodeURIComponent(schoolId)}/materials`).catch(() => ({ materials: [] })),
        apiExtras(`/schools/${encodeURIComponent(schoolId)}/datasets`).catch(() => ({ datasets: [] }))
      ]);
      const materials = matData.materials || [];
      const datasets = dsData.datasets || [];
      const canUploadMaterials = matData.canUpload === true;

      body.innerHTML = `
        <div style="margin-bottom:24px">
          <h3 style="font-size:1rem;font-weight:800;margin-bottom:12px"><i class="fa-solid fa-folder-open" style="color:var(--primary)"></i> Class Materials &amp; Upload</h3>
          ${canUploadMaterials ? `
          <div style="background:var(--light,#f8f9fa);padding:14px;border:1px solid var(--border);margin-bottom:14px">
            <h4 style="font-size:0.85rem;font-weight:700;margin-bottom:8px">Upload New Material (PDF)</h4>
            <form id="teacherMatForm" style="display:grid;gap:8px">
              <input type="text" id="tMatTitle" placeholder="Document Title" required style="padding:8px;border:1px solid var(--border)">
              <input type="text" id="tMatSubject" placeholder="Subject Name" style="padding:8px;border:1px solid var(--border)">
              <input type="text" id="tMatClass" placeholder="Class (optional, e.g. Senior 1)" style="padding:8px;border:1px solid var(--border)">
              <input type="file" id="tMatFile" accept="application/pdf" required>
              <button type="submit" class="btn btn-primary btn-sm" style="width:fit-content"><i class="fa-solid fa-upload"></i> Upload PDF</button>
            </form>
          </div>` : `
          <div style="background:#FFF9E6;border:1px solid var(--yellow,#F9B515);padding:10px 12px;margin-bottom:14px;font-size:.85rem">
            <i class="fa-solid fa-lock"></i> The school admin has not given you upload access for materials.
          </div>`}
          <div style="max-height:180px;overflow-y:auto">
            <table class="tbl" style="width:100%;font-size:0.85rem">
              <thead><tr style="text-align:left"><th style="padding:6px">Title</th><th style="padding:6px">Subject</th><th style="padding:6px">File</th></tr></thead>
              <tbody>
                ${materials.map((m) => `
                  <tr>
                    <td style="padding:6px"><b>${esc(m.title)}</b></td>
                    <td style="padding:6px">${esc(m.subject || "—")}</td>
                    <td style="padding:6px"><a href="#" data-open-mat="${esc(m.id)}">Download</a></td>
                  </tr>
                `).join("") || '<tr><td colspan="3" style="color:var(--muted);text-align:center">No materials uploaded.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 style="font-size:1rem;font-weight:800;margin-bottom:12px"><i class="fa-solid fa-database" style="color:var(--primary)"></i> Available Custom Datasets</h3>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${datasets.map((d) => `
              <div style="padding:10px;border:1px solid var(--border);background:#fff">
                <div style="font-weight:800;font-size:0.9rem">${esc(d.name)} ${d.canUpload ? `<span style="font-size:.7rem;padding:2px 6px;background:#EBF1FB;color:var(--primary);margin-left:6px">Can upload</span>` : ""}</div>
                <div style="font-size:0.82rem;color:var(--muted)">${esc(d.description || "No description provided.")}</div>
              </div>
            `).join("") || '<div style="color:var(--muted);text-align:center;padding:10px">No custom datasets found.</div>'}
          </div>
        </div>
      `;

      qa("[data-open-mat]", body).forEach((a) => {
        a.onclick = (e) => { e.preventDefault(); openMaterial(a.dataset.openMat); };
      });

      if (canUploadMaterials) {
        $("teacherMatForm").onsubmit = async (e) => {
          e.preventDefault();
          const file = $("tMatFile").files[0];
          if (!file) return;
          const fd = new FormData();
          fd.append("file", file);
          fd.append("title", $("tMatTitle").value.trim());
          fd.append("subject", $("tMatSubject").value.trim());
          const cls = $("tMatClass").value.trim();
          fd.append("classes", JSON.stringify(cls ? [cls] : []));

          try {
            await apiExtras(`/schools/${encodeURIComponent(schoolId)}/materials`, { method: "POST", body: fd });
            toast("Material uploaded successfully", "success");
            loadResourcesTab();
          } catch (err) { toast(err.message, "error"); }
        };
      }
    } catch (err) {
      body.innerHTML = `<div style="color:var(--red)">Failed to load extra resources: ${esc(err.message)}</div>`;
    }
  }

  async function openMaterial(id) {
    const win = window.open("", "_blank");
    try {
      const token = await getAuthToken();
      const res = await fetch(`${EXTRAS_BASE}/schools/${encodeURIComponent(TE.schoolId)}/materials/${encodeURIComponent(id)}/file`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Could not open the file");
      win.location = URL.createObjectURL(await res.blob());
    } catch (e) {
      if (win) win.close();
      toast(e.message, "error");
    }
  }

  // ================================================================
  // Points tab (S5/S6)
  // ================================================================

  async function loadPointsTab() {
    const body = $("teacherTabBody");
    if (!body) return;
    body.innerHTML = `<div class="skel h40"></div><div class="skel h80"></div>`;
    const schoolId = await ensureSchoolId();
    if (!schoolId) {
      body.innerHTML = `<div style="color:var(--red)">School context missing. Please sign in again.</div>`;
      return;
    }

    try {
      const [settings, termsData] = await Promise.all([
        apiExtras(`/schools/${encodeURIComponent(schoolId)}/points/settings`, {}, POINTS_BASE),
        apiExtras(`/schools/${encodeURIComponent(schoolId)}/terms`, {}, TEACHERS_BASE)
      ]);
      const terms = termsData.terms || [];
      const inp = "padding:8px;border:2px solid var(--border);font-size:.85rem";

      if (!settings.bands || !settings.bands.length) {
        body.innerHTML = `
          <div style="padding:16px;background:#FFF9E6;border:1px solid var(--yellow,#F9B515);font-size:.9rem">
            <i class="fa-solid fa-circle-info"></i> The school admin has not set the points table yet. Points will appear here once they do.
          </div>`;
        return;
      }

      body.innerHTML = `
        <p style="font-size:.85rem;color:var(--muted);margin-bottom:12px">
          Points are based on each subject's total %. Applies to Senior 5 and Senior 6 only.
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center">
          <select id="ptClass" style="${inp}">
            <option>Senior 5</option>
            <option>Senior 6</option>
          </select>
          <input id="ptStream" placeholder="Stream (leave blank for all)" style="${inp};width:180px">
          <select id="ptTerm" style="${inp}">
            ${terms.map((x) => `<option value="${esc(x.id)}"${x.isCurrent ? " selected" : ""}>${esc(x.name)}${x.year ? ", " + x.year : ""}</option>`).join("")}
          </select>
          <button class="btn btn-primary btn-sm" id="ptLoad" type="button">Load</button>
        </div>
        <div id="ptResults"></div>
      `;

      $("ptLoad").onclick = async () => {
        const box = $("ptResults");
        const p = new URLSearchParams({ termId: $("ptTerm").value, class: $("ptClass").value });
        if ($("ptStream").value.trim()) p.set("stream", $("ptStream").value.trim());
        box.innerHTML = `<div class="skel h80"></div>`;
        try {
          const d = await apiExtras(`/schools/${encodeURIComponent(schoolId)}/points/class?${p}`, {}, POINTS_BASE);
          if (!d.students.length) {
            box.innerHTML = `<div style="padding:20px;text-align:center;color:var(--muted)">No marks found for this class and term.</div>`;
            return;
          }
          const names = [...new Set(d.students.flatMap((x) => x.subjects.map((y) => y.name)))].sort();
          box.innerHTML = `
            <div style="overflow-x:auto">
              <table class="tbl" style="width:100%;font-size:.85rem">
                <thead><tr style="text-align:left">
                  <th style="padding:6px">Pos</th>
                  <th style="padding:6px">Student</th>
                  ${names.map((n) => `<th style="padding:6px;text-align:center">${esc(n)}</th>`).join("")}
                  <th style="padding:6px;text-align:right">Total</th>
                  <th style="padding:6px;text-align:right">Avg %</th>
                </tr></thead>
                <tbody>
                  ${d.students.map((x) => `
                    <tr style="border-top:1px solid var(--border)">
                      <td style="padding:6px"><b>${x.position || "—"}</b></td>
                      <td style="padding:6px">${esc(x.lastName)} ${esc(x.firstName)}</td>
                      ${names.map((n) => {
                        const y = x.subjects.find((z) => z.name === n);
                        return `<td style="padding:6px;text-align:center">${y && y.points !== null ? y.points : "—"}</td>`;
                      }).join("")}
                      <td style="padding:6px;text-align:right"><b>${x.totalPoints}</b></td>
                      <td style="padding:6px;text-align:right">${x.averagePct ?? "—"}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
            <p style="margin-top:10px;font-size:.75rem;color:var(--muted)">
              ${d.students.length} student${d.students.length === 1 ? "" : "s"} ·
              Term: ${esc(d.term.name)}${d.term.year ? ", " + d.term.year : ""}
              ${!settings.publishPosition ? " · Students and parents cannot see positions" : ""}
            </p>
          `;
        } catch (e) {
          box.innerHTML = `<div style="color:var(--red);font-size:.85rem;padding:10px">${esc(e.message)}</div>`;
        }
      };

      // Auto-load current term for S5
      $("ptLoad").click();
    } catch (err) {
      body.innerHTML = `<div style="color:var(--red)">Failed to load points: ${esc(err.message)}</div>`;
    }
  }

  // Boot
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTeacherExtras);
  } else {
    initTeacherExtras();
  }
})();
