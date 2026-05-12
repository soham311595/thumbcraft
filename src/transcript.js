export function formatTranscript(segments, maxChars = 8000) {
  if (!segments || segments.length === 0) return "";
  let text = segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
  if (text.length > maxChars) text = text.slice(0, maxChars) + "...";
  return text;
}
