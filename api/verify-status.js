import { checkGenerationLimit, getEffectiveRemaining } from "../src/rate-limit.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const licenseKey = req.headers["x-license-key"] || req.query.license_key || "";

  try {
    const limit = checkGenerationLimit("", licenseKey);
    if (limit.isPro) {
      const remaining = getEffectiveRemaining(licenseKey);
      return res.status(200).json({
        unlocked: true,
        remaining: remaining ?? MONTHLY_LIMIT,
        plan: "pro",
      });
    }
    return res.status(200).json({
      unlocked: false,
      remaining: 3,
      plan: null,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
