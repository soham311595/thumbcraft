export async function fetchPlayerData(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}&hl=en`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!resp.ok) throw new Error(`Failed to fetch YouTube page: ${resp.status}`);

  const html = await resp.text();
  const playerData = extractPlayerResponse(html);

  const storyboards = playerData?.storyboards?.playerStoryboardSpecRenderer;
  const spec = storyboards?.spec || "";

  const videoDetails = playerData?.videoDetails || {};
  const duration = parseInt(videoDetails.lengthSeconds || 0);
  const title =
    videoDetails.title ||
    playerData?.microformat?.playerMicroformatRenderer?.title?.simpleText ||
    "";

  const sighSignatures = extractSighFromSpec(spec);

  return { spec, duration, title, sighSignatures };
}

function extractPlayerResponse(html) {
  const markers = [
    "ytInitialPlayerResponse = ",
    "window.ytInitialPlayerResponse = ",
    'window["ytInitialPlayerResponse"] = ',
  ];

  let startIdx = -1;
  for (const marker of markers) {
    const idx = html.indexOf(marker);
    if (idx !== -1) {
      startIdx = idx + marker.length;
      break;
    }
  }

  if (startIdx === -1) throw new Error("Could not find ytInitialPlayerResponse");

  let pos = startIdx;
  while (pos < html.length && html[pos] === " ") pos++;

  if (html[pos] !== "{") throw new Error("Expected JSON object");

  let depth = 0;
  let inString = false;
  let escape = false;
  const jsonStart = pos;

  for (let i = pos; i < html.length; i++) {
    const ch = html[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const jsonStr = html.slice(jsonStart, i + 1);
          return JSON.parse(jsonStr);
        }
      }
    }
  }

  throw new Error("Unterminated player response JSON");
}

function extractSighFromSpec(spec) {
  const signatures = [];
  const parts = spec.split("|");
  for (const part of parts) {
    const m = part.match(/sigh=(rs\$\S+?)(?:$|[&#|])/);
    if (m) signatures.push(m[1]);
  }
  return signatures;
}
