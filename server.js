require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const authRoutes = require("./routes/auth");
const songRoutes = require("./routes/songs");
const commentRoutes = require("./routes/comments");
const playlistRoutes = require("./routes/playlist");
const adminRoutes = require("./routes/admin");
const settingsRoutes = require("./routes/settings");

const app = express();

connectDB();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
  })
);
app.use(express.json());

app.get("/", (req, res) => res.json({ message: "HBC REMIX API فعال است 🎵" }));

app.use("/api/auth", authRoutes);
app.use("/api/songs", songRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/playlist", playlistRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/settings", settingsRoutes);

// هندلر خطای عمومی
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "خطای داخلی سرور" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 سرور روی پورت ${PORT} اجرا شد`));
