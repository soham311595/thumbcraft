export async function fetchYouTubeTranscript(videoId) {
  const resp = await fetch(`/api/transcript?vid=${videoId}`);
  if (!resp.ok) throw new Error(`Transcript not available (${resp.status})`);
  const data = await resp.json();
  if (!Array.isArray(data)) throw new Error("No captions available for this video");
  return data.map((seg) => ({
    text: seg.text.replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/<[^>]+>/g, ""),
    start: seg.start,
    duration: seg.duration,
  }));
}

export function formatTranscript(segments, maxChars = 8000) {
  let text = segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
  if (text.length > maxChars) text = text.slice(0, maxChars) + "...";
  return text;
}
