import { Loader2, AlertCircle, TrendingUp, Palette, Type, Heart, MousePointer } from "lucide-react"

const CATEOGRY_META = {
  composition: { label: "Composition", icon: TrendingUp, color: "#f72585" },
  color_and_contrast: { label: "Color & Contrast", icon: Palette, color: "#7209b7" },
  text_readability: { label: "Text Readability", icon: Type, color: "#eab308" },
  emotional_appeal: { label: "Emotional Appeal", icon: Heart, color: "#22c55e" },
  ctr_potential: { label: "CTR Potential", icon: MousePointer, color: "#06b6d4" },
  niche_differentiation: { label: "Niche Differentiation", icon: TrendingUp, color: "#06b6d4" },
}

function scoreColor(s) {
  if (s >= 80) return "#22c55e"
  if (s >= 60) return "#eab308"
  if (s >= 40) return "#f97316"
  return "#f72585"
}

function ScoreGauge({ score }) {
  const r = 54
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = scoreColor(score)
  return (
    <div style={{ position: "relative", width: 140, height: 140, flexShrink: 0 }}>
      <svg width="140" height="140" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
        <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s ease" }} />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 32, fontWeight: 900, color: "#fff", fontFamily: "'Space Mono', monospace", lineHeight: 1 }}>
          {score}
        </span>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'Space Mono', monospace" }}>
          / 100
        </span>
      </div>
    </div>
  )
}

function CategoryBar({ catKey, cat, theme }) {
  const meta = CATEOGRY_META[catKey]
  if (!meta) return null
  const Icon = meta.icon
  const color = meta.color
  const pct = Math.max(0, Math.min(100, cat.score))
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <Icon size={12} style={{ color }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: theme.textTertiary }}>{meta.label}</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor(pct), fontFamily: "'Space Mono', monospace" }}>{pct}</span>
      </div>
      <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          width: `${pct}%`, height: "100%", borderRadius: 2,
          background: color, transition: "width 1s ease",
        }} />
      </div>
      {cat.note && (
        <div style={{ fontSize: 10, color: theme.textDim, marginTop: 3, lineHeight: 1.4 }}>
          {cat.note}
        </div>
      )}
      {catKey === "niche_differentiation" && cat.specific_conflict && (
        <div style={{ fontSize: 9, color: "#f72585", marginTop: 2, lineHeight: 1.4, fontFamily: "'Space Mono', monospace" }}>
          {cat.specific_conflict}
        </div>
      )}
    </div>
  )
}

export default function ThumbnailCritique({ critique, loading, error, theme, onApplyEdit }) {
  const cardStyle = { background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 20 }

  if (loading) {
    return (
      <div style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 12, marginTop: 20 }}>
        <Loader2 size={18} className="spinner" style={{ color: "#b5179e" }} />
        <span style={{ fontSize: 13, color: theme.textSecondary, fontFamily: "'Space Mono', monospace" }}>
          Analyzing thumbnail...
        </span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: theme.errorBg, border: `1px solid ${theme.errorBorder}`, borderRadius: 10, padding: "10px 16px", fontSize: 13, color: "#f72585", marginTop: 20 }}>
        <AlertCircle size={14} />
        Critique unavailable: {error}
      </div>
    )
  }

  if (!critique) return null

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: theme.textDim, marginBottom: 12, fontFamily: "'Space Mono', monospace", letterSpacing: "0.1em" }}>
        AI THUMBNAIL CRITIQUE
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <ScoreGauge score={critique.overall_score} />

        <div style={{ flex: 1, minWidth: 250, display: "flex", flexDirection: "column", gap: 12 }}>
          {Object.entries(CATEOGRY_META).map(([key]) => {
            const cat = critique.categories?.[key]
            if (!cat) return null
            return <CategoryBar key={key} catKey={key} cat={cat} theme={theme} />
          })}
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, marginTop: 20, flexWrap: "wrap" }}>
        {critique.strengths?.length > 0 && (
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", marginBottom: 6, fontFamily: "'Space Mono', monospace" }}>
              STRENGTHS
            </div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: theme.textSecondary, lineHeight: 1.8 }}>
              {critique.strengths.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}
        {critique.weaknesses?.length > 0 && (
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#f72585", marginBottom: 8, fontFamily: "'Space Mono', monospace" }}>
              WEAKNESSES
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {critique.weaknesses.map((w, i) => {
                const desc = typeof w === "string" ? w : w.description
                const cmd = typeof w === "string" ? "" : w.edit_command
                return (
                  <div key={i} style={{
                    background: "rgba(247,37,133,0.04)",
                    border: "1px solid rgba(247,37,133,0.12)",
                    borderRadius: 8, padding: "8px 10px",
                    display: "flex", gap: 8, alignItems: "flex-start",
                  }}>
                    <span style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 1.5, flex: 1 }}>
                      {desc}
                    </span>
                    {cmd && onApplyEdit && (
                      <button
                        onClick={() => onApplyEdit(cmd)}
                        style={{
                          background: "linear-gradient(135deg, #f72585, #7209b7)",
                          border: "none", color: "#fff", borderRadius: 6,
                          padding: "4px 10px", fontSize: 10, fontWeight: 700,
                          cursor: "pointer", fontFamily: "'Space Mono', monospace",
                          whiteSpace: "nowrap", flexShrink: 0,
                        }}
                      >
                        Fix this
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {critique.improvement_tips?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#06b6d4", marginBottom: 6, fontFamily: "'Space Mono', monospace" }}>
            IMPROVEMENT TIPS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {critique.improvement_tips.map((tip, i) => (
              <div key={i} style={{
                ...cardStyle, padding: "10px 14px",
                border: `1px solid rgba(6,182,212,0.15)`,
              }}>
                <span style={{ fontSize: 12, color: theme.textTertiary, lineHeight: 1.5 }}>
                  {tip}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
