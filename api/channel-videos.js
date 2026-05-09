export function extractChannelId(input) {
  if (/^UC[\w-]{22}$/.test(input)) return input;
  try {
    const url = new URL(input.startsWith("http") ? input : `https://${input}`);
    if (url.pathname.startsWith("/channel/")) return url.pathname.split("/")[2];
    if (url.pathname.startsWith("/c/")) return url.pathname.split("/")[2];
    if (url.pathname.startsWith("/user/")) return url.pathname.split("/")[2];
    if (url.pathname.startsWith("/@")) return url.pathname;
  } catch {}
  return input.startsWith("@") ? input : null;
}

export async function resolveHandleToChannelId(handle) {
  const resp = await fetch(`https://www.youtube.com/${handle}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  if (!resp.ok) throw new Error("Channel not found");
  const html = await resp.text();
  const m = html.match(/channelId["']?\s*[:=]\s*["'](UC[\w-]{22})["']/);
  if (m) return m[1];
  const c = html.match(/<link\s+rel="canonical"[^>]*href="[^"]*\/(UC[\w-]{22})"/);
  if (c) return c[1];
  const s = html.match(/externalId["']?\s*[:=]\s*["'](UC[\w-]{22})["']/);
  if (s) return s[1];
  throw new Error("Could not resolve channel ID from handle");
}

export async function fetchChannelVideos(channelId) {
  const resp = await fetch(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36",
      },
    },
  );
  if (!resp.ok) throw new Error("Failed to fetch channel videos");
  const xml = await resp.text();
  const videos = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = entryRe.exec(xml)) !== null) {
    const entry = m[1];
    const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = entry.match(/<title(?!>)[^>]*>([^<]+)<\/title>/)?.[1];
    if (videoId && title) {
      videos.push({
        videoId,
        title: title.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
        thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      });
    }
  }
  return videos;
}

export default async function handler(req, res) {
  const channelInput = req.query.url || req.query.channel;
  if (!channelInput) {
    return res.status(400).json({ error: "Missing channel URL or ID" });
  }

  try {
    let channelId = extractChannelId(channelInput);
    if (!channelId) throw new Error("Invalid channel input");
    if (channelId.startsWith("@")) {
      channelId = await resolveHandleToChannelId(channelId);
    }
    const videos = await fetchChannelVideos(channelId);
    return res.status(200).json({ channelId, videos });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
