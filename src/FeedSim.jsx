import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"

export default function FeedSim({ generatedThumbUrl, videoTitle, competitorThumbs, theme }) {
  const [expanded, setExpanded] = useState(false)

  const items = competitorThumbs.slice(0, 8)
  const grid = []
  let idx = 0
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (r === 1 && c === 1) {
        grid.push({ type: "generated", thumb: generatedThumbUrl, title: videoTitle || "Your Thumbnail" })
      } else if (idx < items.length) {
        const item = items[idx++]
        grid.push({ type: "competitor", thumb: item.thumbnailUrl, title: item.title, ratio: item.viralRatio })
      } else {
        grid.push(null)
      }
    }
  }

  return (
    <div style={{
      background: theme.cardBg,
      border: "1px solid var(--c-card-border)",
      borderRadius: 14,
      overflow: "hidden",
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "12px 16px", border: "none", background: "transparent",
          color: "var(--c-text-bright)", cursor: "pointer",
          fontSize: 12, fontWeight: 700, fontFamily: "'Space Mono', monospace",
          letterSpacing: "0.1em",
        }}
      >
        {expanded ? <EyeOff size={14} /> : <Eye size={14} />}
        {expanded ? "Hide feed preview" : "See how it competes —"}
        <span style={{ color: "var(--c-text-muted)", fontWeight: 400 }}>
          your thumbnail vs real YouTube results
        </span>
      </button>

      {expanded && (
        <div style={{ padding: "0 16px 16px" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 8,
          }}>
            {grid.map((slot, i) => slot ? (
              <div key={i} style={{
                borderRadius: 8,
                overflow: "hidden",
                border: slot.type === "generated"
                  ? "2px solid #f72585"
                  : "1px solid var(--c-card-border)",
                background: "#0a0a14",
                position: "relative",
              }}>
                <img
                  src={slot.thumb}
                  alt=""
                  style={{
                    width: "100%",
                    aspectRatio: "16/9",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
                {slot.type === "generated" && (
                  <div style={{
                    position: "absolute", top: 4, left: 4,
                    background: "#f72585", color: "#fff",
                    borderRadius: 4, padding: "1px 6px",
                    fontSize: 8, fontWeight: 700,
                    fontFamily: "'Space Mono', monospace",
                  }}>
                    YOURS
                  </div>
                )}
                {slot.type === "competitor" && (
                  <div style={{
                    position: "absolute", top: 4, right: 4,
                    background: "rgba(0,0,0,0.7)", color: "#fff",
                    borderRadius: 4, padding: "1px 6px",
                    fontSize: 8, fontFamily: "'Space Mono', monospace",
                  }}>
                    {slot.ratio}x
                  </div>
                )}
                <div style={{
                  padding: "4px 6px",
                  fontSize: 10,
                  color: "var(--c-text-muted)",
                  lineHeight: 1.3,
                  display: "-webkit-box",
                  WebkitLineClamp: 1,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  {slot.title}
                </div>
              </div>
            ) : (
              <div key={i} style={{
                borderRadius: 8,
                aspectRatio: "16/9",
                background: "rgba(255,255,255,0.02)",
                border: "1px dashed var(--c-card-border)",
              }} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
