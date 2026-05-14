import { createLicenseKey } from "../src/rate-limit.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "LemonSqueezy not configured" });
  }

  const { session_id } = req.body;
  if (!session_id) {
    return res.status(400).json({ error: "Missing session_id" });
  }

  try {
    const lsRes = await fetch(
      `https://api.lemonsqueezy.com/v1/checkouts?filter[custom_data.session_id]=${session_id}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );
    const lsRaw = await lsRes.text();
    let lsData;
    try { lsData = JSON.parse(lsRaw); } catch { lsData = null; }

    if (!lsData?.data?.length) {
      return res.status(404).json({ error: "Checkout not found" });
    }

    const checkout = lsData.data[0];
    const status = checkout.attributes?.status;

    if (status !== "paid") {
      return res.status(400).json({ error: `Checkout status: ${status}` });
    }

    const subscriptionId = checkout.relationships?.subscription?.data?.id;
    if (!subscriptionId) {
      return res.status(400).json({ error: "No subscription found" });
    }

    const subRes = await fetch(
      `https://api.lemonsqueezy.com/v1/subscriptions/${subscriptionId}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );
    const subRaw = await subRes.text();
    let subData;
    try { subData = JSON.parse(subRaw); } catch { subData = null; }

    if (!subData?.data) {
      return res.status(500).json({ error: "Failed to fetch subscription" });
    }

    const subAttrs = subData.data.attributes;
    const plan = subAttrs.variant_name?.toLowerCase()?.includes("annual") ? "annual" : "monthly";
    const expiresAt = subAttrs.ends_at || subAttrs.renews_at || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    const licenseKey = createLicenseKey(subscriptionId, plan, expiresAt);

    return res.status(200).json({
      success: true,
      license_key: licenseKey,
      plan,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
