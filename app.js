// ⚠️ این آدرس را بعد از دیپلوی بک‌اند روی Render با آدرس واقعی جایگزین کن

const API_BASE = "https://api.djhbc.ir/api";

const $ = (id) => document.getElementById(id);

const audio = $("audio");

let songs = [];

let current = 0;

let playing = false;

let playPositions = {}; // یادآوری محل توقف هر آهنگ (برای ادامه‌ی پخش)

let token = localStorage.getItem("hbc_token") || null;

let currentUser = JSON.parse(localStorage.getItem("hbc_user") || "null");

// ---------- کمک‌کننده‌ها ----------

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove("show"), 2200);
}

function authHeaders() {
  return token ? { Authorization: "Bearer " + token } : {};
}

async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      // فقط وقتی body داریم Content-Type می‌فرستیم تا برای GET درخواست preflight (OPTIONS) ساخته نشه
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "خطایی رخ داد");
  return data;
}

// ---------- بارگذاری آهنگ‌ها از سرور ----------

let currentSort = "newest";

async function loadSongs(sort = currentSort) {
  currentSort = sort;
  try {
    songs = await api(`/songs?sort=${sort}`);
  } catch (e) {
    songs = [];
    // متن خطای واقعی رو نشون می‌ده تا علت مشخص بشه
    toast("خطا: " + e.message);
  }
  renderSongs();
  if (songs.length) setSong(0);
  checkNewSongsBadge();
  openSharedSongIfAny();
}

document.querySelectorAll(".sort-tab").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll(".sort-tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    loadSongs(btn.dataset.sort);
  };
});

function renderSongs() {
  $("songsEmpty").classList.toggle("hidden", songs.length > 0);
  $("songs").innerHTML = songs
    .map(
      (s, i) => `
<button class="song" data-index="${i}">
<img src="${s.cover}" alt="">
<div><b>${escapeHtml(s.title)}</b><small>${escapeHtml(s.artist)}</small></div>
<span class="time">${s.time}</span>
<span class="dots">•••</span>
</button>`
    )
    .join("");
  document.querySelectorAll("#songs .song").forEach((x) => (x.onclick = () => openPlayer(+x.dataset.index)));
  updateNowPlayingBadge();
}

// نمایش نشانگر «در حال پخش» (اکولایزر) کنار آهنگ فعال تو لیست
function updateNowPlayingBadge() {
  document.querySelectorAll(".song").forEach((el) => {
    const idx = +el.dataset.index;
    const isCurrent = songs.length > 0 && idx === current;
    el.classList.toggle("now-playing", isCurrent);
    let badge = el.querySelector(".eq-badge");
    if (isCurrent) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "eq-badge";
        badge.innerHTML = "<i></i><i></i><i></i>";
        el.querySelector("b")?.after(badge);
      }
      badge.classList.toggle("paused", !playing);
    } else if (badge) {
      badge.remove();
    }
  });
}

