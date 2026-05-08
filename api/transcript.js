export default async function handler(req, res) {
  const videoId = req.query.vid || req.query.videoId;
  if (!videoId) {
    return res.status(400).json({ error: "Missing videoId" });
  }

  try {
    const response = await fetch(
      `https://youtubetranscript.com/?vid=${videoId}&format=json`,
      {
        headers: {
          "User-Agent": "ThumbCraft/1.0",
          Accept: "application/json",
        },
      },
    );

    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({
        error: "Invalid response from transcript service",
        detail: text.slice(0, 500),
      });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error || data.message || "Transcript fetch failed",
      });
    }

    if (!Array.isArray(data)) {
      return res.status(404).json({
        error: typeof data.error === "string" ? data.error : "No captions available for this video",
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
