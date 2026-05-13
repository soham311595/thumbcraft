import { useState, useEffect, useRef } from "react"
import { Loader2, AlertCircle, Flame, Star, Zap } from "lucide-react"
import { analyzeText } from "./ai"
import { CREATOR_SUGGESTION_PROMPT } from "./prompts"

function formatCount(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M"
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K"
  return n.toString()
}

function viralBadge(ratio) {
  if (ratio >= 2) return { label: "VIRAL", color: "#22c55e" }
  if (ratio >= 1) return { label: "STRONG", color: "#eab308" }
  return { label: "AVERAGE", color: "rgba(255,255,255,0.3)" }
}

function creatorType(subCount) {
  if (subCount >= 1_000_000) return "top"
  if (subCount >= 100_000) return "mid"
  return "underdog"
}

export default function Inspiration({ niche, transcript, videoTitle, theme, onSelect }) {
  const cardStyle = { background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 20 }
  const [phase, setPhase] = useState("suggesting")
  const [creators, setCreators] = useState([])
  const [channelsData, setChannelsData] = useState([])
  const [results, setResults] = useState([])
  const [error, setError] = useState("")
  const [selected, setSelected] = useState(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!niche) return
    setPhase("suggesting")
    setError("")

    const run = async () => {
      try {
        const formatted = transcript ? (Array.isArray(transcript) ? transcript.map(s => s.text).join(" ").slice(0, 2000) : String(transcript).slice(0, 2000)) : ""
        const result = await analyzeText(
          CREATOR_SUGGESTION_PROMPT(niche, videoTitle || "Unknown", formatted),
          null,
          { reasoning: false }
        )
        if (!mountedRef.current) return

        const creatorList = result?.creators || []
        if (creatorList.length === 0) throw new Error("Could not identify relevant creators")

        setCreators(creatorList)
        setPhase("fetching")

        const handles = creatorList.map(c => c.handle).join(",")
        const params = new URLSearchParams({ handles })
        const res = await fetch(`/api/inspiration?${params}`)
        const text = await res.text()
        let data
        try { data = JSON.parse(text) } catch { data = { error: text.slice(0, 300) } }
        if (data.error) throw new Error(data.error)
        if (!mountedRef.current) return

        setResults(data.results || [])
        setChannelsData(data.channels || [])
        if (data.results?.length === 0) setError("No long-form videos found from these creators")
        setPhase("done")
      } catch (e) {
        if (mountedRef.current) {
          setError(e.message)
          setPhase("error")
        }
      }
    }
    run()
  }, [niche, transcript, videoTitle])

  const handleSelect = (item) => {
    setSelected(item.videoId)
    onSelect(item)
  }

  if (phase === "suggesting") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", gap: 16 }}>
        <Loader2 size={32} className="spinner" style={{ color: "#b5179e" }} />
        <p style={{ fontSize: 14, color: theme.textSecondary, fontFamily: "'Space Mono', monospace" }}>
          Analyzing niche to find relevant creators...
        </p>
      </div>
    )
  }

  if (phase === "fetching") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", gap: 12 }}>
        <Loader2 size={32} className="spinner" style={{ color: "#b5179e" }} />
        <p style={{ fontSize: 14, color: theme.textSecondary, fontFamily: "'Space Mono', monospace" }}>
          Fetching thumbnails from {creators.length} channels...
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {creators.map((c) => (
            <span key={c.handle} style={{
              fontSize: 11, color: theme.textMuted, background: "rgba(255,255,255,0.04)",
              padding: "3px 10px", borderRadius: 20, fontFamily: "'Space Mono', monospace",
            }}>
              {c.name}
            </span>
          ))}
        </div>
      </div>
    )
  }

  if (phase === "error") {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: theme.errorBg, border: `1px solid ${theme.errorBorder}`, borderRadius: 10, padding: "10px 16px", fontSize: 13, color: "#f72585", marginBottom: 16 }}>
          <AlertCircle size={14} />
          {error}
        </div>
        <p style={{ fontSize: 12, color: theme.textMuted, textAlign: "center" }}>
          Try going back and analyzing a different video
        </p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: theme.textPrimary, margin: "0 0 4px" }}>
          Inspiration Thumbnails
        </h2>
        <p style={{ fontSize: 12, color: theme.textMuted, margin: 0 }}>
          Thumbnails from creators in your niche, sorted by viral ratio. Pick one as a style reference.
        </p>
      </div>

      {/* Creator legend */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        {channelsData.map((c) => {
          const type = creatorType(c.subscriberCount)
          return (
            <div key={c.handle} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {type === "top" ? (
                <Star size={12} style={{ color: "#f72585" }} />
              ) : type === "mid" ? (
                <Star size={12} style={{ color: "#8b5cf6" }} />
              ) : (
                <Zap size={12} style={{ color: "#eab308" }} />
              )}
              <span style={{ fontSize: 12, color: theme.textPrimary, fontWeight: 600 }}>{c.name}</span>
              <span style={{
                fontSize: 9, padding: "1px 6px", borderRadius: 8,
                background: type === "top" ? "rgba(247,37,133,0.12)" : type === "mid" ? "rgba(139,92,246,0.12)" : "rgba(234,179,8,0.12)",
                color: type === "top" ? "#f72585" : type === "mid" ? "#8b5cf6" : "#eab308",
                fontWeight: 700, fontFamily: "'Space Mono', monospace",
              }}>
                {type === "top" ? "TOP" : type === "mid" ? "MID" : "UNDERDOG"}
              </span>
            </div>
          )
        })}
      </div>

      {results.length === 0 && !error && (
        <p style={{ fontSize: 13, color: theme.textMuted, textAlign: "center" }}>
          No videos found from these creators
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
        {results.map((item) => {
          const badge = viralBadge(item.viralRatio)
          const isSelected = selected === item.videoId
          const isAnythingSelected = selected !== null
          const type = creatorType(item.subscriberCount)
          return (
            <div
              key={item.videoId}
              onClick={() => handleSelect(item)}
              style={{
                ...cardStyle,
                cursor: "pointer",
                border: isSelected ? "2px solid #f72585" : `1px solid ${theme.cardBorder}`,
                transition: "all 0.2s",
                position: "relative",
                opacity: isAnythingSelected && !isSelected ? 0.4 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = "rgba(247,37,133,0.4)"
                  if (isAnythingSelected) e.currentTarget.style.opacity = "0.6"
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = theme.cardBorder
                  if (isAnythingSelected) e.currentTarget.style.opacity = "0.4"
                }
              }}
            >
              <div style={{ borderRadius: 8, overflow: "hidden", marginBottom: 10, aspectRatio: "16/9", background: "#0a0a14", position: "relative" }}>
                <img src={item.thumbnailUrl} alt={item.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                {isSelected && (
                  <div style={{
                    position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                    width: 48, height: 48, borderRadius: "50%",
                    background: "#22c55e", color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 4px 20px rgba(34,197,94,0.5)",
                    fontSize: 24, fontWeight: 700,
                  }}>✓</div>
                )}
                {/* Creator type badge on thumbnail */}
                <div style={{
                  position: "absolute", top: 6, left: 6,
                  display: "flex", alignItems: "center", gap: 3,
                  background: type === "top" ? "rgba(247,37,133,0.85)" : type === "mid" ? "rgba(139,92,246,0.85)" : "rgba(234,179,8,0.85)",
                  color: "#fff", borderRadius: 6, padding: "2px 7px",
                  fontSize: 9, fontWeight: 700, fontFamily: "'Space Mono', monospace",
                }}>
                  {type === "top" ? <Star size={9} /> : type === "mid" ? <Star size={9} /> : <Zap size={9} />}
                  {type === "top" ? "TOP" : type === "mid" ? "MID" : "UNDERDOG"}
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: theme.textPrimary, marginBottom: 2, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {item.title}
              </div>
              <div style={{ fontSize: 11, color: theme.textBright, fontWeight: 600, marginBottom: 6 }}>
                {item.channelTitle}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
                <span style={{ color: theme.textSecondary }}>{formatCount(item.viewCount)} views</span>
                <span style={{
                  background: badge.color + "20",
                  color: badge.color,
                  padding: "1px 8px",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                }}>
                  {badge.label === "VIRAL" && <Flame size={10} />}
                  {badge.label} {item.viralRatio}x
                </span>
              </div>
              {isSelected && (
                <div style={{
                  position: "absolute", top: 8, right: 8,
                  background: "#f72585", color: "#fff",
                  borderRadius: 8, padding: "3px 10px",
                  fontSize: 10, fontWeight: 700, fontFamily: "'Space Mono', monospace",
                }}>
                  SELECTED
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
