export async function fetchTranscript(videoId, signal) {
  const resp = await fetch(`/api/transcript?vid=${videoId}`, { signal });
  if (!resp.ok) return [];
  const data = await resp.json();
  if (!Array.isArray(data)) return [];
  return data.map((seg) => ({
    text: seg.text,
    start: seg.start,
    duration: seg.duration,
  }));
}

export function formatTranscript(segments, maxChars = 8000) {
  if (!segments || segments.length === 0) return "";
  let text = segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
  if (text.length > maxChars) text = text.slice(0, maxChars) + "...";
  return text;
}

export async function fetchVideoTitle(videoId, signal) {
  try {
    const resp = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { signal },
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.title || null;
  } catch {
    return null;
  }
}
