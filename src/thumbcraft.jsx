import { useState, useRef, useCallback, useEffect } from "react";

const STEPS = ["references", "analyze", "compose", "export"];
const STEP_LABELS = ["Reference Thumbnails", "Style Analysis", "Compose", "Export"];

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

const ANALYZE_SYSTEM = `You are an expert YouTube thumbnail designer and visual analyst. You will be shown multiple reference thumbnails. Analyze them with EXTREME precision and depth. Return ONLY valid JSON, no markdown fences.

Your analysis must cover:
{
  "overall_style": "A rich 2-3 sentence description of the dominant visual style",
  "composition": {
    "layout": "describe the spatial layout pattern",
    "focal_point": "where the eye is drawn first",
    "depth": "how depth/layers are created",
    "negative_space": "how empty space is used"
  },
  "color_palette": {
    "dominant": ["#hex1", "#hex2", "#hex3"],
    "accent": ["#hex1", "#hex2"],
    "background_treatment": "gradient type, solid, pattern, etc",
    "contrast_level": "high/medium/low",
    "saturation": "oversaturated/natural/desaturated/mixed",
    "color_grading": "describe the color grade"
  },
  "typography": {
    "headline_style": "bold/italic/outlined/3d/shadowed/glitch etc",
    "font_weight": "ultra-bold/bold/medium/light",
    "text_effects": ["list effects like stroke, shadow, glow, gradient fill, 3D extrusion"],
    "text_position": "where text typically sits",
    "text_size_ratio": "large/medium/small",
    "recommended_fonts": ["2-3 Google Fonts that match"]
  },
  "photo_treatment": {
    "subject_cutout": true,
    "background_removal": true,
    "face_expressions": "exaggerated/natural/dramatic",
    "lighting": "describe lighting style",
    "filters": ["list visible filters"],
    "border_or_outline": "describe outlines around subjects",
    "blur_effects": "any bokeh, motion blur, radial blur"
  },
  "effects": {
    "overlays": ["light leaks, dust, grain, emoji, arrows, circles"],
    "shapes": ["geometric elements, borders, frames, badges"],
    "texture": "smooth/grainy/noisy/glossy",
    "glow_or_neon": true,
    "dramatic_shadows": true
  },
  "emotional_tone": "exciting/shocking/calm/luxurious/funny/educational/urgent",
  "thumbnail_recipe": "A step-by-step recipe to recreate this style from scratch. Be VERY specific."
}`;

const COMPOSE_SYSTEM = `You are a world-class thumbnail designer. Given a style analysis JSON and 1-2 source images, generate SPECIFIC composition instructions for a YouTube thumbnail (1280x720).

Return ONLY valid JSON:
{
  "headline_text": "Suggested compelling headline (short, punchy)",
  "subtext": "Optional smaller text",
  "css_filter_main": "CSS filter string for main/background image",
  "css_filter_subject": "CSS filter string for subject image",
  "background_css": "CSS background shorthand",
  "text_color": "#hex",
  "text_stroke_color": "#hex",
  "text_stroke_width": 3,
  "text_shadow": "CSS text-shadow value",
  "text_font_size": 72,
  "subtext_color": "#hex",
  "accent_color": "#hex",
  "vignette_strength": 0.6,
  "grain_opacity": 0.05,
  "border_glow": true,
  "border_glow_color": "#hex",
  "composition_notes": "Brief notes on image positioning"
}`;

function ImageCard({ src, onRemove, label, small, videoId }) {
  return (
    <div style={{
      position: "relative", borderRadius: 10, overflow: "hidden",
      background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.08)",
      width: small ? 152 : 180, height: small ? 85 : 101, flexShrink: 0,
    }}>
      <img src={src} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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

function Stepper({ step, onStep }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 28, flexWrap: "wrap" }}>
      {STEPS.map((s, i) => (
        <div key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button onClick={() => onStep(i)} style={{
            background: i === step ? "linear-gradient(135deg, #f72585, #7209b7)" : i < step ? "rgba(114,9,183,0.3)" : "rgba(255,255,255,0.05)",
            border: "none", color: i <= step ? "#fff" : "rgba(255,255,255,0.3)",
            borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: i === step ? 700 : 500,
            cursor: i <= step ? "pointer" : "default", transition: "all 0.3s",
            fontFamily: "'Space Mono', monospace",
          }}>
            {i + 1}. {STEP_LABELS[i]}
          </button>
          {i < STEPS.length - 1 && <div style={{ width: 16, height: 1, background: "rgba(255,255,255,0.08)" }} />}
        </div>
      ))}
    </div>
  );
}

