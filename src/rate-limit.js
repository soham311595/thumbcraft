const FREE_LIMIT = 3

let kv
async function getKv() {
  if (kv) return kv
  if (!process.env.KV_URL) return null
  try {
    const mod = await import("@vercel/kv")
    kv = mod.kv
    return kv
  } catch { return null }
}

export async function checkGenerationLimit(ip = "", licenseKey = "") {
  const client = await getKv()
  if (!client) {
    return { allowed: true, remaining: 999, isPro: false }
  }

  if (licenseKey) {
    try {
      const license = await client.get(`license:${licenseKey}`)
      if (license && license.status === "active") {
        return { allowed: true, remaining: Infinity, isPro: true }
      }
    } catch {}
  }

  try {
    const count = await client.get(`gen:${ip}`) || 0
    if (count >= FREE_LIMIT) {
      return { allowed: false, remaining: 0, isPro: false }
    }
    return { allowed: true, remaining: FREE_LIMIT - count, isPro: false }
  } catch {
    return { allowed: true, remaining: 1, isPro: false }
  }
}

export async function incrementGenerationCount(ip = "") {
  const client = await getKv()
  if (!client) return
  try {
    await client.incr(`gen:${ip}`)
  } catch {}
}
