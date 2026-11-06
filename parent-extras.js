// ================================================================
// edutraceug - Parent Extras Extension Script (parent-extras.js)
// Standalone extension module for parent portal (parent.html)
// Endpoint: https://edutraceug-extras-worker.anubisdigital114-9df.workers.dev
// ================================================================

(function () {
  "use strict";

  const EXTRAS_BASE = "https://edutraceug-extras-worker.anubisdigital114-9df.workers.dev";

  const PE = {
    schoolId: null,
    token: null
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
  // Initialization & Card Injection
  // ================================================================

  function initParentExtras() {
    // Wait for main initialization to populate window / state
    const checkInterval = setInterval(() => {
      if (window.state && window.state.schoolId) {
        PE.schoolId = window.state.schoolId;
        clearInterval(checkInterval);
        injectParentCards();
        loadParentExtrasData();
      }
    }, 200);
  }

  function injectParentCards() {
    const main = q("main") || document.body;
    if ($("parentExtrasWrap")) return;

    const wrap = document.createElement("div");
    wrap.id = "parentExtrasWrap";
    wrap.style.cssText = "margin-top:20px;display:flex;flex-direction:column;gap:20px;";
    wrap.innerHTML = `
      <div class="card" id="parentMaterialsCard">
        <div class="card-head">
          <h2><i class="fa-solid fa-folder-open"></i> Class Materials &amp; Resources</h2>
        </div>
        <div class="card-body" id="parentMaterialsBody">
          <div class="skel h40"></div>
        </div>
      </div>
      <div class="card" id="parentDatasetsCard">
        <div class="card-head">
          <h2><i class="fa-solid fa-database"></i> School Information &amp; Datasets</h2>
        </div>
        <div class="card-body" id="parentDatasetsBody">
          <div class="skel h40"></div>
        </div>
      </div>
    `;
    main.appendChild(wrap);
  }

  async function loadParentExtrasData() {
    if (!PE.schoolId) return;

    // Load Materials
    try {
      const matData = await apiExtras(`/schools/${encodeURIComponent(PE.schoolId)}/materials`);
      const list = matData.materials || [];
      const matBody = $("parentMaterialsBody");

      if (matBody) {
        matBody.innerHTML = list.length ? `
          <div class="table-wrap">
            <table class="tbl" style="width:100%;border-collapse:collapse">
              <thead><tr style="text-align:left;border-bottom:1px solid var(--border)"><th style="padding:8px">Title</th><th style="padding:8px">Subject</th><th style="padding:8px">Action</th></tr></thead>
              <tbody>
                ${list.map((m) => `
                  <tr style="border-bottom:1px solid var(--border)">
                    <td style="padding:8px"><b>${esc(m.title)}</b></td>
                    <td style="padding:8px">${esc(m.subject || "General")}</td>
                    <td style="padding:8px"><a href="${EXTRAS_BASE}/schools/${encodeURIComponent(PE.schoolId)}/materials/${encodeURIComponent(m.id)}/file" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-download"></i> Download PDF</a></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        ` : `<div style="color:var(--muted);text-align:center;padding:12px">No learning materials uploaded for your classes yet.</div>`;
      }
    } catch (err) {
      if ($("parentMaterialsBody")) {
        $("parentMaterialsBody").innerHTML = `<div style="color:var(--red)">Failed to load class materials.</div>`;
      }
    }

    // Load Datasets
    try {
      const dsData = await apiExtras(`/schools/${encodeURIComponent(PE.schoolId)}/datasets`);
      const dsList = dsData.datasets || [];
      const dsBody = $("parentDatasetsBody");

      if (dsBody) {
        dsBody.innerHTML = dsList.length ? `
          <div style="display:flex;flex-direction:column;gap:10px">
            ${dsList.map((d) => `
              <div style="padding:10px;border:1px solid var(--border);background:var(--light,#f8f9fa)">
                <h4 style="font-size:.9rem;font-weight:800">${esc(d.name)}</h4>
                <p style="font-size:.82rem;color:var(--muted)">${esc(d.description || "")}</p>
              </div>
            `).join("")}
          </div>
        ` : `<div style="color:var(--muted);text-align:center;padding:12px">No published datasets available.</div>`;
      }
    } catch (err) {
      if ($("parentDatasetsBody")) {
        $("parentDatasetsBody").innerHTML = `<div style="color:var(--red)">Failed to load custom datasets.</div>`;
      }
    }
  }

  // Boot
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initParentExtras);
  } else {
    initParentExtras();
  }
})();
