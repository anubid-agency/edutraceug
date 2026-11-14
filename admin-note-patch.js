// admin-note-patch.js — injects head/additional comment fields into the note editor.
(function () {
  let lastRid = null;
  let schoolId = null;
  let termId = null;

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-note]");
    if (btn) lastRid = btn.dataset.note;
  }, true);

  function resolveClaims() {
    if (schoolId) return Promise.resolve(schoolId);
    const auth = window.auth;
    if (!auth || !auth.currentUser) return Promise.resolve(null);
    return auth.currentUser.getIdTokenResult().then((r) => {
      schoolId = r.claims.schoolId;
      return schoolId;
    });
  }

  function resolveTermId() {
    if (termId) return Promise.resolve(termId);
    const sid = schoolId;
    if (!sid) return Promise.resolve(null);
    return window.auth.currentUser.getIdToken().then((t) =>
      fetch(`https://edutraceug-teachers-worker.anubisdigital114-9df.workers.dev/schools/${encodeURIComponent(sid)}/terms`, {
        headers: { Authorization: `Bearer ${t}` }
      })
    ).then((r) => r.json()).then((d) => {
      const cur = (d.terms || []).find((x) => x.isCurrent) || (d.terms || [])[0];
      termId = cur ? cur.id : null;
      return termId;
    });
  }

  function patchSave(btn) {
    if (btn.dataset.patched === "1") return;
    btn.dataset.patched = "1";
    btn.onclick = async (e) => {
      if (e) e.preventDefault();
      const conduct = document.getElementById("ntConduct").value.trim();
      const comment = document.getElementById("ntComment").value.trim();
      const head = document.getElementById("ntHeadComment").value.trim();
      const addl = document.getElementById("ntAdditionalComment").value.trim();
      if (!lastRid) return;
      await resolveClaims();
      await resolveTermId();
      if (!schoolId || !termId) return;
      const t = await window.auth.currentUser.getIdToken();
      const res = await fetch(
        `https://edutraceug-marks-worker.anubisdigital114-9df.workers.dev/schools/${encodeURIComponent(schoolId)}/notes`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            termId,
            rosterId: lastRid,
            conduct,
            comment,
            headComment: head,
            additionalComment: addl
          })
        }
      );
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        alert(b.error || "Save failed");
        return;
      }
      document.getElementById("modalBack").classList.remove("show");
      document.getElementById("modalBody").innerHTML = "";
      document.getElementById("modalFoot").innerHTML = "";
    };
  }

  const obs = new MutationObserver(() => {
    const back = document.getElementById("modalBack");
    if (!back || !back.classList.contains("show")) return;
    const body = document.getElementById("modalBody");
    const conduct = document.getElementById("ntConduct");
    const comment = document.getElementById("ntComment");
    if (!body || !conduct || !comment) return;
    if (!document.getElementById("ntHeadComment")) {
      body.insertAdjacentHTML("beforeend", `
        <div class="field"><label for="ntHeadComment">Head Teacher's Comment <span class="hint">admin only</span></label><textarea id="ntHeadComment" rows="4" maxlength="2000"></textarea></div>
        <div class="field"><label for="ntAdditionalComment">Additional Comment</label><textarea id="ntAdditionalComment" rows="3" maxlength="2000"></textarea></div>
      `);
    }
    const saveBtn = document.getElementById("ntSave");
    if (saveBtn) patchSave(saveBtn);
  });
  obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
})();
