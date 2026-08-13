const express = require("express");
const Setting = require("../models/Setting");
const { adminOnly } = require("../middleware/auth");

const router = express.Router();

// خواندن متن «درباره ریمیکس» (عمومی، همه می‌بینن)
router.get("/about", async (req, res) => {
  const setting = await Setting.findOne({ key: "about" });
  res.json({ text: setting?.value || "" });
});

// ویرایش متن «درباره ریمیکس» (فقط مدیر سایت)
router.put("/about", adminOnly, async (req, res) => {
  const { text } = req.body;
  const setting = await Setting.findOneAndUpdate(
    { key: "about" },
    { value: text || "" },
    { upsert: true, new: true }
  );
  res.json({ text: setting.value });
});

module.exports = router;
