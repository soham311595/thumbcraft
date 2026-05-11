export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENROUTER_API_KEY not configured" });
  }

  const body = { ...req.body };

  // If model uses reasoning, strip it from the body (not a standard OpenAI param)
  // and add it at the top level so OpenRouter uses it
  const reasoning = body.reasoning;
  delete body.reasoning;

  const orBody = { ...body };
  if (reasoning) {
    orBody.reasoning = reasoning;
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.VERCEL_URL || "https://thumbcraft.vercel.app",
        "X-Title": "ThumbCraft",
      },
      body: JSON.stringify(orBody),
    });

    const data = await response.json();

    // For image generation models (Gemini), the response may include images array
    // at choices[0].message.images — forward as-is
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
