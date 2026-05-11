const YT_API = "https://www.googleapis.com/youtube/v3/search";

export default async function handler(req, res) {
  const query = req.query.q || req.query.query;
  if (!query) {
    return res.status(400).json({ error: "Missing search query" });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "YOUTUBE_API_KEY not configured" });
  }

  try {
    const url = new URL(YT_API);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("q", query);
    url.searchParams.set("type", "video");
    url.searchParams.set("order", "viewCount");
    url.searchParams.set("maxResults", "8");
    url.searchParams.set("key", apiKey);

    const resp = await fetch(url.toString());
    const data = await resp.json();

    if (!resp.ok || data.error) {
      return res.status(resp.status).json({
        error: data.error?.message || "YouTube API error",
      });
    }

    const videos = (data.items || []).map((item) => ({
      videoId: item.id?.videoId,
      title: item.snippet?.title,
      channelTitle: item.snippet?.channelTitle,
      thumbnail: `https://img.youtube.com/vi/${item.id?.videoId}/maxresdefault.jpg`,
    })).filter((v) => v.videoId);

    return res.status(200).json({ videos });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
