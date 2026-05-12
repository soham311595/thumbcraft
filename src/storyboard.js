export function parseSpec(spec, videoDurationSec) {
  if (!spec) return null
  const parts = spec.split('|')
  const baseUrl = parts[0]

  const levels = []
  for (let i = 1; i < parts.length; i++) {
    let p = parts[i]
    if (p.startsWith('#')) p = p.slice(1)
    const f = p.split('#')

    const w = parseInt(f[0])
    const h = parseInt(f[1])
    const totalFrames = parseInt(f[2])
    const gridCols = parseInt(f[3])
    const gridRows = parseInt(f[4])
    const frameOffset = parseInt(f[5]) || 0
    const spriteNameTemplate = f[6] || 'default'
    const sigh = f[7] || null

    const framesPerSprite = gridCols * gridRows
    const spriteCount = Math.ceil(totalFrames / framesPerSprite)
    const interval = videoDurationSec > 0 ? videoDurationSec / totalFrames : 0

    levels.push({
      thumbnailWidth: w,
      thumbnailHeight: h,
      totalFrames,
      gridCols,
      gridRows,
      frameOffset,
      spriteNameTemplate,
      sigh,
      framesPerSprite,
      spriteCount,
      interval,
      index: i - 1,
    })
  }

  return { baseUrl, levels }
}

export function getFrameInfo(parsed, levelIndex, frameIndex, videoId) {
  const { baseUrl, levels } = parsed
  const level = levels[levelIndex]

  const spriteIndex = Math.floor(frameIndex / level.framesPerSprite)
  const withinSprite = frameIndex % level.framesPerSprite
  const col = withinSprite % level.gridCols
  const row = Math.floor(withinSprite / level.gridCols)

  const x = col * level.thumbnailWidth
  const y = row * level.thumbnailHeight
  const w = level.thumbnailWidth
  const h = level.thumbnailHeight

  let url = baseUrl
    .replace(/\$L/g, `L${levelIndex}`)
  const spriteName = level.spriteNameTemplate.replace(/\$M/g, String(spriteIndex))
  url = url.replace(/\$N/g, spriteName)
  url = url.replace(/\{id\}/g, videoId)

  if (level.sigh) {
    const encoded = level.sigh.replace(/\$/g, '%24')
    url += (url.includes('?') ? '&' : '?') + `sigh=${encoded}`
  }

  return { url, x, y, w, h, spriteIndex }
}

export function findFrame(levels, timestampSec) {
  if (!levels || !levels.length) return null
  const level = levels[levels.length - 1]
  if (!level.interval) return { levelIndex: level.index, frameIndex: 0, level }
  const fi = Math.min(
    Math.max(0, Math.floor(timestampSec / level.interval)),
    level.totalFrames - 1,
  )
  return { levelIndex: level.index, frameIndex: fi, level }
}

async function loadImage(url) {
  const resp = await fetch(`/api/sprite?url=${encodeURIComponent(url)}`)
  if (!resp.ok) throw new Error(`Sprite fetch failed: ${resp.status}`)
  const blob = await resp.blob()
  const blobUrl = URL.createObjectURL(blob)

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(blobUrl)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl)
      reject(new Error('Failed to decode sprite'))
    }
    img.src = blobUrl
  })
}

export async function extractFrame(videoId, spec, timestampSec, videoDurationSec) {
  const parsed = parseSpec(spec, videoDurationSec)
  if (!parsed || !parsed.levels.length) throw new Error('Invalid storyboard spec')

  const result = findFrame(parsed.levels, timestampSec)
  if (!result) throw new Error('Timestamp out of storyboard range')

  const { levelIndex, frameIndex } = result
  const { url, x, y, w, h } = getFrameInfo(parsed, levelIndex, frameIndex, videoId)

  let img
  try {
    img = await loadImage(url)
  } catch (e) {
    console.error('Sprite load failed for URL:', url.slice(0, 120))
    throw e
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h)

  return canvas.toDataURL('image/jpeg', 0.85)
}

export async function extractFrameByIndex(videoId, spec, timestampSec, videoDurationSec) {
  try {
    return await extractFrame(videoId, spec, timestampSec, videoDurationSec)
  } catch (e) {
    console.warn('Storyboard extraction failed:', e.message)
    return null
  }
}
