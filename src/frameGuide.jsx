import { useState, useEffect, useRef } from "react"
import { Loader2, Lightbulb, Target, Layers, Compass } from "lucide-react"
import { analyzeVision } from "./ai"
import { FRAME_GUIDANCE_VISION_PROMPT } from "./prompts"
import { formatTranscript } from "./transcript"
import FramePicker from "./framepicker"

const guidanceIcons = {
  composition_advice: Lightbulb,
  inspiration_alignment: Layers,
  recommended_approach: Compass,
}

export default function FrameGuide({ videoFile, transcript, niche, selectedInspiration, theme, onSelectFrame }) {
  const cardStyle = { background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 20 }
  const [guidance, setGuidance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [streamText, setStreamText] = useState("")
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!niche || !transcript || !selectedInspiration) return
    setLoading(true)
    setError("")
    setStreamText("Generating guidance...")

    const run = async () => {
      try {
        const formatted = formatTranscript(transcript, 4000)
        const result = await analyzeVision(
          [selectedInspiration.thumbnailUrl],
          FRAME_GUIDANCE_VISION_PROMPT(formatted, niche),
          null,
        )
        if (mountedRef.current) {
          setGuidance(result)
          setStreamText("")
        }
      } catch (e) {
        if (mountedRef.current) setError(e.message)
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    }
    run()
  }, [niche, transcript, selectedInspiration])

  const handleFrameSelect = (dataUrl, timestamp) => {
    onSelectFrame(dataUrl, timestamp)
  }

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: theme.textPrimary, margin: "0 0 4px" }}>
          AI-Guided Frame Selection
        </h2>
        <p style={{ fontSize: 12, color: theme.textMuted, margin: 0 }}>
          AI analyzed your transcript + inspiration thumbnail. Use the advice below to pick the perfect frame.
        </p>
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        {selectedInspiration && (
          <div style={{ width: 200, flexShrink: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: theme.textDim, marginBottom: 6, fontFamily: "'Space Mono', monospace" }}>
              INSPIRATION
            </div>
            <div style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${theme.cardBorder}` }}>
              <img src={selectedInspiration.thumbnailUrl} alt="" style={{ width: "100%", display: "block" }} />
            </div>
            <div style={{ fontSize: 10, color: theme.textDim, marginTop: 4, fontFamily: "'Space Mono', monospace" }}>
              {selectedInspiration.title?.slice(0, 60)}
            </div>
          </div>
        )}

        <div style={{ flex: 1, minWidth: 300 }}>
          {loading && (
            <div style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 12 }}>
              <Loader2 size={18} className="spinner" style={{ color: "#b5179e" }} />
              <span style={{ fontSize: 13, color: theme.textSecondary, fontFamily: "'Space Mono', monospace" }}>
                {streamText}
              </span>
            </div>
          )}

          {error && (
            <div style={{ ...cardStyle, border: `1px solid ${theme.errorBorder}` }}>
              <p style={{ fontSize: 13, color: "#f72585", margin: 0 }}>{error}</p>
            </div>
          )}

          {guidance && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {guidance.composition_advice && (
                <div style={cardStyle}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <Lightbulb size={14} style={{ color: "#eab308" }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#eab308", fontFamily: "'Space Mono', monospace", letterSpacing: "0.1em" }}>
                      COMPOSITION ADVICE
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: theme.textTertiary, lineHeight: 1.6, margin: 0 }}>
                    {guidance.composition_advice}
                  </p>
                </div>
              )}

              {guidance.frame_characteristics?.length > 0 && (
                <div style={cardStyle}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <Target size={14} style={{ color: "#f72585" }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#f72585", fontFamily: "'Space Mono', monospace", letterSpacing: "0.1em" }}>
                      WHAT TO LOOK FOR
                    </span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: theme.textSecondary, lineHeight: 1.8 }}>
                    {guidance.frame_characteristics.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {guidance.inspiration_alignment && (
                <div style={cardStyle}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <Layers size={14} style={{ color: "#7209b7" }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#7209b7", fontFamily: "'Space Mono', monospace", letterSpacing: "0.1em" }}>
                      INSPIRATION ALIGNMENT
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: theme.textTertiary, lineHeight: 1.6, margin: 0 }}>
                    {guidance.inspiration_alignment}
                  </p>
                </div>
              )}

              {guidance.recommended_approach && (
                <div style={cardStyle}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <Compass size={14} style={{ color: "#22c55e" }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", fontFamily: "'Space Mono', monospace", letterSpacing: "0.1em" }}>
                      RECOMMENDED APPROACH
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: theme.textTertiary, lineHeight: 1.6, margin: 0, textTransform: "capitalize" }}>
                    {guidance.recommended_approach.replace(/_/g, " ")}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{
        display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
        marginBottom: 12, padding: "10px 14px",
        background: theme.cardBg, borderRadius: 10,
        border: `1px solid ${theme.cardBorder}`,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: theme.textDim, fontFamily: "'Space Mono', monospace", letterSpacing: "0.1em" }}>
          SHORTCUTS
        </span>
        {[
          { key: "← →", desc: "Step frame" },
          { key: "Shift+←/→", desc: "10 frames" },
          { key: "↑ ↓", desc: "1 second" },
          { key: "Space", desc: "Play/pause" },
          { key: "C", desc: "Capture frame" },
        ].map((s) => (
          <span key={s.key} style={{ fontSize: 11, color: theme.textMuted, fontFamily: "'Space Mono', monospace" }}>
            <kbd style={{
              background: theme.btnBg, padding: "2px 6px", borderRadius: 4,
              border: `1px solid ${theme.inputBorder}`, fontSize: 10, color: theme.textTertiary,
            }}>{s.key}</kbd>
            <span style={{ marginLeft: 4 }}>{s.desc}</span>
          </span>
        ))}
      </div>

      {videoFile && (
        <FramePicker
          videoFile={videoFile}
          theme={theme}
          recommendedTimestamps={[]}
          onSelectFrame={handleFrameSelect}
        />
      )}
    </div>
  )
}
