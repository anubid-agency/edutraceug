import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const WORKER = "https://edutraceug-commitment-images-worker.anubisdigital114-9df.workers.dev";
const MAX_IMAGES = 2;
const MAX_SIDE = 2000;                 // longest side after shrinking
const TARGET_BYTES = 4.5 * 1024 * 1024; // stay under the worker's 5 MB limit

const auth = getAuth(getApp());
const $ = (id) => document.getElementById(id);

/* ---------- small helpers ---------- */

function toast(msg, kind = "info", ms = 4000) {
  const wrap = $("toastWrap");
  if (!wrap) return;
  const icons = { success: "fa-circle-check", error: "fa-circle-exclamation", info: "fa-circle-info" };
  const t = document.createElement("div");
  t.className = `toast ${kind}`;
  const i = document.createElement("i");
  i.className = `fa-solid ${icons[kind] || icons.info}`;
  const s = document.createElement("span");
  s.textContent = msg;
  t.append(i, s);
  wrap.appendChild(t);
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transition = "opacity .3s";
    setTimeout(() => t.remove(), 300);
  }, ms);
}

let schoolIdCache = null;
async function getSchoolId() {
  if (schoolIdCache) return schoolIdCache;
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const res = await user.getIdTokenResult();
  schoolIdCache = res.claims.schoolId;
  if (!schoolIdCache) throw new Error("No school on this account");
  return schoolIdCache;
}

async function callWorker(method, entryId, body) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const sid = await getSchoolId();
  const url = `${WORKER}/schools/${encodeURIComponent(sid)}/ledger/entries/${encodeURIComponent(entryId)}/commitment-images`;
  const send = (token) => fetch(url, { method, headers: { Authorization: `Bearer ${token}` }, body });
  let res = await send(await user.getIdToken());
  if (res.status === 401) res = await send(await user.getIdToken(true));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ---------- shrink the photo on the phone before upload ---------- */

function toBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read this photo")); };
    img.src = url;
  });
}

async function shrink(file) {
  let bmp;
  try { bmp = await createImageBitmap(file); }
  catch { bmp = await loadImageElement(file); }

  const w0 = bmp.width, h0 = bmp.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
  const w = Math.round(w0 * scale), h = Math.round(h0 * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);

  let q = 0.85;
  let blob = await toBlob(canvas, q);
  while (blob && blob.size > TARGET_BYTES && q > 0.4) {
    q -= 0.15;
    blob = await toBlob(canvas, q);
  }
  if (!blob) throw new Error("Could not prepare this photo");
  if (blob.size > TARGET_BYTES) throw new Error("Photo is still too large. Try a smaller one.");
  return blob;
}

/* ---------- photo viewer ---------- */

async function openViewer(entryId, imageId) {
  try {
    // fetch fresh links, because each link expires after 5 minutes
    const data = await callWorker("GET", entryId);
    const found = (data.images || []).find((x) => x.id === imageId);
    if (!found) throw new Error("Photo not found");
    const img = $("imgViewerImg");
    img.onerror = () => {
      closeViewer();
      window.open(found.viewUrl, "_blank", "noopener");
    };
    img.src = found.viewUrl;
    $("imgViewer").classList.add("show");
  } catch (err) {
    toast(err.message, "error");
  }
}

function closeViewer() {
  $("imgViewer").classList.remove("show");
  $("imgViewerImg").removeAttribute("src");
}

$("imgViewerClose").addEventListener("click", closeViewer);
$("imgViewer").addEventListener("click", (e) => { if (e.target === $("imgViewer")) closeViewer(); });
// Escape closes only the viewer first, not the ledger popup behind it
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("imgViewer").classList.contains("show")) {
    e.stopImmediatePropagation();
    closeViewer();
  }
}, true);

/* ---------- the "Commitment photos" box ---------- */

let activeSection = null;

function setMsg(sec, text, isError = false) {
  const m = sec.querySelector(".cimg-msg");
  m.textContent = text || "";
  m.classList.toggle("err", !!isError);
}

