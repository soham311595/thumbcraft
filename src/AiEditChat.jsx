import { useState, useRef, useEffect } from "react"
import { Loader2, Send } from "lucide-react"

export default function AiEditChat({ initialThumbUrl, hasCredits, onEdit, theme }) {
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState("")
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState("")
  const listRef = useRef(null)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async () => {
    const text = inputText.trim()
    if (!text || !hasCredits || editing) return

    setInputText("")
    setEditError("")
    setEditing(true)

    const prevThumb = (() => {
      const images = messages.filter((m) => m.type === "image")
      return images.length > 0 ? images[images.length - 1].dataUrl : initialThumbUrl
    })()
    const userMsg = { role: "user", text, id: Date.now() }
    setMessages((prev) => [...prev, userMsg])

    try {
      const result = await onEdit(text, prevThumb)
      setMessages((prev) => [
        ...prev,
        { role: "assistant", type: "image", dataUrl: result.dataUrl, id: Date.now() },
      ])
    } catch (e) {
      setEditError(e.message)
    } finally {
      setEditing(false)
    }
  }

  const chatInputStyle = {
    width: "100%",
    boxSizing: "border-box",
    background: theme.inputBg,
    border: `1px solid ${theme.inputBorder}`,
    borderRadius: 10,
    padding: "10px 14px",
    color: theme.textPrimary,
    fontSize: 13,
    fontFamily: "'Space Mono', monospace",
    outline: "none",
    flex: 1,
  }

  const btnStyle = (active) => ({
    background: active
      ? "linear-gradient(135deg, #f72585, #7209b7)"
      : theme.btnBg,
    border: "none",
    color: active ? "#fff" : theme.btnText,
    borderRadius: 10,
    padding: "10px 16px",
    fontSize: 13,
    fontWeight: 700,
    cursor: active ? "pointer" : "not-allowed",
    fontFamily: "'Space Mono', monospace",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  })

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--c-text-dim)", marginBottom: 12, fontFamily: "'Space Mono', monospace", letterSpacing: "0.1em" }}>
        AI EDITS
      </div>

      <div
        ref={listRef}
        style={{
          maxHeight: 420,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          marginBottom: 14,
          paddingRight: 4,
        }}
      >
        {messages.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--c-text-muted)", textAlign: "center", padding: "20px 0", lineHeight: 1.6 }}>
            {hasCredits
              ? "Ask AI to edit this thumbnail — change the background, adjust colors, swap text, or anything else."
              : "You've used all regenerations for this thumbnail."}
          </div>
        )}

        {messages.map((msg) =>
          msg.role === "user" ? (
            <div key={msg.id} style={{ display: "flex", justifyContent: "flex-end" }}>
              <div style={{
                background: "rgba(247,37,133,0.1)",
                border: "1px solid rgba(247,37,133,0.2)",
                borderRadius: "12px 12px 4px 12px",
                padding: "10px 14px",
                maxWidth: "80%",
                fontSize: 13,
                color: theme.textBright,
                lineHeight: 1.5,
              }}>
                {msg.text}
              </div>
            </div>
          ) : (
            <div key={msg.id} style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{ width: "80%", maxWidth: 400 }}>
                <div style={{
                  borderRadius: 12,
                  overflow: "hidden",
                  border: "1px solid var(--c-card-border)",
                }}>
                  <img
                    src={msg.dataUrl}
                    alt="Edited thumbnail"
                    style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block" }}
                  />
                </div>
              </div>
            </div>
          )
        )}

        {editing && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--c-text-muted)", fontSize: 12, fontFamily: "'Space Mono', monospace" }}>
            <Loader2 size={14} className="spinner" />
            Editing thumbnail...
          </div>
        )}

        {editError && (
          <div style={{ fontSize: 12, color: "#f72585", lineHeight: 1.4 }}>
            {editError}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder="Ask AI to edit this thumbnail..."
          disabled={!hasCredits || editing}
          style={{ ...chatInputStyle, opacity: hasCredits ? 1 : 0.4 }}
        />
        <button
          onClick={handleSend}
          disabled={!hasCredits || editing || !inputText.trim()}
          style={btnStyle(!!hasCredits && !editing && !!inputText.trim())}
        >
          {editing ? <Loader2 size={14} className="spinner" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  )
}
