const express = require("express");
const router = express.Router();
const Video = require("../models/Video");

// Get latest video
router.get("/video", async (req, res) => {
  try {
    const video = await Video.findOne().sort({ _id: -1 });
    res.json(video);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
