import { pipeline } from '@huggingface/transformers'

const MODEL = 'Xenova/whisper-tiny'

async function extractAudioData(file) {
  const buffer = await file.arrayBuffer()
  const ctx = new AudioContext({ sampleRate: 16000 })
  const decoded = await ctx.decodeAudioData(buffer)
  const src = decoded.getChannelData(0)
  const offline = new OfflineAudioContext(1, Math.ceil(src.length * 16000 / decoded.sampleRate), 16000)
  const srcNode = offline.createBufferSource()
  const buf = offline.createBuffer(1, src.length, decoded.sampleRate)
  buf.getChannelData(0).set(src)
  srcNode.buffer = buf
  srcNode.connect(offline.destination)
  const rendered = await offline.startRendering()
  const float32 = rendered.getChannelData(0)
  ctx.close()
  return float32
}

export async function transcribeVideo(file, onProgress) {
  onProgress?.({ phase: 'extracting-audio', percent: 0 })
  const audioData = await extractAudioData(file)
  onProgress?.({ phase: 'extracting-audio', percent: 100 })

  onProgress?.({ phase: 'loading-model', percent: 0 })
  const pipe = await pipeline('automatic-speech-recognition', MODEL, {
    progress_callback: (p) => {
      if (p.status === 'progress') {
        onProgress?.({ phase: 'loading-model', percent: Math.round(p.progress * 100) })
      }
    },
  })
  onProgress?.({ phase: 'loading-model', percent: 100 })

  onProgress?.({ phase: 'transcribing', percent: 0 })
  const result = await pipe(audioData, {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
  })
  onProgress?.({ phase: 'transcribing', percent: 100 })

  const segments = (result.chunks || []).map((chunk) => ({
    text: chunk.text.trim(),
    start: chunk.timestamp[0],
    duration: chunk.timestamp[1] - chunk.timestamp[0],
  }))

  return {
    text: result.text,
    segments,
    duration: segments.length > 0 ? segments[segments.length - 1].start + segments[segments.length - 1].duration : 0,
  }
}
