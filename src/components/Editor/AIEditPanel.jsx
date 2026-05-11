import { useState } from "react"
import { Wand2, Loader2 } from "lucide-react"
import { analyzeText, generateThumbnail } from "../../ai"
import { AI_EDIT_PROMPT } from "../../prompts"

const QUICK_EDITS = [
  "Make the text bigger and more aggressive",
  "Change the color scheme to red and black",
  "Make it look more professional and clean",
  "Add more contrast and make it pop more",
  "Make the background darker and moodier",
  "Change the mood to more exciting and energetic",
]

export function AIEditPanel({ originalPrompt, canvasRef }) {
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleEdit(request) {
    if (!request.trim() || loading) return
    setLoading(true)
    setError("")
    try {
      const newPrompt = await analyzeText(AI_EDIT_PROMPT(originalPrompt, request), null, { raw: true })
      const result = await generateThumbnail(newPrompt)
      canvasRef.current?.swapBackground(result.dataUrl)
      setInput("")
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <Wand2 size={13} style={{ color: "#a78bfa" }} />
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.4)", fontFamily: "'Space Mono', monospace" }}>
          AI Edit
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
        {QUICK_EDITS.map(e => (
          <button key={e} onClick={() => handleEdit(e)} disabled={loading}
            style={{
              textAlign: "left", fontSize: 11, padding: "6px 10px", borderRadius: 6,
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
              color: loading ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.5)",
              cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
            }}>
            {e}
          </button>
        ))}
      </div>

      <textarea value={input} onChange={e => setInput(e.target.value)}
        placeholder="Describe what to change..."
        rows={2}
        style={{
          width: "100%", boxSizing: "border-box", resize: "none",
          background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 6, padding: "6px 10px", color: "#fff", fontSize: 11,
          fontFamily: "'Space Mono', monospace", outline: "none", marginBottom: 6,
        }} />

      <button onClick={() => handleEdit(input)} disabled={loading || !input.trim()}
        style={{
          width: "100%", padding: "8px 0", borderRadius: 6,
          background: loading ? "rgba(147,51,234,0.1)" : "rgba(147,51,234,0.2)",
          border: "1px solid rgba(147,51,234,0.2)",
          color: loading ? "rgba(255,255,255,0.3)" : "#a78bfa",
          fontSize: 12, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
          fontFamily: "'Space Mono', monospace",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}>
        {loading ? <Loader2 size={13} className="spinner" /> : <Wand2 size={13} />}
        {loading ? "Regenerating..." : "Regenerate with AI"}
      </button>

      {error && (
        <div style={{ marginTop: 6, fontSize: 10, color: "#ef4444" }}>
          {error}
        </div>
      )}
    </div>
  )
}
