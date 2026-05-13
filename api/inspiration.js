export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "YOUTUBE_API_KEY not configured" });
  }

  const { handles = "" } = req.query;
  const creatorList = handles.split(",").map((s) => s.trim().replace(/^@/, "")).filter(Boolean);

  if (creatorList.length === 0) {
    return res.status(400).json({ error: "No creator handles provided" });
  }

  try {
    // Phase 1: Look up each handle → channelId + stats
    const channels = await Promise.all(
      creatorList.map(async (handle) => {
        const r = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&forHandle=${encodeURIComponent(handle)}&key=${apiKey}`
        );
        const raw = await r.text();
        let data;
        try { data = JSON.parse(raw); } catch { data = null; }
        if (!r.ok || !data?.items?.length) {
          // fallback: try without @ (some APIs strip it)
          const r2 = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&forHandle=${encodeURIComponent(handle)}&key=${apiKey}`
          );
          const raw2 = await r2.text();
          try { data = JSON.parse(raw2); } catch { data = null; }
        }
        if (!data?.items?.length) return null;
        const ch = data.items[0];
        return {
          handle: `@${handle}`,
          channelId: ch.id,
          name: ch.snippet?.title || handle,
          subscriberCount: parseInt(ch.statistics?.subscriberCount || "0", 10),
          totalViews: parseInt(ch.statistics?.viewCount || "0", 10),
          totalVideos: parseInt(ch.statistics?.videoCount || "1", 10),
          avgViews: Math.round(
            parseInt(ch.statistics?.viewCount || "0", 10) /
            Math.max(parseInt(ch.statistics?.videoCount || "1", 10), 1)
          ),
        };
      })
    );

    const validChannels = channels.filter(Boolean);
    if (validChannels.length === 0) {
      return res.status(200).json({ results: [], errors: ["No channels found for the given handles"] });
    }

    // Phase 2: Fetch RSS feeds for each channel
    const rssResults = await Promise.all(
      validChannels.map(async (ch) => {
        try {
          const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.channelId}`);
          const xml = await r.text();

          const entries = [];
          const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
          let match;
          while ((match = entryRegex.exec(xml)) !== null) {
            const block = match[1];
            const videoId = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
            const title = block.match(/<title>([^<]*)<\/title>/)?.[1]?.trim();
            const thumbnailMatch = block.match(/<media:thumbnail[^>]*url="([^"]+)"/)?.[1];
            if (videoId) {
              entries.push({
                videoId,
                title: title || "Untitled",
                thumbnailUrl: thumbnailMatch || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              });
            }
          }
          return { channel: ch, videos: entries };
        } catch {
          return { channel: ch, videos: [] };
        }
      })
    );

    // Collect all video IDs
    const allVideos = [];
    const videoIdToCreator = {};
    for (const { channel, videos } of rssResults) {
      for (const v of videos) {
        allVideos.push(v.videoId);
        videoIdToCreator[v.videoId] = { ...channel };
      }
    }

    if (allVideos.length === 0) {
      return res.status(200).json({ results: [], errors: ["No videos found in RSS feeds"] });
    }

    // Phase 3: Get video stats + durations in one batch
      const videoRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${allVideos.join(",")}&key=${apiKey}`
      );
    const videoRaw = await videoRes.text();
    let videoData;
    try { videoData = JSON.parse(videoRaw); } catch { videoData = { items: [] }; }

    function parseDuration(iso) {
      const m = iso.match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
      return (parseInt(m?.[1] || "0", 10) * 60) + parseInt(m?.[2] || "0", 10);
    }

    const results = [];
    const seen = new Set();

    for (const v of videoData.items || []) {
      const vid = v.id;
      if (seen.has(vid)) continue;
      seen.add(vid);

      const dur = parseDuration(v.contentDetails?.duration || "PT0S");
      if (dur < 60) continue; // filter shorts

      const creator = videoIdToCreator[vid];
      if (!creator) continue;

      const viewCount = parseInt(v.statistics?.viewCount || "0", 10);
      const avgViews = creator.avgViews || 1;
      const viralRatio = avgViews > 0 ? +(viewCount / avgViews).toFixed(2) : 0;

      results.push({
        videoId: vid,
        title: v.snippet?.title || "Untitled",
        channelTitle: creator.name,
        channelId: creator.channelId,
        creatorHandle: creator.handle,
        subscriberCount: creator.subscriberCount,
        thumbnailUrl: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
        viewCount,
        channelAvgViews: avgViews,
        viralRatio,
      });
    }

    results.sort((a, b) => b.viralRatio - a.viralRatio);

    // Ensure diversity: cap at 3 videos per creator, max 15 total, at least 5 creators
    const perCreatorCount = {};
    const diverseResults = [];
    for (const r of results) {
      const key = r.creatorHandle;
      const count = perCreatorCount[key] || 0;
      if (count >= 3) continue;
      perCreatorCount[key] = count + 1;
      diverseResults.push(r);
      if (diverseResults.length === 15) break;
    }

    return res.status(200).json({
      results: diverseResults,
      channels: validChannels.map((c) => ({
        handle: c.handle,
        name: c.name,
        subscriberCount: c.subscriberCount,
        avgViews: c.avgViews,
        totalViews: c.totalViews,
        totalVideos: c.totalVideos,
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
