import crypto from "crypto"

export const MONTHLY_LIMIT = 50

function getSecret() {
  return process.env.LEMONSQUEEZY_WEBHOOK_SECRET || process.env.OPENROUTER_API_KEY || "dev-secret-change-me"
}

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function encodePayload(subscriptionId, plan, month, remaining) {
  const raw = `${subscriptionId}|${plan}|${month}|${remaining}`
  return Buffer.from(raw).toString("base64")
}

function sign(payload) {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("hex")
}

function verify(token) {
  try {
    const parts = token.split(".")
    if (parts.length !== 2) return null
    const [payload, signature] = parts
    if (signature !== sign(payload)) return null
    const raw = Buffer.from(payload, "base64").toString()
    const [subscriptionId, plan, month, remainingStr] = raw.split("|")
    const remaining = parseInt(remainingStr, 10)
    if (isNaN(remaining)) return null
    return { subscriptionId, plan, month, remaining }
  } catch { return null }
}

export function createLicenseKey(subscriptionId, plan) {
  const month = currentMonth()
  const payload = encodePayload(subscriptionId, plan, month, MONTHLY_LIMIT)
  return `${payload}.${sign(payload)}`
}

export function getEffectiveRemaining(licenseKey) {
  const info = verify(licenseKey)
  if (!info) return null
  return info.month !== currentMonth() ? MONTHLY_LIMIT : info.remaining
}

export function createNextLicenseKey(licenseKey) {
  const info = verify(licenseKey)
  if (!info) return null
  const cm = currentMonth()
  const base = info.month !== cm ? MONTHLY_LIMIT : info.remaining
  if (base <= 0) return null
  const newPayload = encodePayload(info.subscriptionId, info.plan, cm, base - 1)
  return `${newPayload}.${sign(newPayload)}`
}

export function checkGenerationLimit(ip, licenseKey) {
  if (!licenseKey) {
    return { allowed: true, remaining: 999, isPro: false }
  }
  const remaining = getEffectiveRemaining(licenseKey)
  if (remaining === null) {
    return { allowed: true, remaining: 999, isPro: false }
  }
  if (remaining <= 0) {
    return { allowed: false, remaining: 0, isPro: true, exhausted: true }
  }
  return { allowed: true, remaining, isPro: true }
}

export function incrementGenerationCount(ip, licenseKey) {
  return createNextLicenseKey(licenseKey)
}
