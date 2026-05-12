export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENROUTER_API_KEY not configured" });
  }

  const { prompt, reference_image } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "Missing prompt" });
  }

  try {
    const messageContent = reference_image
      ? [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: reference_image } },
        ]
      : prompt;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.VERCEL_URL || "https://thumbcraft.vercel.app",
        "X-Title": "ThumbCraft",
      },
      body: JSON.stringify({
        model: "sourceful/riverflow-v2-fast",
        messages: [{ role: "user", content: messageContent }],
        modalities: ["image"],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const detail = data.error?.metadata?.provider_name
        ? ` (${data.error.metadata.provider_name})`
        : "";
      return res.status(response.status).json({
        error: `${data.error?.message || "Image generation failed"}${detail}`,
      });
    }

    const images = data?.choices?.[0]?.message?.images;
    if (!images?.length) {
      return res.status(500).json({ error: "No image in model response" });
    }

    return res.status(200).json({
      dataUrl: images[0].image_url.url,
      prompt,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
