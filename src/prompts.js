const NICHE_ANALYSIS_PROMPT_V1 = (transcript, title) => `
You are an expert YouTube strategist. Analyze this video and extract everything needed to create a high-performing thumbnail.

VIDEO TITLE: "${title}"
TRANSCRIPT:
${transcript}

Return ONLY valid JSON — no markdown, no preamble:
{
  "niche": {
    "primary_category": "string",
    "subcategory": "string",
    "audience": "string (specific — e.g. 'people in their 20s with student debt')",
    "creator_persona": "educational_authority | relatable_peer | entertainer | expert_advisor"
  },
  "content": {
    "main_topic": "string (one sentence)",
    "key_moment": "string (most dramatic/surprising moment — this is the thumbnail concept)",
    "key_moment_timestamp": "number (seconds)",
    "outcome_or_transformation": "string (e.g. 'paid off $40k in 18 months')"
  },
  "emotional_hook": {
    "type": "curiosity_gap | fear_of_missing_out | transformation | controversy | social_proof | shock_value",
    "description": "string"
  },
  "thumbnail_strategy": {
    "concept": "string (visual description of the thumbnail)",
    "text_overlay": "string (max 6 words, bold text for thumbnail)",
    "color_mood": "string (e.g. 'high contrast red and black for urgency')",
    "face_recommended": "boolean",
    "face_expression": "string (if face_recommended)"
  },
  "scraping_queries": ["string", "string", "string"]
}

`
export const NICHE_ANALYSIS_PROMPT_V2 = (transcript, title) => `
You are an expert YouTube strategist. Analyze this video and extract everything needed to create a high-performing thumbnail.

VIDEO TITLE: "${title}"
TRANSCRIPT:
${transcript}

Use these thumbnail type categories for type_primary and type_secondary:
- "face_reaction" — expressive face filling frame
- "before_after" — split comparison
- "curiosity_gap" — text that teases unknown info
- "shock_surprise" — exaggerated shock expression
- "transformation" — showing a change or result
- "controversy" — polarizing statement or image
- "educational" — diagrams, arrows, annotations
- "comparison" — side-by-side A vs B
- "list_style" — numbered items or bullet-like visual
- "metaphor" — visual metaphor representing the topic

NOTES:
- thumbnail_moments: extract 3-5 moments. Timestamps are APPROXIMATE — use the start time of the transcript segment containing the moment. If transcript is very short (<1000 chars), at minimum return 2.
- emotional_weight: 0-10 scale.
- color_palette must return hex values or specific color names (e.g. "#FF6B00", "crimson red", "electric blue"), not vague descriptions like "warm tones".

Return ONLY valid JSON — no markdown, no preamble:
{
  "niche": {
    "primary_category": "string",
    "subcategory": "string",
    "audience": "string (specific — e.g. 'people in their 20s with student debt')"
  },
  "content": {
    "main_topic": "string (one sentence)",
    "thumbnail_moments": [
      {
        "timestamp": 142.0,
        "quote": "exact words from transcript at this moment",
        "visual_potential": "what would the creator look like here — expression, pose, surroundings",
        "emotional_weight": 8,
        "why_clickable": "one sentence — why this moment makes viewers want to click"
      }
    ],
    "outcome_or_transformation": "string (e.g. 'paid off $40k in 18 months')"
  },
  "emotional_hook": {
    "type": "curiosity_gap | fear_of_missing_out | transformation | controversy | social_proof | shock_value",
    "description": "string"
  },
  "competitive_landscape": {
    "cliche_patterns": ["what every video in this niche does visually", "another common pattern"],
    "differentiation_opportunity": "what nobody is doing in this niche — the visual gap"
  },
  "thumbnail_blueprint": {
    "type_primary": "one of the 10 types above",
    "type_secondary": "one of the 10 types above",
    "combination_rationale": "why these two types work together for this specific video",
    "composition": "subject position, text position, spatial layout — e.g. 'creator on left third with shocked expression, negative space on right for bold text overlay'",
    "text_overlay": "string (max 5 words, bold text for thumbnail)",
    "color_palette": {
      "primary": "#FF6B00",
      "accent": "#FFFFFF",
      "background": "#1A1A2E",
      "contrast_instruction": "white text on dark background"
    },
    "face_needed": true,
    "face_expression": "shocked, wide eyes, mouth open",
    "cross_niche_inspiration": "which non-competing niche's visual style would work unexpectedly well here — e.g. 'borrow the neon-grunge aesthetic from gaming thumbnails'"
  }
}
`

