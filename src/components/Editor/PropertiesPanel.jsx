const FONTS = ["Impact", "Bebas Neue", "Oswald", "Montserrat", "Anton", "Arial Black"]

export function PropertiesPanel({ canvasRef, selectedObject }) {
  if (!selectedObject) {
    return (
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 20 }}>
        Select a layer to edit its properties
      </div>
    )
  }

  const isText = ["textbox", "i-text"].includes(selectedObject.type)
  const update = (props) => canvasRef.current?.updateObjectProps(props)

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.4)", marginBottom: 10, fontFamily: "'Space Mono', monospace" }}>
        Properties — {(isText ? "Text" : "Image").toUpperCase()}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

        {/* Position */}
        <div style={{ display: "flex", gap: 8 }}>
          <Field label="X">
            <input type="number" value={Math.round(selectedObject.left || 0)}
              onChange={e => update({ left: +e.target.value })}
              style={inputStyle} />
          </Field>
          <Field label="Y">
            <input type="number" value={Math.round(selectedObject.top || 0)}
              onChange={e => update({ top: +e.target.value })}
              style={inputStyle} />
          </Field>
        </div>

        {isText ? (
          <>
            {/* Font family */}
            <Field label="Font">
              <select value={selectedObject.fontFamily || "Impact"}
                onChange={e => update({ fontFamily: e.target.value })}
                style={selectStyle}>
                {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>

            {/* Font size */}
            <Field label="Size">
              <input type="range" min={12} max={200}
                value={selectedObject.fontSize || 80}
                onChange={e => update({ fontSize: +e.target.value })}
                style={{ flex: 1, accentColor: "#a78bfa" }} />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", width: 30, textAlign: "right" }}>
                {selectedObject.fontSize || 80}
              </span>
            </Field>

            {/* Fill color */}
            <Field label="Fill">
              <input type="color" value={selectedObject.fill || "#ffffff"}
                onChange={e => update({ fill: e.target.value })}
                style={{ width: 36, height: 28, borderRadius: 4, border: "none", cursor: "pointer", background: "none" }} />
            </Field>

            {/* Stroke color + width */}
            <Field label="Stroke">
              <input type="color" value={selectedObject.stroke || "#000000"}
                onChange={e => update({ stroke: e.target.value })}
                style={{ width: 36, height: 28, borderRadius: 4, border: "none", cursor: "pointer", background: "none" }} />
              <input type="range" min={0} max={10}
                value={selectedObject.strokeWidth || 0}
                onChange={e => update({ strokeWidth: +e.target.value })}
                style={{ flex: 1, accentColor: "#a78bfa" }} />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", width: 20, textAlign: "right" }}>
                {selectedObject.strokeWidth || 0}
              </span>
            </Field>

            {/* Text alignment */}
            <Field label="Align">
              <div style={{ display: "flex", gap: 4 }}>
                {["left", "center", "right"].map(a => (
                  <button key={a} onClick={() => update({ textAlign: a })}
                    style={{
                      padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                      background: (selectedObject.textAlign || "left") === a ? "rgba(147,51,234,0.3)" : "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      color: (selectedObject.textAlign || "left") === a ? "#a78bfa" : "rgba(255,255,255,0.5)",
                      cursor: "pointer", fontFamily: "'Space Mono', monospace",
                    }}>
                    {a[0].toUpperCase()}
                  </button>
                ))}
              </div>
            </Field>
          </>
        ) : (
          <>
            {/* Width / Height / Scale */}
            <Field label="Scale">
              <input type="range" min={0.1} max={3} step={0.05}
                value={selectedObject.scaleX || 1}
                onChange={e => update({ scaleX: +e.target.value, scaleY: +e.target.value })}
                style={{ flex: 1, accentColor: "#a78bfa" }} />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", width: 30, textAlign: "right" }}>
                {((selectedObject.scaleX || 1) * 100).toFixed(0)}%
              </span>
            </Field>

            {/* Opacity */}
            <Field label="Opacity">
              <input type="range" min={0} max={1} step={0.05}
                value={selectedObject.opacity ?? 1}
                onChange={e => update({ opacity: +e.target.value })}
                style={{ flex: 1, accentColor: "#a78bfa" }} />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", width: 30, textAlign: "right" }}>
                {Math.round((selectedObject.opacity ?? 1) * 100)}%
              </span>
            </Field>

            {/* Rotation */}
            <Field label="Rotate">
              <input type="range" min={-180} max={180}
                value={selectedObject.angle || 0}
                onChange={e => update({ angle: +e.target.value })}
                style={{ flex: 1, accentColor: "#a78bfa" }} />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", width: 30, textAlign: "right" }}>
                {Math.round(selectedObject.angle || 0)}°
              </span>
            </Field>
          </>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <label style={{
        fontSize: 10, color: "rgba(255,255,255,0.4)", width: 50, flexShrink: 0,
        fontFamily: "'Space Mono', monospace", textTransform: "uppercase",
      }}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
        {children}
      </div>
    </div>
  )
}

const inputStyle = {
  width: "100%", boxSizing: "border-box",
  background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6, padding: "4px 8px", color: "#fff", fontSize: 12,
  fontFamily: "'Space Mono', monospace", outline: "none",
}

const selectStyle = {
  flex: 1,
  background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6, padding: "4px 8px", color: "#fff", fontSize: 12,
  fontFamily: "'Space Mono', monospace", outline: "none", cursor: "pointer",
}
