// ================================================================
// edutraceug - Admin Extras Extension Script (admin-extras.js)
// Standalone extension module for admin dashboard (school-admin.html)
// Endpoint: https://edutraceug-extras-worker.anubisdigital114-9df.workers.dev
//
// IMPORTANT: this file must be loaded with
//   <script type="module" src="admin-extras.js"></script>
// otherwise the imports below will fail and nothing will load.
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

  const ES = {
    schoolId: null,
    activeView: null
  };

  // Pull the school ID from the signed-in admin's token claims.
  onAuthStateChanged(auth, async (u) => {
    if (u) ES.schoolId = (await u.getIdTokenResult()).claims.schoolId;
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
  // 1. Initialization & Sidebar Injection
  // ================================================================

  function initAdminExtras() {
    injectSidebarItems();
    injectViewContainers();
    observeReportCards();
  }

  function injectSidebarItems() {
    const sidebarNav = q(".snav") || q("nav") || $("sidebar");
    if (!sidebarNav || $("snav-datasets")) return;

    const navItems = [
      { id: "snav-datasets", view: "ext-datasets", icon: "fa-database", label: "Custom Datasets" },
      { id: "snav-subjects", view: "ext-subjects", icon: "fa-book-bookmark", label: "Custom Subjects" },
      { id: "snav-promotion", view: "ext-promotion", icon: "fa-graduation-cap", label: "Yearly Promotion" },
      { id: "snav-materials", view: "ext-materials", icon: "fa-folder-open", label: "Class Materials" },
      { id: "snav-compare", view: "ext-compare", icon: "fa-chart-column", label: "Term Comparison" },
      { id: "snav-points", view: "ext-points", icon: "fa-ranking-star", label: "S5/S6 Points" }
    ];

    const sectionHeader = document.createElement("div");
    sectionHeader.className = "snav-label";
    sectionHeader.textContent = "Extras & Analytics";
    sidebarNav.appendChild(sectionHeader);

    navItems.forEach((item) => {
      const div = document.createElement("div");
      div.id = item.id;
      div.className = "snav-item";
      div.dataset.view = item.view;
      div.innerHTML = `<i class="fa-solid ${item.icon}"></i><span>${item.label}</span>`;
      div.addEventListener("click", () => switchExtraView(item.view));
      sidebarNav.appendChild(div);
    });

    // Intercept default sidebar items to handle deactivation of extras views
    qa(".snav-item").forEach((el) => {
      if (!el.id.startsWith("snav-")) {
        el.addEventListener("click", () => {
          qa(".view").forEach((v) => {
            v.style.display = "";
          });
          qa("[id^='snav-']").forEach((s) => s.classList.remove("active"));
        });
      }
    });
  }

  function injectViewContainers() {
    const mainContent = q(".main") || q("main") || document.body;

    const views = [
      { id: "ext-datasets", title: "Custom Data Sets", render: renderDatasetsView },
      { id: "ext-subjects", title: "Custom Subjects Management", render: renderSubjectsView },
      { id: "ext-promotion", title: "Yearly Student Auto-Promotion", render: renderPromotionView },
      { id: "ext-materials", title: "Class Materials (PDFs)", render: renderMaterialsView },
      { id: "ext-compare", title: "Term Performance Comparison", render: renderCompareView },
      { id: "ext-points", title: "Senior 5 & 6 Points", render: renderPointsView }
    ];

    views.forEach((v) => {
      if ($(v.id)) return;
      const sec = document.createElement("section");
      sec.id = v.id;
      sec.className = "view ext-view";
      sec.dataset.view = v.id;
      sec.style.display = "none";
      sec.innerHTML = `
        <div class="page-head">
          <div>
            <h1>${v.title}</h1>
            <p>Managed via Edutrace Extras Extension</p>
          </div>
        </div>
        <div class="card"><div class="card-body" id="${v.id}-content">Loading...</div></div>
      `;
      mainContent.appendChild(sec);
    });
  }

  function switchExtraView(viewId) {
    qa(".view").forEach((v) => {
      v.classList.remove("active");
      v.style.display = "none";
    });
    qa(".snav-item").forEach((n) => n.classList.remove("active"));

    const targetNav = $(`snav-${viewId.replace("ext-", "")}`);
    const targetView = $(viewId);

    if (targetNav) targetNav.classList.add("active");
    if (targetView) {
      targetView.classList.add("active");
      targetView.style.display = "block";
    }

    ES.activeView = viewId;

    // Fallback: if the auth state change hasn't fired yet, re-read it now.
    if (!ES.schoolId && auth.currentUser) {
      auth.currentUser.getIdTokenResult().then((r) => {
        ES.schoolId = r.claims.schoolId;
        if (ES.schoolId) switchExtraView(viewId);
      }).catch(() => {});
      return;
    }

    if (!ES.schoolId) {
      toast("School context missing", "error");
      return;
    }

    switch (viewId) {
      case "ext-datasets": renderDatasetsView(); break;
      case "ext-subjects": renderSubjectsView(); break;
      case "ext-promotion": renderPromotionView(); break;
      case "ext-materials": renderMaterialsView(); break;
      case "ext-compare": renderCompareView(); break;
      case "ext-points": renderPointsView(); break;
    }
  }

  // ================================================================
  // 2. Section Renderers
  // ================================================================

  async function renderSubjectsView() {
    const c = $("ext-subjects-content");
    c.innerHTML = `<div class="skel h20 w50"></div><div class="skel h80"></div>`;
    try {
      const data = await apiExtras(`/schools/${encodeURIComponent(ES.schoolId)}/subjects`);
      const subjects = data.subjects || [];

      c.innerHTML = `
        <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
          <input type="text" id="extSubName" placeholder="New subject name" style="padding:11px 12px;border:2px solid var(--border);flex:1;min-width:200px">
          <button class="btn btn-primary" id="extSubAddBtn"><i class="fa-solid fa-plus"></i> Add Subject</button>
        </div>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>Subject Name</th><th style="text-align:right">Actions</th></tr></thead>
            <tbody>
              ${subjects.map((s) => `
                <tr>
                  <td><b>${esc(s.name)}</b></td>
                  <td style="text-align:right">
                    <button class="btn btn-red btn-sm" data-del-sub="${esc(s.id)}"><i class="fa-solid fa-trash"></i> Delete</button>
                  </td>
                </tr>
              `).join("") || '<tr><td colspan="2" style="text-align:center;color:var(--muted)">No custom subjects found.</td></tr>'}
            </tbody>
          </table>
        </div>
      `;

      $("extSubAddBtn").onclick = async () => {
        const val = $("extSubName").value.trim();
        if (!val) return toast("Enter subject name", "warn");
        try {
          await apiExtras(`/schools/${encodeURIComponent(ES.schoolId)}/subjects`, {
            method: "POST",
            body: { name: val }
          });
          toast("Subject added", "success");
          renderSubjectsView();
        } catch (e) { toast(e.message, "error"); }
      };

      qa("[data-del-sub]", c).forEach((btn) => {
        btn.onclick = async () => {
          if (!confirm("Delete this subject?")) return;
          try {
            await apiExtras(`/schools/${encodeURIComponent(ES.schoolId)}/subjects/${encodeURIComponent(btn.dataset.delSub)}`, {
              method: "DELETE"
            });
            toast("Subject deleted", "success");
            renderSubjectsView();
          } catch (e) { toast(e.message, "error"); }
        };
      });
    } catch (err) {
      c.innerHTML = `<div class="empty"><h3>Failed to load subjects</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  async function renderPromotionView() {
    const c = $("ext-promotion-content");
    c.innerHTML = `<div class="skel h40"></div><div class="skel h80"></div>`;
    try {
      const status = await apiExtras(`/schools/${encodeURIComponent(ES.schoolId)}/promotion/status`);
      const run = status.run || {};

      c.innerHTML = `
        <div style="padding:14px;background:var(--light);border:1px solid var(--border);margin-bottom:16px;font-size:.9rem">
          <div><b>Target Academic Year:</b> ${status.year}</div>
          <div style="margin-top:4px"><b>Auto-Promote Cron Enabled:</b> ${status.autoPromote ? "Yes" : "No"}</div>
          <div style="margin-top:4px"><b>Last Run Status:</b> ${run.status ? `<span class="pill blue">${esc(run.status)}</span>` : "Not run yet"}</div>
          ${run.promoted ? `<div style="margin-top:6px">Promoted: <b>${run.promoted}</b> | Graduated: <b>${run.graduated}</b></div>` : ""}
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-outline" id="extPromoPreviewBtn"><i class="fa-solid fa-eye"></i> Preview Promotion</button>
          <button class="btn btn-primary" id="extPromoRunBtn"><i class="fa-solid fa-play"></i> Run Auto-Promotion</button>
          <button class="btn btn-red" id="extPromoUndoBtn"><i class="fa-solid fa-rotate-left"></i> Undo Promotion</button>
        </div>
        <div id="extPromoPreviewResult" style="margin-top:16px"></div>
      `;

      $("extPromoPreviewBtn").onclick = async () => {
        const resBox = $("extPromoPreviewResult");
        resBox.innerHTML = `Loading preview...`;
        try {
          const prev = await apiExtras(`/schools/${encodeURIComponent(ES.schoolId)}/promotion/preview`);
          resBox.innerHTML = `
            <h4>Preview Summary (Moving ${prev.willMove} students)</h4>
            <ul style="margin-top:8px;font-size:.9rem">
              ${(prev.summary || []).map((s) => `<li>${esc(s.from)} → ${esc(s.to)}: <b>${s.count}</b> students</li>`).join("")}
            </ul>
          `;
        } catch (e) { resBox.innerHTML = `<span style="color:var(--red)">${esc(e.message)}</span>`; }
      };

      $("extPromoRunBtn").onclick = async () => {
        if (!confirm("Run yearly auto-promotion now?")) return;
        try {
          await apiExtras(`/schools/${encodeURIComponent(ES.schoolId)}/promotion/run`, { method: "POST" });
          toast("Promotion completed", "success");
          renderPromotionView();
        } catch (e) { toast(e.message, "error"); }
      };

      $("extPromoUndoBtn").onclick = async () => {
        if (!confirm("Revert the last promotion execution?")) return;
        try {
          await apiExtras(`/schools/${encodeURIComponent(ES.schoolId)}/promotion/undo`, { method: "POST" });
          toast("Promotion undone", "success");
          renderPromotionView();
        } catch (e) { toast(e.message, "error"); }
      };
    } catch (err) {
      c.innerHTML = `<div class="empty"><h3>Failed to load promotion status</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  async function renderMaterialsView() {
    const c = $("ext-materials-content");
    c.innerHTML = `<div class="skel h20 w50"></div><div class="skel h80"></div>`;
    try {
      const data = await apiExtras(`/schools/${encodeURIComponent(ES.schoolId)}/materials`);
      const list = data.materials || [];

      c.innerHTML = `
        <div style="margin-bottom:20px;padding:16px;border:1px solid var(--border);background:var(--light)">
          <h4 style="font-size:.95rem;font-weight:800;margin-bottom:12px">Upload PDF Material</h4>
          <form id="extMaterialForm" style="display:grid;gap:12px">
            <input type="text" id="extMatTitle" placeholder="Document Title" required style="padding:11px 12px;border:2px solid var(--border)">
            <div class="grid2">
              <input type="text" id="extMatSubject" placeholder="Subject (Optional)" style="padding:11px 12px;border:2px solid var(--border)">
              <input type="text" id="extMatClass" placeholder="Class (e.g. Senior 1)" style="padding:11px 12px;border:2px solid var(--border)">
            </div>
            <input type="file" id="extMatFile" accept="application/pdf" required>
            <button type="submit" class="btn btn-primary" style="width:fit-content"><i class="fa-solid fa-upload"></i> Upload Material</button>
          </form>
        </div>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>Title</th><th>Subject</th><th>Classes</th><th>File</th><th style="text-align:right">Actions</th></tr></thead>
            <tbody>
              ${list.map((m) => `
                <tr>
                  <td><b>${esc(m.title)}</b></td>
                  <td>${esc(m.subject || "—")}</td>
                  <td>${(m.classes || []).map((cl) => `<span class="pill blue">${esc(cl)}</span>`).join(" ")}</td>
                  <td><a href="#" data-open-mat="${esc(m.id)}" style="color:var(--primary);font-weight:700">PDF</a></td>
                  <td style="text-align:right"><button class="btn btn-red btn-sm" data-del-mat="${esc(m.id)}"><i class="fa-solid fa-trash"></i></button></td>
                </tr>
              `).join("") || '<tr><td colspan="5" style="text-align:center;color:var(--muted)">No class materials uploaded yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      `;

      $("extMaterialForm").onsubmit = async (e) => {
        e.preventDefault();
        const file = $("extMatFile").files[0];
        if (!file) return;
        const fd = new FormData();
        fd.append("file", file);
        fd.append("title", $("extMatTitle").value.trim());
        fd.append("subject", $("extMatSubject").value.trim());
        fd.append("classes", JSON.stringify([$("extMatClass").value.trim()].filter(Boolean)));

        try {
          await apiExtras(`/schools/${encodeURIComponent(ES.schoolId)}/materials`, {
            method: "POST",
            body: fd
          });
          toast("Material uploaded successfully", "success");
          renderMaterialsView();
        } catch (err) { toast(err.message, "error"); }
      };

      qa("[data-del-mat]", c).forEach((btn) => {
        btn.onclick = async () => {
          if (!confirm("Delete this material?")) return;
          try {
            await apiExtras(`/schools/${encodeURIComponent(ES.schoolId)}/materials/${encodeURIComponent(btn.dataset.delMat)}`, { method: "DELETE" });
            toast("Material deleted", "success");
            renderMaterialsView();
          } catch (e) { toast(e.message, "error"); }
        };
      });

      qa("[data-open-mat]", c).forEach((a) => {
        a.onclick = (e) => { e.preventDefault(); openMaterial(a.dataset.openMat); };
      });
    } catch (err) {
      c.innerHTML = `<div class="empty"><h3>Failed to load materials</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  async function openMaterial(id) {
    const win = window.open("", "_blank");
    try {
      const token = await getAuthToken();
      const res = await fetch(`${EXTRAS_BASE}/schools/${encodeURIComponent(ES.schoolId)}/materials/${encodeURIComponent(id)}/file`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Could not open the file");
      win.location = URL.createObjectURL(await res.blob());
    } catch (e) {
      if (win) win.close();
      toast(e.message, "error");
    }
  }

  async function renderDatasetsView() {
    const c = $("ext-datasets-content");
    c.innerHTML = `<div class="skel h80"></div>`;
    try {
      const data = await apiExtras(`/schools/${encodeURIComponent(ES.schoolId)}/datasets`);
      const list = data.datasets || [];

      c.innerHTML = `
        <div style="margin-bottom:12px;font-size:.9rem">
          Configured Custom Datasets: <b>${list.length}</b>
        </div>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>Name</th><th>Description</th><th>Fields</th></tr></thead>
            <tbody>
              ${list.map((d) => `
                <tr>
                  <td><b>${esc(d.name)}</b></td>
                  <td>${esc(d.description || "—")}</td>
                  <td>${(d.fields || []).length} field(s)</td>
                </tr>
              `).join("") || '<tr><td colspan="3" style="text-align:center;color:var(--muted)">No custom datasets configured.</td></tr>'}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      c.innerHTML = `<div class="empty"><h3>Failed to load datasets</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  async function renderCompareView() {
    const c = $("ext-compare-content");
    c.innerHTML = `<div class="skel h80"></div>`;
    try {
      const data = await apiExtras(`/schools/${encodeURIComponent(ES.schoolId)}/analytics/compare`);
      const labels = data.labels || [];
      const series = data.series || [];

      if (!series.length || !labels.length) {
        c.innerHTML = `<div class="empty"><h3>Insufficient analytics data to display comparison chart.</h3></div>`;
        return;
      }

      const svgHeight = 240;
      const barWidth = 18;
      const groupGap = 24;
      const svgWidth = Math.max(600, labels.length * (series.length * barWidth + groupGap) + 40);
      const colors = ["#3570BC", "#008E34"];

      let chartBars = "";
      labels.forEach((lbl, groupIdx) => {
        const xBase = 40 + groupIdx * (series.length * barWidth + groupGap);
        series.forEach((s, sIdx) => {
          const val = s.values[groupIdx] || 0;
          const h = (val / 100) * (svgHeight - 40);
          const x = xBase + sIdx * barWidth;
          const y = svgHeight - 30 - h;
          chartBars += `<rect x="${x}" y="${y}" width="${barWidth - 2}" height="${h}" fill="${colors[sIdx % colors.length]}"><title>${esc(s.name)} - ${lbl}: ${val}%</title></rect>`;
        });
        chartBars += `<text x="${xBase + (series.length * barWidth) / 2}" y="${svgHeight - 10}" font-size="10" text-anchor="middle" fill="#555">${esc(lbl)}</text>`;
      });

      c.innerHTML = `
        <div style="margin-bottom:12px;font-size:0.85rem">
          Comparing: ${series.map((s, i) => `<span style="display:inline-block;margin-right:12px"><span style="display:inline-block;width:12px;height:12px;background:${colors[i % colors.length]};margin-right:4px"></span><b>${esc(s.name)}</b></span>`).join("")}
        </div>
        <div style="overflow-x:auto;background:#fff;border:1px solid var(--border);padding:10px">
          <svg width="${svgWidth}" height="${svgHeight}">
            <line x1="30" y1="10" x2="30" y2="${svgHeight - 30}" stroke="#E5E5E5" stroke-width="1"/>
            <line x1="30" y1="${svgHeight - 30}" x2="${svgWidth}" y2="${svgHeight - 30}" stroke="#E5E5E5" stroke-width="1"/>
            ${chartBars}
          </svg>
        </div>
      `;
    } catch (err) {
      c.innerHTML = `<div class="empty"><h3>Failed to load analytics</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  // ================================================================
  // 3. Points view (S5/S6)
  // ================================================================

  async function renderPointsView() {
    const c = $("ext-points-content");
    const sid = encodeURIComponent(ES.schoolId);
    c.innerHTML = `<div class="skel h80"></div>`;
    try {
      const [s, t] = await Promise.all([
        apiExtras(`/schools/${sid}/points/settings`, {}, POINTS_BASE),
        apiExtras(`/schools/${sid}/terms`, {}, TEACHERS_BASE)
      ]);
      const terms = t.terms || [];
      let bands = s.bands.length ? s.bands : [{ min: 0, max: 100, points: 0 }];
      const inp = "padding:8px;border:2px solid var(--border);font-size:.85rem;width:100%";
      const read = () => qa("#ptBands > div").map((r) => ({
        min: Number(q('[data-pb="min"]', r).value),
        max: Number(q('[data-pb="max"]', r).value),
        points: Number(q('[data-pb="points"]', r).value)
      }));
      const paint = () => {
        $("ptBands").innerHTML = bands.map((b, i) => `
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;margin-bottom:8px">
            <input type="number" data-pb="min" value="${b.min}" placeholder="Min %" style="${inp}">
            <input type="number" data-pb="max" value="${b.max}" placeholder="Max %" style="${inp}">
            <input type="number" data-pb="points" value="${b.points}" placeholder="Points" style="${inp}">
            <button class="btn btn-red btn-sm" data-pb-rm="${i}" type="button"><i class="fa-solid fa-trash"></i></button>
          </div>`).join("");
        qa("[data-pb-rm]", $("ptBands")).forEach((b) => b.onclick = () => {
          bands = read(); bands.splice(Number(b.dataset.pbRm), 1); paint();
        });
      };

      c.innerHTML = `
        <p style="font-size:.85rem;color:var(--muted);margin-bottom:12px">Points for each subject, based on its total %. Applies to Senior 5 and Senior 6 only.</p>
        <div id="ptBands"></div>
        <label class="check"><input type="checkbox" id="ptPublish" ${s.publishPosition ? "checked" : ""}><span>Show position to students and parents</span></label>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0 24px">
          <button class="btn btn-outline btn-sm" id="ptAdd" type="button"><i class="fa-solid fa-plus"></i> Add band</button>
          <button class="btn btn-primary btn-sm" id="ptSave" type="button">Save points table</button>
        </div>
        <h4 style="font-weight:800;margin-bottom:10px">Class results</h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
          <select id="ptClass" style="${inp};width:auto"><option>Senior 5</option><option>Senior 6</option></select>
          <input id="ptStream" placeholder="Stream" style="${inp};width:120px">
          <select id="ptTerm" style="${inp};width:auto">${terms.map((x) => `<option value="${esc(x.id)}"${x.isCurrent ? " selected" : ""}>${esc(x.name)}${x.year ? ", " + x.year : ""}</option>`).join("")}</select>
          <button class="btn btn-primary btn-sm" id="ptLoad" type="button">Load</button>
        </div>
        <div id="ptResults"></div>`;
      paint();

      $("ptAdd").onclick = () => { bands = read(); bands.push({ min: 0, max: 0, points: 0 }); paint(); };
      $("ptSave").onclick = async () => {
        try {
          await apiExtras(`/schools/${sid}/points/settings`, { method: "PUT", body: { bands: read(), publishPosition: $("ptPublish").checked } }, POINTS_BASE);
          toast("Points table saved", "success");
        } catch (e) { toast(e.message, "error", 6000); }
      };
      $("ptLoad").onclick = async () => {
        const box = $("ptResults");
        const p = new URLSearchParams({ termId: $("ptTerm").value, class: $("ptClass").value });
        if ($("ptStream").value.trim()) p.set("stream", $("ptStream").value.trim());
        box.innerHTML = `<div class="skel h80"></div>`;
        try {
          const d = await apiExtras(`/schools/${sid}/points/class?${p}`, {}, POINTS_BASE);
          const names = [...new Set(d.students.flatMap((x) => x.subjects.map((y) => y.name)))].sort();
          box.innerHTML = d.students.length ? `<div class="table-wrap"><table class="tbl">
            <thead><tr><th>Pos</th><th>Student</th>${names.map((n) => `<th style="text-align:center">${esc(n)}</th>`).join("")}<th>Total</th><th>Avg %</th></tr></thead>
            <tbody>${d.students.map((x) => `<tr>
              <td><b>${x.position || "—"}</b></td>
              <td>${esc(x.lastName)} ${esc(x.firstName)}</td>
              ${names.map((n) => { const y = x.subjects.find((z) => z.name === n); return `<td style="text-align:center">${y && y.points !== null ? y.points : "—"}</td>`; }).join("")}
              <td><b>${x.totalPoints}</b></td><td>${x.averagePct ?? "—"}</td></tr>`).join("")}</tbody>
          </table></div>` : `<div class="empty"><h3>No marks found</h3></div>`;
        } catch (e) { box.innerHTML = `<span style="color:var(--red)">${esc(e.message)}</span>`; }
      };
    } catch (err) {
      c.innerHTML = `<div class="empty"><h3>Failed to load</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  // ================================================================
  // 4. Compact report card
  // ================================================================

  function observeReportCards() {
    const target = $("repList") || document.body;
    const observer = new MutationObserver(() => {
      qa("[data-view-card]").forEach((btn) => {
        if (btn.nextElementSibling?.classList.contains("btn-compact-card")) return;
        const rid = btn.dataset.viewCard;
        const termId = btn.dataset.term;
        const compactBtn = document.createElement("button");
        compactBtn.className = "btn btn-outline btn-sm btn-compact-card";
        compactBtn.style.marginLeft = "4px";
        compactBtn.innerHTML = `<i class="fa-solid fa-id-card"></i> Compact`;
        compactBtn.onclick = () => openCompactReportCard(rid, termId);
        btn.parentNode.insertBefore(compactBtn, btn.nextSibling);
      });
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  async function openCompactReportCard(rid, termId) {
    $("modalTitle").textContent = "Compact Report Card";
    $("modal").className = "modal wider";
    $("modalFoot").innerHTML = "";
    $("modalBody").innerHTML = `<div class="skel h60"></div>`;
    $("modalBack").classList.add("show");
    try {
      const html = await apiExtras(`/schools/${encodeURIComponent(ES.schoolId)}/report-card?rosterId=${encodeURIComponent(rid)}&termId=${encodeURIComponent(termId)}`);
      $("modalBody").innerHTML = `<iframe class="report-frame" id="extRcFrame"></iframe>`;
      $("extRcFrame").srcdoc = html;
    } catch (e) {
      $("modalBody").innerHTML = `<div class="empty"><h3>Could not load</h3><p>${esc(e.message)}</p></div>`;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAdminExtras);
  } else {
    initAdminExtras();
  }
})();
