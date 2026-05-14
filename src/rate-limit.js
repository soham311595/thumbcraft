import crypto from "crypto"

function getSecret() {
  return process.env.LEMONSQUEEZY_WEBHOOK_SECRET || process.env.OPENROUTER_API_KEY || "dev-secret-change-me"
}

export function createLicenseKey(subscriptionId, plan, expiresAt) {
  const raw = `${subscriptionId}|${plan}|${expiresAt}`
  const payload = Buffer.from(raw).toString("base64")
  const signature = crypto.createHmac("sha256", getSecret()).update(payload).digest("hex")
  return `${payload}.${signature}`
}

export function verifyLicenseKey(licenseKey) {
  try {
    const parts = licenseKey.split(".")
    if (parts.length !== 2) return null
    const [payload, signature] = parts
    const expected = crypto.createHmac("sha256", getSecret()).update(payload).digest("hex")
    if (signature !== expected) return null
    const raw = Buffer.from(payload, "base64").toString()
    const [subscriptionId, plan, expiresAt] = raw.split("|")
    if (new Date(expiresAt) < new Date()) return null
    return { subscriptionId, plan, expiresAt }
  } catch { return null }
}

export async function checkGenerationLimit(ip = "", licenseKey = "") {
  if (licenseKey) {
    const info = verifyLicenseKey(licenseKey)
    if (info) {
      return { allowed: true, remaining: Infinity, isPro: true }
    }
  }
  // Free tier is enforced client-side via localStorage
  // Server allows all requests without a valid license key
  return { allowed: true, remaining: 999, isPro: false }
}

export async function incrementGenerationCount(ip = "") {
  // No-op: free tier tracking is client-side
}
