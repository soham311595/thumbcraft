const INNERTUBE_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export default async function handler(req, res) {
  const videoId = req.query.vid || req.query.videoId;
  if (!videoId) {
    return res.status(400).json({ error: "Missing videoId" });
  }

  try {
    const playerResp = await fetch(INNERTUBE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "com.google.android.youtube/20.10.38 (Linux; U; Android 14)",
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: "20.10.38",
          },
        },
        videoId,
      }),
    });

    if (!playerResp.ok) {
      return res.status(502).json({ error: "YouTube API request failed" });
    }

    const data = await playerResp.json();

    if (data?.playabilityStatus?.status !== "OK") {
      const reason =
        data?.playabilityStatus?.reason || "Video is unavailable";
      return res.status(404).json({ error: reason });
    }

    const tracks =
      data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!Array.isArray(tracks) || tracks.length === 0) {
      return res.status(403).json({
        error: "No captions available for this video",
        detail:
          "The video may have captions disabled, or they are not accessible through this method.",
      });
    }

    const track = tracks[0];
    const transcriptResp = await fetch(track.baseUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36",
      },
    });

    if (!transcriptResp.ok) {
      return res.status(502).json({ error: "Failed to fetch transcript XML" });
    }

    const xml = await transcriptResp.text();
    const segments = [];
    const regex = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
    let m;
    while ((m = regex.exec(xml)) !== null) {
      segments.push({
        text: decodeHtml(m[3]),
        start: parseFloat(m[1]),
        duration: parseFloat(m[2]),
      });
    }

    if (segments.length === 0) {
      return res.status(404).json({ error: "Transcript is empty" });
    }

    return res.status(200).json(segments);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Internal error" });
  }
}
