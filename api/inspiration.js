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
    const query = encodeURIComponent(`best thumbnails ${niche} ${subcategory} channel`);
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${query}&key=${apiKey}`
    );

    const searchRaw = await searchRes.text();
    let searchData;
    try { searchData = JSON.parse(searchRaw); } catch { searchData = null; }
    if (!searchRes.ok || !searchData) {
      const msg = searchData?.error?.message || searchRaw?.slice(0, 200) || "YouTube search failed";
      return res.status(searchRes.status).json({ error: msg });
    }

    const items = searchData.items || [];
    if (items.length === 0) {
      return res.status(200).json({ results: [] });
    }

    const channelIds = [...new Set(items.map((i) => i.snippet.channelId))];
    const videoIds = items.map((i) => i.id.videoId);

    const [channelRaw, videoRaw] = await Promise.all([
      fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelIds.join(",")}&key=${apiKey}`)
        .then((r) => r.text()),
      fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds.join(",")}&key=${apiKey}`)
        .then((r) => r.text()),
    ]);

    let channelData, videoData;
    try { channelData = JSON.parse(channelRaw); } catch { channelData = { items: [] }; }
    try { videoData = JSON.parse(videoRaw); } catch { videoData = { items: [] }; }

    const videoStats = {};
    for (const v of videoData.items || []) {
      videoStats[v.id] = parseInt(v.statistics.viewCount || "0", 10);
    }

    const channelVideoCounts = {};
    const channelTotalViews = {};
    for (const v of videoData.items || []) {
      const cid = items.find((i) => i.id.videoId === v.id)?.snippet.channelId;
      if (cid) {
        channelVideoCounts[cid] = (channelVideoCounts[cid] || 0) + 1;
        channelTotalViews[cid] = (channelTotalViews[cid] || 0) + parseInt(v.statistics.viewCount || "0", 10);
      }
    }

    const results = items.map((item) => {
      const vid = item.id.videoId;
      const cid = item.snippet.channelId;
      const viewCount = videoStats[vid] || 0;
      const totalViews = channelTotalViews[cid] || 0;
      const videoCount = channelVideoCounts[cid] || 1;
      const channelAvgViews = Math.round(totalViews / videoCount);
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
