const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const { PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { s3, BUCKET } = require("../config/storage");
const Song = require("../models/Song");
const Comment = require("../models/Comment");
const User = require("../models/User");
const { adminOnly } = require("../middleware/auth");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 }, // حداکثر ۱۵۰ مگابایت هر فایل
});

function publicUrl(key) {
  // اگه STORAGE_PUBLIC_URL جدا تنظیم شده بود (مثلاً CDN آروان)، از اون استفاده کن
  if (process.env.STORAGE_PUBLIC_URL) {
    return `${process.env.STORAGE_PUBLIC_URL}/${key}`;
  }
  // فرمت درست آروان کلود: https://{bucket}.s3.{region}.arvanstorage.ir/{key}
  const endpoint = process.env.STORAGE_ENDPOINT.replace("https://", "");
  return `https://${BUCKET}.${endpoint}/${key}`;
}

async function uploadFile(file, folder) {
  const ext = file.originalname.split(".").pop();
  const key = `${folder}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: "public-read",
    })
  );
  return { key, url: publicUrl(key) };
}

// آپلود آهنگ جدید (کاور + فایل mp3)
router.post(
  "/songs",
  adminOnly,
  upload.fields([
    { name: "audio", maxCount: 1 },
    { name: "cover", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { title, artist, time } = req.body;
      const audioFile = req.files?.audio?.[0];
      const coverFile = req.files?.cover?.[0];

      if (!title || !artist || !audioFile || !coverFile) {
        return res.status(400).json({ message: "عنوان، خواننده، فایل صوتی و کاور الزامی است" });
      }

      const audioResult = await uploadFile(audioFile, "audio");
      const coverResult = await uploadFile(coverFile, "covers");

      const song = await Song.create({
        title,
        artist,
        time: time || "00:00",
        cover: coverResult.url,
        coverPublicId: coverResult.key,
        src: audioResult.url,
        audioPublicId: audioResult.key,
      });

      res.status(201).json(song);
    } catch (err) {
      res.status(500).json({ message: "خطا در آپلود آهنگ", error: err.message });
    }
  }
);

// حذف آهنگ
router.delete("/songs/:id", adminOnly, async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);
    if (!song) return res.status(404).json({ message: "آهنگ یافت نشد" });

    if (song.audioPublicId) {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: song.audioPublicId })).catch(() => {});
    }
    if (song.coverPublicId) {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: song.coverPublicId })).catch(() => {});
    }
    await Comment.deleteMany({ song: song._id });
    await User.updateMany({}, { $pull: { savedSongs: song._id } });
    await song.deleteOne();

    res.json({ message: "آهنگ حذف شد" });
  } catch (err) {
    res.status(500).json({ message: "خطا در حذف آهنگ", error: err.message });
  }
});

// لیست همه نظرات (برای مدیریت)
router.get("/comments", adminOnly, async (req, res) => {
  const comments = await Comment.find().populate("song", "title").sort({ createdAt: -1 });
  res.json(
    comments.map((c) => ({
      _id: c._id,
      name: c.name,
      text: c.text,
      songTitle: c.song?.title || "آهنگ حذف‌شده",
      createdAt: c.createdAt,
    }))
  );
});

// ویرایش نظر
router.put("/comments/:id", adminOnly, async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ message: "متن نظر خالی است" });
  }
  const comment = await Comment.findByIdAndUpdate(req.params.id, { text: text.trim() }, { new: true });
  if (!comment) return res.status(404).json({ message: "نظر یافت نشد" });
  res.json(comment);
});

// حذف نظر
router.delete("/comments/:id", adminOnly, async (req, res) => {
  const comment = await Comment.findByIdAndDelete(req.params.id);
  if (!comment) return res.status(404).json({ message: "نظر یافت نشد" });
  res.json({ message: "نظر حذف شد" });
});

// آمار کلی پنل مدیریت
router.get("/stats", adminOnly, async (req, res) => {
  const [songCount, userCount, commentCount] = await Promise.all([
    Song.countDocuments(),
    User.countDocuments(),
    Comment.countDocuments(),
  ]);
  const totalDownloads = await Song.aggregate([{ $group: { _id: null, sum: { $sum: "$downloads" } } }]);
  res.json({
    songs: songCount,
    users: userCount,
    comments: commentCount,
    downloads: totalDownloads[0]?.sum || 0,
  });
});

module.exports = router;
