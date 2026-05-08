function decodeHtml(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseTranscriptXml(xml) {
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
  return segments;
}

async function fetchTranscriptFromTrack(baseUrl) {
  const resp = await fetch(baseUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36",
    },
  });
  if (!resp.ok) return null;
  const xml = await resp.text();
  return parseTranscriptXml(xml);
}

async function tryInnerTube(videoId, clientName, clientVersion) {
  const resp = await fetch(
    "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": `com.google.android.youtube/${clientVersion} (Linux; U; Android 14)`,
      },
      body: JSON.stringify({
        context: { client: { clientName, clientVersion } },
        videoId,
      }),
    },
  );
  if (!resp.ok) return null;
  const data = await resp.json();
  if (data?.playabilityStatus?.status !== "OK") return null;
  const tracks =
    data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(tracks) || tracks.length === 0) return null;
  return fetchTranscriptFromTrack(tracks[0].baseUrl);
}

async function tryWebScrape(videoId) {
  const resp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!resp.ok) return null;
  const html = await resp.text();
  if (html.includes('class="g-recaptcha"')) return "captcha";

  const match = html.match(/ytInitialPlayerResponse\s*=\s*({.*?});/);
  if (!match) return null;
  let playerData;
  try {
    playerData = JSON.parse(match[1]);
  } catch {
    return null;
  }
  if (playerData?.playabilityStatus?.status !== "OK") return null;
  const tracks =
    playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(tracks) || tracks.length === 0) return null;
  return fetchTranscriptFromTrack(tracks[0].baseUrl);
}

export default async function handler(req, res) {
  const videoId = req.query.vid || req.query.videoId;
  if (!videoId) {
    return res.status(400).json({ error: "Missing videoId" });
  }

  const methods = [
    () => tryInnerTube(videoId, "ANDROID", "20.10.38"),
    () => tryInnerTube(videoId, "ANDROID", "19.09.37"),
    () => tryInnerTube(videoId, "WEB", "2.20250101.00.00"),
    () => tryWebScrape(videoId),
  ];

  let lastError = "All transcript methods failed";

  for (const method of methods) {
    try {
      const result = await method();
      if (result === "captcha") {
        lastError = "YouTube is blocking automated access. Try a different video.";
        continue;
      }
      if (result && result.length > 0) {
        return res.status(200).json(result);
      }
      if (result !== null) {
        lastError = "No captions found on this video";
      }
    } catch (e) {
      lastError = e.message;
    }
  }

  return res.status(404).json({ error: lastError });
}
