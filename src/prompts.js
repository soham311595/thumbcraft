export const NICHE_ANALYSIS_PROMPT = (transcript, title) => `
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
}`

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
}`

export const CREATOR_SUGGESTION_PROMPT = (niche, title, transcript) => `
You are a YouTube niche expert. Based on the video context below, suggest exactly 4 YouTube creators
whose thumbnails would be valuable inspiration for creating a high-CTR thumbnail.

Include:
- 2 big established creators in this exact niche
- 2 smaller creators who have had breakout viral videos in this niche

VIDEO TITLE: "${title}"
PRIMARY NICHE: ${niche.niche?.primary_category}
SUBCATEGORY: ${niche.niche?.subcategory}
TARGET AUDIENCE: ${niche.niche?.audience}
EMOTIONAL HOOK: ${niche.emotional_hook?.type} — ${niche.emotional_hook?.description}
THUMBNAIL CONCEPT: ${niche.thumbnail_strategy?.concept}
TRANSCRIPT SNIPPET:
${(transcript || "").slice(0, 2000)}

IMPORTANT: Each creator MUST have an exact YouTube channel handle (e.g. @mrbeast) that
can be looked up via the YouTube API. The handle is the part after the @ in the channel URL.

Return ONLY valid JSON — no markdown, no preamble:
{
  "creators": [
    { "handle": "@handle", "name": "Channel display name", "type": "successful", "reason": "one sentence why their thumbnails are relevant" },
    { "handle": "@handle", "name": "Channel display name", "type": "underdog", "reason": "one sentence why their thumbnails are relevant" }
  ]
}`

export const THUMBNAIL_CRITIQUE_PROMPT = (niche, transcript) => `
You are a YouTube thumbnail design critic. Analyze the provided thumbnail image and the video context below.
Rate it across multiple dimensions and give actionable feedback.

NICHE: ${niche.niche?.primary_category} / ${niche.niche?.subcategory}
AUDIENCE: ${niche.niche?.audience}
EMOTIONAL HOOK: ${niche.emotional_hook?.type} — ${niche.emotional_hook?.description}
TARGET TEXT OVERLAY: "${niche.thumbnail_strategy?.text_overlay ?? ''}"

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
  const angles = [
    `Create a HIGH-CTR YouTube thumbnail INSPIRED BY but VISUALLY DISTINCT from typical ${niche.niche?.subcategory} thumbnails. Design for a curiosity gap — viewers feel compelled to click.`,
    `Create a HIGH-CTR YouTube thumbnail that BREAKS THE PATTERN of typical ${niche.niche?.subcategory} thumbnails while still signaling the niche. Must create a curiosity gap that drives clicks.`,
    `Create a HIGH-CTR YouTube thumbnail with a CINEMATIC, editorial, high-production feel for ${niche.niche?.subcategory}. The composition should create a curiosity gap that demands a click.`,
  ]

  return `${angles[variationIndex]}

CONTENT: ${niche.thumbnail_strategy?.concept}
TEXT OVERLAY: "${niche.thumbnail_strategy?.text_overlay ?? ''}"
EMOTIONAL TONE: ${niche.emotional_hook?.type} — ${niche.emotional_hook?.description}
COLOR MOOD: ${niche.thumbnail_strategy?.color_mood}
${niche.thumbnail_strategy?.face_recommended
  ? `FACE: Include a person with expression: ${niche.thumbnail_strategy?.face_expression}`
  : 'NO FACE: Focus on visual metaphor or graphic elements'}
DIFFERENTIATION: ${style?.differentiation_opportunity || "Create a unique, attention-grabbing thumbnail that stands out from typical content in this niche."}

REQUIREMENTS:
- 16:9 aspect ratio (1280x720)
- High contrast, readable at small thumbnail size
- Text "${niche.thumbnail_strategy?.text_overlay ?? ''}" must appear prominently
- No generic stock photo feel
- Photorealistic or high-quality graphic style
- Creates a CURIOSITY GAP — viewer needs to click to find out more
- HIGH CTR design: bold, punchy, impossible to scroll past`
}