function escapeHtml(str = "") {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- پلیر ----------

function setSong(i) {
  if (!songs.length) return;
  // قبل از عوض کردن آهنگ، محل فعلی رو ذخیره کن
  if (songs[current]) playPositions[songs[current]._id] = audio.currentTime || 0;
  current = (i + songs.length) % songs.length;
  const s = songs[current];
  $("playerCover").src = s.cover;
  $("bgCover").src = s.cover;
  $("playerTitle").textContent = s.title;
  $("playerArtist").textContent = s.artist;
  $("total").textContent = s.time;
  $("miniCover").src = s.cover;
  $("miniTitle").textContent = s.title;
  $("miniArtist").textContent = s.artist;
  $("seek").value = 0;
  $("miniProgress").style.width = "0%";
  audio.src = s.src;
  const resumeAt = playPositions[s._id] || 0;
  const onReady = () => {
    if (resumeAt > 0 && resumeAt < audio.duration - 1) audio.currentTime = resumeAt;
    audio.removeEventListener("loadedmetadata", onReady);
  };
  audio.addEventListener("loadedmetadata", onReady);
  if (playing) audio.play();
  updateLikeIcon();
  updateNowPlayingBadge();
}

function openPlayer(i) {
  setSong(i);
  navigate("playerPage");
  $("miniPlayer").classList.add("hidden");
  playing = true;
  audio.play().catch(() => {});
  updateButtons();
  api(`/songs/${songs[current]._id}/play`, { method: "POST" }).catch(() => {});
  loadRating();
}

function togglePlay() {
  if (!songs.length) return;
  if (audio.paused) {
    audio.play();
    playing = true;
  } else {
    audio.pause();
    playing = false;
  }
  updateButtons();
}

function updateButtons() {
  $("iconPlay").classList.toggle("hidden", playing);
  $("iconPause").classList.toggle("hidden", !playing);
  $("miniPlay").textContent = playing ? "Ⅱ" : "▶";
  updateNowPlayingBadge();
}

function next() {
  setSong(current + 1);
  if (playing) audio.play();
  loadRating();
}

function prev() {
  setSong(current - 1);
  if (playing) audio.play();
  loadRating();
}

// ---------- امتیازدهی ستاره‌ای ----------

function renderStars(myRating) {
  document.querySelectorAll(".star").forEach((s) => {
    s.classList.toggle("filled", +s.dataset.value <= myRating);
  });
}

async function loadRating() {
  if (!songs.length) return;
  const s = songs[current];
  $("ratingInfo").textContent = s.ratingCount
    ? `${(s.ratingSum / s.ratingCount).toFixed(1)} از ${s.ratingCount} رای`
    : "بدون امتیاز";
  renderStars(0);
  if (!token) return;
  try {
    const data = await api(`/songs/${s._id}/rate/mine`);
    renderStars(data.myRating || 0);
  } catch (e) {}
}

document.querySelectorAll(".star").forEach((star) => {
  star.onclick = async () => {
    if (!token) {
      toast("برای امتیازدهی ابتدا وارد حساب شوید");
      navigate("authPage");
      return;
    }
    const value = +star.dataset.value;
    const s = songs[current];
    try {
      const data = await api(`/songs/${s._id}/rate`, { method: "POST", body: { value } });
      s.ratingSum = data.ratingAvg * data.ratingCount;
      s.ratingCount = data.ratingCount;
      $("ratingInfo").textContent = `${data.ratingAvg} از ${data.ratingCount} رای`;
      renderStars(value);
      toast("امتیازت ثبت شد");
    } catch (e) {
      toast(e.message);
    }
  };
});

// ---------- اشتراک‌گذاری آهنگ ----------

$("shareBtn").onclick = async () => {
  if (!songs.length) return;
  const s = songs[current];
  const url = `${location.origin}${location.pathname}?song=${s._id}`;
  const shareData = { title: s.title, text: `آهنگ «${s.title}» رو تو HBC REMIX گوش کن 🎧`, url };
  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch (e) {}
  } else {
    try {
      await navigator.clipboard.writeText(url);
      toast("لینک آهنگ کپی شد");
    } catch (e) {
      toast("کپی نشد، لینک: " + url);
    }
  }
};

$("backBtn").onclick = () => navigate("songsPage");
$("play").onclick = togglePlay;
$("miniPlay").onclick = togglePlay;
$("next").onclick = next;
$("prev").onclick = prev;

$("seek").oninput = (e) => {
  const p = +e.target.value;
  $("miniProgress").style.width = p + "%";
  if (audio.duration) audio.currentTime = (audio.duration * p) / 100;
};

audio.ontimeupdate = () => {
  if (!audio.duration) return;
  const p = (audio.currentTime / audio.duration) * 100;
  $("seek").value = p;
  $("miniProgress").style.width = p + "%";
  $("current").textContent = new Date(audio.currentTime * 1000).toISOString().slice(14, 19);
  if (songs[current]) playPositions[songs[current]._id] = audio.currentTime;
};

audio.onended = () => {
  if (songs[current]) delete playPositions[songs[current]._id];
  next();
};

$("download").onclick = async () => {
  if (!songs.length) return;
  const s = songs[current];
  try {
    const data = await api(`/songs/${s._id}/download`);
    const a = document.createElement("a");
    a.href = data.url;
    a.download = s.title + ".mp3";
    a.target = "_blank";
    a.click();
    toast("دانلود شروع شد");
  } catch (e) {
    toast(e.message);
  }
};

