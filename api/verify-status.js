import { checkGenerationLimit } from "../src/rate-limit.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
             req.socket?.remoteAddress ||
             "unknown";

  const licenseKey = req.headers["x-license-key"] || req.query.license_key || "";

  try {
    const result = await checkGenerationLimit(ip, licenseKey);
    return res.status(200).json({
      unlocked: result.isPro,
      remaining: result.isPro ? Infinity : result.remaining,
      plan: null,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
