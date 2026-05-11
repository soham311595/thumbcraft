import { Eye, EyeOff, Trash2 } from "lucide-react"

const TYPE_LABELS = {
  textbox: "T",
  "i-text": "T",
  image: "■",
  background: "⊙",
}

export function LayersPanel({ objects, selectedIndex, onSelect, onToggleVisibility, onDelete }) {
  if (!objects || objects.length === 0) {
    return (
      <div style={{ padding: 16, fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
        No layers
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.4)", marginBottom: 8, fontFamily: "'Space Mono', monospace" }}>
        Layers
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {[...objects].reverse().map((obj, ri) => {
          const realIndex = objects.length - 1 - ri
          const isSelected = realIndex === selectedIndex
          const typeLabel = TYPE_LABELS[obj.type] || "?"
          return (
            <div key={realIndex}
              onClick={() => onSelect(realIndex)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 10px", borderRadius: 6, cursor: "pointer",
                background: isSelected ? "rgba(147,51,234,0.15)" : "transparent",
                border: isSelected ? "1px solid rgba(147,51,234,0.3)" : "1px solid transparent",
                transition: "all 0.15s",
              }}>
              <div style={{
                width: 20, height: 20, borderRadius: 4,
                background: isSelected ? "rgba(147,51,234,0.2)" : "rgba(255,255,255,0.05)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700, color: isSelected ? "#a78bfa" : "rgba(255,255,255,0.4)",
                flexShrink: 0,
              }}>
                {typeLabel}
              </div>
              <div style={{
                flex: 1, fontSize: 12, color: "rgba(255,255,255,0.7)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {obj.name}
              </div>
              <button onClick={(e) => { e.stopPropagation(); onToggleVisibility(realIndex) }}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: obj.visible ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.15)" }}>
                {obj.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <button onClick={(e) => { e.stopPropagation(); onDelete(realIndex) }}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "rgba(239,68,68,0.5)" }}>
                <Trash2 size={13} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
