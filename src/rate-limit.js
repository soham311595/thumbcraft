import { kv } from "@vercel/kv";

const FREE_LIMIT = 3;

function kvAvailable() {
  return !!process.env.KV_URL;
}

export async function checkGenerationLimit(ip = "", licenseKey = "") {
  if (!kvAvailable()) {
    return { allowed: true, remaining: 999, isPro: false };
  }

  if (licenseKey) {
    try {
      const license = await kv.get(`license:${licenseKey}`);
      if (license && license.status === "active") {
        return { allowed: true, remaining: Infinity, isPro: true };
      }
    } catch {}
  }

  try {
    const count = await kv.get(`gen:${ip}`) || 0;
    if (count >= FREE_LIMIT) {
      return { allowed: false, remaining: 0, isPro: false };
    }
    return { allowed: true, remaining: FREE_LIMIT - count, isPro: false };
  } catch {
    return { allowed: true, remaining: 1, isPro: false };
  }
}

export async function incrementGenerationCount(ip = "") {
  if (!kvAvailable()) return;
  try {
    await kv.incr(`gen:${ip}`);
  } catch {}
}
