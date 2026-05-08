import { useState, useRef, useCallback, useEffect } from "react";
import { loadBgRemovalModel, removeBackground, isModelLoaded } from "./backgroundRemoval";
import { fetchTranscript, formatTranscript, fetchVideoTitle } from "./transcript";

const STEPS = ["input", "analyze", "concepts", "craft"];
const STEP_LABELS = ["Video Input", "Analysis", "Concepts", "Craft"];

const AI_MODEL = "openai/gpt-4o-mini";

const VIDEO_ANALYZE_SYSTEM = `You are an expert YouTube strategist and thumbnail designer. Analyze the video using the thumbnail image and any provided context (transcript or title) to understand the video's content, audience, and visual potential.

If a transcript is provided, use it for deep content understanding. If not, infer everything from the thumbnail image and video title.

Return ONLY valid JSON:
{
  "summary": "2-3 sentence summary of what this video is about",
  "topics": ["key topics or themes"],
  "tone": "overall emotional tone (e.g. exciting, educational, controversial, funny, shocking, mysterious)",
  "target_audience": "who this video is for",
  "key_moments": [
    {
      "timestamp_seconds": 0,
      "description": "what happens at this moment (infer from thumbnail/title if no transcript)",
      "thumbnail_potential": "why this would make a compelling thumbnail visual"
    }
  ],
  "suggested_visual_direction": "creative brief for the thumbnail designer — what visual approach would best capture this video's essence"
}`;

const CONCEPT_GENERATE_SYSTEM = `You are a world-class YouTube thumbnail concept designer. Given a video's analysis and its transcript, generate 3-4 distinct thumbnail concepts.

Each concept must be visually distinct — different compositions, different focal points, different emotional angles.

Return ONLY valid JSON:
{
  "concepts": [
    {
      "headline": "SHORT PUNCHY TEXT (2-4 words)",
      "description": "visual description of what this thumbnail looks like",
      "composition_notes": "how elements are arranged — subject position, text placement, depth layers",
      "requested_assets": [
        "description of image the user needs to provide (e.g. 'host pointing at camera with shocked expression')",
        "description of another needed image if applicable"
      ],
      "emotional_hook": "why this concept grabs attention"
    }
  ]
}`;

const COMPOSE_SYSTEM = `You are a world-class YouTube thumbnail designer. Given extracted subject images (transparent backgrounds), a selected concept, and video analysis, produce a multi-layer 1280x720 composition.

The subject images have their backgrounds already removed. They are labeled as "extracted_subject_0", "extracted_subject_1" etc.

Return ONLY valid JSON:
{
  "headline_text": "Short punchy headline (2-4 words max)",
  "subtext": "Optional smaller supporting text or empty string",
  "layers": [
    {
      "type": "background",
      "gradient": { "angle": 135, "colors": ["#hex1", "#hex2", "#hex3"] }
    },
    {
      "type": "subject",
      "index": 0,
      "x": 60,
      "y": 100,
      "scale": 1.0,
      "rotation": 0,
      "z_index": 1,
      "blend_mode": "normal",
      "opacity": 1.0,
      "filter": "contrast(1.1) saturate(1.2)"
    },
    {
      "type": "text",
      "text": "headline",
      "font": "Bebas Neue",
      "font_size": 72,
      "color": "#ffffff",
      "stroke_color": "#000000",
      "stroke_width": 4,
      "shadow": "2px 2px 10px rgba(0,0,0,0.8)",
      "position": { "x": 60, "y": 280 },
      "max_width": 920,
      "text_align": "left",
      "z_index": 5
    }
  ],
  "effects": {
    "vignette_strength": 0.6,
    "grain_opacity": 0.05,
    "border_glow": true,
    "border_glow_color": "#f72585"
  }
}`;

const CRITIQUE_SYSTEM = `You are a critical YouTube thumbnail reviewer. Analyze the rendered thumbnail image and its composition data.

Score from 1-10 based on:
- Visual impact and scroll-stopping power
- Text readability and hierarchy
- Subject/background contrast
- Color harmony and emotional fit
- Composition balance and focal point
- Adherence to the video's content/tone

Return ONLY valid JSON:
{
  "score": 7,
  "issues": ["specific problem 1", "specific problem 2"],
  "strengths": ["what works well 1", "what works well 2"],
  "suggestions": "brief actionable advice to improve this thumbnail",
  "refined_layers": [
    { ... same layer structure as input, with improvements applied ... }
  ]
}`;

const toBase64 = (file) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

const resizeImage = (base64, maxDim = 512) =>
  new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      res(c.toDataURL("image/jpeg", 0.8).split(",")[1]);
    };
    img.src = `data:image/jpeg;base64,${base64}`;
  });

const resizeToPng = (dataUrl, maxDim = 800) =>
  new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      res(c.toDataURL("image/png"));
    };
    img.src = dataUrl;
  });

function extractVideoId(input) {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname === "youtu.be") return url.pathname.slice(1).split("/")[0].slice(0, 11);
    if (url.searchParams.has("v")) return url.searchParams.get("v");
    const match = url.pathname.match(/\/(embed|v|shorts|live)\/([a-zA-Z0-9_-]{11})/);
    if (match) return match[2];
  } catch {}
  const m = trimmed.match(/[a-zA-Z0-9_-]{11}/);
  return m ? m[0] : null;
}