export const NICHE_ANALYSIS_PROMPT = NICHE_ANALYSIS_PROMPT_V2

export const STYLE_ANALYSIS_PROMPT = (count) => `
You are a thumbnail design expert. Analyze these ${count} competitor YouTube thumbnails and identify dominant visual patterns.

Return ONLY valid JSON — no markdown, no preamble:
{
  "dominant_patterns": {
    "text_placement": "string",
    "text_style": "string",
    "face_usage": "string",
    "color_scheme": "string",
    "background_type": "string",
    "composition": "string"
  },
  "what_works": "string (2-3 sentences — why these get clicks)",
  "differentiation_opportunity": "string (2-3 sentences — what they are NOT doing)",
  "style_tags": ["string", "string", "string"]
}`

export const FRAME_RECOMMENDATION_PROMPT = (segments, niche) => `
You are a YouTube thumbnail strategist. Given the timestamped transcript and niche analysis,
recommend the 3 best moments in the video to use as thumbnail reference frames, plus 2 concept
ideas that don't need a specific video frame.

TRANSCRIPT SEGMENTS (with exact timestamps):
${JSON.stringify(segments)}

NICHE ANALYSIS:
${JSON.stringify(niche)}

Return ONLY valid JSON — no markdown, no preamble:
{
  "recommended_frames": [
    {
      "timestamp": 142.0,
      "description": "what happens in this exact moment (one sentence)",
      "thumbnail_concept": "detailed visual description of the final generated thumbnail: subject pose, expression, text overlay text, colors, composition, lighting",
      "reason": "why this moment drives clicks (one sentence)"
    }
  ],
  "concept_ideas": [
    {
      "title": "short thematic label (2-3 words)",
      "description": "text-only concept for a thumbnail without using any specific video frame — describe composition, metaphor, text overlay",
      "reason": "why this concept would perform"
    }
  ]
}

RULES:
- Timestamps must match transcript segments exactly (±2 seconds)
- Each recommended_frame.thumbnail_concept must describe a COMPLETE thumbnail design (not just the video moment)
- Each concept_idea must work WITHOUT any video frame as reference (pure graphic/typographic concepts)
- Prefer frames with faces for emotional reactions, or frames with dramatic visual changes
- If the video has no faces, focus on visual metaphors or text-heavy concepts`

