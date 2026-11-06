// ================================================================
// edutraceug - Admin Extras Extension Script (admin-extras.js)
// Standalone extension module for admin dashboard (school-admin.html)
// Endpoint: https://edutraceug-extras-worker.anubisdigital114-9df.workers.dev
// ================================================================

(function () {
  "use strict";

  const EXTRAS_BASE = "https://edutraceug-extras-worker.anubisdigital114-9df.workers.dev";

  // State Management
  const ES = {
    schoolId: null,
    user: null,
    token: null,
    activeView: null
  };

  // Helper Utilities
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
    if (window.firebase && window.firebase.auth) {
      const currentUser = window.firebase.auth().currentUser;
      if (currentUser) return await currentUser.getIdToken();
    }
    // Fallback if auth SDK instance is standard ES module export attached globally
    if (window.auth && typeof window.auth.currentUser?.getIdToken === "function") {
      return await window.auth.currentUser.getIdToken();
    }
    throw new Error("Authentication context unavailable");
  }

  async function apiExtras(path, options = {}) {
    try {
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
    } catch (err) {
      throw err;
    }
  }

  // ================================================================
  // 1. Initialization & Sidebar Injection
  // ================================================================

  function initAdminExtras() {
    // Attempt to infer schoolId from window state or token claims
    if (window.S && window.S.schoolId) {
      ES.schoolId = window.S.schoolId;
    }

    injectSidebarItems();
    injectViewContainers();
    observeReportCards();
  }

  function injectSidebarItems() {
    const sidebarNav = q(".sidebar-nav") || q("nav") || $("sidebar");
    if (!sidebarNav) return;

    // Avoid duplicate injection
    if ($("snav-datasets")) return;

    const navItems = [
      { id: "snav-datasets", view: "ext-datasets", icon: "fa-database", label: "Custom Datasets" },
      { id: "snav-subjects", view: "ext-subjects", icon: "fa-book-bookmark", label: "Custom Subjects" },
      { id: "snav-promotion", view: "ext-promotion", icon: "fa-graduation-cap", label: "Yearly Promotion" },
      { id: "snav-materials", view: "ext-materials", icon: "fa-folder-open", label: "Class Materials" },
      { id: "snav-compare", view: "ext-compare", icon: "fa-chart-column", label: "Term Comparison" }
    ];

    const sectionHeader = document.createElement("div");
    sectionHeader.className = "snav-header";
    sectionHeader.style.cssText = "padding:12px 16px 4px;font-size:0.7rem;font-weight:800;text-transform:uppercase;color:var(--muted, #888);letter-spacing:1px;";
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
          qa(".ext-view").forEach((v) => v.classList.remove("active"));
          qa("[id^='snav-']").forEach((s) => s.classList.remove("active"));
        });
      }
    });
  }

  function injectViewContainers() {
    const mainContent = q("main") || q(".main-content") || document.body;

    const views = [
      { id: "ext-datasets", title: "Custom Data Sets", render: renderDatasetsView },
      { id: "ext-subjects", title: "Custom Subjects Management", render: renderSubjectsView },
      { id: "ext-promotion", title: "Yearly Student Auto-Promotion", render: renderPromotionView },
      { id: "ext-materials", title: "Class Materials (PDFs)", render: renderMaterialsView },
      { id: "ext-compare", title: "Term Performance Comparison", render: renderCompareView }
    ];

    views.forEach((v) => {
      if ($(v.id)) return;
      const sec = document.createElement("section");
      sec.id = v.id;
      sec.className = "view ext-view";
      sec.dataset.view = v.id;
      sec.style.display = "none";
      sec.innerHTML = `
        <div class="view-header">
          <h2>${v.title}</h2>
        </div>
        <div class="card"><div class="card-body" id="${v.id}-content">Loading...</div></div>
      `;
      mainContent.appendChild(sec);
    });
  }

  function switchExtraView(viewId) {
    // Hide standard views and remove active state from standard nav
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
    ES.schoolId = (window.S && window.S.schoolId) || ES.schoolId;

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
    }
  }

  // ================================================================
  // 2. Section Renderers
  // ================================================================

  // --- Custom Subjects ---
  async function renderSubjectsView() {
    const c = $("ext-subjects-content");
    c.innerHTML = `<div class="skel h20 w50"></div><div class="skel h80"></div>`;
    try {
      const data = await apiExtras(`/schools/${encodeURIComponent(ES.schoolId)}/subjects`);
      const subjects = data.subjects || [];

      c.innerHTML = `
        <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
          <input type="text" id="extSubName" placeholder="New subject name" style="padding:8px 12px;border:2px solid var(--border, #ccc);flex:1;min-width:200px">
          <button class="btn btn-primary" id="extSubAddBtn"><i class="fa-solid fa-plus"></i> Add Subject</button>
        </div>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>Subject Name</th><th>Actions</th></tr></thead>
            <tbody>
              ${subjects.map((s) => `
                <tr>
                  <td><b>${esc(s.name)}</b></td>
                  <td>
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

  // --- Yearly Promotion ---
  async function renderPromotionView() {
    const c = $("ext-promotion-content");
    c.innerHTML = `<div class="skel h40"></div><div class="skel h80"></div>`;
    try {
      const status = await apiExtras(`/schools/${encodeURIComponent(ES.schoolId)}/promotion/status`);
      const run = status.run || {};

      c.innerHTML = `
        <div style="padding:14px;background:var(--light, #f8f9fa);border:1px solid var(--border, #eee);margin-bottom:16px">
          <div><b>Target Academic Year:</b> ${status.year}</div>
          <div><b>Auto-Promote Cron Enabled:</b> ${status.autoPromote ? "Yes" : "No"}</div>
          <div><b>Last Run Status:</b> ${run.status ? `<span class="pill blue">${esc(run.status)}</span>` : "Not run yet"}</div>
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
            <ul>
              ${(prev.summary || []).map((s) => `<li>${esc(s.from)} → ${esc(s.to)}: <b>${s.count}</b> students</li>`).join("")}
            </ul>
            ${prev.unrecognisedClass?.length ? `<div style="color:var(--red)">Unrecognized classes: ${prev.unrecognisedClass.length}</div>` : ""}
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
        if (!confirm("Are you sure you want to revert the last promotion execution?")) return;
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

  // --- Class Materials ---
  async function renderMaterialsView() {
    const c = $("ext-materials-content");
    c.innerHTML = `<div class="skel h20 w50"></div><div class="skel h80"></div>`;
    try {
      const data = await apiExtras(`/schools/${encodeURIComponent(ES.schoolId)}/materials`);
      const list = data.materials || [];

      c.innerHTML = `
        <div style="margin-bottom:16px;padding:12px;border:1px dashed var(--border, #ccc)">
          <h4>Upload PDF Material</h4>
          <form id="extMaterialForm" style="display:grid;gap:10px;grid-template-columns:1fr 1fr">
            <input type="text" id="extMatTitle" placeholder="Document Title" required style="grid-column:1/-1;padding:8px">
            <input type="text" id="extMatSubject" placeholder="Subject (Optional)" style="padding:8px">
            <input type="text" id="extMatClass" placeholder="Class (e.g. Senior 1)" style="padding:8px">
            <input type="file" id="extMatFile" accept="application/pdf" required style="grid-column:1/-1">
            <button type="submit" class="btn btn-primary" style="grid-column:1/-1"><i class="fa-solid fa-upload"></i> Upload Material</button>
          </form>
        </div>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>Title</th><th>Subject</th><th>Classes</th><th>File</th><th>Actions</th></tr></thead>
            <tbody>
              ${list.map((m) => `
                <tr>
                  <td><b>${esc(m.title)}</b></td>
                  <td>${esc(m.subject || "—")}</td>
                  <td>${(m.classes || []).map((cl) => `<span class="pill blue">${esc(cl)}</span>`).join(" ")}</td>
                  <td><a href="${EXTRAS_BASE}/schools/${encodeURIComponent(ES.schoolId)}/materials/${encodeURIComponent(m.id)}/file" target="_blank">PDF</a></td>
                  <td><button class="btn btn-red btn-sm" data-del-mat="${esc(m.id)}"><i class="fa-solid fa-trash"></i></button></td>
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
    } catch (err) {
      c.innerHTML = `<div class="empty"><h3>Failed to load materials</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  // --- Custom Datasets ---
  async function renderDatasetsView() {
    const c = $("ext-datasets-content");
    c.innerHTML = `<div class="skel h80"></div>`;
    try {
      const data = await apiExtras(`/schools/${encodeURIComponent(ES.schoolId)}/datasets`);
      const list = data.datasets || [];

      c.innerHTML = `
        <div style="margin-bottom:12px;display:flex;justify-content:space-between">
          <span>Configured Custom Datasets: <b>${list.length}</b></span>
        </div>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>Name</th><th>Description</th><th>Fields</th><th>Actions</th></tr></thead>
            <tbody>
              ${list.map((d) => `
                <tr>
                  <td><b>${esc(d.name)}</b></td>
                  <td>${esc(d.description || "—")}</td>
                  <td>${(d.fields || []).length} field(s)</td>
                  <td><button class="btn btn-outline btn-sm" data-view-ds="${esc(d.id)}">View Entries</button></td>
                </tr>
              `).join("") || '<tr><td colspan="4" style="text-align:center;color:var(--muted)">No custom datasets configured.</td></tr>'}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      c.innerHTML = `<div class="empty"><h3>Failed to load datasets</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  // --- Term Comparison SVG Chart ---
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

      // Render plain CSS/SVG Bar Chart
      const svgHeight = 240;
      const barWidth = 18;
      const groupGap = 24;
      const svgWidth = Math.max(600, labels.length * (series.length * barWidth + groupGap) + 40);

      const colors = ["#3570BC", "#E67E22"];

      let chartBars = "";
      labels.forEach((lbl, groupIdx) => {
        const xBase = 40 + groupIdx * (series.length * barWidth + groupGap);
        series.forEach((s, sIdx) => {
          const val = s.values[groupIdx] || 0;
          const h = (val / 100) * (svgHeight - 40);
          const x = xBase + sIdx * barWidth;
          const y = svgHeight - 30 - h;
          chartBars += `
            <rect x="${x}" y="${y}" width="${barWidth - 2}" height="${h}" fill="${colors[sIdx % colors.length]}">
              <title>${esc(s.name)} - ${lbl}: ${val}%</title>
            </rect>
          `;
        });
        chartBars += `<text x="${xBase + (series.length * barWidth) / 2}" y="${svgHeight - 10}" font-size="10" text-anchor="middle" fill="#666">${esc(lbl)}</text>`;
      });

      c.innerHTML = `
        <div style="margin-bottom:12px;font-size:0.85rem">
          Comparing: ${series.map((s, i) => `<span style="display:inline-block;margin-right:12px"><span style="display:inline-block;width:12px;height:12px;background:${colors[i % colors.length]};margin-right:4px"></span><b>${esc(s.name)}</b></span>`).join("")}
        </div>
        <div style="overflow-x:auto;background:#fff;border:1px solid var(--border, #eee);padding:10px">
          <svg width="${svgWidth}" height="${svgHeight}">
            <line x1="30" y1="10" x2="30" y2="${svgHeight - 30}" stroke="#ccc" stroke-width="1"/>
            <line x1="30" y1="${svgHeight - 30}" x2="${svgWidth}" y2="${svgHeight - 30}" stroke="#ccc" stroke-width="1"/>
            ${chartBars}
          </svg>
        </div>
      `;
    } catch (err) {
      c.innerHTML = `<div class="empty"><h3>Failed to load analytics</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  // ================================================================
  // 3. Class Reports MutationObserver (Compact Card Inserter)
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

  function openCompactReportCard(rid, termId) {
    if (typeof window.openModal === "function") {
      window.openModal({
        title: "Compact Report Card",
        wide: "wider",
        body: `<iframe style="width:100%;height:520px;border:none" src="${EXTRAS_BASE}/schools/${encodeURIComponent(ES.schoolId)}/report-card?rosterId=${encodeURIComponent(rid)}&termId=${encodeURIComponent(termId)}"></iframe>`,
        foot: `<button class="btn btn-outline" onclick="closeModal()">Close</button>`
      });
    }
  }

  // ================================================================
  // Boot Sequence
  // ================================================================
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAdminExtras);
  } else {
    initAdminExtras();
  }
})();
