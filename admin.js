// ⚠️ باید دقیقاً با app.js یکی باشد

const API_BASE = "https://api.djhbc.ir/api";

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

// ---------- ورود مدیر ----------

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
  loadAbout();
  loadAdminComments();
  loadDjProfile();
}

// ---------- درباره ریمیکس ----------

async function loadAbout() {
  try {
    const res = await fetch(API_BASE + "/settings/about");
    const data = await res.json();
    $("aboutTextarea").value = data.text || "";
  } catch (e) {}
}

$("aboutForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await apiJson("/settings/about", { method: "PUT", body: { text: $("aboutTextarea").value } });
    toast("متن ذخیره شد");
  } catch (err) {
    toast(err.message);
  }
};

// ---------- پروفایل عمومی DJ ----------

async function loadDjProfile() {
  try {
    const res = await fetch(API_BASE + "/settings/dj-profile");
    const data = await res.json();
    $("djBioInput").value = data.bio || "";
    $("djPhotoInput").value = data.photo || "";
    $("djInstagramInput").value = data.instagram || "";
    $("djTelegramInput").value = data.telegram || "";
  } catch (e) {}
}

$("djProfileForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await apiJson("/settings/dj-profile", {
      method: "PUT",
      body: {
        bio: $("djBioInput").value,
        photo: $("djPhotoInput").value,
        instagram: $("djInstagramInput").value,
        telegram: $("djTelegramInput").value,
      },
    });
    toast("پروفایل ذخیره شد");
  } catch (err) {
    toast(err.message);
  }
};

// ---------- آمار ----------

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

// ---------- آپلود آهنگ ----------

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

// ---------- لیست و حذف آهنگ‌ها ----------

async function loadAdminSongs() {
  try {
    const songs = await apiJson("/songs");
    $("adminSongs").innerHTML = songs
      .map(
        (s) => `<div class="admin-song" data-id="${s._id}">
<div class="admin-song-view">
<img src="${s.cover}">
<div class="admin-song-info">
<b>${escapeHtml(s.title)}</b>
<small>${escapeHtml(s.artist)} • ${s.time} • ${s.downloads || 0} دانلود</small>
</div>
<button class="btn-ghost edit-song" data-id="${s._id}">ویرایش</button>
<button class="btn-danger" data-id="${s._id}">حذف</button>
</div>
<div class="admin-song-edit hidden">
<label>عنوان آهنگ</label>
<input type="text" class="edit-title" value="${escapeHtml(s.title)}">
<label>نام خواننده</label>
<input type="text" class="edit-artist" value="${escapeHtml(s.artist)}">
<label>مدت زمان</label>
<input type="text" class="edit-time" value="${escapeHtml(s.time)}">
<div class="admin-song-edit-actions">
<button class="btn-primary save-song" data-id="${s._id}">ذخیره</button>
<button class="btn-ghost cancel-edit">انصراف</button>
</div>
</div>
</div>`
      )
      .join("");

    document.querySelectorAll(".btn-danger").forEach((btn) => {
      btn.onclick = () => deleteSong(btn.dataset.id);
    });

    document.querySelectorAll(".edit-song").forEach((btn) => {
      btn.onclick = () => {
        const wrap = btn.closest(".admin-song");
        wrap.querySelector(".admin-song-view").classList.add("hidden");
        wrap.querySelector(".admin-song-edit").classList.remove("hidden");
      };
    });

    document.querySelectorAll(".cancel-edit").forEach((btn) => {
      btn.onclick = () => {
        const wrap = btn.closest(".admin-song");
        wrap.querySelector(".admin-song-edit").classList.add("hidden");
        wrap.querySelector(".admin-song-view").classList.remove("hidden");
      };
    });

    document.querySelectorAll(".save-song").forEach((btn) => {
      btn.onclick = () => {
        const wrap = btn.closest(".admin-song");
        const title = wrap.querySelector(".edit-title").value;
        const artist = wrap.querySelector(".edit-artist").value;
        const time = wrap.querySelector(".edit-time").value;
        saveSongEdit(btn.dataset.id, { title, artist, time });
      };
    });
  } catch (e) {
    toast(e.message);
  }
}

async function saveSongEdit(id, body) {
  try {
    await apiJson(`/admin/songs/${id}`, { method: "PUT", body });
    toast("آهنگ ویرایش شد");
    loadAdminSongs();
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

// ---------- مدیریت نظرات ----------

async function loadAdminComments() {
  try {
    const comments = await apiJson("/admin/comments");
    $("adminComments").innerHTML = comments.length
      ? comments
          .map(
            (c) => `<div class="admin-comment" data-id="${c._id}">
<div class="admin-comment-head">
<b>${escapeHtml(c.name)}</b>
<small>روی «${escapeHtml(c.songTitle)}»</small>
</div>
<textarea class="admin-comment-text">${escapeHtml(c.text)}</textarea>
<div class="admin-comment-actions">
<button class="btn-ghost save-comment">ذخیره ویرایش</button>
<button class="btn-danger delete-comment">حذف</button>
</div>
</div>`
          )
          .join("")
      : `<p class="hint">هنوز نظری ثبت نشده.</p>`;

    document.querySelectorAll(".save-comment").forEach((btn) => {
      btn.onclick = () => {
        const wrap = btn.closest(".admin-comment");
        const id = wrap.dataset.id;
        const text = wrap.querySelector(".admin-comment-text").value;
        saveComment(id, text);
      };
    });

    document.querySelectorAll(".delete-comment").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.closest(".admin-comment").dataset.id;
        deleteComment(id);
      };
    });
  } catch (e) {
    toast(e.message);
  }
}

async function saveComment(id, text) {
  try {
    await apiJson(`/admin/comments/${id}`, { method: "PUT", body: { text } });
    toast("نظر ویرایش شد");
    loadAdminComments();
  } catch (e) {
    toast(e.message);
  }
}

async function deleteComment(id) {
  if (!confirm("مطمئنی می‌خوای این نظر حذف بشه؟")) return;
  try {
    await apiJson(`/admin/comments/${id}`, { method: "DELETE" });
    toast("نظر حذف شد");
    loadAdminComments();
    loadStats();
  } catch (e) {
    toast(e.message);
  }
}

// ---------- شروع ----------

if (adminToken) onLoggedIn();
else show("login");