$("searchBtn").onclick = () => {
  const q = prompt("نام آهنگ را جستجو کنید:");
  if (q === null) return;
  document.querySelectorAll("#songs .song").forEach((el, i) => {
    el.style.display = (songs[i].title + " " + songs[i].artist).toLowerCase().includes(q.toLowerCase()) ? "grid" : "none";
  });
};

$("shuffle").onclick = () => {
  if (songs.length < 2) return;
  let r;
  do {
    r = Math.floor(Math.random() * songs.length);
  } while (r === current);
  setSong(r);
  if (playing) audio.play();
};

$("repeat").onclick = () => {
  audio.loop = !audio.loop;
  toast(audio.loop ? "تکرار آهنگ فعال شد" : "تکرار آهنگ غیرفعال شد");
};

// ---------- سیو کردن آهنگ (لایک / پلی‌لیست) ----------

async function updateLikeIcon() {
  if (!songs.length) return;
  const s = songs[current];
  if (!token || !currentUser) {
    $("likeBtn").classList.remove("active");
    return;
  }
  const saved = (currentUser.savedSongs || []).includes(s._id);
  $("likeBtn").classList.toggle("active", saved);
}

$("likeBtn").onclick = async () => {
  if (!token) {
    toast("برای سیو آهنگ ابتدا وارد حساب شوید");
    navigate("authPage");
    return;
  }
  const s = songs[current];
  try {
    const data = await api(`/playlist/${s._id}`, { method: "POST" });
    currentUser.savedSongs = currentUser.savedSongs || [];
    if (data.saved) currentUser.savedSongs.push(s._id);
    else currentUser.savedSongs = currentUser.savedSongs.filter((id) => id !== s._id);
    localStorage.setItem("hbc_user", JSON.stringify(currentUser));
    $("likeBtn").classList.toggle("active", data.saved);
    toast(data.saved ? "به پلی‌لیست اضافه شد" : "از پلی‌لیست حذف شد");
  } catch (e) {
    toast(e.message);
  }
};

// ---------- ناوبری بین صفحات ----------

function navigate(pageId) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  $(pageId).classList.add("active");
  closeDrawer();
  window.scrollTo(0, 0);
  if (pageId === "playlistPage") loadPlaylist();
  if (pageId === "commentsPage") loadComments();
  if (pageId === "profilePage") loadProfile();
  if (pageId === "chartPage") loadChart();
  // مینی‌پلیر: وقتی از صفحه پلیر خارج می‌شیم ولی آهنگی بارگذاری شده، نشونش بده تا پخش پس‌زمینه ادامه پیدا کنه
  if (pageId !== "playerPage" && songs.length && audio.src) {
    $("miniPlayer").classList.remove("hidden");
  } else if (pageId === "playerPage") {
    $("miniPlayer").classList.add("hidden");
  }
}

$("miniPlayer").onclick = (e) => {
  if (e.target.id === "miniPlay") return;
  navigate("playerPage");
};

// ---------- پروفایل کاربری ----------

function loadProfile() {
  if (!currentUser) {
    navigate("authPage");
    return;
  }
  $("profileName").value = currentUser.name;
  $("profileEmail").value = currentUser.email;
  $("profileCurrentPass").value = "";
  $("profileNewPass").value = "";
}

$("profileForm").onsubmit = async (e) => {
  e.preventDefault();
  const body = { name: $("profileName").value };
  const newPass = $("profileNewPass").value;
  const curPass = $("profileCurrentPass").value;
  if (newPass) {
    body.newPassword = newPass;
    body.currentPassword = curPass;
  }
  try {
    const data = await api("/auth/profile", { method: "PUT", body });
    currentUser = { ...currentUser, ...data.user };
    localStorage.setItem("hbc_user", JSON.stringify(currentUser));
    refreshDrawerUser();
    toast("تغییرات ذخیره شد");
    $("profileCurrentPass").value = "";
    $("profileNewPass").value = "";
  } catch (err) {
    toast(err.message);
  }
};

document.querySelectorAll("[data-nav]").forEach((btn) => {
  btn.addEventListener("click", () => navigate(btn.dataset.nav));
});