function fetchYtThumbnail(videoId) {
  return new Promise((resolve, reject) => {
    const tryLoad = (quality, fallback) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (img.naturalWidth <= 120 && fallback) { tryLoad(fallback, null); return; }
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        try {
          const b64 = c.toDataURL("image/jpeg", 0.85).split(",")[1];
          resolve({ base64: b64, preview: c.toDataURL("image/jpeg", 0.85), videoId });
        } catch { reject(new Error("CORS blocked")); }
      };
      img.onerror = () => {
        if (fallback) tryLoad(fallback, null);
        else reject(new Error(`Not found: ${videoId}`));
      };
      img.src = `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
    };
    tryLoad("maxresdefault", "hqdefault");
  });
}

function loadImage(src) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

async function callAI(messages, maxTokens = 4000) {
  const resp = await fetch("/api/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: maxTokens,
      messages,
    }),
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);
  const text = data.choices?.[0]?.message?.content || "";
  let parsed;
  try { parsed = JSON.parse(text.replace(/```json|```/g, "").trim()); }
  catch { const m = text.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); else throw new Error("AI response parse failed"); }
  return parsed;
}

function ImageCard({ src, onRemove, label, small, videoId, transparent }) {
  return (
    <div style={{
      position: "relative", borderRadius: 10, overflow: "hidden",
      background: transparent
        ? "repeating-conic-gradient(rgba(255,255,255,0.08) 0% 25%, transparent 0% 50%) 0 0 / 16px 16px"
        : "#1a1a2e",
      border: "1px solid rgba(255,255,255,0.08)",
      width: small ? 152 : 180, height: small ? 85 : 101, flexShrink: 0,
    }}>
      <img src={src} alt={label} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      {onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} style={{
          position: "absolute", top: 4, right: 4,
          background: "rgba(0,0,0,0.75)", border: "none", color: "#fff",
          borderRadius: "50%", width: 22, height: 22, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
        }}>×</button>
      )}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        background: "linear-gradient(transparent, rgba(0,0,0,0.85))",
        padding: "14px 8px 5px", fontSize: 10, color: "rgba(255,255,255,0.7)",
        textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
      }}>
        {videoId && <span style={{ color: "#f72585" }}>▶</span>}
        {label}
      </div>
    </div>
  );
}

function DropZone({ onFiles, children, accept, multiple, style: extraStyle }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]); }}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? "#f72585" : "rgba(255,255,255,0.12)"}`,
        borderRadius: 14, padding: 24, textAlign: "center", cursor: "pointer",
        transition: "all 0.3s",
        background: dragging ? "rgba(247,37,133,0.05)" : "rgba(255,255,255,0.015)",
        ...extraStyle,
      }}
    >
      <input ref={inputRef} type="file" accept={accept || "image/*"} multiple={multiple}
        style={{ display: "none" }}
        onChange={(e) => { if (e.target.files.length) onFiles([...e.target.files]); e.target.value = ""; }}
      />
      {children}
    </div>
  );
}

function Stepper({ step, onStep, steps, labels }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 28, flexWrap: "wrap" }}>
      {steps.map((s, i) => (
        <div key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button onClick={() => onStep(i)} style={{
            background: i === step ? "linear-gradient(135deg, #f72585, #7209b7)" : i < step ? "rgba(114,9,183,0.3)" : "rgba(255,255,255,0.05)",
            border: "none", color: i <= step ? "#fff" : "rgba(255,255,255,0.3)",
            borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: i === step ? 700 : 500,
            cursor: i <= step ? "pointer" : "default", transition: "all 0.3s",
            fontFamily: "'Space Mono', monospace",
          }}>
            {i + 1}. {labels[i]}
          </button>
          {i < steps.length - 1 && <div style={{ width: 16, height: 1, background: "rgba(255,255,255,0.08)" }} />}
        </div>
      ))}
    </div>
  );
}

