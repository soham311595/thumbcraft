const memoryStore = new Map()

function getEdgeConfigUrl() {
  const conn = process.env.EDGE_CONFIG
  const token = process.env.VERCEL_ACCESS_TOKEN
  if (!conn || !token) return null
  const match = conn.match(/ecfg_[a-z0-9]+/)
  if (!match) return null
  return {
    id: match[0],
    token,
  }
}

export async function getLastSeq(subscriptionId) {
  const cfg = getEdgeConfigUrl()
  if (cfg) {
    try {
      const res = await fetch(
        `https://api.vercel.com/v1/edge-config/${cfg.id}/items?key=${subscriptionId}`,
        { headers: { Authorization: `Bearer ${cfg.token}` } }
      )
      if (res.ok) {
        const data = await res.json()
        if (data?.value != null) return data.value
      }
    } catch {}
  }
  return memoryStore.get(subscriptionId) || 0
}

export async function setLastSeq(subscriptionId, seq) {
  memoryStore.set(subscriptionId, seq)

  const cfg = getEdgeConfigUrl()
  if (!cfg) return

  try {
    await fetch(
      `https://api.vercel.com/v1/edge-config/${cfg.id}/items`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          { operation: "upsert", key: subscriptionId, value: seq },
        ]),
      }
    )
  } catch {}
}
