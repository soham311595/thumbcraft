import { useState, useEffect } from "react"
import { Loader2, AlertCircle, Flame } from "lucide-react"

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

export default function Inspiration({ niche, theme, onSelect }) {
  const cardStyle = { background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 20 }
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (!niche) return
    setLoading(true)
    setError("")
    const params = new URLSearchParams({
      niche: niche.niche?.primary_category || "",
      subcategory: niche.niche?.subcategory || "",
    })
    fetch(`/api/inspiration?${params}`)
      .then(async (r) => {
        const text = await r.text()
        let data
        try { data = JSON.parse(text) } catch { data = { error: text.slice(0, 300) } }
        if (data.error) throw new Error(data.error)
        return data
      })
      .then((data) => {
        setResults(data.results || [])
        if (data.results?.length === 0) setError("No results found — try a different niche")
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [niche])

  const handleSelect = (item) => {
    setSelected(item.videoId)
    onSelect(item)
  }

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", gap: 16 }}>
        <Loader2 size={32} className="spinner" style={{ color: "#b5179e" }} />
        <p style={{ fontSize: 14, color: theme.textSecondary, fontFamily: "'Space Mono', monospace" }}>
          Searching for inspiration thumbnails...
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: theme.errorBg, border: `1px solid ${theme.errorBorder}`, borderRadius: 10, padding: "10px 16px", fontSize: 13, color: "#f72585" }}>
        <AlertCircle size={14} />
        {error}
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
          Real YouTube thumbnails sorted by viral ratio (views ÷ channel avg). Pick one as a style reference.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
        {results.map((item) => {
          const badge = viralBadge(item.viralRatio)
          const isSelected = selected === item.videoId
          const isAnythingSelected = selected !== null
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
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: theme.textPrimary, marginBottom: 4, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {item.title}
              </div>
              <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 8 }}>
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