export const FRAME_GUIDANCE_PROMPT = (transcript, niche, inspirationTitle) => `
You are a YouTube thumbnail frame selection expert. Given the video transcript, niche analysis, and an inspiration thumbnail, provide specific, actionable advice for selecting the perfect video frame to use as a base for the generated thumbnail.

INSPIRATION THUMBNAIL TITLE: "${inspirationTitle}"

TRANSCRIPT:
${transcript}

NICHE ANALYSIS:
${JSON.stringify(niche)}

Return ONLY valid JSON — no markdown, no preamble:
{
  "composition_advice": "string (specific advice on what to look for in a video frame — subject placement, expressions, lighting, background elements, hand gestures, dramatic moments that would work well as a thumbnail base)",
  "frame_characteristics": ["string", "string", "string"] (3-5 bullet points of specific frame characteristics to look for — e.g., 'wide-eyed reaction', 'before/after transition moment', 'hands pointing at something', 'product being held up')",
  "inspiration_alignment": "string (how the selected inspiration thumbnail style should influence the frame choice — what visual techniques from the inspiration could be replicated with the right frame)",
  "recommended_approach": "string (either 'face_reaction' | 'action_moment' | 'visual_metaphor' | 'text_only')"
}

`
export const FRAME_GUIDANCE_VISION_PROMPT = (transcript, niche) => `
Analyze the provided inspiration thumbnail image in detail.

Describe what you see in terms of:
1. Subject placement — is it centered, left third, right third? Is it a face, full body, or object? What percentage of the frame does the subject fill?
2. Space utilization — where is the negative space? Where could text be placed?
3. Color scheme — dominant colors, contrast technique (light on dark, complementary, monochrome)?
4. What makes this thumbnail effective — specifically why does it grab attention at small size?

Then, given this video context:
TRANSCRIPT:
${transcript}

NICHE ANALYSIS:
${JSON.stringify(niche)}

Give specific, actionable advice for finding a video frame that would work with a similar composition. Reference exact placement and visual techniques you observed in the inspiration image.

Return ONLY valid JSON — no markdown, no preamble:
{
  "composition_advice": "string (specific advice referencing what was seen in the inspiration thumbnail — e.g. 'the inspiration thumbnail places the subject on the left third with a tight face crop; look for a frame where your face fills the left 60% with clear space on the right for text')",
  "frame_characteristics": ["string", "string", "string"],
  "inspiration_alignment": "string (how specific visual techniques from the inspiration should influence the frame choice)",
  "recommended_approach": "face_reaction | action_moment | visual_metaphor | text_only"
}
`

export const CREATOR_SUGGESTION_PROMPT = (niche, title, transcript) => `
You are a YouTube niche expert. Based on the video context below, suggest exactly 5-7 YouTube creators
whose thumbnails would be valuable inspiration for creating a high-CTR thumbnail.

Include a diverse mix of channel sizes:
- Some big established creators (1M+ subscribers)
- Some mid-size growing creators (100K-1M subscribers)
- Some small underdog creators (under 100K subscribers who have had breakout viral moments)

Spread your suggestions across different content styles within the niche for variety.

VIDEO TITLE: "${title}"
PRIMARY NICHE: ${niche.niche?.primary_category}
SUBCATEGORY: ${niche.niche?.subcategory}
TARGET AUDIENCE: ${niche.niche?.audience}
EMOTIONAL HOOK: ${niche.emotional_hook?.type} — ${niche.emotional_hook?.description}
THUMBNAIL CONCEPT: ${niche.thumbnail_blueprint?.composition || niche.thumbnail_strategy?.concept}
TRANSCRIPT SNIPPET:
${(transcript || "").slice(0, 2000)}

IMPORTANT: Each creator MUST have an exact YouTube channel handle (e.g. @mrbeast) that
can be looked up via the YouTube API. The handle is the part after the @ in the channel URL.

Return ONLY valid JSON — no markdown, no preamble:
{
  "creators": [
    { "handle": "@handle", "name": "Channel display name", "reason": "one sentence why their thumbnails are relevant" },
    { "handle": "@handle", "name": "Channel display name", "reason": "one sentence why their thumbnails are relevant" }
  ]
}

`
export const CREATOR_SUGGESTION_PROMPT_V2 = (niche, title, transcript) => `
You are a YouTube niche expert. Based on the video context below, suggest exactly 6 YouTube creators whose thumbnails would be valuable inspiration for creating a high-CTR thumbnail.

INCLUDE CREATORS IN THIS EXACT RATIO:
- 2 creators IN the ${niche.niche?.primary_category} niche (to show what exists)
- 3 creators from COMPLETELY DIFFERENT niches whose visual style would feel unexpected in ${niche.niche?.primary_category}
- 1 creator from a non-YouTube visual medium (film poster design, advertising photography, editorial illustration) if applicable — otherwise make it 4 cross-niche creators

Include a diverse mix of channel sizes within each group (some big, some mid-size, some underdog).
For cross-niche picks, explain specifically which compositional element to borrow — e.g. "borrow their color palette", "borrow their composition layout", "borrow their text treatment".

VIDEO TITLE: "${title}"
PRIMARY NICHE: ${niche.niche?.primary_category}
SUBCATEGORY: ${niche.niche?.subcategory}
TARGET AUDIENCE: ${niche.niche?.audience}
EMOTIONAL HOOK: ${niche.emotional_hook?.type} — ${niche.emotional_hook?.description}
THUMBNAIL CONCEPT: ${niche.thumbnail_blueprint?.composition || niche.thumbnail_strategy?.concept}
TRANSCRIPT SNIPPET:
${(transcript || "").slice(0, 2000)}

IMPORTANT: Each creator MUST have an exact YouTube channel handle (e.g. @mrbeast) that can be looked up via the YouTube API. The handle is the part after the @ in the channel URL. Cross-niche creators must be real YouTube channels.

Return ONLY valid JSON — no markdown, no preamble:
{
  "creators": [
    { "handle": "@handle", "name": "Channel display name", "reason": "one sentence explaining why relevant; if cross-niche, specify which visual element to borrow" },
    { "handle": "@handle", "name": "Channel display name", "reason": "..." }
  ]
}
`