function setBusy(sec, on) {
  sec.querySelectorAll(".cimg-actions .btn").forEach((b) => { b.disabled = on; });
}

async function loadImages(sec) {
  const grid = sec.querySelector(".cimg-grid");
  const count = sec.querySelector(".cimg-count");
  const actions = sec.querySelector(".cimg-actions");
  try {
    const data = await callWorker("GET", sec.dataset.entry);
    const images = data.images || [];
    grid.textContent = "";
    if (!images.length) {
      const e = document.createElement("div");
      e.className = "cimg-empty";
      e.textContent = "No photos yet.";
      grid.appendChild(e);
    }
    images.forEach((img, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cimg-thumb";
      b.setAttribute("aria-label", `Open photo ${i + 1}`);
      const im = document.createElement("img");
      im.alt = `Commitment photo ${i + 1}`;
      im.loading = "lazy";
      im.src = img.viewUrl;
      b.appendChild(im);
      b.onclick = () => openViewer(sec.dataset.entry, img.id);
      grid.appendChild(b);
    });
    count.textContent = `${images.length} of ${MAX_IMAGES}`;
    actions.hidden = images.length >= MAX_IMAGES;
  } catch (err) {
    grid.textContent = "";
    const e = document.createElement("div");
    e.className = "cimg-empty";
    e.textContent = "Couldn't load photos: " + err.message;
    grid.appendChild(e);
  }
}

async function handleFile(sec, file) {
  setBusy(sec, true);
  try {
    if (!file.type.startsWith("image/")) throw new Error("Please choose a photo");
    setMsg(sec, "Preparing photo…");
    const blob = await shrink(file);
    setMsg(sec, "Uploading…");
    const fd = new FormData();
    fd.append("image", blob, "commitment.jpg");
    await callWorker("POST", sec.dataset.entry, fd);
    toast("Photo saved", "success");
    if (sec.isConnected) { setMsg(sec, ""); await loadImages(sec); }
  } catch (err) {
    toast(err.message, "error", 6000);
    if (sec.isConnected) setMsg(sec, err.message, true);
  } finally {
    if (sec.isConnected) setBusy(sec, false);
  }
}

function buildSection(entryId) {
  const sec = document.createElement("div");
  sec.className = "cimg";
  sec.dataset.entry = entryId;
  sec.innerHTML = `
    <div class="cimg-head"><b>Commitment photos</b><span class="cimg-count"></span></div>
    <div class="cimg-grid"><div class="cimg-empty">Loading…</div></div>
    <div class="cimg-actions">
      <button class="btn btn-outline btn-sm" data-cimg-cam type="button"><i class="fa-solid fa-camera"></i> Take photo</button>
      <button class="btn btn-outline btn-sm" data-cimg-gal type="button"><i class="fa-solid fa-image"></i> From gallery</button>
    </div>
    <div class="cimg-msg"></div>`;
  sec.querySelector("[data-cimg-cam]").onclick = () => { activeSection = sec; $("cimgCamera").click(); };
  sec.querySelector("[data-cimg-gal]").onclick = () => { activeSection = sec; $("cimgGallery").click(); };
  return sec;
}

["cimgCamera", "cimgGallery"].forEach((id) => {
  $(id).addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (file && activeSection && activeSection.isConnected) handleFile(activeSection, file);
  });
});

/* ---------- attach the box to every entry in the ledger popup ---------- */

const modalBody = $("modalBody");

function scan() {
  modalBody.querySelectorAll("[data-note-add]").forEach((btn) => {
    const entryId = btn.dataset.noteAdd;
    const row = btn.parentElement; // the "Add a note" row
    if (!row || !row.parentElement) return;
    if (row.parentElement.querySelector(`.cimg[data-entry="${entryId}"]`)) return;
    const sec = buildSection(entryId);
    row.insertAdjacentElement("beforebegin", sec);
    loadImages(sec);
  });
}

new MutationObserver(scan).observe(modalBody, { childList: true, subtree: true });
