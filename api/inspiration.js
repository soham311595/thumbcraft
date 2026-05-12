export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "YOUTUBE_API_KEY not configured" });
  }

  const { niche = "", subcategory = "" } = req.query;

  try {
    async function searchVideos(query) {
      const r = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(query)}&key=${apiKey}`
      );
      const raw = await r.text();
      let data;
      try { data = JSON.parse(raw); } catch { data = null; }
      if (!r.ok || !data) return [];
      return data.items || [];
    }

    const [broadItems, specificItems] = await Promise.all([
      searchVideos(`${niche} channel`),
      subcategory ? searchVideos(`${niche} ${subcategory} viral trending`) : Promise.resolve([]),
    ]);

    // Merge and deduplicate by videoId
    const seen = new Set();
    const merged = [];
    for (const item of [...broadItems, ...specificItems]) {
      if (!seen.has(item.id.videoId)) {
        seen.add(item.id.videoId);
        merged.push(item);
      }
    }

    if (merged.length === 0) {
      return res.status(200).json({ results: [] });
    }

    const channelIds = [...new Set(merged.map((i) => i.snippet.channelId))];
    const videoIds = merged.map((i) => i.id.videoId);

    const [channelRaw, videoRaw] = await Promise.all([
      fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelIds.join(",")}&key=${apiKey}`)
        .then((r) => r.text()),
      fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=${videoIds.join(",")}&key=${apiKey}`)
        .then((r) => r.text()),
    ]);

    let channelData, videoData;
    try { channelData = JSON.parse(channelRaw); } catch { channelData = { items: [] }; }
    try { videoData = JSON.parse(videoRaw); } catch { videoData = { items: [] }; }

    const channelStatsMap = {};
    for (const ch of channelData.items || []) {
      channelStatsMap[ch.id] = Math.round(
        parseInt(ch.statistics.viewCount || "0", 10) /
        Math.max(parseInt(ch.statistics.videoCount || "1", 10), 1)
      );
    }

    function parseDuration(iso) {
      const m = iso.match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
      return (parseInt(m?.[1] || "0", 10) * 60) + parseInt(m?.[2] || "0", 10);
    }

    const longVideos = (videoData.items || []).filter(
      (v) => parseDuration(v.contentDetails.duration) >= 60
    );
    const longVideoIds = new Set(longVideos.map((v) => v.id));
    const filteredItems = merged.filter((i) => longVideoIds.has(i.id.videoId));
    if (filteredItems.length === 0) {
      return res.status(200).json({ results: [] });
    }

    const videoStats = {};
    for (const v of longVideos) {
      videoStats[v.id] = parseInt(v.statistics.viewCount || "0", 10);
    }

    const results = filteredItems.map((item) => {
      const vid = item.id.videoId;
      const cid = item.snippet.channelId;
      const viewCount = videoStats[vid] || 0;
      const channelAvgViews = channelStatsMap[cid] || 1;
      const viralRatio = channelAvgViews > 0 ? +(viewCount / channelAvgViews).toFixed(2) : 0;

      return {
        videoId: vid,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        channelId: cid,
        thumbnailUrl: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
        viewCount,
        channelAvgViews,
        viralRatio,
      };
    });

    results.sort((a, b) => b.viralRatio - a.viralRatio);
    return res.status(200).json({ results });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
