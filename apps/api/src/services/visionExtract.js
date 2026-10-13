import OpenAI from 'openai';

/**
 * GPT-4o vision extracts spatial_summary / fixtures / substrates / checklist hints ONLY.
 * Financial fields are intentionally omitted from the extraction schema.
 */

const EXTRACTION_SCHEMA = {
  name: 'spatial_extraction_schema',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      spatial_summary: {
        type: 'object',
        additionalProperties: false,
        properties: {
          total_cleanable_sq_ft: { type: 'number' },
          substrate_breakdown: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                material: { type: 'string' },
                percentage: { type: 'number' },
              },
              required: ['material', 'percentage'],
            },
          },
          detected_fixtures: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                fixture_type: { type: 'string' },
                count: { type: 'number' },
              },
              required: ['fixture_type', 'count'],
            },
          },
        },
        required: [
          'total_cleanable_sq_ft',
          'substrate_breakdown',
          'detected_fixtures',
        ],
      },
      room_zones: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            room_zone: { type: 'string' },
            is_high_risk: { type: 'boolean' },
            risk_reason: { type: 'string' },
            suggested_tasks: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: [
            'room_zone',
            'is_high_risk',
            'risk_reason',
            'suggested_tasks',
          ],
        },
      },
      property_notes: { type: 'string' },
    },
    required: ['spatial_summary', 'room_zones', 'property_notes'],
  },
};

const SYSTEM_PROMPT = `You are OmniClean's spatial measurement engine.
Extract ONLY:
1) Cleanable square footage (exclude structural walls, columns, shafts, voids)
2) Substrate material breakdown (percentages must sum ~100)
3) Fixture/touchpoint counts
4) Room zones for a cleaning route (top-to-bottom, left-to-right) with suggested tasks
5) Flag high-risk zones (medical, bio-hazard, kitchens, restrooms) and give a short risk_reason

CRITICAL RULES:
- Do NOT calculate prices, taxes, margins, labor hours, or currency conversions.
- Do NOT invent ISSA rates, TOT, or SZV figures.
- Return numbers for measurements only.`;

/**
 * Demo fallback when OPENAI_API_KEY is missing — deterministic sample walkthrough.
 */
export function mockSpatialExtraction(modifiers = {}) {
  const sqFt = Number(modifiers.hint_sq_ft) || 12500;
  return {
    spatial_summary: {
      total_cleanable_sq_ft: sqFt,
      substrate_breakdown: [
        { material: 'LVT', percentage: 45 },
        { material: 'high-pile carpet', percentage: 30 },
        { material: 'terrazzo', percentage: 15 },
        { material: 'porous concrete', percentage: 10 },
      ],
      detected_fixtures: [
        { fixture_type: 'restroom plumbing fixtures', count: 18 },
        { fixture_type: 'glass partitions', count: 6 },
        { fixture_type: 'HVAC diffusers', count: 42 },
        { fixture_type: 'executive desks', count: 12 },
      ],
    },
    room_zones: [
      {
        room_zone: 'Lobby / reception',
        is_high_risk: false,
        risk_reason: '',
        suggested_tasks: [
          'Dust reception desk and glass',
          'Vacuum walk-off mats',
          'Sanitize entry handles',
        ],
      },
      {
        room_zone: 'Open office A (north)',
        is_high_risk: false,
        risk_reason: '',
        suggested_tasks: [
          'Vacuum carpet corridors L→R',
          'Wipe desks and monitors',
          'Empty trash / replace liners',
        ],
      },
      {
        room_zone: 'Executive suite',
        is_high_risk: false,
        risk_reason: '',
        suggested_tasks: [
          'Detail polish desks',
          'Glass partition wipe',
          'Spot-clean carpet',
        ],
      },
      {
        room_zone: 'Restrooms (floor 1)',
        is_high_risk: true,
        risk_reason: 'High-touch plumbing; pathogen risk',
        suggested_tasks: [
          'Disinfect toilets and sinks',
          'Restock consumables',
          'Mop with restroom chem',
        ],
      },
      {
        room_zone: 'Clinic / first-aid room',
        is_high_risk: true,
        risk_reason: 'Medical / bio-hazard waste present',
        suggested_tasks: [
          'Don PPE before entry',
          'Verify bio-hazard bin lids sealed',
          'Disinfect exam surfaces',
        ],
      },
    ],
    property_notes:
      modifiers.property_address ||
      'Demo walkthrough — Replace with GPT-4o vision when OPENAI_API_KEY is set.',
    _source: 'mock',
  };
}

/**
 * @param {Buffer} imageBuffer
 * @param {string} mimeType
 * @param {object} customPromptModifiers
 */
export async function processWalkthroughImage(
  imageBuffer,
  mimeType,
  customPromptModifiers = {}
) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.warn(
      '[vision] OPENAI_API_KEY not set — using deterministic mock spatial extraction'
    );
    return mockSpatialExtraction(customPromptModifiers);
  }

  const openai = new OpenAI({ apiKey });
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: {
      type: 'json_schema',
      json_schema: EXTRACTION_SCHEMA,
    },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze this site walkthrough upload. Contextual parameters: ${JSON.stringify(customPromptModifiers)}. Extract spatial data and room zones only — no financial math.`,
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${imageBuffer.toString('base64')}`,
            },
          },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty vision response');
  const parsed = JSON.parse(content);
  parsed._source = 'gpt-4o';
  return parsed;
}
