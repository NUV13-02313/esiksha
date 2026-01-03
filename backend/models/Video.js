const mongoose = require("mongoose");

const videoSchema = new mongoose.Schema({
  title: String,
  videoUrl: String, // YouTube / MP4 / cloud link
});

module.exports = mongoose.model("Video", videoSchema);