function nicheOverlay(niche) {
  return niche.thumbnail_blueprint?.text_overlay || niche.thumbnail_strategy?.text_overlay || ""
}

export const THUMBNAIL_CRITIQUE_PROMPT = (niche, transcript) => `
You are a YouTube thumbnail design critic. Analyze the provided thumbnail image and the video context below.
Rate it across multiple dimensions and give actionable feedback.

NICHE: ${niche.niche?.primary_category} / ${niche.niche?.subcategory}
AUDIENCE: ${niche.niche?.audience}
EMOTIONAL HOOK: ${niche.emotional_hook?.type} — ${niche.emotional_hook?.description}
TARGET TEXT OVERLAY: "${nicheOverlay(niche)}"

Return ONLY valid JSON — no markdown, no preamble:
{
  "overall_score": 0-100,
  "categories": {
    "composition": { "score": 0-100, "note": "string (one sentence)" },
    "color_and_contrast": { "score": 0-100, "note": "string (one sentence)" },
    "text_readability": { "score": 0-100, "note": "string (one sentence)" },
    "emotional_appeal": { "score": 0-100, "note": "string (one sentence)" },
    "ctr_potential": { "score": 0-100, "note": "string (one sentence)" }
  },
  "strengths": ["string", "string", "string"],
  "weaknesses": ["string", "string", "string"],
  "improvement_tips": ["string", "string", "string"]
}`

export const IMAGE_PROMPT_GENERATOR = (niche, style, variationIndex) => {
  const ts = niche.thumbnail_strategy || {}
  const bp = niche.thumbnail_blueprint || {}
  const angles = [
    `Create a HIGH-CTR YouTube thumbnail INSPIRED BY but VISUALLY DISTINCT from typical ${niche.niche?.subcategory} thumbnails. Design for a curiosity gap — viewers feel compelled to click.`,
    `Create a HIGH-CTR YouTube thumbnail that BREAKS THE PATTERN of typical ${niche.niche?.subcategory} thumbnails while still signaling the niche. Must create a curiosity gap that drives clicks.`,
    `Create a HIGH-CTR YouTube thumbnail with a CINEMATIC, editorial, high-production feel for ${niche.niche?.subcategory}. The composition should create a curiosity gap that demands a click.`,
  ]

  const concept = bp.composition || ts.concept || ""
  const overlay = bp.text_overlay || ts.text_overlay || ""
  const faceNeeded = bp.face_needed ?? ts.face_recommended
  const faceExp = bp.face_expression || ts.face_expression || ""
  const colorDesc = ts.color_mood
    ? "COLOR MOOD: " + ts.color_mood
    : bp.color_palette
      ? "COLOR PALETTE: primary=" + (bp.color_palette.primary || "") + ", accent=" + (bp.color_palette.accent || "") + ", bg=" + (bp.color_palette.background || "")
      : ""

  return `${angles[variationIndex]}

CONTENT: ${concept}
TEXT OVERLAY: "${overlay}"
EMOTIONAL TONE: ${niche.emotional_hook?.type} — ${niche.emotional_hook?.description}
${colorDesc}
${faceNeeded
  ? `FACE: Include a person with expression: ${faceExp}`
  : 'NO FACE: Focus on visual metaphor or graphic elements'}
DIFFERENTIATION: ${style?.differentiation_opportunity || "Create a unique, attention-grabbing thumbnail that stands out from typical content in this niche."}

REQUIREMENTS:
- 16:9 aspect ratio (1280x720)
- High contrast, readable at small thumbnail size
- Text "${overlay}" must appear prominently
- No generic stock photo feel
- Photorealistic or high-quality graphic style
- Creates a CURIOSITY GAP — viewer needs to click to find out more
- HIGH CTR design: bold, punchy, impossible to scroll past`
}

