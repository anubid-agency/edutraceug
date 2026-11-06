// ================================================================
// edutraceug - Teacher Extras Extension Script (teacher-extras.js)
// Standalone extension module for teacher portal (teacher.html)
// Endpoint: https://edutraceug-extras-worker.anubisdigital114-9df.workers.dev
// ================================================================

(function () {
  "use strict";

  const EXTRAS_BASE = "https://edutraceug-extras-worker.anubisdigital114-9df.workers.dev";

  const TE = {
    schoolId: null
  };

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
    if (window.auth && typeof window.auth.currentUser?.getIdToken === "function") {
      return await window.auth.currentUser.getIdToken();
    }
    throw new Error("Authentication context unavailable");
  }

  async function apiExtras(path, options = {}) {
    const token = await getAuthToken();
    const headers = {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    };
    if (options.body && !(options.body instanceof FormData) && typeof options.body === "object") {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }
    const res = await fetch(`${EXTRAS_BASE}${path}`, { ...options, headers });
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
    const checkInterval = setInterval(() => {
      if (window.state && window.state.schoolId) {
        TE.schoolId = window.state.schoolId;
        clearInterval(checkInterval);
        injectHeaderExtrasButton();
      }
    }, 200);
  }

  function injectHeaderExtrasButton() {
    const headerInner = q(".header-inner") || q("header");
    if (!headerInner || $("teacherExtrasBtn")) return;

    // Create an "Extras" button next to the user profile/logout
    const btn = document.createElement("button");
    btn.id = "teacherExtrasBtn";
    btn.className = "btn btn-outline btn-sm";
    btn.style.marginLeft = "auto";
    btn.style.marginRight = "10px";
    btn.innerHTML = `<i class="fa-solid fa-layer-group"></i> Extras`;
    btn.onclick = openExtrasModal;

    // Insert before logout button if present
    const logoutBtn = $("logoutBtn");
    if (logoutBtn) {
      headerInner.insertBefore(btn, logoutBtn);
    } else {
      headerInner.appendChild(btn);
    }
  }

  function openExtrasModal() {
    let modalBack = $("teacherExtrasModal");
    if (!modalBack) {
      modalBack = document.createElement("div");
      modalBack.id = "teacherExtrasModal";
      modalBack.className = "modal-back";
      modalBack.innerHTML = `
        <div class="modal" style="max-width:700px">
          <div class="modal-head">
            <h2>Teacher Resources &amp; Datasets</h2>
            <button class="close" id="teacherModalClose" type="button"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="modal-body" id="teacherModalBody" style="padding:20px">
            <div class="skel h40"></div>
          </div>
        </div>
      `;
      document.body.appendChild(modalBack);
      $("teacherModalClose").onclick = () => modalBack.classList.remove("show");
      modalBack.onclick = (e) => { if (e.target === modalBack) modalBack.classList.remove("show"); };
    }

    modalBack.classList.add("show");
    loadTeacherExtrasContent();
  }

  async function loadTeacherExtrasContent() {
    const body = $("teacherModalBody");
    if (!body) return;
    body.innerHTML = `<div class="skel h40"></div><div class="skel h80"></div>`;

    try {
      const [matData, dsData] = await Promise.all([
        apiExtras(`/schools/${encodeURIComponent(TE.schoolId)}/materials`).catch(() => ({ materials: [] })),
        apiExtras(`/schools/${encodeURIComponent(TE.schoolId)}/datasets`).catch(() => ({ datasets: [] }))
      ]);

      const materials = matData.materials || [];
      const datasets = dsData.datasets || [];

      body.innerHTML = `
        <div style="margin-bottom:24px">
          <h3 style="font-size:1rem;font-weight:800;margin-bottom:12px"><i class="fa-solid fa-folder-open" style="color:var(--primary)"></i> Class Materials &amp; Upload</h3>
          <div style="background:var(--light,#f8f9fa);padding:14px;border:1px solid var(--border);margin-bottom:14px">
            <h4 style="font-size:0.85rem;font-weight:700;margin-bottom:8px">Upload New Material (PDF)</h4>
            <form id="teacherMatForm" style="display:grid;gap:8px">
              <input type="text" id="tMatTitle" placeholder="Document Title" required style="padding:8px;border:1px solid var(--border)">
              <input type="text" id="tMatSubject" placeholder="Subject Name" style="padding:8px;border:1px solid var(--border)">
              <input type="file" id="tMatFile" accept="application/pdf" required>
              <button type="submit" class="btn btn-primary btn-sm" style="width:fit-content"><i class="fa-solid fa-upload"></i> Upload PDF</button>
            </form>
          </div>
          <div style="max-height:180px;overflow-y:auto">
            <table class="tbl" style="width:100%;font-size:0.85rem">
              <thead><tr style="text-align:left"><th style="padding:6px">Title</th><th style="padding:6px">Subject</th><th style="padding:6px">File</th></tr></thead>
              <tbody>
                ${materials.map((m) => `
                  <tr>
                    <td style="padding:6px"><b>${esc(m.title)}</b></td>
                    <td style="padding:6px">${esc(m.subject || "—")}</td>
                    <td style="padding:6px"><a href="${EXTRAS_BASE}/schools/${encodeURIComponent(TE.schoolId)}/materials/${encodeURIComponent(m.id)}/file" target="_blank">Download</a></td>
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
                <div style="font-weight:800;font-size:0.9rem">${esc(d.name)}</div>
                <div style="font-size:0.82rem;color:var(--muted)">${esc(d.description || "No description provided.")}</div>
              </div>
            `).join("") || '<div style="color:var(--muted);text-align:center;padding:10px">No custom datasets found.</div>'}
          </div>
        </div>
      `;

      $("teacherMatForm").onsubmit = async (e) => {
        e.preventDefault();
        const file = $("tMatFile").files[0];
        if (!file) return;
        const fd = new FormData();
        fd.append("file", file);
        fd.append("title", $("tMatTitle").value.trim());
        fd.append("subject", $("tMatSubject").value.trim());

        try {
          await apiExtras(`/schools/${encodeURIComponent(TE.schoolId)}/materials`, {
            method: "POST",
            body: fd
          });
          toast("Material uploaded successfully", "success");
          loadTeacherExtrasContent();
        } catch (err) {
          toast(err.message, "error");
        }
      };

    } catch (err) {
      body.innerHTML = `<div style="color:var(--red)">Failed to load extra resources.</div>`;
    }
  }

  // Boot
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTeacherExtras);
  } else {
    initTeacherExtras();
  }
})();
