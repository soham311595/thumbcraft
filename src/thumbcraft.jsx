import { useState, useRef, useCallback } from "react"
import { analyzeText, analyzeVision, generateThumbnail } from "./ai"
import { fetchTranscript, formatTranscript, fetchVideoTitle } from "./transcript"
import {
  NICHE_ANALYSIS_PROMPT,
  STYLE_ANALYSIS_PROMPT,
  IMAGE_PROMPT_GENERATOR,
} from "./prompts"
import {
  ArrowLeft,
  AlertCircle,
  Loader2,
  RefreshCw,
  Sparkles,
  Search,
} from "lucide-react"
import Canvas from "./components/Editor/Canvas"
import { Toolbar } from "./components/Editor/Toolbar"
import { LayersPanel } from "./components/Editor/LayersPanel"
import { PropertiesPanel } from "./components/Editor/PropertiesPanel"
import { AIEditPanel } from "./components/Editor/AIEditPanel"

const STEPS = ["input", "niche", "style", "generate"]
const STEP_LABELS = ["Video", "Niche", "Style Research", "Generate"]

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
  const [videoUrl, setVideoUrl] = useState("")
  const videoId = videoUrl ? extractVideoId(videoUrl) : null

  // Loading / status
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")

  // Step 1 — Niche
  const [transcript, setTranscript] = useState(null)
  const [transcriptText, setTranscriptText] = useState("")
  const [videoTitle, setVideoTitle] = useState(null)
  const [videoThumbnail, setVideoThumbnail] = useState(null)
  const [nicheAnalysis, setNicheAnalysis] = useState(null)

  // Step 2 — Style
  const [competitorVideos, setCompetitorVideos] = useState([])
  const [competitorUrls, setCompetitorUrls] = useState([])
  const [styleAnalysis, setStyleAnalysis] = useState(null)

  // Step 3 — Generate
  const [thumbnails, setThumbnails] = useState([])

  // Editor
  const [editingThumbnail, setEditingThumbnail] = useState(null)
  const [showAIEdit, setShowAIEdit] = useState(false)
  const canvasRef = useRef(null)
  const [selectedObject, setSelectedObject] = useState(null)
  const [canvasObjects, setCanvasObjects] = useState([])

  // ─── Step 1: Niche Analysis ──────────────────────────────
  const analyzeVideo = async () => {
    if (!videoId) {
      setError("Enter a valid YouTube URL")
      return
    }
    setLoading(true)
    setError("")
    setStatus("Fetching video info...")
    try {
      const thumb = await fetchYtThumbnail(videoId)
      setVideoThumbnail(thumb)

      setStatus("Fetching title...")
      const title = await fetchVideoTitle(videoId)
      setVideoTitle(title)

      setStatus("Fetching transcript...")
      const segments = await fetchTranscript(videoId)
      const formatted = formatTranscript(segments, 12000)
      setTranscript(segments)
      setTranscriptText(formatted)

      setStatus("Analyzing niche...")
      const result = await analyzeText(
        NICHE_ANALYSIS_PROMPT(formatted, title || "Unknown"),
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

  // ─── Step 2: Style Research ──────────────────────────────
  const researchCompetition = async () => {
    if (!nicheAnalysis?.scraping_queries?.length) {
      setError("No search queries available")
      return
    }
    setLoading(true)
    setError("")
    setStatus("Searching YouTube...")

    try {
      const query = nicheAnalysis.scraping_queries.slice(0, 3).join(" ")
      const res = await fetch(`/api/youtube-search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Search failed")

      const urls = data.videos.map((v) => v.thumbnail).filter(Boolean).slice(0, 8)
      setCompetitorVideos(data.videos)
      setCompetitorUrls(urls)

      setStatus("Analyzing competitor styles...")
      const styleResult = await analyzeVision(
        urls,
        STYLE_ANALYSIS_PROMPT(urls.length),
      )
      setStyleAnalysis(styleResult)
      setStep(2)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      setStatus("")
    }
  }

  // ─── Step 3: Generate Thumbnails ─────────────────────────
  const generateThumbnails = async () => {
    if (!nicheAnalysis || !styleAnalysis) return
    setLoading(true)
    setError("")
    setStatus("Generating thumbnails...")

    try {
      const prompts = [0, 1, 2].map((i) =>
        IMAGE_PROMPT_GENERATOR(nicheAnalysis, styleAnalysis, i),
      )
      const results = await Promise.allSettled(prompts.map((p) => generateThumbnail(p)))
      const generated = results
        .filter((r) => r.status === "fulfilled")
        .map((r) => r.value)

      if (!generated.length) throw new Error("All thumbnail generations failed")
      setThumbnails(generated)
      setStep(3)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      setStatus("")
    }
  }

  // ─── Editor ──────────────────────────────────────────────
  const openEditor = (thumb) => {
    setEditingThumbnail(thumb)
    setView("editor")
    setShowAIEdit(false)
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
      2: !!styleAnalysis,
      3: thumbnails.length > 0,
    }
    if (canGo[s]) setStep(s)
  }

  // ─── Render ──────────────────────────────────────────────
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
          onAIEditToggle={() => setShowAIEdit((p) => !p)}
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
            {showAIEdit && (
              <div style={{ padding: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <AIEditPanel
                  originalPrompt={editingThumbnail.prompt || editingThumbnail.dataUrl}
                  canvasRef={canvasRef}
                />
              </div>
            )}
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
            AI thumbnail generator with competitor research
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
            Paste a <strong style={{ color: "#fff" }}>YouTube video link</strong> to analyze its niche and generate a custom thumbnail.
          </p>

          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 18 }}>🎬</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>YouTube Video</span>
            </div>
            <input type="text" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              style={inputStyle} />
            <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.2)", lineHeight: 1.5 }}>
              Supports: youtube.com/watch, youtu.be, /shorts/, /embed/, /live/ links or raw video ID
            </div>
          </div>

          <button onClick={analyzeVideo} disabled={loading || !videoId} style={btn(!!videoId && !loading)}>
            {loading ? <><Loader2 size={14} className="spinner" /> Analyzing...</> : "Analyze Video →"}
          </button>
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
                  <Tag>{(nicheAnalysis.niche?.subcategory)}</Tag>
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

          <button onClick={researchCompetition} disabled={loading}
            style={btn(!loading)}>
            {loading ? <><Loader2 size={14} className="spinner" /> Researching...</> : <><Search size={14} /> Research Competition →</>}
          </button>
        </div>
      )}

      {/* ════ STEP 2: STYLE ════ */}
      {step === 2 && competitorUrls.length > 0 && styleAnalysis && (
        <div>
          <div style={{ marginBottom: 22 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: "0 0 4px" }}>
              Top Creators in Your Niche
            </h2>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: 0 }}>
              YouTube search results for "{nicheAnalysis.scraping_queries?.slice(0, 2).join(", ")}"
            </p>
          </div>

          <div style={{ ...cardStyle, marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#f72585", marginBottom: 10, fontFamily: "'Space Mono', monospace", letterSpacing: "0.1em" }}>
              WHAT WORKS IN THIS NICHE
            </div>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.7, margin: 0 }}>
              {styleAnalysis.what_works}
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, marginBottom: 20 }}>
            {competitorUrls.map((url, i) => (
              <div key={i} style={{ borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
                <img src={url} alt="" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block" }}
                  onError={(e) => { e.target.src = "https://img.youtube.com/vi/nonexistent/hqdefault.jpg" }} />
              </div>
            ))}
          </div>

          <div style={{ ...cardStyle, marginBottom: 20, borderColor: "rgba(114,9,183,0.2)", background: "rgba(114,9,183,0.04)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#a78bfa", marginBottom: 8, fontFamily: "'Space Mono', monospace", letterSpacing: "0.1em" }}>
              HOW WE DIFFERENTIATE
            </div>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.7, margin: 0 }}>
              {styleAnalysis.differentiation_opportunity}
            </p>
          </div>

          {styleAnalysis.style_tags && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
              {styleAnalysis.style_tags.map((t, i) => (
                <span key={i} style={{ background: "rgba(247,37,133,0.08)", color: "#f72585", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                  #{t.replace(/\s+/g, "")}
                </span>
              ))}
            </div>
          )}

          <button onClick={generateThumbnails} disabled={loading}
            style={btn(!loading)}>
            {loading ? <><Loader2 size={14} className="spinner" /> Generating...</> : <><Sparkles size={14} /> Generate Thumbnails →</>}
          </button>
        </div>
      )}

      {/* ════ STEP 3: GENERATE ════ */}
      {step === 3 && thumbnails.length > 0 && (
        <div>
          <div style={{ marginBottom: 22 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: "0 0 4px" }}>
              Your Thumbnails
            </h2>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: 0 }}>
              Click a thumbnail to open the editor and customize it
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16, marginBottom: 24 }}>
            {thumbnails.map((thumb, i) => (
              <div key={i}
                onClick={() => openEditor(thumb)}
                style={{
                  cursor: "pointer", borderRadius: 14, overflow: "hidden",
                  border: "2px solid rgba(255,255,255,0.08)",
                  transition: "all 0.2s", position: "relative",
                  background: "#1a1a2e",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#f72585"; e.currentTarget.style.transform = "translateY(-2px)" }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.transform = "none" }}>
                <img src={thumb.dataUrl || thumb.url} alt={`Option ${i + 1}`}
                  style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block" }} />
                <div style={{
                  position: "absolute", bottom: 0, left: 0, right: 0,
                  background: "linear-gradient(transparent, rgba(0,0,0,0.85))",
                  padding: "30px 14px 10px", display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.6)", fontFamily: "'Space Mono', monospace" }}>
                    VARIATION {i + 1}
                  </span>
                  <span style={{ fontSize: 11, color: "#f72585", fontWeight: 600, fontFamily: "'Space Mono', monospace" }}>
                    Edit →
                  </span>
                </div>
              </div>
            ))}
          </div>

          <button onClick={generateThumbnails} disabled={loading}
            style={{ ...btn(!loading), background: "rgba(255,255,255,0.05)", color: loading ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.7)" }}>
            {loading ? <><Loader2 size={14} className="spinner" /> Regenerating...</> : <><RefreshCw size={14} /> Regenerate</>}
          </button>
        </div>
      )}

      <div style={{ marginTop: 48, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.04)", fontSize: 10, color: "rgba(255,255,255,0.15)", fontFamily: "'Space Mono', monospace" }}>
        Powered by OpenRouter · YouTube Data API · Fabric.js · 1280×720
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner { animation: spin 0.8s linear infinite; }
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
