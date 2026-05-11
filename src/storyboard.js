export async function fetchStoryboardSpec(videoId) {
  const res = await fetch(`/api/player?vid=${videoId}`)
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || "Failed to fetch storyboard")
  }
  return res.json()
}

export function parseSpec(specString) {
  const pipeIdx = specString.indexOf("|")
  if (pipeIdx === -1) throw new Error("Invalid storyboard spec")

  const urlTemplate = specString.slice(0, pipeIdx)
  const raw = specString.slice(pipeIdx + 1)

  const parts = raw.split("#").map(Number)
  const levels = []
  let i = 0

  while (i + 8 < parts.length) {
    const frames = parts[i]
    const cols = parts[i + 1]
    const rows = parts[i + 2]
    const width = parts[i + 6]
    const height = parts[i + 7]
    const interval = parts[i + 8]

    if (!frames || !cols || !width || !height || !interval) break

    levels.push({
      frames,
      cols,
      rows,
      width,
      height,
      interval,
      spritesPerLevel: cols * rows,
      url: urlTemplate.replace("$L", levels.length).replace("$N", "$N"),
    })

    i += 9
    const remaining = parts.length - i
    if (remaining >= 3 && remaining < 9) {
      i += remaining
    } else if (remaining > 0 && remaining < 9) {
      i += remaining
    }
  }

  if (!levels.length) throw new Error("Could not parse storyboard levels")
  return { urlTemplate, levels }
}

export function getFrameUrlAndPosition(spec, timestampMs) {
  const { levels } = spec
  const durationMs = levels[0].frames * levels[0].interval

  for (let lvl = 0; lvl < levels.length; lvl++) {
    const level = levels[lvl]
    const frameIndex = Math.floor(timestampMs / level.interval)
    if (frameIndex >= level.frames) continue
    const localIndex = frameIndex % level.spritesPerLevel
    const spriteIndex = Math.floor(frameIndex / level.spritesPerLevel)
    const col = localIndex % level.cols
    const row = Math.floor(localIndex / level.cols)
    const url = level.url.replace("$N", String(spriteIndex))
    return {
      url,
      x: col * level.width,
      y: row * level.height,
      width: level.width,
      height: level.height,
      level,
    }
  }

  const fallback = levels[levels.length - 1]
  const frameIndex = Math.min(Math.floor(timestampMs / fallback.interval), fallback.frames - 1)
  const localIndex = frameIndex % fallback.spritesPerLevel
  const spriteIndex = Math.floor(frameIndex / fallback.spritesPerLevel)
  const col = localIndex % fallback.cols
  const row = Math.floor(localIndex / fallback.cols)
  return {
    url: fallback.url.replace("$N", String(spriteIndex)),
    x: col * fallback.width,
    y: row * fallback.height,
    width: fallback.width,
    height: fallback.height,
    level: fallback,
  }
}

export function extractFrame(spec, timestampMs) {
  return new Promise((resolve, reject) => {
    const { url, x, y, width, height } = getFrameUrlAndPosition(spec, timestampMs)
    const proxyUrl = `/api/sprite-proxy?url=${encodeURIComponent(url)}`
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const c = document.createElement("canvas")
      c.width = width
      c.height = height
      const ctx = c.getContext("2d")
      ctx.drawImage(img, x, y, width, height, 0, 0, width, height)
      resolve(c.toDataURL("image/jpeg", 0.8))
    }
    img.onerror = () => {
      const fallback = new Image()
      fallback.crossOrigin = "anonymous"
      fallback.onload = () => {
        const c = document.createElement("canvas")
        c.width = width
        c.height = height
        const ctx = c.getContext("2d")
        ctx.drawImage(fallback, x, y, width, height, 0, 0, width, height)
        resolve(c.toDataURL("image/jpeg", 0.8))
      }
      fallback.onerror = () => reject(new Error("Failed to load sprite sheet (proxy fallback)"))
      fallback.src = proxyUrl
    }
    img.src = url
  })
}

export async function extractFrameDataUrls(spec, timestamps) {
  const results = []
  for (const ts of timestamps) {
    try {
      const dataUrl = await extractFrame(spec, ts)
      results.push({ timestamp: ts, dataUrl })
    } catch {
      results.push({ timestamp: ts, dataUrl: null })
    }
  }
  return results
}