// ---------- منوی همبرگری ----------

function openDrawer() {
  $("drawer").classList.add("open");
  $("overlay").classList.add("show");
}

function closeDrawer() {
  $("drawer").classList.remove("open");
  $("overlay").classList.remove("show");
}

$("menuBtn").onclick = openDrawer;
$("closeDrawer").onclick = closeDrawer;
$("overlay").onclick = closeDrawer;

function refreshDrawerUser() {
  const box = $("drawerUser");
  if (currentUser) {
    box.innerHTML = `<p>سلام، <b>${escapeHtml(currentUser.name)}</b> 👋</p>`;
    $("authNavBtn").classList.add("hidden");
    $("logoutBtn").classList.remove("hidden");
    $("profileNavBtn").classList.remove("hidden");
  } else {
    box.innerHTML = `<p>برای استفاده از امکانات وارد شوید</p>`;
    $("authNavBtn").classList.remove("hidden");
    $("logoutBtn").classList.add("hidden");
    $("profileNavBtn").classList.add("hidden");
  }
}

$("logoutBtn").onclick = () => {
  token = null;
  currentUser = null;
  localStorage.removeItem("hbc_token");
  localStorage.removeItem("hbc_user");
  refreshDrawerUser();
  updateLikeIcon();
  toast("از حساب خارج شدید");
  navigate("songsPage");
};

// ---------- ثبت‌نام / ورود ----------

$("tabLogin").onclick = () => {
  $("tabLogin").classList.add("active");
  $("tabSignup").classList.remove("active");
  $("loginForm").classList.remove("hidden");
  $("signupForm").classList.add("hidden");
};

$("tabSignup").onclick = () => {
  $("tabSignup").classList.add("active");
  $("tabLogin").classList.remove("active");
  $("signupForm").classList.remove("hidden");
  $("loginForm").classList.add("hidden");
};

$("loginForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const data = await api("/auth/login", {
      method: "POST",
      body: { email: $("loginEmail").value, password: $("loginPassword").value },
    });
    onAuthSuccess(data);
  } catch (e) {
    toast(e.message);
  }
};

$("signupForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const data = await api("/auth/signup", {
      method: "POST",
      body: {
        name: $("signupName").value,
        email: $("signupEmail").value,
        password: $("signupPassword").value,
      },
    });
    onAuthSuccess(data);
  } catch (e) {
    toast(e.message);
  }
};

function onAuthSuccess(data) {
  token = data.token;
  currentUser = data.user;
  currentUser.savedSongs = currentUser.savedSongs || [];
  localStorage.setItem("hbc_token", token);
  localStorage.setItem("hbc_user", JSON.stringify(currentUser));
  refreshDrawerUser();
  updateLikeIcon();
  toast("خوش آمدی " + currentUser.name);
  navigate("songsPage");
}

// ---------- پلی‌لیست من ----------

async function loadPlaylist() {
  if (!token) {
    $("playlistSongs").innerHTML = "";
    $("playlistEmpty").classList.remove("hidden");
    return;
  }
  try {
    const list = await api("/playlist/mine");
    $("playlistEmpty").classList.toggle("hidden", list.length > 0);
    $("playlistSongs").innerHTML = list
      .map((s) => {
        const idx = songs.findIndex((x) => x._id === s._id);
        return `<button class="song" data-index="${idx}">
<img src="${s.cover}" alt="">
<div><b>${escapeHtml(s.title)}</b><small>${escapeHtml(s.artist)}</small></div>
<span class="time">${s.time}</span>
<span class="dots">•••</span>
</button>`;
      })
      .join("");
    document.querySelectorAll("#playlistSongs .song").forEach((x) => {
      x.onclick = () => {
        const i = +x.dataset.index;
        if (i >= 0) openPlayer(i);
      };
    });
    updateNowPlayingBadge();
  } catch (e) {
    toast(e.message);
  }
}

// ---------- نظرات ----------

