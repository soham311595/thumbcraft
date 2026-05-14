export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  const monthlyVariantId = process.env.LEMONSQUEEZY_MONTHLY_VARIANT;
  const annualVariantId = process.env.LEMONSQUEEZY_ANNUAL_VARIANT;

  if (!apiKey || !storeId || !monthlyVariantId || !annualVariantId) {
    return res.status(500).json({ error: "LemonSqueezy not configured" });
  }

  const { plan = "monthly" } = req.body;
  const variantId = plan === "annual" ? annualVariantId : monthlyVariantId;

  const sessionId = crypto.randomUUID();
  const origin = req.headers.origin || "https://thumbcraft.vercel.app";

  try {
    const response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            store_id: parseInt(storeId, 10),
            variant_id: parseInt(variantId, 10),
            checkout_data: {
              custom: { session_id: sessionId },
            },
            redirect_url: `${origin}/?session_id=${sessionId}`,
            product_options: {
              enabled_variants: [parseInt(variantId, 10)],
            },
          },
        },
      }),
    });

    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = null; }

    if (!response.ok || !data?.data?.attributes?.url) {
      const detail = data?.errors?.[0]?.detail || raw.slice(0, 300);
      return res.status(500).json({ error: detail });
    }

    return res.status(200).json({
      url: data.data.attributes.url,
      session_id: sessionId,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
