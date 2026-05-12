import { useState, useRef } from "react"
import { analyzeText, generateThumbnail } from "./ai"
import { fetchTranscript, formatTranscript, fetchVideoTitle } from "./transcript"
import FrameGuide from "./frameGuide"
import Inspiration from "./inspiration"

import {
  NICHE_ANALYSIS_PROMPT,
  IMAGE_PROMPT_GENERATOR,
} from "./prompts"
import {
  ArrowLeft,
  AlertCircle,
  Loader2,
  RefreshCw,
  Sparkles,
  Upload,
} from "lucide-react"
import Canvas from "./components/Editor/Canvas"
import { Toolbar } from "./components/Editor/Toolbar"
import { LayersPanel } from "./components/Editor/LayersPanel"
import { PropertiesPanel } from "./components/Editor/PropertiesPanel"

const STEPS = ["input", "niche", "inspiration", "frame", "generate"]
const STEP_LABELS = ["Video", "Niche", "Inspire", "Frame", "Generate"]

function extractVideoId(input) {
  const trimmed = input.trim()
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed
  try {
    const url = new URL(trimmed)
    if (url.hostname === "youtu.be") return url.pathname.slice(1).split("/")[0].slice(0, 11)
    if (url.searchParams.has("v")) return url.searchParams.get("v")
    const match = url.pathname.match(/\/(embed|v|shorts|live)\/([a-zA-Z0-9_-]{11})/)
    if (match) return match[2]
  } catch {}
  const m = trimmed.match(/[a-zA-Z0-9_-]{11}/)
  return m ? m[0] : null
}

function fetchYtThumbnail(videoId) {
  return new Promise((resolve, reject) => {
    const tryLoad = (quality, fallback) => {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        if (img.naturalWidth <= 120 && fallback) {
          tryLoad(fallback, null)
          return
        }
        const c = document.createElement("canvas")
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        c.getContext("2d").drawImage(img, 0, 0)
        try {
          const b64 = c.toDataURL("image/jpeg", 0.85).split(",")[1]
          resolve({ base64: b64, preview: c.toDataURL("image/jpeg", 0.85), videoId })
        } catch {
          reject(new Error("CORS blocked"))
        }
      }
      img.onerror = () => {
        if (fallback) tryLoad(fallback, null)
        else reject(new Error(`Not found: ${videoId}`))
      }
      img.src = `https://img.youtube.com/vi/${videoId}/${quality}.jpg`
    }
    tryLoad("maxresdefault", "hqdefault")
  })
}

function formatTimestamp(sec) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

function formatSize(bytes) {
  if (bytes < 1e6) return (bytes / 1024).toFixed(1) + " KB"
  return (bytes / 1e6).toFixed(1) + " MB"
}

function Stepper({ step, onStep, steps, labels }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 28, flexWrap: "wrap" }}>
      {steps.map((s, i) => (
        <div key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button onClick={() => onStep(i)} style={{
            background: i === step
              ? "linear-gradient(135deg, #f72585, #7209b7)"
              : i < step
                ? "rgba(114,9,183,0.3)"
                : "rgba(255,255,255,0.05)",
            border: "none",
            color: i <= step ? "#fff" : "rgba(255,255,255,0.3)",
            borderRadius: 20,
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: i === step ? 700 : 500,
            cursor: i <= step ? "pointer" : "default",
            transition: "all 0.3s",
            fontFamily: "'Space Mono', monospace",
          }}>
            {i + 1}. {labels[i]}
          </button>
          {i < steps.length - 1 && (
            <div style={{ width: 16, height: 1, background: "rgba(255,255,255,0.08)" }} />
          )}
        </div>
      ))}
    </div>
  )
}