async function loadComments() {
  if (!songs.length) return;
  const s = songs[current];
  $("commentsSongTitle").textContent = "– " + s.title;
  $("commentLoginHint").classList.toggle("hidden", !!token);
  $("commentForm").classList.toggle("hidden", !token);
  try {
    const list = await api(`/comments/${s._id}`);
    $("commentsList").innerHTML = list.length
      ? list
          .map(
            (c) => `<div class="comment">
<b>${escapeHtml(c.name)}</b>
<p>${escapeHtml(c.text)}</p>
<div class="comment-foot">
<small>${new Date(c.createdAt).toLocaleDateString("fa-IR")}</small>
<button class="comment-like" data-id="${c._id}">
<svg viewBox="0 0 24 24" fill="none"><path d="M12 20s-7-4.4-9.3-8.8C1.2 8 2.6 4.8 5.7 4.1 7.9 3.6 10 4.6 12 7c2-2.4 4.1-3.4 6.3-2.9 3.1.7 4.5 3.9 3 6.1C19 15.6 12 20 12 20z" stroke="currentColor" stroke-width="1.8"/></svg>
<span>${c.likeCount || 0}</span>
</button>
</div>
</div>`
          )
          .join("")
      : `<p class="empty">هنوز نظری ثبت نشده. اولین نفر باش!</p>`;
    document.querySelectorAll(".comment-like").forEach((btn) => {
      btn.onclick = async () => {
        if (!token) {
          toast("برای لایک ابتدا وارد حساب شوید");
          navigate("authPage");
          return;
        }
        try {
          const data = await api(`/comments/${s._id}/${btn.dataset.id}/like`, { method: "POST" });
          btn.querySelector("span").textContent = data.likeCount;
          btn.classList.toggle("liked", data.liked);
        } catch (e) {
          toast(e.message);
        }
      };
    });
  } catch (e) {
    toast(e.message);
  }
}

$("openComments").onclick = () => navigate("commentsPage");

$("commentForm").onsubmit = async (e) => {
  e.preventDefault();
  const s = songs[current];
  try {
    await api(`/comments/${s._id}`, { method: "POST", body: { text: $("commentText").value } });
    $("commentText").value = "";
    toast("نظر شما ثبت شد");
    loadComments();
  } catch (e) {
    toast(e.message);
  }
};

// ---------- درباره ریمیکس ----------

const aboutNavBtn = document.getElementById("aboutNavBtn");
if (aboutNavBtn) {
  aboutNavBtn.onclick = async () => {
    closeDrawer();
    $("aboutOverlay").classList.remove("hide");
    try {
      const data = await api("/settings/about");
      $("aboutText").textContent = data.text || "توضیحی ثبت نشده است.";
    } catch (e) {
      $("aboutText").textContent = "خطا در دریافت اطلاعات.";
    }
  };
}

const aboutCloseBtn = document.getElementById("aboutCloseBtn");
if (aboutCloseBtn) {
  aboutCloseBtn.onclick = () => $("aboutOverlay").classList.add("hide");
}

// ---------- پرطرفدارترین‌ها (نمودار) ----------

async function loadChart() {
  try {
    const list = await api("/songs/top/chart");
    const max = Math.max(...list.map((s) => s.downloads + s.plays), 1);
    $("chartList").innerHTML = list.length
      ? list
          .map((s, i) => {
            const score = s.downloads + s.plays;
            const pct = Math.round((score / max) * 100);
            return `<div class="chart-item">
<span class="chart-rank">${i + 1}</span>
<img src="${s.cover}" alt="">
<div class="chart-info">
<b>${escapeHtml(s.title)}</b>
<div class="chart-bar-track"><div class="chart-bar-fill" style="width:${pct}%"></div></div>
<div class="chart-count">${s.plays} پخش • ${s.downloads} دانلود</div>
</div>
</div>`;
          })
          .join("")
      : `<p class="empty">هنوز آماری ثبت نشده.</p>`;
  } catch (e) {
    toast(e.message);
  }
}

// ---------- پروفایل عمومی DJ ----------

