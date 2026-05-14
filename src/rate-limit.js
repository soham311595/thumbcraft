import crypto from "crypto"
import { getLastSeq, setLastSeq } from "./nonce-store.js"

export const MONTHLY_LIMIT = 50

function getSecret() {
  return process.env.LEMONSQUEEZY_WEBHOOK_SECRET || process.env.OPENROUTER_API_KEY || "dev-secret-change-me"
}

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function encodePayload(subscriptionId, plan, month, remaining, seq) {
  const raw = `${subscriptionId}|${plan}|${month}|${remaining}|${seq}`
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
    const fields = raw.split("|")
    if (fields.length !== 5) return null
    const [subscriptionId, plan, month, remainingStr, seqStr] = fields
    const remaining = parseInt(remainingStr, 10)
    const seq = parseInt(seqStr, 10)
    if (isNaN(remaining) || isNaN(seq)) return null
    return { subscriptionId, plan, month, remaining, seq }
  } catch { return null }
}

export function createLicenseKey(subscriptionId, plan) {
  const month = currentMonth()
  const payload = encodePayload(subscriptionId, plan, month, MONTHLY_LIMIT, 1)
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
  const newPayload = encodePayload(info.subscriptionId, info.plan, cm, base - 1, info.seq + 1)
  return `${newPayload}.${sign(newPayload)}`
}

export function checkGenerationLimit(ip, licenseKey) {
  if (!licenseKey) {
    return { allowed: true, remaining: 999, isPro: false }
  }
  const info = verify(licenseKey)
  if (!info) {
    return { allowed: true, remaining: 999, isPro: false }
  }
  const cm = currentMonth()
  const effective = info.month !== cm ? MONTHLY_LIMIT : info.remaining
  if (effective <= 0) {
    return { allowed: false, remaining: 0, isPro: true, exhausted: true }
  }
  return { allowed: true, remaining: effective, isPro: true, seq: info.seq, subscriptionId: info.subscriptionId }
}

export function incrementGenerationCount(ip, licenseKey) {
  return createNextLicenseKey(licenseKey)
}