export default function ThumbCraft() {
  const [step, setStep] = useState(0)
  const [view, setView] = useState("wizard")

  // YouTube URL
  const [videoUrl, setVideoUrl] = useState("")
  const videoId = videoUrl ? extractVideoId(videoUrl) : null

  // Video file for frame selection
  const [videoFile, setVideoFile] = useState(null)

  // Loading / status
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")

  // Step 1 — Niche
  const [transcript, setTranscript] = useState(null)
  const [videoTitle, setVideoTitle] = useState(null)
  const [videoThumbnail, setVideoThumbnail] = useState(null)
  const [nicheAnalysis, setNicheAnalysis] = useState(null)

  // Step 2 — Inspiration
  const [selectedInspiration, setSelectedInspiration] = useState(null)

  // Step 3 — Frame Selection
  const [selectedFrameTimestamp, setSelectedFrameTimestamp] = useState(null)
  const [selectedFrameDataUrl, setSelectedFrameDataUrl] = useState(null)

  // Step 4 — Generate
  const [generatedThumb, setGeneratedThumb] = useState(null)
  const [generating, setGenerating] = useState(false)

  // Editor
  const [editingThumbnail, setEditingThumbnail] = useState(null)
  const canvasRef = useRef(null)
  const [selectedObject, setSelectedObject] = useState(null)
  const [canvasObjects, setCanvasObjects] = useState([])

  // ─── File handlers ──────────────────────────────────────
  const handleFileDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && /video\//.test(file.type)) setVideoFile(file)
    else setError("Please upload a video file (MP4, MOV, MKV, WebM)")
  }

  const handleFileInput = (e) => {
    const file = e.target.files[0]
    if (file) setVideoFile(file)
  }

  // ─── Step 1: Niche Analysis ──────────────────────────────
  const analyzeVideo = async () => {
    if (!videoId) {
      setError("Enter a valid YouTube URL")
      return
    }
    if (!videoFile) {
      setError("Upload a video file for frame selection")
      return
    }
    setLoading(true)
    setError("")
    setStatus("Fetching video info...")
    try {
      const thumb = await fetchYtThumbnail(videoId)
      setVideoThumbnail(thumb)

      setStatus("Fetching title and transcript...")
      const abort = new AbortController()
      const timeout = setTimeout(() => abort.abort(), 15000)
      const [title, segments] = await Promise.all([
        fetchVideoTitle(videoId, abort.signal),
        fetchTranscript(videoId, abort.signal),
      ]).finally(() => clearTimeout(timeout))
      setVideoTitle(title)
      setTranscript(segments)

      const formatted = formatTranscript(segments, 6000)
      setStatus("Analyzing niche...")
      const result = await analyzeText(
        NICHE_ANALYSIS_PROMPT(formatted, title || "Unknown"),
        null,
        { reasoning: false },
      )
      setNicheAnalysis(result)
      setStep(1)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      setStatus("")
    }
  }

  // ─── Step 2: Inspiration ─────────────────────────────────
  const handleInspirationSelect = (inspiration) => {
    setSelectedInspiration(inspiration)
    setStep(2)
  }

  // ─── Step 3: Frame Guide → Capture ──────────────────────
  const handleFrameCaptured = (dataUrl, timestamp) => {
    setSelectedFrameDataUrl(dataUrl)
    setSelectedFrameTimestamp(timestamp)
  }

  // ─── Step 4: Generate ───────────────────────────────────
  const generateWithSelection = async () => {
    if (!nicheAnalysis) return
    setGenerating(true)
    setError("")
    setStatus("Generating thumbnail...")

    try {
      const refImages = []
      if (selectedFrameDataUrl) refImages.push(selectedFrameDataUrl)
      if (selectedInspiration?.thumbnailUrl) refImages.push(selectedInspiration.thumbnailUrl)

      const promptText = selectedFrameTimestamp != null
        ? `Use this video frame as the visual starting point for a YouTube thumbnail. Keep the subject and composition of the frame but enhance it with bold colors, dramatic lighting, and text overlay. This MUST be a HIGH-CTR thumbnail that creates a curiosity gap — make viewers feel they NEED to click to find out what's inside.\n\n${IMAGE_PROMPT_GENERATOR(nicheAnalysis, null, 0)}`
        : `Create a YouTube thumbnail based on this concept (no video frame reference needed). This MUST be a HIGH-CTR thumbnail that creates a curiosity gap — make viewers feel they NEED to click to find out what's inside.\n\n${IMAGE_PROMPT_GENERATOR(nicheAnalysis, null, 0)}`

      const result = await generateThumbnail(promptText, null, refImages)
      setGeneratedThumb(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setGenerating(false)
      setStatus("")
    }
  }

  // ─── Editor ──────────────────────────────────────────────
  const openEditor = (thumb) => {
    setEditingThumbnail(thumb)
    setView("editor")
  }

  const closeEditor = () => {
    setView("wizard")
    setEditingThumbnail(null)
  }

  const handleExport = () => {
    const dataUrl = canvasRef.current?.exportPNG()
    if (!dataUrl) return
    const link = document.createElement("a")
    link.download = "thumbnail-1280x720.png"
    link.href = dataUrl
    link.click()
  }

  const goToStep = (s) => {
    const canGo = {
      0: true,
      1: !!nicheAnalysis,
      2: !!nicheAnalysis,
      3: !!selectedInspiration,
      4: generatedThumb != null,
    }
    if (canGo[s]) setStep(s)
  }

  // ─── Render helpers ──────────────────────────────────────
  const appBg = { minHeight: "100vh", background: "#08080f", color: "#e0e0ec", fontFamily: "'DM Sans', -apple-system, sans-serif", padding: "20px 24px" }
  const cardStyle = { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 20 }
  const inputStyle = { width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 14, fontFamily: "'Space Mono', monospace", outline: "none" }
  const btn = (active) => ({
    background: active ? "linear-gradient(135deg, #f72585, #7209b7)" : "rgba(255,255,255,0.05)",
    border: "none",
    color: active ? "#fff" : "rgba(255,255,255,0.3)",
    borderRadius: 12,
    padding: "13px 28px",
    fontSize: 14,
    fontWeight: 700,
    cursor: active ? "pointer" : "not-allowed",
    fontFamily: "'Space Mono', monospace",
    transition: "all 0.3s",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  })

  // ─── EDITOR VIEW ─────────────────────────────────────────
  if (view === "editor" && editingThumbnail) {
    const selectedIndex = canvasObjects.findIndex((o) => o.selected)

    return (
      <div style={appBg}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: "linear-gradient(135deg, #f72585, #7209b7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 17, boxShadow: "0 4px 20px rgba(247,37,133,0.3)",
          }}>▶</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, fontFamily: "'Space Mono', monospace", background: "linear-gradient(135deg, #f72585, #b5179e, #7209b7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              ThumbCraft
            </h1>
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={closeEditor} style={{
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.6)", borderRadius: 8, padding: "6px 14px",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            fontFamily: "'Space Mono', monospace", display: "flex", alignItems: "center", gap: 6,
          }}>
            <ArrowLeft size={14} /> Back
          </button>
        </div>

        <Toolbar
          canvasRef={canvasRef}
          selectedObject={selectedObject}
          onExport={handleExport}
        />

        <div style={{ display: "flex", height: "calc(100vh - 160px)", gap: 0 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, overflow: "auto" }}>
            <div style={{ maxWidth: 820, width: "100%" }}>
              <div style={{ borderRadius: 14, overflow: "hidden", border: "2px solid rgba(255,255,255,0.08)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
                <Canvas
                  ref={canvasRef}
                  initialImageUrl={editingThumbnail.dataUrl || editingThumbnail.url}
                  onSelectionChange={(obj) => setSelectedObject(obj)}
                  onObjectsChange={(objs) => setCanvasObjects(objs)}
                />
              </div>
            </div>
          </div>

          <div style={{
            width: 300, flexShrink: 0,
            borderLeft: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(15,15,25,0.95)",
            display: "flex", flexDirection: "column", overflow: "auto",
          }}>
            <div style={{ padding: 16, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <LayersPanel
                objects={canvasObjects}
                selectedIndex={selectedIndex ?? -1}
                onSelect={(idx) => canvasRef.current?.selectObject(idx)}
                onToggleVisibility={(idx) => canvasRef.current?.toggleVisibility(idx)}
                onDelete={(idx) => {
                  canvasRef.current?.selectObject(idx)
                  canvasRef.current?.removeSelected()
                }}
              />
            </div>
            <div style={{ padding: 16, borderBottom: "1px solid rgba(255,255,255,0.06)", flex: 1 }}>
              <PropertiesPanel
                canvasRef={canvasRef}
                selectedObject={selectedObject}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── WIZARD VIEW ─────────────────────────────────────────
  return (
    <div style={appBg}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: "linear-gradient(135deg, #f72585, #7209b7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 17, boxShadow: "0 4px 20px rgba(247,37,133,0.3)",
        }}>▶</div>
        <div>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, fontFamily: "'Space Mono', monospace", background: "linear-gradient(135deg, #f72585, #b5179e, #7209b7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            ThumbCraft
          </h1>
          <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "'Space Mono', monospace" }}>
            AI thumbnail generator — YouTube transcript + local frame capture
          </p>
        </div>
      </div>

      <Stepper step={step} onStep={goToStep} steps={STEPS} labels={STEP_LABELS} />

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(247,37,133,0.08)", border: "1px solid rgba(247,37,133,0.25)", borderRadius: 10, padding: "10px 16px", marginBottom: 18, fontSize: 13, color: "#f72585" }}>
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {status && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(114,9,183,0.08)", border: "1px solid rgba(114,9,183,0.2)", borderRadius: 10, padding: "10px 16px", marginBottom: 18, fontSize: 13, color: "#b5179e" }}>
          <Loader2 size={14} className="spinner" />
          {status}
        </div>
      )}

      {/* ════ STEP 0: INPUT ════ */}
      {step === 0 && (
        <div style={{ maxWidth: 680 }}>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 20, lineHeight: 1.6 }}>
            Provide a <strong style={{ color: "#fff" }}>YouTube URL</strong> for transcript analysis and a <strong style={{ color: "#fff" }}>video file</strong> for frame selection.
            Both are required.
          </p>

          {/* YouTube URL */}
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 18 }}>🎬</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>YouTube URL</span>
            </div>
            <input
              type="text"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              style={inputStyle}
            />
            <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.2)", lineHeight: 1.5 }}>
              Supports: youtube.com/watch, youtu.be, /shorts/, /embed/, /live/ links or raw video ID
            </div>
          </div>

          {/* Video file */}
          {!videoFile ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              style={{
                ...cardStyle,
                border: "2px dashed rgba(255,255,255,0.12)",
                textAlign: "center", padding: "40px 20px", cursor: "pointer",
                transition: "all 0.2s",
              }}
              onClick={() => document.getElementById("video-input").click()}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = "rgba(247,37,133,0.4)"}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"}
            >
              <Upload size={28} style={{ color: "rgba(255,255,255,0.2)", marginBottom: 10 }} />
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "0 0 4px" }}>
                Drop a video file here or <strong style={{ color: "#f72585" }}>browse</strong>
              </p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", margin: 0 }}>
                MP4, MOV, MKV, WebM — used for frame-by-frame selection
              </p>
              <input
                id="video-input"
                type="file"
                accept="video/mp4,video/quicktime,video/x-matroska,video/webm"
                onChange={handleFileInput}
                style={{ display: "none" }}
              />
            </div>
          ) : (
            <div style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: "rgba(114,9,183,0.2)", display: "flex",
                  alignItems: "center", justifyContent: "center", fontSize: 16,
                }}>🎞️</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
                    {videoFile.name}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "'Space Mono', monospace" }}>
                    {formatSize(videoFile.size)}
                  </div>
                </div>
                <button
                  onClick={() => setVideoFile(null)}
                  style={{
                    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.5)", borderRadius: 8, padding: "6px 12px",
                    fontSize: 11, cursor: "pointer", fontFamily: "'Space Mono', monospace",
                  }}
                >Change</button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <button
              onClick={analyzeVideo}
              disabled={loading || !videoId || !videoFile}
              style={btn(!!videoId && !!videoFile && !loading)}
            >
              {loading ? <><Loader2 size={14} className="spinner" /> Analyzing...</> : "Analyze Video →"}
            </button>
          </div>
        </div>
      )}

      {/* ════ STEP 1: NICHE ════ */}
      {step === 1 && nicheAnalysis && (
        <div>
          <div style={{ display: "flex", gap: 20, marginBottom: 24, flexWrap: "wrap" }}>
            {videoThumbnail && (
              <div style={{ width: 240, flexShrink: 0 }}>
                <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <img src={videoThumbnail.preview} alt="Video thumbnail" style={{ width: "100%", display: "block" }} />
                </div>
                {videoTitle && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.4 }}>
                    {videoTitle}
                  </div>
                )}
              </div>
            )}

            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={cardStyle}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#b5179e", marginBottom: 8, fontFamily: "'Space Mono', monospace", letterSpacing: "0.1em" }}>
                  NICHE ANALYSIS
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                  <Tag>{nicheAnalysis.niche?.primary_category}</Tag>
                  <Tag>{nicheAnalysis.niche?.subcategory}</Tag>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 12, lineHeight: 1.6 }}>
                  <strong style={{ color: "rgba(255,255,255,0.7)" }}>Audience:</strong> {nicheAnalysis.niche?.audience}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 12, lineHeight: 1.6 }}>
                  <strong style={{ color: "rgba(255,255,255,0.7)" }}>Hook:</strong>{" "}
                  <span style={{ color: "#f72585", fontWeight: 600 }}>{nicheAnalysis.emotional_hook?.type}</span>{" "}
                  — {nicheAnalysis.emotional_hook?.description}
                </div>
              </div>

              <div style={{ ...cardStyle, marginTop: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#7209b7", marginBottom: 8, fontFamily: "'Space Mono', monospace", letterSpacing: "0.1em" }}>
                  THUMBNAIL STRATEGY
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, marginBottom: 8 }}>
                  {nicheAnalysis.thumbnail_strategy?.concept}
                </div>
                {nicheAnalysis.thumbnail_strategy?.text_overlay && (
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", fontFamily: "'Impact', sans-serif", letterSpacing: "0.02em", marginTop: 4 }}>
                    "{nicheAnalysis.thumbnail_strategy.text_overlay}"
                  </div>
                )}
              </div>
            </div>
          </div>

          <button onClick={() => setStep(2)} disabled={loading}
            style={btn(!loading)}>
            Find Inspiration →
          </button>
        </div>
      )}

      {/* ════ STEP 2: INSPIRATION ════ */}
      {step === 2 && nicheAnalysis && (
        <div>
          <Inspiration
            niche={nicheAnalysis}
            onSelect={handleInspirationSelect}
          />

          {selectedInspiration && (
            <div style={{ marginTop: 24 }}>
              <button onClick={() => setStep(3)} style={btn(true)}>
                Continue with Selected Inspiration →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ════ STEP 3: FRAME GUIDE ════ */}
      {step === 3 && (
        <div>
          <FrameGuide
            videoFile={videoFile}
            transcript={transcript}
            niche={nicheAnalysis}
            selectedInspiration={selectedInspiration}
            onSelectFrame={handleFrameCaptured}
          />

          {selectedFrameDataUrl && (
            <div style={{ marginTop: 24 }}>
              <button onClick={() => setStep(4)} style={btn(true)}>
                Generate with Selected Frame →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ════ STEP 4: GENERATE ════ */}
      {step === 4 && (
        <div>
          {!generatedThumb ? (
            <div>
              <div style={{ marginBottom: 22 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: "0 0 4px" }}>
                  Generate Thumbnail
                </h2>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: 0 }}>
                  {selectedFrameTimestamp != null
                    ? `Using frame at ${formatTimestamp(selectedFrameTimestamp)} + inspiration thumbnail`
                    : `Using inspiration thumbnail only`
                  }
                </p>
              </div>

              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24, alignItems: "flex-start" }}>
                {selectedFrameDataUrl && (
                  <div style={{ width: 240, flexShrink: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", marginBottom: 4, fontFamily: "'Space Mono', monospace" }}>
                      CAPTURED FRAME
                    </div>
                    <div style={{ borderRadius: 10, overflow: "hidden", border: "2px solid #f72585" }}>
                      <img src={selectedFrameDataUrl} alt="Selected frame" style={{ width: "100%", display: "block" }} />
                    </div>
                    <div style={{ marginTop: 4, textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'Space Mono', monospace" }}>
                      {formatTimestamp(selectedFrameTimestamp)}
                    </div>
                  </div>
                )}

                {selectedInspiration && (
                  <div style={{ width: 240, flexShrink: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", marginBottom: 4, fontFamily: "'Space Mono', monospace" }}>
                      INSPIRATION
                    </div>
                    <div style={{ borderRadius: 10, overflow: "hidden", border: "2px solid #7209b7" }}>
                      <img src={selectedInspiration.thumbnailUrl} alt="" style={{ width: "100%", display: "block" }} />
                    </div>
                    <div style={{ marginTop: 4, textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'Space Mono', monospace" }}>
                      {selectedInspiration.viralRatio}x viral
                    </div>
                  </div>
                )}

                <div style={{ flex: 1, minWidth: 280 }}>
                  <div style={cardStyle}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#f72585", marginBottom: 8, fontFamily: "'Space Mono', monospace", letterSpacing: "0.1em" }}>
                      THUMBNAIL STRATEGY
                    </div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.7, marginBottom: 8 }}>
                      {nicheAnalysis?.thumbnail_strategy?.concept}
                    </div>
                    {nicheAnalysis?.thumbnail_strategy?.text_overlay && (
                      <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", fontFamily: "'Impact', sans-serif", letterSpacing: "0.02em" }}>
                        "{nicheAnalysis.thumbnail_strategy.text_overlay}"
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button onClick={generateWithSelection} disabled={generating}
                  style={btn(!generating)}>
                  {generating ? <><Loader2 size={14} className="spinner" /> Generating...</> : <><Sparkles size={14} /> Generate Thumbnail →</>}
                </button>
                <button onClick={() => setStep(3)}
                  style={{
                    background: "transparent", border: "1px solid rgba(255,255,255,0.12)",
                    color: "rgba(255,255,255,0.5)", borderRadius: 12,
                    padding: "13px 22px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                    fontFamily: "'Space Mono', monospace",
                  }}>
                  ← Capture Different Frame
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 22 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: "0 0 4px" }}>
                  Your Thumbnail
                </h2>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: 0 }}>
                  {selectedFrameTimestamp != null
                    ? `Generated using frame at ${formatTimestamp(selectedFrameTimestamp)} + inspiration`
                    : `Generated with inspiration reference`
                  }
                </p>
              </div>

              <div style={{ maxWidth: 600, marginBottom: 24 }}>
                <div
                  onClick={() => openEditor(generatedThumb)}
                  style={{
                    cursor: "pointer", borderRadius: 14, overflow: "hidden",
                    border: "2px solid rgba(255,255,255,0.08)",
                    transition: "all 0.2s", position: "relative",
                    background: "#1a1a2e",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#f72585"; e.currentTarget.style.transform = "translateY(-2px)" }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.transform = "none" }}>
                  <img src={generatedThumb.dataUrl || generatedThumb.url} alt="Generated thumbnail"
                    style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block" }} />
                  <div style={{
                    position: "absolute", bottom: 0, left: 0, right: 0,
                    background: "linear-gradient(transparent, rgba(0,0,0,0.85))",
                    padding: "30px 14px 10px", display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.6)", fontFamily: "'Space Mono', monospace" }}>
                      GENERATED
                    </span>
                    <span style={{ fontSize: 11, color: "#f72585", fontWeight: 600, fontFamily: "'Space Mono', monospace" }}>
                      Edit in Fabric.js →
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button onClick={() => openEditor(generatedThumb)}
                  style={btn(true)}>
                  <Sparkles size={14} /> Open in Editor
                </button>
                <button onClick={generateWithSelection} disabled={generating}
                  style={{ ...btn(!generating), background: "rgba(255,255,255,0.05)", color: generating ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.7)" }}>
                  {generating ? <><Loader2 size={14} className="spinner" /> Regenerating...</> : <><RefreshCw size={14} /> Regenerate</>}
                </button>
                <button onClick={() => setStep(3)}
                  style={{
                    background: "transparent", border: "1px solid rgba(255,255,255,0.12)",
                    color: "rgba(255,255,255,0.5)", borderRadius: 12,
                    padding: "13px 22px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                    fontFamily: "'Space Mono', monospace",
                  }}>
                  ← Different Frame
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 48, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.04)", fontSize: 10, color: "rgba(255,255,255,0.15)", fontFamily: "'Space Mono', monospace" }}>
        Powered by YouTube Transcript API · OpenRouter · Fabric.js · 100% in-browser frame capture
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner { animation: spin 0.8s linear infinite; }
        input[type=range] { -webkit-appearance: none; appearance: none; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; outline: none; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 16px; height: 16px; border-radius: 50%; background: linear-gradient(135deg, #f72585, #7209b7); cursor: pointer; border: 2px solid rgba(255,255,255,0.15); }
      `}</style>
    </div>
  )
}

function Tag({ children }) {
  return (
    <span style={{
      background: "rgba(247,37,133,0.08)", color: "#f72585",
      padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
    }}>
      {children}
    </span>
  )
}