function ConceptCard({ concept, selected, onSelect, index }) {
  return (
    <div onClick={() => onSelect(index)} style={{
      background: selected ? "rgba(247,37,133,0.08)" : "rgba(255,255,255,0.02)",
      border: selected ? "2px solid #f72585" : "1px solid rgba(255,255,255,0.07)",
      borderRadius: 14, padding: 18, cursor: "pointer",
      transition: "all 0.2s", position: "relative", flex: "1 1 280px",
    }}>
      {selected && <div style={{
        position: "absolute", top: 10, right: 10,
        background: "#f72585", color: "#fff", borderRadius: "50%",
        width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 700,
      }}>✓</div>}
      <div style={{
        display: "inline-block", background: "rgba(247,37,133,0.12)", color: "#f72585",
        borderRadius: 8, padding: "2px 10px", fontSize: 10, fontWeight: 700,
        fontFamily: "'Space Mono', monospace", marginBottom: 8,
      }}>CONCEPT {index + 1}</div>
      <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginBottom: 6, lineHeight: 1.15 }}>
        {concept.headline}
      </div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginBottom: 10 }}>
        {concept.description}
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.6, marginBottom: 10 }}>
        <strong style={{ color: "rgba(255,255,255,0.6)" }}>Hook:</strong> {concept.emotional_hook}
      </div>
      {concept.requested_assets?.length > 0 && (
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
          <strong style={{ color: "rgba(255,255,255,0.5)" }}>Needs images of:</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
            {concept.requested_assets.map((a, i) => <li key={i} style={{ marginBottom: 2 }}>{a}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

const btn = (active, loading) => ({
  background: active ? "linear-gradient(135deg, #f72585, #7209b7)" : "rgba(255,255,255,0.05)",
  border: "none", color: active ? "#fff" : "rgba(255,255,255,0.3)", borderRadius: 12,
  padding: "13px 28px", fontSize: 14, fontWeight: 700, cursor: active ? "pointer" : "not-allowed",
  fontFamily: "'Space Mono', monospace", transition: "all 0.3s", opacity: loading ? 0.7 : 1,
});

const inputStyle = {
  width: "100%", boxSizing: "border-box",
  background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 14,
  fontFamily: "'Space Mono', monospace", outline: "none",
};

async function renderLayers(ctx, composed, extracted, sourceImgs, analysis, headline) {
  const layers = [...(composed.layers || [])].sort((a, b) => a.z_index - b.z_index);

  if (!layers.length) {
    renderLegacy(ctx, composed, sourceImgs, analysis, headline);
    return;
  }

  const cache = {};

  for (const layer of layers) {
    ctx.save();

    switch (layer.type) {
      case "background": {
        const bgColors = ["#1a1a2e", "#16213e"];
        const colors = layer.gradient?.colors || bgColors;
        const angle = layer.gradient?.angle || 135;
        const rad = (angle * Math.PI) / 180;
        const len = Math.sqrt(1280 * 1280 + 720 * 720) / 2;
        const cx = 640, cy = 360;
        const x1 = cx - Math.cos(rad) * len;
        const y1 = cy - Math.sin(rad) * len;
        const x2 = cx + Math.cos(rad) * len;
        const y2 = cy + Math.sin(rad) * len;
        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
        colors.forEach((c, i) => grad.addColorStop(i / Math.max(colors.length - 1, 1), c));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1280, 720);
        break;
      }

      case "subject": {
        const srcData = extracted[layer.index]?.dataUrl || sourceImgs[layer.index]?.preview;
        if (!srcData) break;
        if (!cache[srcData]) cache[srcData] = await loadImage(srcData);
        const img = cache[srcData];
        if (!img) break;

        if (layer.filter) ctx.filter = layer.filter;
        if (layer.opacity !== undefined) ctx.globalAlpha = layer.opacity;
        if (layer.blend_mode && layer.blend_mode !== "normal") {
          ctx.globalCompositeOperation = layer.blend_mode;
        }

        const scale = layer.scale || 1;
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        let x, y;
        if (layer.x === "center") x = (1280 - w) / 2;
        else if (typeof layer.x === "number") x = layer.x;
        else x = 0;
        if (layer.y === "center") y = (720 - h) / 2;
        else if (typeof layer.y === "number") y = layer.y;
        else y = 0;

        if (layer.rotation) {
          ctx.translate(x + w / 2, y + h / 2);
          ctx.rotate((layer.rotation * Math.PI) / 180);
          ctx.translate(-(x + w / 2), -(y + h / 2));
        }

        ctx.drawImage(img, x, y, w, h);
        break;
      }

      case "text": {
        const text = layer.text === "headline"
          ? headline || composed.headline_text || ""
          : layer.text || "";
        if (!text) break;

        const fontSize = layer.font_size || 68;
        const fontFamily = layer.font || "Impact";
        const maxW = layer.max_width || 920;
        const align = layer.text_align || "left";

        ctx.font = `900 ${fontSize}px "${fontFamily}", Impact, sans-serif`;
        ctx.textBaseline = "top";
        ctx.textAlign = align;

        const words = text.toUpperCase().split(" ");
        const lines = [];
        let line = "";
        for (const w of words) {
          const test = line ? line + " " + w : w;
          if (ctx.measureText(test).width > maxW && line) {
            lines.push(line);
            line = w;
          } else {
            line = test;
          }
        }
        if (line) lines.push(line);

        const lh = fontSize * 1.12;
        let startX = typeof layer.position?.x === "number" ? layer.position.x : 60;
        let startY = typeof layer.position?.y === "number"
          ? layer.position.y
          : (720 - lines.length * lh) / 2;

        if (align === "center") startX = 640;
        else if (align === "right") startX = 1220;

        ctx.save();

        if (layer.shadow) {
          const parts = layer.shadow.match(/([-\d.]+)px/g);
          if (parts?.length >= 3) {
            ctx.shadowOffsetX = parseFloat(parts[0]);
            ctx.shadowOffsetY = parseFloat(parts[1]);
            ctx.shadowBlur = parseFloat(parts[2]);
            const sc = layer.shadow.match(/(#[0-9a-fA-F]+|rgba?\([^)]+\))/);
            ctx.shadowColor = sc ? sc[0] : "rgba(0,0,0,0.8)";
          }
        }

        lines.forEach((ln, li) => {
          const y = startY + li * lh;
          if (layer.stroke_width) {
            ctx.strokeStyle = layer.stroke_color || "#000";
            ctx.lineWidth = layer.stroke_width;
            ctx.lineJoin = "round";
            ctx.strokeText(ln, startX, y);
          }
          ctx.fillStyle = layer.color || "#fff";
          ctx.fillText(ln, startX, y);
        });

        ctx.restore();
        break;
      }
    }

    ctx.restore();
  }

  const eff = composed.effects || {};
  if (eff.vignette_strength) {
    const vg = ctx.createRadialGradient(640, 360, 200, 640, 360, 900);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, `rgba(0,0,0,${eff.vignette_strength})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, 1280, 720);
  }

  const tg = ctx.createLinearGradient(0, 0, 700, 0);
  tg.addColorStop(0, "rgba(0,0,0,0.55)");
  tg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = tg;
  ctx.fillRect(0, 0, 1280, 720);

  if ((eff.grain_opacity || 0) > 0) {
    const gc = document.createElement("canvas");
    gc.width = 1280;
    gc.height = 720;
    const gctx = gc.getContext("2d");
    const id = gctx.createImageData(1280, 720);
    for (let p = 0; p < id.data.length; p += 4) {
      const v = Math.random() * 255;
      id.data[p] = id.data[p + 1] = id.data[p + 2] = v;
      id.data[p + 3] = 255;
    }
    gctx.putImageData(id, 0, 0);
    ctx.save();
    ctx.globalAlpha = eff.grain_opacity;
    ctx.globalCompositeOperation = "overlay";
    ctx.drawImage(gc, 0, 0);
    ctx.restore();
  }

  if (eff.border_glow) {
    ctx.save();
    const bc = eff.border_glow_color || "#f72585";
    ctx.shadowColor = bc;
    ctx.shadowBlur = 50;
    ctx.strokeStyle = bc;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(20, 20, 1240, 680, 16);
    ctx.stroke();
    ctx.restore();
  }
}

function renderLegacy(ctx, composed, sourceImgs, analysis, headline) {
  const bgColors = ["#1a1a2e", "#16213e"];
  const accent = composed.accent_color || "#f72585";

  const grad = ctx.createLinearGradient(0, 0, 1280, 720);
  bgColors.forEach((c, i) => grad.addColorStop(i / Math.max(bgColors.length - 1, 1), c));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1280, 720);

  const displayText = headline || composed?.headline_text || "YOUR HEADLINE";
  const fontSize = composed.text_font_size || 68;
  const fonts = ["Impact"];

  ctx.font = `900 ${fontSize}px ${fonts[0]}, Impact, sans-serif`;
  ctx.textBaseline = "top";
  const words = displayText.toUpperCase().split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > 920 && line) { lines.push(line); line = w; } else { line = test; }
  }
  if (line) lines.push(line);

  const lh = fontSize * 1.12;
  const totalH = lines.length * lh;
  const startY = (720 - totalH) / 2;

  ctx.save();
  if (composed.text_shadow) {
    const parts = composed.text_shadow.match(/([-\d.]+)px/g);
    if (parts?.length >= 3) {
      ctx.shadowOffsetX = parseFloat(parts[0]);
      ctx.shadowOffsetY = parseFloat(parts[1]);
      ctx.shadowBlur = parseFloat(parts[2]);
      ctx.shadowColor = composed.text_shadow.match(/(#[0-9a-fA-F]+|rgba?\([^)]+\))/)?.[0] || "rgba(0,0,0,0.8)";
    }
  }

  lines.forEach((ln, li) => {
    const y = startY + li * lh;
    if (composed.text_stroke_width) {
      ctx.strokeStyle = composed.text_stroke_color || accent;
      ctx.lineWidth = composed.text_stroke_width;
      ctx.lineJoin = "round";
      ctx.strokeText(ln, 60, y);
    }
    ctx.fillStyle = composed.text_color || "#ffffff";
    ctx.fillText(ln, 60, y);
  });

  if (composed?.subtext) {
    ctx.shadowColor = "transparent";
    ctx.font = `700 ${Math.round(fontSize * 0.35)}px ${fonts[0]}, sans-serif`;
    ctx.fillStyle = composed.subtext_color || accent;
    ctx.fillText(composed.subtext.toUpperCase(), 60, startY + totalH + 16);
  }
  ctx.restore();
}

export default function ThumbCraft() {
  const [step, setStep] = useState(0);
  const [videoUrl, setVideoUrl] = useState("");
  const [transcript, setTranscript] = useState(null);
  const [transcriptText, setTranscriptText] = useState("");
  const [videoThumbnail, setVideoThumbnail] = useState(null);
  const [refs, setRefs] = useState([]);
  const [ytLoading, setYtLoading] = useState(false);
  const [ytStatus, setYtStatus] = useState("");

  const [analyzing, setAnalyzing] = useState(false);
  const [videoAnalysis, setVideoAnalysis] = useState(null);

  const [generatingConcepts, setGeneratingConcepts] = useState(false);
  const [concepts, setConcepts] = useState([]);
  const [selectedConcept, setSelectedConcept] = useState(null);

  const [sourceImages, setSourceImages] = useState([]);
  const [extractedSubjects, setExtractedSubjects] = useState([]);
  const [extracting, setExtracting] = useState(false);
  const [modelStatus, setModelStatus] = useState("");
  const [selectedSubjects, setSelectedSubjects] = useState(new Set());
  const [headlineText, setHeadlineText] = useState("");

  const [composing, setComposing] = useState(false);
  const [composed, setComposed] = useState(null);
  const [critiquing, setCritiquing] = useState(false);
  const [critiqueIteration, setCritiqueIteration] = useState(0);
  const [critiqueResult, setCritiqueResult] = useState(null);
  const [finalScore, setFinalScore] = useState(null);

  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const canvasRef = useRef();
  const [canvasReady, setCanvasReady] = useState(false);

  const videoId = videoUrl ? extractVideoId(videoUrl) : null;

  const addRefs = useCallback(async (files) => {
    setError("");
    const newRefs = [];
    for (const f of files) {
      if (refs.length + newRefs.length >= 15) break;
      const b64 = await toBase64(f);
      const small = await resizeImage(b64, 512);
      newRefs.push({ base64: small, preview: URL.createObjectURL(f), source: "upload" });
    }
    setRefs((prev) => [...prev, ...newRefs]);
  }, [refs]);

  const analyzeVideo = async () => {
    if (!videoId) { setError("Enter a valid YouTube URL"); return; }
    setAnalyzing(true); setError(""); setStatus("Fetching video info...");
    try {
      const thumb = await fetchYtThumbnail(videoId);
      setVideoThumbnail(thumb);

      setStatus("Fetching video title...");
      const title = await fetchVideoTitle(videoId);

      setStatus("Fetching transcript...");
      const segments = await fetchTranscript(videoId);
      const formatted = formatTranscript(segments, 8000);
      setTranscript(segments);
      setTranscriptText(formatted);

      setStatus("Analyzing video content...");

      let prompt = "";
      if (formatted) {
        prompt = `Video title: ${title || "Unknown"}\n\nTranscript:\n${formatted}`;
      } else {
        prompt = `Video title: ${title || "Unknown"}\n\nNo transcript available. Analyze the video thumbnail image to understand the video's content, tone, and visual direction for thumbnail creation.`;
      }
      prompt += "\n\nAnalyze this video for thumbnail creation. Return ONLY JSON.";

      const content = [
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${thumb.base64}` } },
        { type: "text", text: prompt },
      ];

      const result = await callAI([
        { role: "system", content: VIDEO_ANALYZE_SYSTEM },
        { role: "user", content },
      ], 3000);

      setVideoAnalysis(result);
      setStep(1);
    } catch (e) { setError(`Analysis failed: ${e.message}`); }
    finally { setAnalyzing(false); setStatus(""); }
  };

  const generateConcepts = async () => {
    setGeneratingConcepts(true); setError(""); setStatus("Generating concepts...");
    try {
      let conceptPrompt = `Video Analysis:\n${JSON.stringify(videoAnalysis, null, 2)}\n\nTranscript:\n${transcriptText.slice(0, 4000)}`;

      if (refs.length > 0) {
        conceptPrompt += `\n\nReference style analysis not available, but ${refs.length} reference thumbnails were provided. Consider their style in your concepts.`;
      }

      const result = await callAI([
        { role: "system", content: CONCEPT_GENERATE_SYSTEM },
        { role: "user", content: [{ type: "text", text: conceptPrompt }] },
      ], 4000);

      if (result.concepts) {
        setConcepts(result.concepts);
        setSelectedConcept(0);
        if (result.concepts[0]?.headline) setHeadlineText(result.concepts[0].headline);
      } else {
        throw new Error("No concepts returned");
      }
      setStep(2);
    } catch (e) { setError(`Concept generation failed: ${e.message}`); }
    finally { setGeneratingConcepts(false); setStatus(""); }
  };

  const addSources = useCallback(async (files) => {
    setError("");
    const newSrcs = [];
    for (const f of files) {
      if (sourceImages.length + newSrcs.length >= 4) break;
      const b64 = await toBase64(f);
      newSrcs.push({ base64: b64, preview: URL.createObjectURL(f) });
    }
    setSourceImages((prev) => [...prev, ...newSrcs]);
  }, [sourceImages]);

  const startExtraction = async () => {
    setExtracting(true); setError(""); setModelStatus("Loading AI model...");
    try {
      await loadBgRemovalModel((p) => {
        if (p.status === "download") {
          setModelStatus(`Downloading model (176MB) ... ${p.progress ? Math.round(p.progress * 100) + "%" : ""}`);
        } else if (p.status === "progress") {
          setModelStatus("Processing...");
        }
      });
      setModelStatus("Removing backgrounds...");
      const results = [];
      for (let i = 0; i < sourceImages.length; i++) {
        setModelStatus(`Extracting subject ${i + 1}/${sourceImages.length}...`);
        const small = await resizeToPng(sourceImages[i].preview, 800);
        const result = await removeBackground(small);
        results.push({ dataUrl: result, sourceIndex: i });
      }
      setExtractedSubjects(results);
      setSelectedSubjects(new Set(results.map((_, i) => i)));
      setModelStatus(`Extracted ${results.length} subject${results.length > 1 ? "s" : ""}`);
      setTimeout(() => setModelStatus(""), 3000);
    } catch (e) {
      setError(`Extraction failed: ${e.message}`);
      console.error(e);
    }
    setExtracting(false);
  };

  const toggleSubject = (idx) => {
    const next = new Set(selectedSubjects);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    setSelectedSubjects(next);
  };

  const craftThumbnail = async () => {
    setComposing(true); setError(""); setStatus("Composing thumbnail...");
    setCritiqueIteration(0);
    setCritiqueResult(null);
    setFinalScore(null);
    try {
      const content = [];
      const subjectsToSend = extractedSubjects.length > 0
        ? [...selectedSubjects].map((i) => extractedSubjects[i])
        : [];

      if (subjectsToSend.length > 0) {
        for (const s of subjectsToSend) {
          const resized = await resizeToPng(s.dataUrl, 512);
          content.push({ type: "image_url", image_url: { url: resized } });
        }
      } else {
        for (const s of sourceImages) {
          const small = await resizeImage(s.base64, 800);
          content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${small}` } });
        }
      }

      const selectedConceptData = concepts[selectedConcept] || {};
      content.push({
        type: "text",
        text: `${subjectsToSend.length > 0 ? subjectsToSend.length + " extracted subject(s)" : sourceImages.length + " source image(s)"}\nConcept: ${JSON.stringify(selectedConceptData)}\nVideo Analysis: ${JSON.stringify(videoAnalysis)}\nHeadline: "${headlineText || selectedConceptData.headline || ""}"\nReturn ONLY JSON.`,
      });

      const result = await callAI([
        { role: "system", content: COMPOSE_SYSTEM },
        { role: "user", content },
      ], 4000);

      setComposed(result);
      if (result.headline_text && !headlineText) setHeadlineText(result.headline_text);
      setStep(3);
    } catch (e) { setError(`Composition failed: ${e.message}`); }
    finally { setComposing(false); setStatus(""); }
  };

  useEffect(() => {
    if (step !== 3 || !composed || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = 1280;
    canvas.height = 720;

    (async () => {
      await renderLayers(ctx, composed, extractedSubjects, sourceImages, videoAnalysis, headlineText);
      setCanvasReady(true);
    })();
  }, [step, composed, videoAnalysis, sourceImages, extractedSubjects, headlineText]);

  const runCritique = async () => {
    if (!canvasRef.current || critiqueIteration >= 3) return;
    setCritiquing(true); setError(""); setStatus(`Critique iteration ${critiqueIteration + 1}/3...`);
    try {
      const dataUrl = canvasRef.current.toDataURL("image/jpeg", 0.85);
      const result = await callAI([
        { role: "system", content: CRITIQUE_SYSTEM },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl } },
            { type: "text", text: `Current composition:\n${JSON.stringify(composed, null, 2)}\n\nCritique this thumbnail and return refined_layers to improve it. Score it 1-10. Return ONLY JSON.` },
          ],
        },
      ], 4000);

      setCritiqueResult(result);
      setFinalScore(result.score);

      if (result.score >= 8 || critiqueIteration >= 2) {
        setCritiquing(false);
        setStatus("Finished! Score: " + result.score + "/10");
        setTimeout(() => setStatus(""), 3000);
        return;
      }

      if (result.refined_layers && Array.isArray(result.refined_layers) && result.refined_layers.length > 0) {
        const updated = { ...composed, layers: result.refined_layers };
        setComposed(updated);
        setCritiqueIteration((prev) => prev + 1);
      }
    } catch (e) { setError(`Critique failed: ${e.message}`); }
    setCritiquing(false);
  };

  useEffect(() => {
    if (step === 3 && canvasReady && critiqueIteration === 0 && !critiquing && !critiqueResult) {
      runCritique();
    }
  }, [step, canvasReady, critiqueIteration]);

  useEffect(() => {
    if (critiqueIteration > 0 && canvasReady && !critiquing) {
      const timer = setTimeout(() => runCritique(), 500);
      return () => clearTimeout(timer);
    }
  }, [critiqueIteration, canvasReady]);

  const exportThumbnail = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = "thumbnail-1280x720.png";
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#08080f", color: "#e0e0ec",
      fontFamily: "'DM Sans', -apple-system, sans-serif", padding: "20px 24px",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: "linear-gradient(135deg, #f72585, #7209b7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 17, boxShadow: "0 4px 20px rgba(247,37,133,0.3)",
        }}>▶</div>
        <div>
          <h1 style={{
            margin: 0, fontSize: 21, fontWeight: 700, fontFamily: "'Space Mono', monospace",
            background: "linear-gradient(135deg, #f72585, #b5179e, #7209b7)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>ThumbCraft</h1>
          <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "'Space Mono', monospace" }}>
            YouTube-first thumbnail generator from video transcripts
          </p>
        </div>
      </div>

      <Stepper step={step} onStep={(s) => { if (s <= step || (s === 1 && videoAnalysis) || (s === 2 && concepts.length) || (s === 3 && composed)) setStep(s); }} steps={STEPS} labels={STEP_LABELS} />

      {error && (
        <div style={{
          background: "rgba(247,37,133,0.08)", border: "1px solid rgba(247,37,133,0.25)",
          borderRadius: 10, padding: "10px 16px", marginBottom: 18, fontSize: 13, color: "#f72585",
        }}>{error}</div>
      )}

      {status && (
        <div style={{
          background: "rgba(114,9,183,0.08)", border: "1px solid rgba(114,9,183,0.2)",
          borderRadius: 10, padding: "10px 16px", marginBottom: 18, fontSize: 13, color: "#b5179e",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{
            width: 14, height: 14, border: "2px solid #b5179e", borderTopColor: "transparent",
            borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0,
          }} />
          {status}
        </div>
      )}

      {/* ==================== STEP 0: INPUT ==================== */}
      {step === 0 && (
        <div>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 20, lineHeight: 1.6 }}>
            Paste a <strong style={{ color: "#fff" }}>YouTube video link</strong> to analyze its content and generate a custom thumbnail.
          </p>

          <div style={{
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14, padding: 20, marginBottom: 16,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 18 }}>🎬</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>YouTube Video</span>
            </div>

            <input type="text" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              style={inputStyle} />

            <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.2)", lineHeight: 1.5 }}>
              Supports: youtube.com/watch, youtu.be, /shorts/, /embed/, /live/ links or raw video ID
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "'Space Mono', monospace" }}>OPTIONAL: STYLE REFERENCES</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
          </div>

          <DropZone onFiles={addRefs} multiple accept="image/*" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>🎨</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>Upload reference thumbnail images (optional)</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>Helps match a specific style</div>
          </DropZone>

          {refs.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "'Space Mono', monospace" }}>
                  {refs.length} REFERENCE{refs.length > 1 ? "S" : ""}
                </span>
                <button onClick={() => setRefs([])} style={{
                  background: "none", border: "none", color: "rgba(255,255,255,0.3)",
                  fontSize: 11, cursor: "pointer", fontFamily: "'Space Mono', monospace",
                }}>Clear</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {refs.map((r, i) => (
                  <ImageCard key={i} src={r.preview} small label={`Ref ${i + 1}`}
                    onRemove={() => setRefs((p) => p.filter((_, j) => j !== i))} />
                ))}
              </div>
            </div>
          )}

          <button onClick={analyzeVideo} disabled={analyzing || !videoId}
            style={btn(!!videoId && !analyzing, analyzing)}>
            {analyzing ? "Analyzing..." : "Analyze Video →"}
          </button>
        </div>
      )}

      {/* ==================== STEP 1: ANALYSIS ==================== */}
      {step === 1 && videoAnalysis && (
        <div>
          <div style={{
            background: "rgba(114,9,183,0.07)", border: "1px solid rgba(114,9,183,0.18)",
            borderRadius: 14, padding: 20, marginBottom: 22,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#b5179e", marginBottom: 8, fontFamily: "'Space Mono', monospace", letterSpacing: "0.1em" }}>VIDEO SUMMARY</div>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(255,255,255,0.75)", margin: 0 }}>{videoAnalysis.summary}</p>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 22 }}>
            <div style={{
              background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12, padding: 16, flex: "1 1 260px",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#f72585", marginBottom: 10, fontFamily: "'Space Mono', monospace" }}>Topics</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(videoAnalysis.topics || []).map((t, i) => (
                  <span key={i} style={{
                    background: "rgba(247,37,133,0.08)", color: "#f72585",
                    padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                  }}>{t}</span>
                ))}
              </div>
            </div>

            <div style={{
              background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12, padding: 16, flex: "1 1 160px",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#f72585", marginBottom: 10, fontFamily: "'Space Mono', monospace" }}>Tone</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", textTransform: "uppercase", fontFamily: "'Space Mono', monospace" }}>{videoAnalysis.tone}</div>
            </div>

            <div style={{
              background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12, padding: 16, flex: "1 1 200px",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#f72585", marginBottom: 10, fontFamily: "'Space Mono', monospace" }}>Audience</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>{videoAnalysis.target_audience}</div>
            </div>
          </div>

          {videoAnalysis.key_moments?.length > 0 && (
            <div style={{
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 14, padding: 18, marginBottom: 22,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#7209b7", marginBottom: 12, fontFamily: "'Space Mono', monospace" }}>KEY MOMENTS FOR THUMBNAIL</div>
              {videoAnalysis.key_moments.map((m, i) => (
                <div key={i} style={{
                  padding: "10px 0", borderBottom: i < videoAnalysis.key_moments.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                }}>
                  <div style={{ fontSize: 11, color: "#f72585", fontFamily: "'Space Mono', monospace", marginBottom: 3 }}>
                    @{Math.floor(m.timestamp_seconds / 60)}:{String(Math.floor(m.timestamp_seconds % 60)).padStart(2, "0")}
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginBottom: 3 }}>{m.description}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}>{m.thumbnail_potential}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{
            background: "rgba(247,37,133,0.03)", border: "1px solid rgba(247,37,133,0.12)",
            borderRadius: 14, padding: 18, marginBottom: 22,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#f72585", marginBottom: 8, fontFamily: "'Space Mono', monospace" }}>SUGGESTED VISUAL DIRECTION</div>
            <p style={{ fontSize: 13, lineHeight: 1.7, color: "rgba(255,255,255,0.6)", margin: 0 }}>{videoAnalysis.suggested_visual_direction}</p>
          </div>

          <button onClick={generateConcepts} disabled={generatingConcepts}
            style={btn(!generatingConcepts, generatingConcepts)}>
            {generatingConcepts ? "Generating Concepts..." : "Generate Thumbnail Concepts →"}
          </button>
        </div>
      )}

      {/* ==================== STEP 2: CONCEPTS ==================== */}
      {step === 2 && concepts.length > 0 && (
        <div>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 16, lineHeight: 1.6 }}>
            Select a concept and upload the images it needs.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 24 }}>
            {concepts.map((c, i) => (
              <ConceptCard key={i} concept={c} selected={selectedConcept === i}
                onSelect={(idx) => { setSelectedConcept(idx); if (concepts[idx]?.headline) setHeadlineText(concepts[idx].headline); }} index={i} />
            ))}
          </div>

          <div style={{
            background: "rgba(247,37,133,0.03)", border: "1px solid rgba(247,37,133,0.12)",
            borderRadius: 14, padding: 20,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
              Upload subject images
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 14, lineHeight: 1.5 }}>
              {concepts[selectedConcept]?.requested_assets?.length > 0 ? (
                <span>Based on your selected concept, we recommend: <strong style={{ color: "rgba(255,255,255,0.6)" }}>{concepts[selectedConcept].requested_assets.join(", ")}</strong></span>
              ) : "Upload photos of yourself, products, or anything to feature in the thumbnail."}
            </div>

            <DropZone onFiles={addSources} multiple accept="image/*" style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>📸</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>Drop your images here</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>up to 4 images</div>
            </DropZone>

            {sourceImages.length > 0 && (
              <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                {sourceImages.map((s, i) => (
                  <ImageCard key={i} src={s.preview} label={`Image ${i + 1}`}
                    onRemove={() => setSourceImages((p) => p.filter((_, j) => j !== i))} />
                ))}
              </div>
            )}

            {sourceImages.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <button onClick={startExtraction} disabled={extracting}
                  style={{
                    ...btn(!extracting, extracting), fontSize: 12, padding: "10px 20px",
                    background: isModelLoaded() && !extracting
                      ? "linear-gradient(135deg, #7209b7, #3a0ca3)"
                      : btn(!extracting, extracting).background,
                  }}>
                  {extracting ? modelStatus : extractedSubjects.length > 0
                    ? "Re-extract Subjects"
                    : "Remove Backgrounds (AI)"}
                </button>
                {modelStatus && !extracting && (
                  <span style={{ marginLeft: 10, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{modelStatus}</span>
                )}
              </div>
            )}

            {extractedSubjects.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 8, fontFamily: "'Space Mono', monospace" }}>
                  EXTRACTED SUBJECTS — click to toggle
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {extractedSubjects.map((s, i) => {
                    const sel = selectedSubjects.has(i);
                    return (
                      <div key={i} onClick={() => toggleSubject(i)} style={{
                        cursor: "pointer", opacity: sel ? 1 : 0.35,
                        transition: "all 0.2s",
                        border: sel ? "2px solid #f72585" : "2px solid transparent",
                        borderRadius: 10, overflow: "hidden",
                        width: 140, height: 90,
                        background: "repeating-conic-gradient(rgba(255,255,255,0.08) 0% 25%, transparent 0% 50%) 0 0 / 16px 16px",
                      }}>
                        <img src={s.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 6 }}>Headline</label>
              <input type="text" value={headlineText} onChange={(e) => setHeadlineText(e.target.value)}
                placeholder={concepts[selectedConcept]?.headline || "e.g. THIS CHANGES EVERYTHING"} style={inputStyle} />
            </div>

            <button onClick={craftThumbnail} disabled={composing || !sourceImages.length}
              style={btn(sourceImages.length > 0 && !composing, composing)}>
              {composing ? "Composing..." : "Craft Thumbnail →"}
            </button>

            {!sourceImages.length && (
              <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
                Upload at least one image to craft the thumbnail
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== STEP 3: CRAFT ==================== */}
      {step === 3 && (
        <div>
          <div style={{
            borderRadius: 14, overflow: "hidden",
            border: "2px solid rgba(255,255,255,0.08)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            maxWidth: 820, marginBottom: 20,
          }}>
            <canvas ref={canvasRef} style={{ width: "100%", height: "auto", display: "block" }} />
          </div>

          {critiqueResult && (
            <div style={{
              background: "rgba(114,9,183,0.07)", border: "1px solid rgba(114,9,183,0.18)",
              borderRadius: 14, padding: 18, marginBottom: 20,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{
                  fontSize: 32, fontWeight: 900, fontFamily: "'Space Mono', monospace",
                  color: critiqueResult.score >= 8 ? "#4ade80" : critiqueResult.score >= 6 ? "#fbbf24" : "#f72585",
                }}>{critiqueResult.score}/10</div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#b5179e", fontFamily: "'Space Mono', monospace", letterSpacing: "0.1em" }}>
                    {critiqueIteration === 0 ? "INITIAL CRITIQUE" : `CRITIQUE ITERATION ${critiqueIteration}`}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                    {critiqueResult.score >= 8 ? "✓ Target score reached" : critiqueIteration >= 3 ? "Max iterations reached" : "Refining..."}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 16, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 10, color: "#f72585", fontWeight: 700, marginBottom: 4, fontFamily: "'Space Mono', monospace" }}>ISSUES</div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>
                    {critiqueResult.issues?.map((iss, i) => <li key={i}>{iss}</li>)}
                  </ul>
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 10, color: "#4ade80", fontWeight: 700, marginBottom: 4, fontFamily: "'Space Mono', monospace" }}>STRENGTHS</div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>
                    {critiqueResult.strengths?.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              </div>

              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.6, fontStyle: "italic" }}>
                "{critiqueResult.suggestions}"
              </div>
            </div>
          )}

          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 6, fontFamily: "'Space Mono', monospace", textTransform: "uppercase" }}>Headline</label>
            <input type="text" value={headlineText} onChange={(e) => setHeadlineText(e.target.value)}
              style={{ ...inputStyle, maxWidth: 500 }} />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={exportThumbnail} style={btn(true, false)}>Export PNG (1280×720)</button>
            <button onClick={() => { setComposed(null); setCanvasReady(false); setCritiqueResult(null); setCritiqueIteration(0); setFinalScore(null); craftThumbnail(); }}
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", borderRadius: 12, padding: "13px 22px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Space Mono', monospace" }}>
              Regenerate
            </button>
            <button onClick={() => setStep(2)}
              style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)", borderRadius: 12, padding: "13px 22px", fontSize: 13, cursor: "pointer", fontFamily: "'Space Mono', monospace" }}>
              ← Back to Concepts
            </button>
          </div>
        </div>
      )}

      <div style={{
        marginTop: 48, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.04)",
        fontSize: 10, color: "rgba(255,255,255,0.15)", fontFamily: "'Space Mono', monospace",
      }}>
        Powered by OpenRouter · youtubetranscript.com · Transformers.js (RMBG-1.4) · 1280×720
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
