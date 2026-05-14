const TEXT_MODEL = "inclusionai/ring-2.6-1t:free";
const VISION_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";

// Strip <think>...</think> reasoning blocks that Nemotron emits before its answer
function extractText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from model");
  return content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

// Strip and parse JSON from response text (handles markdown code fences etc.)
function repairJson(raw) {
  let s = raw.replace(/```json|```/g, "").trim();
  s = s.replace(/,(\s*[}\]])/g, "$1");
  s = s.replace(/:\s*'([^']*)'/g, ': "$1"');
  s = s.replace(/(['"])\s*:\s*(['"])/g, "$1: $2");
  return s;
}

function tryParse(text) {
  const repaired = repairJson(text);
  try {
    return JSON.parse(repaired);
  } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(repairJson(m[0]));
    } catch {}
  }
  return null;
}

// Generic OpenRouter chat completion call
async function orChat(body) {
  const res = await fetch("/api/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error(raw.slice(0, 300)); }
  if (data.error) {
    const detail = data.error.metadata?.provider_name
      ? ` (${data.error.metadata.provider_name})`
      : "";
    throw new Error(`${data.error.message}${detail}`);
  }
  return data;
}

// ─────────────────────────────────────────────────────────
// TEXT ANALYSIS - Nemotron
// Used for: niche analysis (transcript → JSON), concept gen, composition, critique
// ─────────────────────────────────────────────────────────
export async function analyzeText(prompt, systemPrompt, options = {}) {
  const messages = systemPrompt
    ? [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ]
    : [{ role: "user", content: prompt }];

  const body = {
    model: TEXT_MODEL,
    messages,
  };
  if (options.reasoning !== false) {
    body.reasoning = { enabled: true };
  }

  const data = await orChat(body);

  const text = options.reasoning !== false ? extractText(data) : (data?.choices?.[0]?.message?.content || "");
  if (options.raw) return text;
  const parsed = tryParse(text);
  if (!parsed) throw new Error("Nemotron response parse failed: " + text.slice(0, 300));
  return parsed;
}

// ─────────────────────────────────────────────────────────
// VISION ANALYSIS - Nemotron
// Used for: analyzing thumbnail images + transcript together, critique with image
// Nemotron natively accepts image + text in the same message
// ─────────────────────────────────────────────────────────
export async function analyzeVision(imageUrls, textContent, systemPrompt) {
  const imageContent = imageUrls.map((url) => ({
    type: "image_url",
    image_url: { url },
  }));

  const messages = [
    ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
    {
      role: "user",
      content: [...imageContent, { type: "text", text: textContent }],
    },
  ];

  const data = await orChat({
    model: VISION_MODEL,
    messages,
    reasoning: { enabled: true },
  });

  const text = extractText(data);
  const parsed = tryParse(text);
  if (!parsed) throw new Error("Nemotron vision parse failed: " + text.slice(0, 300));
  return parsed;
}

// ─────────────────────────────────────────────────────────
// IMAGE GENERATION - Riverflow via OpenRouter
// Returns base64 data URL - caller must upload to storage or use directly
// ─────────────────────────────────────────────────────────
export async function generateThumbnail(prompt, imageConfig, referenceImages = []) {
  const body = { prompt };
  if (referenceImages.length > 0) {
    body.reference_images = referenceImages;
  }

  const res = await fetch("/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error(raw.slice(0, 300)); }
  if (!res.ok) throw new Error(data.error || "Image generation failed");
  return data;
}
