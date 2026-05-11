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

export const IMAGE_PROMPT_GENERATOR = (niche, style, variationIndex) => {
  const angles = [
    `Create a YouTube thumbnail INSPIRED BY but VISUALLY DISTINCT from typical ${niche.niche?.subcategory} thumbnails.`,
    `Create a YouTube thumbnail that BREAKS THE PATTERN of typical ${niche.niche?.subcategory} thumbnails while still signaling the niche.`,
    `Create a YouTube thumbnail with a CINEMATIC, editorial, high-production feel for ${niche.niche?.subcategory}.`,
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
- Photorealistic or high-quality graphic style`
}