export const IMAGE_PROMPT_GENERATOR_V2 = (niche, style, variationIndex, principles = []) => {
  const bp = niche.thumbnail_blueprint
  const palette = bp?.color_palette || {}
  const crossNiche = bp?.cross_niche_inspiration
  const faceLine = bp?.face_needed
    ? "FACE: Include a person with expression: " + (bp?.face_expression || "")
    : "NO FACE: Focus on visual metaphor or graphic elements"
  const paletteLine = palette.primary
    ? "COLOR PALETTE: primary=" + palette.primary + ", accent=" + palette.accent + ", background=" + palette.background
    : ""
  const contrastLine = palette.contrast_instruction
    ? "CONTRAST: " + palette.contrast_instruction
    : ""
  const crossNicheLine = crossNiche
    ? "CROSS-NICHE INSPIRATION: " + crossNiche
    : ""
  const principlesLine = principles.length > 0
    ? "BORROWED PRINCIPLES from selected inspiration: " + principles.join(", ")
    : ""
  const angles = [
    "Create a HIGH-CTR YouTube thumbnail INSPIRED BY but VISUALLY DISTINCT from typical " + niche.niche?.subcategory + " thumbnails. Design for a curiosity gap — viewers feel compelled to click.",
    "Create a HIGH-CTR YouTube thumbnail that BREAKS THE PATTERN of typical " + niche.niche?.subcategory + " thumbnails while still signaling the niche. Must create a curiosity gap that drives clicks.",
    "Create a HIGH-CTR YouTube thumbnail with a CINEMATIC, editorial, high-production feel for " + niche.niche?.subcategory + ". The composition should create a curiosity gap that demands a click.",
  ]

  return "" + angles[variationIndex] + "\n\n" +
    "COMPOSITION: " + (bp?.composition || "") + "\n" +
    "TEXT OVERLAY: \"" + (bp?.text_overlay || "") + "\"\n" +
    "EMOTIONAL TONE: " + (niche.emotional_hook?.type || "") + " — " + (niche.emotional_hook?.description || "") + "\n" +
    "TYPE COMBINATION: " + (bp?.type_primary || "") + " + " + (bp?.type_secondary || "") + " — " + (bp?.combination_rationale || "") + "\n" +
    paletteLine + "\n" +
    contrastLine + "\n" +
    faceLine + "\n" +
    crossNicheLine + "\n" +
    principlesLine + "\n\n" +
    "TECHNICAL CONSTRAINTS (must follow all):\n" +
    "- Rule of thirds: place subject at intersection points, not dead center\n" +
    "- Subject fills at least 40% of the frame\n" +
    "- Maximum 3 visual elements (subject + background + text)\n" +
    "- Text must be readable at 180px thumbnail size — use large bold font\n" +
    "- Background must strongly contrast with foreground elements\n" +
    "- Text must have a dark or light backdrop for readability (shadow, outline, or solid block)\n" +
    "- No more than 5 words in text overlay\n" +
    "- No generic stock photo feel\n" +
    "- Creates a CURIOSITY GAP — viewer needs to click to find out more"
}


