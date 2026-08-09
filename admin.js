const API_BASE = "https://hbc-remix-backend.onrender.com/api";

const $ = (id) => document.getElementById(id);
let adminToken = localStorage.getItem("hbc_admin_token") || null;

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove("show"), 2200);
}

function show(page) {
  $("adminLoginPage").classList.toggle("hidden", page !== "login");
  $("adminDashboard").classList.toggle("hidden", page !== "dashboard");
}

async function apiJson(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + adminToken,
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "خطایی رخ داد");
  return data;
}

$("adminLoginForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const res = await fetch(API_BASE + "/auth/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: $("adminUsername").value,
        password: $("adminPassword").value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    adminToken = data.token;
    localStorage.setItem("hbc_admin_token", adminToken);
    onLoggedIn();
  } catch (err) {
    toast(err.message);
  }
};

$("adminLogout").onclick = () => {
  adminToken = null;
  localStorage.removeItem("hbc_admin_token");
  show("login");
};

function onLoggedIn() {
  show("dashboard");
  loadStats();
  loadAdminSongs();
}

async function loadStats() {
  try {
    const s = await apiJson("/admin/stats");
    $("statsBox").innerHTML = `
      <div class="stat"><b>${s.songs}</b><span>آهنگ</span></div>
      <div class="stat"><b>${s.users}</b><span>کاربر</span></div>
      <div class="stat"><b>${s.comments}</b><span>نظر</span></div>
      <div class="stat"><b>${s.downloads}</b><span>دانلود</span></div>
    `;
  } catch (e) {
    toast(e.message);
  }
}

$("uploadForm").onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData();
  fd.append("title", $("upTitle").value);
  fd.append("artist", $("upArtist").value);
  fd.append("time", $("upTime").value || "00:00");
  fd.append("cover", $("upCover").files[0]);
  fd.append("audio", $("upAudio").files[0]);

  $("uploadBtn").disabled = true;
  $("uploadProgress").classList.remove("hidden");
  try {
    const res = await fetch(API_BASE + "/admin/songs", {
      method: "POST",
      headers: { Authorization: "Bearer " + adminToken },
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    toast("آهنگ با موفقیت آپلود شد");
    $("uploadForm").reset();
    loadStats();
    loadAdminSongs();
  } catch (err) {
    toast(err.message);
  } finally {
    $("uploadBtn").disabled = false;
    $("uploadProgress").classList.add("hidden");
  }
};

async function loadAdminSongs() {
  try {
    const songs = await apiJson("/songs");
    $("adminSongs").innerHTML = songs
      .map(
        (s) => `<div class="admin-song">
        <img src="${s.cover}">
        <div class="admin-song-info">
          <b>${escapeHtml(s.title)}</b>
          <small>${escapeHtml(s.artist)} • ${s.downloads || 0} دانلود</small>
        </div>
        <button class="btn-danger" data-id="${s._id}">حذف</button>
      </div>`
      )
      .join("");
    document.querySelectorAll(".btn-danger").forEach((btn) => {
      btn.onclick = () => deleteSong(btn.dataset.id);
    });
  } catch (e) {
    toast(e.message);
  }
}

async function deleteSong(id) {
  if (!confirm("مطمئنی می‌خوای این آهنگ حذف بشه؟")) return;
  try {
    await apiJson(`/admin/songs/${id}`, { method: "DELETE" });
    toast("آهنگ حذف شد");
    loadStats();
    loadAdminSongs();
  } catch (e) {
    toast(e.message);
  }
}

function escapeHtml(str = "") {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

if (adminToken) onLoggedIn();
else show("login");
