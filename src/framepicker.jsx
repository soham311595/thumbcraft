import { useState, useRef, useEffect, useCallback } from "react"
import { Loader2 } from "lucide-react"

const FPS = 30
const FRAME = 1 / FPS

function fmt(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toFixed(3).padStart(7, "0")}`
}

export default function FramePicker({ videoFile, recommendedTimestamps, onSelectFrame }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [captured, setCaptured] = useState([])
  const [previewIdx, setPreviewIdx] = useState(null)
  const [speed, setSpeed] = useState(1)
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 })

  const frameNum = Math.floor(currentTime * FPS)

  const drawFrame = useCallback(() => {
    const v = videoRef.current
    const c = canvasRef.current
    if (!v || !c) return
    const ctx = c.getContext("2d")
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(v, 0, 0, c.width, c.height)
  }, [])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const src = URL.createObjectURL(videoFile)
    v.src = src
    v.addEventListener("loadedmetadata", () => {
      setDuration(v.duration)
      const w = v.videoWidth
      const h = v.videoHeight
      const aspect = w / h
      const cw = Math.min(640, 640 * aspect)
      const ch = cw / aspect
      setDimensions({ w: cw, h: ch })
      setLoaded(true)
      drawFrame()
    })
    v.addEventListener("seeked", drawFrame)
    v.addEventListener("timeupdate", () => {
      setCurrentTime(v.currentTime)
      if (!v.paused) drawFrame()
    })
    v.addEventListener("play", () => setPlaying(true))
    v.addEventListener("pause", () => setPlaying(false))
    v.addEventListener("ended", () => setPlaying(false))
    return () => {
      URL.revokeObjectURL(src)
      v.removeEventListener("loadedmetadata", () => {})
      v.removeEventListener("seeked", drawFrame)
      v.removeEventListener("timeupdate", () => {})
    }
  }, [videoFile, drawFrame])

  const seek = useCallback((t) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.max(0, Math.min(t, duration))
  }, [duration])

  const stepFrame = useCallback((n) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.max(0, Math.min(v.currentTime + n * FRAME, duration))
  }, [duration])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play(); setPlaying(true) }
    else { v.pause(); setPlaying(false) }
  }, [])

  const captureFrame = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    const dataUrl = c.toDataURL("image/png")
    setCaptured((prev) => [...prev, { dataUrl, timestamp: currentTime }])
  }, [currentTime])

  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT") return
      switch (e.code) {
        case "ArrowLeft": e.preventDefault(); stepFrame(e.shiftKey ? -10 : -1); break
        case "ArrowRight": e.preventDefault(); stepFrame(e.shiftKey ? 10 : 1); break
        case "ArrowUp": e.preventDefault(); stepFrame(-30); break
        case "ArrowDown": e.preventDefault(); stepFrame(30); break
        case "Space": e.preventDefault(); togglePlay(); break
        case "KeyC": e.preventDefault(); captureFrame(); break
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [stepFrame, togglePlay, captureFrame])

  const removeCapture = (idx) => {
    setCaptured((prev) => prev.filter((_, i) => i !== idx))
    if (previewIdx === idx) setPreviewIdx(null)
  }

  const downloadSingle = (frame) => {
    const a = document.createElement("a")
    a.download = `frame_${frame.timestamp.toFixed(3).replace(".", "-")}.png`
    a.href = frame.dataUrl
    a.click()
  }

  const downloadAll = () => {
    captured.forEach((f) => downloadSingle(f))
  }

  const selectFrame = (frame) => {
    onSelectFrame(frame.dataUrl, frame.timestamp)
  }

  const btnBase = {
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
    color: "rgba(255,255,255,0.7)", borderRadius: 8, padding: "6px 12px",
    fontSize: 12, fontWeight: 600, cursor: "pointer",
    fontFamily: "'Space Mono', monospace", transition: "all 0.2s",
  }

  return (
    <div>
      {/* Video display */}
      <div style={{
        position: "relative", borderRadius: 12, overflow: "hidden",
        background: "#000", marginBottom: 10, maxWidth: 640,
      }}>
        <canvas
          ref={canvasRef}
          width={dimensions.w || 640}
          height={dimensions.h || 360}
          style={{ display: "block", width: "100%" }}
        />
        <div style={{
          position: "absolute", top: 8, left: 8,
          background: "rgba(0,0,0,0.7)", borderRadius: 6,
          padding: "4px 10px", fontSize: 12,
          fontFamily: "'Space Mono', monospace", color: "#fff",
        }}>
          {fmt(currentTime)} · f{frameNum}
        </div>
        {!loaded && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.6)", gap: 10,
          }}>
            <Loader2 size={20} className="spinner" style={{ color: "rgba(255,255,255,0.5)" }} />
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Loading video...</span>
          </div>
        )}
        <video ref={videoRef} style={{ display: "none" }} playsInline />
      </div>

      {/* Timeline */}
      <div style={{ maxWidth: 640, marginBottom: 10 }}>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={FRAME}
          value={currentTime}
          onChange={(e) => seek(parseFloat(e.target.value))}
          style={{ width: "100%", margin: 0 }}
        />
        {/* Recommended markers */}
        {recommendedTimestamps && recommendedTimestamps.length > 0 && (
          <div style={{ position: "relative", height: 10, marginTop: 2 }}>
            {recommendedTimestamps.map((ts, i) => (
              <button
                key={i}
                title={`Jump to ${fmt(ts)}`}
                onClick={() => seek(ts)}
                style={{
                  position: "absolute", left: `${(ts / duration) * 100}%`,
                  top: 0, transform: "translateX(-50%)",
                  width: 10, height: 10, borderRadius: "50%",
                  background: "#f72585", border: "2px solid rgba(255,255,255,0.3)",
                  cursor: "pointer", padding: 0,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 16, maxWidth: 640 }}>
        <button onClick={togglePlay} style={btnBase} disabled={!loaded}>
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => stepFrame(-1)} style={btnBase} disabled={!loaded} title="Back 1 frame">←1</button>
          <button onClick={() => stepFrame(1)} style={btnBase} disabled={!loaded} title="Forward 1 frame">1→</button>
          <button onClick={() => stepFrame(-10)} style={btnBase} disabled={!loaded} title="Back 10 frames">←10</button>
          <button onClick={() => stepFrame(10)} style={btnBase} disabled={!loaded} title="Forward 10 frames">10→</button>
          <button onClick={() => stepFrame(-30)} style={btnBase} disabled={!loaded} title="Back 1 sec">←1s</button>
          <button onClick={() => stepFrame(30)} style={btnBase} disabled={!loaded} title="Forward 1 sec">1s→</button>
        </div>
        <select
          value={speed}
          onChange={(e) => {
            const s = parseFloat(e.target.value)
            setSpeed(s)
            if (videoRef.current) videoRef.current.playbackRate = s
          }}
          style={{
            ...btnBase, background: "rgba(255,255,255,0.04)",
            cursor: loaded ? "pointer" : "not-allowed",
          }}
          disabled={!loaded}
        >
          {[0.05, 0.1, 0.25, 0.5, 1, 1.5, 2].map((v) => (
            <option key={v} value={v}>{v}×</option>
          ))}
        </select>
        <button onClick={captureFrame} style={{
          ...btnBase, background: "linear-gradient(135deg, #f72585, #7209b7)",
          color: "#fff", border: "none",
        }} disabled={!loaded}>
          📷 Capture (C)
        </button>
      </div>

      {/* Captured frames strip */}
      {captured.length > 0 && (
        <div style={{ maxWidth: 640 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>
              Captured Frames ({captured.length})
            </span>
            <button onClick={downloadAll} style={btnBase}>
              ⬇ All ({captured.length})
            </button>
          </div>
          <div style={{
            display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8,
          }}>
            {captured.map((frame, i) => (
              <div
                key={i}
                style={{
                  flexShrink: 0, width: 120, borderRadius: 8, overflow: "hidden",
                  border: previewIdx === i ? "2px solid #f72585" : "2px solid rgba(255,255,255,0.08)",
                  background: "#0a0a14", cursor: "pointer", position: "relative",
                }}
                onClick={() => setPreviewIdx(previewIdx === i ? null : i)}
              >
                <img src={frame.dataUrl} alt="" style={{ width: "100%", display: "block" }} />
                <div style={{
                  fontSize: 9, color: "rgba(255,255,255,0.5)", textAlign: "center",
                  padding: "2px 0", fontFamily: "'Space Mono', monospace",
                }}>
                  {fmt(frame.timestamp)}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeCapture(i) }}
                  style={{
                    position: "absolute", top: 2, right: 2,
                    background: "rgba(0,0,0,0.6)", border: "none",
                    color: "#fff", borderRadius: 4, width: 18, height: 18,
                    fontSize: 12, cursor: "pointer", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    lineHeight: 1,
                  }}
                >×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview + select */}
      {captured.length > 0 && (
        <div style={{ maxWidth: 640, marginTop: 16 }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>
            Click a frame above to preview, then select it below:
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {captured.map((frame, i) => (
              <button
                key={i}
                onClick={() => selectFrame(frame)}
                style={{
                  ...btnBase,
                  background: previewIdx === i
                    ? "linear-gradient(135deg, #f72585, #7209b7)"
                    : "rgba(255,255,255,0.05)",
                  color: previewIdx === i ? "#fff" : "rgba(255,255,255,0.6)",
                  border: previewIdx === i ? "none" : "1px solid rgba(255,255,255,0.1)",
                  display: "flex", alignItems: "center", gap: 4,
                }}
              >
                📷 {fmt(frame.timestamp)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
