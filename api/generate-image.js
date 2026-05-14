import { checkGenerationLimit, incrementGenerationCount } from "../src/rate-limit.js";
import { getLastSeq, setLastSeq } from "../src/nonce-store.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENROUTER_API_KEY not configured" });
  }

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
             req.socket?.remoteAddress ||
             "unknown";
  const licenseKey = req.headers["x-license-key"] || "";

  const limit = checkGenerationLimit(ip, licenseKey);
  if (!limit.allowed && limit.exhausted) {
    return res.status(402).json({ error: "Monthly limit reached (50/50). Resets next month.", exhausted: true });
  }
  if (!limit.allowed) {
    return res.status(402).json({ error: "Free limit reached" });
  }

  // Anti-replay: check sequence number hasn't been used before
  if (limit.isPro) {
    const lastSeq = await getLastSeq(limit.subscriptionId);
    if (limit.seq <= lastSeq) {
      return res.status(402).json({ error: "Monthly limit reached (50/50). Resets next month.", exhausted: true });
    }
  }

  const { prompt, reference_images } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "Missing prompt" });
  }

  try {
    let messageContent;
    if (reference_images && reference_images.length > 0) {
      messageContent = [
        { type: "text", text: prompt },
        ...reference_images.map((url) => ({ type: "image_url", image_url: { url } })),
      ];
    } else {
      messageContent = prompt;
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.VERCEL_URL || "https://thumbcraft.vercel.app",
        "X-Title": "ThumbCraft",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image-preview",
        messages: [{ role: "user", content: messageContent }],
        modalities: ["image"],
      }),
    });

    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = { error: raw.slice(0, 300) }; }

    if (!response.ok) {
      const detail = data.error?.metadata?.provider_name
        ? ` (${data.error.metadata.provider_name})`
        : "";
      return res.status(response.status).json({
        error: `${data.error?.message || data.error || "Image generation failed"}${detail}`,
      });
    }

    const images = data?.choices?.[0]?.message?.images;
    if (!images?.length) {
      return res.status(500).json({ error: "No image in model response" });
    }

    // Record this seq as used (prevents replay of this token)
    if (limit.isPro) {
      await setLastSeq(limit.subscriptionId, limit.seq);
    }

    const newLicenseKey = incrementGenerationCount(ip, licenseKey);

    const result = {
      dataUrl: images[0].image_url.url,
      prompt,
    };
    if (newLicenseKey) result.license_key = newLicenseKey;

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
