import { useState, useRef, useCallback } from "react"
import { analyzeText, analyzeVision, generateThumbnail } from "./ai"
import { fetchTranscript, formatTranscript, fetchVideoTitle } from "./transcript"
import { fetchStoryboardSpec, parseSpec, extractFrame } from "./storyboard"
import {
  NICHE_ANALYSIS_PROMPT,
  STYLE_ANALYSIS_PROMPT,
  IMAGE_PROMPT_GENERATOR,
  FRAME_RECOMMENDATION_PROMPT,
} from "./prompts"
import {
  ArrowLeft,
  AlertCircle,
  Loader2,
  RefreshCw,
  Sparkles,
  Search,
  Image as ImageIcon,
  Video,
} from "lucide-react"
import Canvas from "./components/Editor/Canvas"
import { Toolbar } from "./components/Editor/Toolbar"
import { LayersPanel } from "./components/Editor/LayersPanel"
import { PropertiesPanel } from "./components/Editor/PropertiesPanel"


const STEPS = ["input", "niche", "frames", "generate"]
const STEP_LABELS = ["Video", "Niche", "Pick Frame", "Generate"]

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

  // Step 2 — Frame Selection
  const [storyboardSpec, setStoryboardSpec] = useState(null)
  const [frameRecs, setFrameRecs] = useState(null)
  const [conceptIdeas, setConceptIdeas] = useState([])
  const [frameThumbnails, setFrameThumbnails] = useState({})
  const [scrubValues, setScrubValues] = useState({})
  const [framesLoading, setFramesLoading] = useState(false)
  const [videoDuration, setVideoDuration] = useState(0)

  // Step 3 — Generate
  const [selectedFrameTimestamp, setSelectedFrameTimestamp] = useState(null)
  const [selectedFrameDataUrl, setSelectedFrameDataUrl] = useState(null)
  const [selectedConceptTitle, setSelectedConceptTitle] = useState(null)
  const [generatedThumb, setGeneratedThumb] = useState(null)
  const [generating, setGenerating] = useState(false)

  // Step 2 — Style (kept as optional)
  const [competitorVideos, setCompetitorVideos] = useState([])
  const [competitorUrls, setCompetitorUrls] = useState([])
  const [styleAnalysis, setStyleAnalysis] = useState(null)

  // Editor
  const [editingThumbnail, setEditingThumbnail] = useState(null)
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

  // ─── Step 2: Open Frame Selection ───────────────────────
  const openFrameSelection = async () => {
    if (!nicheAnalysis || !videoId || !transcript) return
    setFramesLoading(true)
    setError("")
    setStatus("Loading storyboard and analyzing frames...")
    setStep(2)

    try {
      setStatus("Fetching storyboard...")
      const playerData = await fetchStoryboardSpec(videoId)
      const parsed = parseSpec(playerData.spec)
      setStoryboardSpec(parsed)
      setVideoDuration(playerData.duration || 0)

      setStatus("Analyzing transcript for frame recommendations...")
      const frameResult = await analyzeText(
        FRAME_RECOMMENDATION_PROMPT(transcript, nicheAnalysis),
      )
      setFrameRecs(frameResult.recommended_frames || [])
      setConceptIdeas(frameResult.concept_ideas || [])

      setStatus("Extracting frame thumbnails...")

      const recs = frameResult.recommended_frames || []
      const initialScrub = {}
      const thumbMap = {}

      for (let i = 0; i < recs.length; i++) {
        const ts = recs[i].timestamp
        const tsMs = ts * 1000
        initialScrub[i] = ts
        try {
          const dataUrl = await extractFrame(parsed, tsMs)
          thumbMap[i] = dataUrl
        } catch {
          thumbMap[i] = null
        }
      }

      setScrubValues(initialScrub)
      setFrameThumbnails(thumbMap)
      setStatus("")
    } catch (e) {
      console.error("Frame analysis error:", e)
      setError("Frame analysis failed: " + e.message)
      setFrameRecs(null)
      setStoryboardSpec(null)
    } finally {
      setFramesLoading(false)
      setStatus("")
    }
  }

  // ─── Scrub handler ──────────────────────────────────────
  const scrubTimerRef = useRef(null)
  const handleScrub = (recIndex, newTimestamp) => {
    setScrubValues((prev) => ({ ...prev, [recIndex]: newTimestamp }))
    if (scrubTimerRef.current) clearTimeout(scrubTimerRef.current)
    scrubTimerRef.current = setTimeout(async () => {
      if (!storyboardSpec || !frameRecs) return
      try {
        const dataUrl = await extractFrame(storyboardSpec, newTimestamp * 1000)
        setFrameThumbnails((prev) => ({ ...prev, [recIndex]: dataUrl }))
      } catch {}
    }, 150)
  }

  // ─── Select Frame ───────────────────────────────────────
  const handleSelectFrame = (recIndex) => {
    const rec = frameRecs[recIndex]
    const dataUrl = frameThumbnails[recIndex]
    const ts = scrubValues[recIndex] ?? rec.timestamp
    setSelectedFrameTimestamp(ts)
    setSelectedFrameDataUrl(dataUrl)
    setSelectedConceptTitle(null)
    setStep(3)
  }

  // ─── Select Concept Idea ────────────────────────────────
  const handleSelectConcept = (conceptIndex) => {
    const concept = conceptIdeas[conceptIndex]
    setSelectedConceptTitle(concept.title)
    setSelectedFrameTimestamp(null)
    setSelectedFrameDataUrl(null)
    setStep(3)
  }

  // ─── Step 3: Style Research (optional) ──────────────────
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
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      setStatus("")
    }
  }

  // ─── Step 3: Generate with Frame/Concept ────────────────
  const generateWithSelection = async () => {
    if (!nicheAnalysis) return
    setGenerating(true)
    setError("")
    setStatus("Generating thumbnail...")

    try {
      let promptText

      if (selectedFrameTimestamp != null && selectedFrameDataUrl) {
        const rec = frameRecs?.find((r) => Math.abs(r.timestamp - selectedFrameTimestamp) < 11)
        const concept = rec?.thumbnail_concept || ""
        promptText = `Use this video frame as the visual starting point for a YouTube thumbnail. Keep the subject and composition of the frame but enhance it with bold colors, dramatic lighting, and text overlay.\n\nTHUMBNAIL CONCEPT: ${concept}\n\n${IMAGE_PROMPT_GENERATOR(nicheAnalysis, styleAnalysis, 0)}`
      } else {
        promptText = `Create a YouTube thumbnail based on this concept (no video frame reference needed).\n\nCONCEPT: ${selectedConceptTitle || ""}\n\n${IMAGE_PROMPT_GENERATOR(nicheAnalysis, styleAnalysis, 0)}`
      }

      const result = await generateThumbnail(promptText, null, selectedFrameDataUrl || undefined)
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
      3: generatedThumb != null,
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
            AI thumbnail generator with frame selection
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

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={openFrameSelection} disabled={loading || framesLoading}
              style={btn(!loading && !framesLoading)}>
              {framesLoading ? <><Loader2 size={14} className="spinner" /> Loading frames...</> : <><Video size={14} /> Choose Frames →</>}
            </button>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "'Space Mono', monospace" }}>or</span>
            <button onClick={researchCompetition}
              style={{
                background: "transparent", border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.5)", borderRadius: 12,
                padding: "13px 22px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                fontFamily: "'Space Mono', monospace", transition: "all 0.3s",
              }}>
              <Search size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
              Research Competition
            </button>
          </div>

          {styleAnalysis && (
            <div style={{ ...cardStyle, marginTop: 16, borderColor: "rgba(114,9,183,0.2)", background: "rgba(114,9,183,0.04)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#a78bfa", marginBottom: 8, fontFamily: "'Space Mono', monospace", letterSpacing: "0.1em" }}>
                COMPETITOR STYLE ANALYSIS
              </div>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.7, margin: 0 }}>
                {styleAnalysis.differentiation_opportunity}
              </p>
              {styleAnalysis.style_tags && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  {styleAnalysis.style_tags.map((t, i) => (
                    <span key={i} style={{ background: "rgba(247,37,133,0.08)", color: "#f72585", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                      #{t.replace(/\s+/g, "")}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════ STEP 2: FRAME SELECTION ════ */}
      {step === 2 && (
        <div>
          {framesLoading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", gap: 16 }}>
              <Loader2 size={32} className="spinner" style={{ color: "#b5179e" }} />
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", fontFamily: "'Space Mono', monospace" }}>
                Analyzing transcript and extracting frames...
              </p>
            </div>
          ) : frameRecs && frameRecs.length > 0 ? (
            <div>
              <div style={{ marginBottom: 22 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: "0 0 4px" }}>
                  Pick a Frame
                </h2>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: 0 }}>
                  AI-recommended moments from your video — drag the slider to fine-tune (±10s)
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16, marginBottom: 32 }}>
                {frameRecs.map((rec, i) => {
                  const currentTs = scrubValues[i] ?? rec.timestamp
                  const tsMin = Math.max(0, rec.timestamp - 10)
                  const tsMax = videoDuration ? Math.min(rec.timestamp + 10, videoDuration) : rec.timestamp + 10
                  const previewUrl = frameThumbnails[i]

                  return (
                    <div key={i} style={{ ...cardStyle, display: "flex", flexDirection: "column" }}>
                      <div style={{ borderRadius: 10, overflow: "hidden", background: "#000", marginBottom: 12, aspectRatio: "16/9", position: "relative" }}>
                        {previewUrl ? (
                          <img src={previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1a1a2e", color: "rgba(255,255,255,0.2)", fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
                            Failed to load
                          </div>
                        )}
                        <div style={{ position: "absolute", bottom: 6, left: 6, background: "rgba(0,0,0,0.75)", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "#fff" }}>
                          {formatTimestamp(currentTs)}
                        </div>
                      </div>

                      <div style={{ marginBottom: 10 }}>
                        <input
                          type="range"
                          min={tsMin}
                          max={tsMax}
                          step={0.5}
                          value={currentTs}
                          onChange={(e) => handleScrub(i, parseFloat(e.target.value))}
                          style={{ width: "100%", accentColor: "#f72585" }}
                        />
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'Space Mono', monospace", marginTop: 2 }}>
                          <span>{formatTimestamp(tsMin)}</span>
                          <span>{formatTimestamp(tsMax)}</span>
                        </div>
                      </div>

                      <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 4, lineHeight: 1.4 }}>
                        {rec.description}
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12, lineHeight: 1.5, flex: 1 }}>
                        {rec.reason}
                      </div>

                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 12, lineHeight: 1.5, padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
                        <strong style={{ color: "rgba(255,255,255,0.7)" }}>Final concept:</strong> {rec.thumbnail_concept}
                      </div>

                      <button onClick={() => handleSelectFrame(i)}
                        style={{ ...btn(true), width: "100%", justifyContent: "center" }}>
                        <ImageIcon size={14} /> Use This Frame →
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* Concept Ideas */}
              {conceptIdeas.length > 0 && (
                <div style={{ marginBottom: 22 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: "0 0 4px" }}>
                    Concept Ideas (No Reference Frame)
                  </h2>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: 0 }}>
                    Text-only concepts that work without a specific video frame
                  </p>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16, marginBottom: 24 }}>
                {conceptIdeas.map((concept, i) => (
                  <div key={`c-${i}`} style={{ ...cardStyle, borderColor: "rgba(114,9,183,0.2)", background: "rgba(114,9,183,0.04)" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#a78bfa", marginBottom: 6 }}>
                      💡 {concept.title}
                    </div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.6, marginBottom: 10 }}>
                      {concept.description}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 14, lineHeight: 1.5 }}>
                      {concept.reason}
                    </div>
                    <button onClick={() => handleSelectConcept(i)}
                      style={{
                        ...btn(true), width: "100%", justifyContent: "center",
                        background: "linear-gradient(135deg, #7209b7, #b5179e)",
                      }}>
                      <Sparkles size={14} /> Generate from Concept
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 16 }}>
                Failed to analyze frames. Try researching competition or go back to input.
              </p>
              <button onClick={openFrameSelection} style={btn(true)}>
                <RefreshCw size={14} /> Retry Frame Analysis
              </button>
            </div>
          )}
        </div>
      )}

      {/* ════ STEP 3: GENERATE ════ */}
      {step === 3 && (
        <div>
          {!generatedThumb ? (
            <div>
              <div style={{ marginBottom: 22 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: "0 0 4px" }}>
                  {selectedFrameTimestamp != null ? "Generate with This Frame" : "Generate from Concept"}
                </h2>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: 0 }}>
                  {selectedFrameTimestamp != null
                    ? `Using frame at ${formatTimestamp(selectedFrameTimestamp)} as reference`
                    : `Using concept: ${selectedConceptTitle}`
                  }
                </p>
              </div>

              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24, alignItems: "flex-start" }}>
                {selectedFrameDataUrl && (
                  <div style={{ width: 280, flexShrink: 0 }}>
                    <div style={{ borderRadius: 12, overflow: "hidden", border: "2px solid #f72585" }}>
                      <img src={selectedFrameDataUrl} alt="Selected frame" style={{ width: "100%", display: "block" }} />
                    </div>
                    <div style={{ marginTop: 6, textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "'Space Mono', monospace" }}>
                      Reference frame at {formatTimestamp(selectedFrameTimestamp)}
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
                <button onClick={() => setStep(2)}
                  style={{
                    background: "transparent", border: "1px solid rgba(255,255,255,0.12)",
                    color: "rgba(255,255,255,0.5)", borderRadius: 12,
                    padding: "13px 22px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                    fontFamily: "'Space Mono', monospace",
                  }}>
                  ← Pick Different Frame
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
                    ? `Generated using frame at ${formatTimestamp(selectedFrameTimestamp)}`
                    : `Generated from concept: ${selectedConceptTitle}`
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
                <button onClick={() => setStep(2)}
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
        Powered by OpenRouter · YouTube Data API · Fabric.js · 1280×720
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
