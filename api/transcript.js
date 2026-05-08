import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { fetchTranscript } = require("youtube-transcript");

export default async function handler(req, res) {
  const videoId = req.query.vid || req.query.videoId;
  if (!videoId) {
    return res.status(400).json({ error: "Missing videoId" });
  }

  try {
    const segments = await fetchTranscript(videoId);
    const normalized = segments.map((seg) => ({
      text: seg.text,
      start: seg.offset / 1000,
      duration: seg.duration / 1000,
    }));
    return res.status(200).json(normalized);
  } catch (error) {
    const msg = error.message || "";
    if (msg.includes("unavailable") || msg.includes("not found")) {
      return res.status(404).json({ error: "Transcript not available for this video" });
    }
    if (msg.includes("disabled")) {
      return res.status(403).json({ error: "Captions are disabled for this video" });
    }
    return res.status(500).json({ error: msg || "Failed to fetch transcript" });
  }
}
