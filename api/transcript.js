export default async function handler(req, res) {
  const videoId = req.query.vid || req.query.videoId;
  if (!videoId) {
    return res.status(400).json({ error: "Missing videoId" });
  }

  try {
    const response = await fetch(
      `https://youtubetranscript.com/?vid=${videoId}&format=json`,
    );
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