const djProfileNavBtn = document.getElementById("djProfileNavBtn");
if (djProfileNavBtn) {
  djProfileNavBtn.onclick = async () => {
    closeDrawer();
    $("djProfileOverlay").classList.remove("hide");
    try {
      const data = await api("/settings/dj-profile");
      $("djBio").textContent = data.bio || "توضیحی ثبت نشده است.";
      $("djPhoto").src = data.photo || "logo.png";
      if (data.instagram) {
        $("djInstagram").href = data.instagram;
        $("djInstagram").classList.remove("hidden");
      }
      if (data.telegram) {
        $("djTelegram").href = data.telegram;
        $("djTelegram").classList.remove("hidden");
      }
    } catch (e) {
      $("djBio").textContent = "خطا در دریافت اطلاعات.";
    }
  };
}

const djProfileCloseBtn = document.getElementById("djProfileCloseBtn");
if (djProfileCloseBtn) {
  djProfileCloseBtn.onclick = () => $("djProfileOverlay").classList.add("hide");
}

// ---------- نشان آهنگ جدید ----------

function checkNewSongsBadge() {
  if (!songs.length) return;
  const newestCreatedAt = songs.reduce((max, s) => (s.createdAt > max ? s.createdAt : max), songs[0].createdAt);
  const lastSeen = localStorage.getItem("hbc_last_seen_song") || "";
  if (newestCreatedAt > lastSeen) {
    $("newBadge").classList.remove("hidden");
  }
}

const songsNavBtn = document.getElementById("songsNavBtn");
if (songsNavBtn) {
  songsNavBtn.addEventListener("click", () => {
    if (songs.length) {
      const newestCreatedAt = songs.reduce((max, s) => (s.createdAt > max ? s.createdAt : max), songs[0].createdAt);
      localStorage.setItem("hbc_last_seen_song", newestCreatedAt);
    }
    $("newBadge").classList.add("hidden");
  });
}

// ---------- باز کردن مستقیم آهنگ از لینک اشتراک‌گذاری‌شده (?song=ID) ----------

function openSharedSongIfAny() {
  const params = new URLSearchParams(location.search);
  const songId = params.get("song");
  if (!songId) return;
  const idx = songs.findIndex((s) => s._id === songId);
  if (idx >= 0) openPlayer(idx);
}

// ---------- اعلان آهنگ جدید (Push Notification) ----------

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function updateNotifyBtnLabel() {
  const btn = document.getElementById("notifyBtn");
  if (!btn) return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    btn.textContent = "🔔 مرورگرت از اعلان پشتیبانی نمی‌کنه";
    btn.disabled = true;
    return;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    btn.textContent = sub ? "🔕 غیرفعال کردن اعلان آهنگ جدید" : "🔔 فعال کردن اعلان آهنگ جدید";
  } catch (e) {}
}

async function initPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    await navigator.serviceWorker.register("sw.js");
    updateNotifyBtnLabel();
  } catch (e) {}
}

const notifyBtn = document.getElementById("notifyBtn");
if (notifyBtn) {
  notifyBtn.onclick = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast("مرورگرت از اعلان پشتیبانی نمی‌کنه");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await api("/push/unsubscribe", { method: "POST", body: { endpoint: existing.endpoint } });
        await existing.unsubscribe();
        toast("اعلان آهنگ جدید غیرفعال شد");
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          toast("اجازه‌ی نمایش اعلان داده نشد");
          return;
        }
        const { key } = await api("/push/vapid-public-key");
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });
        await api("/push/subscribe", { method: "POST", body: sub.toJSON() });
        toast("اعلان آهنگ جدید فعال شد 🎉");
      }
      updateNotifyBtnLabel();
    } catch (e) {
      toast("خطا در تنظیم اعلان");
    }
  };
}

// ---------- پنجره خوش‌آمد ----------

const welcomeBtn = document.getElementById("welcomeBtn");
if (welcomeBtn) {
  welcomeBtn.onclick = () => $("welcomeOverlay").classList.add("hide");
}

// ---------- انیمیشن لمس دکمه‌های دایره‌ای ----------

document.querySelectorAll(".dock-controls button,.icon-btn-sm,.dock-nav button,.icon-circle,.like-inline,.menu").forEach((btn) => {
  btn.addEventListener("click", () => {
    btn.classList.remove("pop-anim");
    void btn.offsetWidth;
    btn.classList.add("pop-anim");
  });
});

// ---------- شروع ----------

refreshDrawerUser();
loadSongs();
initPush();