function StyleCard({ title, children }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 12, padding: 16, flex: "1 1 260px",
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.12em", color: "#f72585", marginBottom: 10,
        fontFamily: "'Space Mono', monospace",
      }}>{title}</div>
      {children}
    </div>
  );
}

function ColorSwatch({ colors, label }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", gap: 4 }}>
        {(colors || []).map((c, i) => (
          <div key={i} title={c} style={{
            width: 26, height: 26, borderRadius: 6, background: c,
            border: "1px solid rgba(255,255,255,0.1)", boxShadow: `0 2px 8px ${c}44`,
          }} />
        ))}
      </div>
    </div>
  );
}

export default function ThumbCraft() {
  const [step, setStep] = useState(0);
  const [refs, setRefs] = useState([]);
  const [sourceImages, setSourceImages] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [composing, setComposing] = useState(false);
  const [composed, setComposed] = useState(null);
  const [headlineText, setHeadlineText] = useState("");
  const [error, setError] = useState("");
  const [analyzeProgress, setAnalyzeProgress] = useState("");
  const canvasRef = useRef();
  const [canvasReady, setCanvasReady] = useState(false);
  const [ytInput, setYtInput] = useState("");
  const [ytLoading, setYtLoading] = useState(false);
  const [ytStatus, setYtStatus] = useState("");

  const processYoutubeUrls = async () => {
    const lines = ytInput.split(/[\n,]+/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setYtLoading(true); setError("");
    let added = 0, failed = 0;
    const newRefs = [];

    for (const line of lines) {
      if (refs.length + newRefs.length >= 15) { setYtStatus("Reached 15 limit"); break; }
      const videoId = extractVideoId(line);
      if (!videoId) { failed++; continue; }
      setYtStatus(`Fetching ${added + failed + 1}/${lines.length}...`);
      try {
        const result = await fetchYtThumbnail(videoId);
        const small = await resizeImage(result.base64, 512);
        newRefs.push({ base64: small, preview: result.preview, videoId: result.videoId, source: "youtube" });
        added++;
      } catch { failed++; }
    }

    setRefs((prev) => [...prev, ...newRefs]);
    setYtInput("");
    setYtStatus(`Added ${added} thumbnail${added !== 1 ? "s" : ""}${failed ? `, ${failed} failed` : ""}`);
    setYtLoading(false);
    setTimeout(() => setYtStatus(""), 4000);
  };

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

  const addSources = useCallback(async (files) => {
    setError("");
    const newSrcs = [];
    for (const f of files) {
      if (sourceImages.length + newSrcs.length >= 2) break;
      const b64 = await toBase64(f);
      newSrcs.push({ base64: b64, preview: URL.createObjectURL(f) });
    }
    setSourceImages((prev) => [...prev, ...newSrcs]);
  }, [sourceImages]);

  const analyzeStyle = async () => {
    if (refs.length < 3) { setError("Add at least 3 reference thumbnails."); return; }
    setAnalyzing(true); setError(""); setAnalyzeProgress("Preparing images...");
    try {
      const content = refs.map((r) => ({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${r.base64}` },
      }));
      content.push({
        type: "text",
        text: `I've provided ${refs.length} YouTube thumbnail references. Analyze their COLLECTIVE visual style with extreme precision. Return ONLY raw JSON.`,
      });
      setAnalyzeProgress(`Analyzing ${refs.length} thumbnails...`);
      const resp = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", max_tokens: 4000,
          messages: [
            { role: "system", content: ANALYZE_SYSTEM },
            { role: "user", content },
          ],
        }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error.message);
      const text = data.choices?.[0]?.message?.content || "";
      let parsed;
      try { parsed = JSON.parse(text.replace(/```json|```/g, "").trim()); }
      catch { const m = text.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); else throw new Error("Parse failed"); }
      setAnalysis(parsed); setStep(1);
    } catch (e) { setError(`Analysis failed: ${e.message}`); }
    finally { setAnalyzing(false); setAnalyzeProgress(""); }
  };

  const composeThumbnail = async () => {
    if (!sourceImages.length) { setError("Add at least 1 source image."); return; }
    setComposing(true); setError("");
    try {
      const content = [];
      for (const s of sourceImages) {
        const small = await resizeImage(s.base64, 800);
        content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${small}` } });
      }
      content.push({
        type: "text",
        text: `${sourceImages.length} source image(s). Style:\n${JSON.stringify(analysis, null, 2)}\nHeadline: "${headlineText || '(suggest one)'}"\nReturn ONLY JSON.`,
      });
      const resp = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", max_tokens: 3000,
          messages: [
            { role: "system", content: COMPOSE_SYSTEM },
            { role: "user", content },
          ],
        }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error.message);
      const text = data.choices?.[0]?.message?.content || "";
      let parsed;
      try { parsed = JSON.parse(text.replace(/```json|```/g, "").trim()); }
      catch { const m = text.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); else throw new Error("Parse failed"); }
      setComposed(parsed);
      if (parsed.headline_text && !headlineText) setHeadlineText(parsed.headline_text);
      setStep(2);
    } catch (e) { setError(`Composition failed: ${e.message}`); }
    finally { setComposing(false); }
  };

  useEffect(() => {
    if (step !== 2 || !composed || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = 1280; canvas.height = 720;

    const render = async () => {
      const bgColors = analysis?.color_palette?.dominant || ["#1a1a2e", "#16213e"];
      const accent = composed.accent_color || "#f72585";

      const grad = ctx.createLinearGradient(0, 0, 1280, 720);
      bgColors.forEach((c, i) => grad.addColorStop(i / Math.max(bgColors.length - 1, 1), c));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1280, 720);

      for (let i = 0; i < sourceImages.length; i++) {
        await new Promise((res) => {
          const img = new Image();
          img.onload = () => {
            ctx.save();
            ctx.filter = i === 0 ? (composed.css_filter_main || "contrast(1.1) saturate(1.2)") : (composed.css_filter_subject || "contrast(1.15) saturate(1.3)");
            if (sourceImages.length === 1) {
              const scale = Math.max(1280 / img.width, 720 / img.height);
              ctx.drawImage(img, (1280 - img.width * scale) / 2, (720 - img.height * scale) / 2, img.width * scale, img.height * scale);
            } else if (i === 0) {
              const scale = Math.max(1280 / img.width, 720 / img.height);
              ctx.globalAlpha = 0.55;
              ctx.drawImage(img, (1280 - img.width * scale) / 2, (720 - img.height * scale) / 2, img.width * scale, img.height * scale);
              ctx.globalAlpha = 1;
            } else {
              const scale = Math.min(660 / img.height, 720 / img.width);
              ctx.drawImage(img, 1280 - img.width * scale - 30, 720 - img.height * scale, img.width * scale, img.height * scale);
            }
            ctx.restore();
            res();
          };
          img.src = sourceImages[i].preview;
        });
      }

      const vigGrad = ctx.createRadialGradient(640, 360, 200, 640, 360, 900);
      vigGrad.addColorStop(0, "rgba(0,0,0,0)");
      vigGrad.addColorStop(1, `rgba(0,0,0,${composed.vignette_strength || 0.6})`);
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, 1280, 720);

      const tGrad = ctx.createLinearGradient(0, 0, 700, 0);
      tGrad.addColorStop(0, "rgba(0,0,0,0.65)");
      tGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = tGrad;
      ctx.fillRect(0, 0, 1280, 720);

      if ((composed.grain_opacity || 0) > 0) {
        const gc = document.createElement("canvas");
        gc.width = 1280; gc.height = 720;
        const g = gc.getContext("2d");
        const id = g.createImageData(1280, 720);
        for (let p = 0; p < id.data.length; p += 4) {
          const v = Math.random() * 255;
          id.data[p] = id.data[p+1] = id.data[p+2] = v; id.data[p+3] = 255;
        }
        g.putImageData(id, 0, 0);
        ctx.save();
        ctx.globalAlpha = composed.grain_opacity;
        ctx.globalCompositeOperation = "overlay";
        ctx.drawImage(gc, 0, 0);
        ctx.restore();
      }

      if (composed.border_glow) {
        ctx.save();
        const gc = composed.border_glow_color || accent;
        ctx.shadowColor = gc; ctx.shadowBlur = 50;
        ctx.strokeStyle = gc; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect(20, 20, 1240, 680, 16); ctx.stroke();
        ctx.restore();
      }

      const fonts = analysis?.typography?.recommended_fonts || ["Impact"];
      const fontSize = composed.text_font_size || 68;
      const displayText = headlineText || composed?.headline_text || "YOUR HEADLINE";
      const maxW = sourceImages.length > 1 ? 600 : 920;

      ctx.font = `900 ${fontSize}px ${fonts[0]}, Impact, sans-serif`;
      ctx.textBaseline = "top";
      const words = displayText.toUpperCase().split(" ");
      const lines = []; let line = "";
      for (const w of words) {
        const test = line ? line + " " + w : w;
        if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else { line = test; }
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
        ctx.font = `700 ${Math.round(fontSize * 0.35)}px ${fonts[1] || fonts[0]}, sans-serif`;
        ctx.fillStyle = composed.subtext_color || accent;
        ctx.fillText(composed.subtext.toUpperCase(), 60, startY + totalH + 16);
      }
      ctx.restore();
      setCanvasReady(true);
    };
    render();
  }, [step, composed, analysis, sourceImages, headlineText]);

  const exportThumbnail = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = "thumbnail-1280x720.png";
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

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
            AI-powered style transfer for YouTube thumbnails
          </p>
        </div>
      </div>

      <Stepper step={step} onStep={(s) => { if (s <= step || (s === 1 && analysis) || (s === 2 && composed)) setStep(s); }} />

      {error && (
        <div style={{
          background: "rgba(247,37,133,0.08)", border: "1px solid rgba(247,37,133,0.25)",
          borderRadius: 10, padding: "10px 16px", marginBottom: 18, fontSize: 13, color: "#f72585",
        }}>{error}</div>
      )}

      {/* ==================== STEP 0: REFERENCES ==================== */}
      {step === 0 && (
        <div>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 20, lineHeight: 1.6 }}>
            Add <strong style={{ color: "#fff" }}>10–15 YouTube thumbnails</strong> as style references. Paste video links or upload screenshots.
          </p>

          {/* YouTube URL Input */}
          <div style={{
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14, padding: 20, marginBottom: 16,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 18 }}>🔗</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Paste YouTube Links</span>
              <span style={{
                fontSize: 10, background: "rgba(247,37,133,0.15)", color: "#f72585",
                padding: "2px 8px", borderRadius: 20, fontWeight: 600,
              }}>RECOMMENDED</span>
            </div>

            <textarea
              value={ytInput}
              onChange={(e) => setYtInput(e.target.value)}
              placeholder={"Paste YouTube URLs, one per line:\nhttps://www.youtube.com/watch?v=abc123\nhttps://youtu.be/def456\nhttps://youtube.com/shorts/ghi789"}
              rows={5}
              style={{
                ...inputStyle, resize: "vertical", lineHeight: 1.6, fontSize: 13,
              }}
            />

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
              <button onClick={processYoutubeUrls} disabled={ytLoading || !ytInput.trim()}
                style={btn(!!ytInput.trim() && !ytLoading, ytLoading)}>
                {ytLoading ? ytStatus : "Extract Thumbnails"}
              </button>
              {ytStatus && !ytLoading && (
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{ytStatus}</span>
              )}
            </div>

            <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.2)", lineHeight: 1.5 }}>
              Supports: youtube.com/watch, youtu.be, /shorts/, /embed/, /live/ links
            </div>
          </div>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "'Space Mono', monospace" }}>OR UPLOAD IMAGES</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
          </div>

          <DropZone onFiles={addRefs} multiple accept="image/*">
            <div style={{ fontSize: 24, marginBottom: 6 }}>🎨</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>Drop thumbnail screenshots here</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>or click to browse</div>
          </DropZone>

          {refs.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", fontFamily: "'Space Mono', monospace" }}>
                  {refs.length} REFERENCE{refs.length !== 1 ? "S" : ""} LOADED
                </span>
                <button onClick={() => setRefs([])} style={{
                  background: "none", border: "none", color: "rgba(255,255,255,0.3)",
                  fontSize: 11, cursor: "pointer", fontFamily: "'Space Mono', monospace",
                }}>Clear all</button>
              </div>
              <div style={{
                display: "flex", flexWrap: "wrap", gap: 10,
                padding: 14, background: "rgba(255,255,255,0.015)",
                borderRadius: 14, border: "1px solid rgba(255,255,255,0.05)",
              }}>
                {refs.map((r, i) => (
                  <ImageCard key={i} src={r.preview} small
                    label={r.videoId ? r.videoId.slice(0, 8) + "…" : `Upload ${i + 1}`}
                    videoId={r.videoId}
                    onRemove={() => setRefs((p) => p.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
            </div>
          )}

          <button onClick={analyzeStyle} disabled={analyzing || refs.length < 3}
            style={{ ...btn(refs.length >= 3 && !analyzing, analyzing), marginTop: 24 }}>
            {analyzing ? analyzeProgress : `Analyze Style DNA (${refs.length} refs)`}
          </button>

          {refs.length > 0 && refs.length < 3 && (
            <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
              Add {3 - refs.length} more reference{3 - refs.length > 1 ? "s" : ""} to enable analysis
            </div>
          )}
        </div>
      )}

      {/* ==================== STEP 1: ANALYSIS ==================== */}
      {step === 1 && analysis && (
        <div>
          <div style={{
            background: "rgba(114,9,183,0.07)", border: "1px solid rgba(114,9,183,0.18)",
            borderRadius: 14, padding: 20, marginBottom: 22,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#b5179e", marginBottom: 8, fontFamily: "'Space Mono', monospace", letterSpacing: "0.1em" }}>STYLE DNA</div>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(255,255,255,0.75)", margin: 0 }}>{analysis.overall_style}</p>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 22 }}>
            <StyleCard title="Color Palette">
              <ColorSwatch colors={analysis.color_palette?.dominant} label="Dominant" />
              <ColorSwatch colors={analysis.color_palette?.accent} label="Accent" />
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 8 }}>
                {analysis.color_palette?.color_grading} · {analysis.color_palette?.saturation} · {analysis.color_palette?.contrast_level} contrast
              </div>
            </StyleCard>
            <StyleCard title="Composition">
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
                <div><strong style={{ color: "#fff" }}>Layout:</strong> {analysis.composition?.layout}</div>
                <div><strong style={{ color: "#fff" }}>Focal:</strong> {analysis.composition?.focal_point}</div>
                <div><strong style={{ color: "#fff" }}>Depth:</strong> {analysis.composition?.depth}</div>
              </div>
            </StyleCard>
            <StyleCard title="Typography">
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
                <div><strong style={{ color: "#fff" }}>Style:</strong> {analysis.typography?.headline_style}</div>
                <div><strong style={{ color: "#fff" }}>Weight:</strong> {analysis.typography?.font_weight}</div>
                <div><strong style={{ color: "#fff" }}>Effects:</strong> {analysis.typography?.text_effects?.join(", ")}</div>
                <div><strong style={{ color: "#fff" }}>Fonts:</strong> {analysis.typography?.recommended_fonts?.join(", ")}</div>
              </div>
            </StyleCard>
            <StyleCard title="Photo Treatment">
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
                <div><strong style={{ color: "#fff" }}>Lighting:</strong> {analysis.photo_treatment?.lighting}</div>
                <div><strong style={{ color: "#fff" }}>Filters:</strong> {analysis.photo_treatment?.filters?.join(", ")}</div>
                <div><strong style={{ color: "#fff" }}>Outlines:</strong> {analysis.photo_treatment?.border_or_outline}</div>
                {analysis.photo_treatment?.subject_cutout && <div style={{ color: "#f72585" }}>✂ Subject cutout detected</div>}
              </div>
            </StyleCard>
            <StyleCard title="Effects & Overlays">
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
                <div><strong style={{ color: "#fff" }}>Overlays:</strong> {analysis.effects?.overlays?.join(", ")}</div>
                <div><strong style={{ color: "#fff" }}>Shapes:</strong> {analysis.effects?.shapes?.join(", ")}</div>
                <div><strong style={{ color: "#fff" }}>Texture:</strong> {analysis.effects?.texture}</div>
                {analysis.effects?.glow_or_neon && <div style={{ color: "#f72585" }}>✨ Glow/neon</div>}
              </div>
            </StyleCard>
            <StyleCard title="Emotional Tone">
              <div style={{ fontSize: 17, fontWeight: 700, color: "#f72585", textTransform: "uppercase", fontFamily: "'Space Mono', monospace" }}>
                {analysis.emotional_tone}
              </div>
            </StyleCard>
          </div>

          <div style={{
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 14, padding: 18, marginBottom: 22,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#7209b7", marginBottom: 10, fontFamily: "'Space Mono', monospace" }}>THUMBNAIL RECIPE</div>
            <p style={{ fontSize: 12, lineHeight: 1.8, color: "rgba(255,255,255,0.55)", margin: 0, whiteSpace: "pre-wrap" }}>{analysis.thumbnail_recipe}</p>
          </div>

          {/* Source Images */}
          <div style={{
            background: "rgba(247,37,133,0.03)", border: "1px solid rgba(247,37,133,0.12)",
            borderRadius: 14, padding: 20,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 14 }}>Add your source images (1–2)</div>
            <DropZone onFiles={addSources} multiple accept="image/*" style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>📸</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>Drop your images here</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>{sourceImages.length}/2 · 1 background + 1 subject works best</div>
            </DropZone>
            {sourceImages.length > 0 && (
              <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                {sourceImages.map((s, i) => (
                  <ImageCard key={i} src={s.preview} label={i === 0 ? "Main / Background" : "Subject"}
                    onRemove={() => setSourceImages((p) => p.filter((_, j) => j !== i))} />
                ))}
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 6 }}>Headline (optional)</label>
              <input type="text" value={headlineText} onChange={(e) => setHeadlineText(e.target.value)}
                placeholder="e.g. THIS CHANGES EVERYTHING" style={inputStyle} />
            </div>
            <button onClick={composeThumbnail} disabled={composing || !sourceImages.length}
              style={btn(sourceImages.length > 0 && !composing, composing)}>
              {composing ? "Composing..." : "Generate Thumbnail"}
            </button>
          </div>
        </div>
      )}

      {/* ==================== STEP 2: COMPOSE ==================== */}
      {step === 2 && (
        <div>
          <div style={{
            borderRadius: 14, overflow: "hidden",
            border: "2px solid rgba(255,255,255,0.08)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            maxWidth: 820, marginBottom: 20,
          }}>
            <canvas ref={canvasRef} style={{ width: "100%", height: "auto", display: "block" }} />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 6, fontFamily: "'Space Mono', monospace", textTransform: "uppercase" }}>Edit Headline</label>
            <input type="text" value={headlineText} onChange={(e) => setHeadlineText(e.target.value)}
              style={{ ...inputStyle, maxWidth: 500 }} />
          </div>

          {composed?.composition_notes && (
            <div style={{
              background: "rgba(255,255,255,0.02)", borderRadius: 10, padding: 14,
              marginBottom: 18, fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.6,
            }}>
              <strong style={{ color: "rgba(255,255,255,0.65)" }}>Notes:</strong> {composed.composition_notes}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={exportThumbnail} style={btn(true, false)}>Export PNG (1280×720)</button>
            <button onClick={() => { setComposed(null); setCanvasReady(false); composeThumbnail(); }}
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", borderRadius: 12, padding: "13px 22px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Space Mono', monospace" }}>
              Regenerate
            </button>
            <button onClick={() => setStep(1)}
              style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)", borderRadius: 12, padding: "13px 22px", fontSize: 13, cursor: "pointer", fontFamily: "'Space Mono', monospace" }}>
              ← Back
            </button>
          </div>
        </div>
      )}

      <div style={{
        marginTop: 48, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.04)",
        fontSize: 10, color: "rgba(255,255,255,0.15)", fontFamily: "'Space Mono', monospace",
      }}>
        Powered by OpenRouter · YouTube thumbnail extraction + style analysis + canvas compositing · 1280×720
      </div>
    </div>
  );
}
