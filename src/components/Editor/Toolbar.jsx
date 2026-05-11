import { Type, Image, ArrowUp, ArrowDown, Trash2, Download, Wand2 } from "lucide-react"

export function Toolbar({ canvasRef, selectedObject, onAIEditToggle, onExport }) {
  const isText = selectedObject && ["textbox", "i-text"].includes(selectedObject.type)

  return (
    <div className="toolbar" style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 14px",
      background: "rgba(20,20,35,0.95)",
      borderBottom: "1px solid rgba(255,255,255,0.08)",
      flexWrap: "wrap",
    }}>
      <button onClick={() => canvasRef.current?.addText()}
        style={btnStyle}>
        <Type size={15} /> Text
      </button>

      <label style={btnStyle}>
        <Image size={15} /> Image
        <input type="file" accept="image/*" style={{ display: "none" }}
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) canvasRef.current?.addImage(URL.createObjectURL(f))
            e.target.value = ""
          }} />
      </label>

      <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.08)" }} />

      <button onClick={() => canvasRef.current?.moveLayerUp()}
        disabled={!selectedObject}
        style={btnStyle}>
        <ArrowUp size={15} />
      </button>
      <button onClick={() => canvasRef.current?.moveLayerDown()}
        disabled={!selectedObject}
        style={btnStyle}>
        <ArrowDown size={15} />
      </button>

      <button onClick={() => canvasRef.current?.removeSelected()}
        disabled={!selectedObject}
        style={{ ...btnStyle, color: selectedObject ? "#ef4444" : "rgba(255,255,255,0.2)" }}>
        <Trash2 size={15} />
      </button>

      <div style={{ flex: 1 }} />

      <button onClick={onAIEditToggle}
        style={{ ...btnStyle, background: "rgba(147,51,234,0.2)", color: "#a78bfa" }}>
        <Wand2 size={15} /> AI Edit
      </button>

      <button onClick={onExport}
        style={{ ...btnStyle, background: "rgba(34,197,94,0.2)", color: "#4ade80" }}>
        <Download size={15} /> Export
      </button>
    </div>
  )
}

const btnStyle = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "6px 12px", borderRadius: 8,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.8)",
  fontSize: 12, fontWeight: 600, cursor: "pointer",
  fontFamily: "'Space Mono', monospace",
  transition: "all 0.15s",
  outline: "none",
}
