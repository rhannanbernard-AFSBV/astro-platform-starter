import OpenAI from 'openai';

/**
 * GPT-4o vision extracts spatial_summary / fixtures / substrates / scale / checklist ONLY.
 * Financial fields are intentionally omitted from the extraction schema.
 */

const EXTRACTION_SCHEMA = {
  name: 'spatial_extraction_schema',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      scale_and_legend: {
        type: 'object',
        additionalProperties: false,
        properties: {
          scale_detected: { type: 'boolean' },
          scale_text: { type: 'string' },
          units: { type: 'string' },
          pixels_per_foot: { type: 'number' },
          reference_feature: { type: 'string' },
          reference_real_world_ft: { type: 'number' },
          confidence: { type: 'number' },
          notes: { type: 'string' },
        },
        required: [
          'scale_detected',
          'scale_text',
          'units',
          'pixels_per_foot',
          'reference_feature',
          'reference_real_world_ft',
          'confidence',
          'notes',
        ],
      },
      spatial_summary: {
        type: 'object',
        additionalProperties: false,
        properties: {
          total_cleanable_sq_ft: { type: 'number' },
          excluded_structural_sq_ft: { type: 'number' },
          measurement_method: { type: 'string' },
          substrate_breakdown: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                material: { type: 'string' },
                percentage: { type: 'number' },
                approx_sq_ft: { type: 'number' },
              },
              required: ['material', 'percentage', 'approx_sq_ft'],
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
                labor_intensity: { type: 'string' },
              },
              required: ['fixture_type', 'count', 'labor_intensity'],
            },
          },
        },
        required: [
          'total_cleanable_sq_ft',
          'excluded_structural_sq_ft',
          'measurement_method',
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
            approx_sq_ft: { type: 'number' },
            is_high_risk: { type: 'boolean' },
            risk_reason: { type: 'string' },
            suggested_tasks: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: [
            'room_zone',
            'approx_sq_ft',
            'is_high_risk',
            'risk_reason',
            'suggested_tasks',
          ],
        },
      },
      property_notes: { type: 'string' },
    },
    required: [
      'scale_and_legend',
      'spatial_summary',
      'room_zones',
      'property_notes',
    ],
  },
};

const SYSTEM_PROMPT = `You are OmniClean's spatial measurement engine for floorplans, blueprints, and walkthrough photos/video frames.

Extract ONLY:
1) Scale & legend: read diagram scale bars, written scales (e.g. 1/8"=1'-0"), or infer from door (~3 ft), hallway (~5–6 ft), parking stall, or tile modules. Report pixels_per_foot when estimable; else 0 with notes.
2) Cleanable square footage — exclude structural walls, columns, shafts, stair cores, elevators, uncleaned voids. Report excluded_structural_sq_ft separately.
3) Substrate breakdown with approx_sq_ft (percentages ~100).
4) Fixture/touchpoint counts with labor_intensity: low|medium|high.
5) Room zones sequenced top-to-bottom, left-to-right for a cleaning route; flag medical/bio-hazard/kitchen/restroom as high risk.

measurement_method must be one of: "scale_legend", "reference_feature", "contextual_estimate", "user_hint".

CRITICAL:
- Do NOT calculate prices, taxes, margins, labor hours, ISSA rates, TOT, or SZV.
- Prefer scale_legend when a scale bar or written scale is visible; otherwise reference_feature; last resort contextual_estimate.
- If the user provides hint_sq_ft, you may calibrate but still report how scale was handled.`;

/**
 * Apply scale calibration when legend/reference is present; honor hint_sq_ft as override.
 */
export function applyScaleCalibration(extraction, modifiers = {}) {
  const out = structuredClone
    ? structuredClone(extraction)
    : JSON.parse(JSON.stringify(extraction));
  const scale = out.scale_and_legend || {};
  const hint = Number(modifiers.hint_sq_ft);

  if (Number.isFinite(hint) && hint > 0) {
    const current = Number(out.spatial_summary.total_cleanable_sq_ft) || hint;
    const factor = hint / current;
    out.spatial_summary.total_cleanable_sq_ft = Math.round(hint * 100) / 100;
    out.spatial_summary.measurement_method =
      out.spatial_summary.measurement_method || 'user_hint';
    out.spatial_summary.substrate_breakdown = (
      out.spatial_summary.substrate_breakdown || []
    ).map((s) => ({
      ...s,
      approx_sq_ft:
        s.approx_sq_ft != null
          ? Math.round(Number(s.approx_sq_ft) * factor * 100) / 100
          : Math.round(((hint * Number(s.percentage)) / 100) * 100) / 100,
    }));
    out.property_notes = `${out.property_notes || ''} | Calibrated to user hint_sq_ft=${hint}.`.trim();
    out._scale_calibration = 'user_hint';
    return out;
  }

  if (
    scale.scale_detected &&
    Number(scale.pixels_per_foot) > 0 &&
    Number(out.spatial_summary.total_cleanable_sq_ft) > 0
  ) {
    out.spatial_summary.measurement_method = 'scale_legend';
    out._scale_calibration = 'scale_legend';
  } else if (
    scale.reference_feature &&
    Number(scale.reference_real_world_ft) > 0
  ) {
    out.spatial_summary.measurement_method =
      out.spatial_summary.measurement_method || 'reference_feature';
    out._scale_calibration = 'reference_feature';
  } else {
    out.spatial_summary.measurement_method =
      out.spatial_summary.measurement_method || 'contextual_estimate';
    out._scale_calibration = 'contextual_estimate';
  }

  // Ensure approx_sq_ft on substrates
  const total = Number(out.spatial_summary.total_cleanable_sq_ft) || 0;
  out.spatial_summary.substrate_breakdown = (
    out.spatial_summary.substrate_breakdown || []
  ).map((s) => ({
    ...s,
    approx_sq_ft:
      s.approx_sq_ft != null
        ? Number(s.approx_sq_ft)
        : Math.round(((total * Number(s.percentage)) / 100) * 100) / 100,
  }));

  return out;
}

/**
 * Richer deterministic mock when OPENAI_API_KEY is missing.
 */
export function mockSpatialExtraction(modifiers = {}) {
  const profile = String(modifiers.facility_profile || 'medical_office').toLowerCase();
  const sqFt = Number(modifiers.hint_sq_ft) || (profile.includes('retail') ? 8200 : 12500);

  const base = {
    scale_and_legend: {
      scale_detected: true,
      scale_text: "1/8\" = 1'-0\"",
      units: 'ft',
      pixels_per_foot: 12.5,
      reference_feature: 'standard door leaf',
      reference_real_world_ft: 3,
      confidence: 0.86,
      notes: 'Mock legend: architectural scale bar + 3 ft door reference.',
    },
    spatial_summary: {
      total_cleanable_sq_ft: sqFt,
      excluded_structural_sq_ft: Math.round(sqFt * 0.08),
      measurement_method: 'scale_legend',
      substrate_breakdown: [
        { material: 'LVT', percentage: 42, approx_sq_ft: Math.round(sqFt * 0.42) },
        {
          material: 'high-pile carpet',
          percentage: 28,
          approx_sq_ft: Math.round(sqFt * 0.28),
        },
        { material: 'terrazzo', percentage: 18, approx_sq_ft: Math.round(sqFt * 0.18) },
        {
          material: 'porous concrete',
          percentage: 12,
          approx_sq_ft: Math.round(sqFt * 0.12),
        },
      ],
      detected_fixtures: [
        {
          fixture_type: 'restroom plumbing fixtures',
          count: 18,
          labor_intensity: 'high',
        },
        { fixture_type: 'glass partitions', count: 8, labor_intensity: 'medium' },
        { fixture_type: 'HVAC diffusers', count: 46, labor_intensity: 'low' },
        { fixture_type: 'executive desks', count: 14, labor_intensity: 'medium' },
        {
          fixture_type: 'bio-hazard waste stations',
          count: 4,
          labor_intensity: 'high',
        },
        {
          fixture_type: 'exam / treatment tables',
          count: 6,
          labor_intensity: 'high',
        },
        {
          fixture_type: 'breakroom appliances',
          count: 5,
          labor_intensity: 'medium',
        },
      ],
    },
    room_zones: [
      {
        room_zone: 'Lobby / reception',
        approx_sq_ft: Math.round(sqFt * 0.12),
        is_high_risk: false,
        risk_reason: '',
        suggested_tasks: [
          'Dust reception desk and glass',
          'Vacuum walk-off mats L→R',
          'Sanitize entry handles and directory',
        ],
      },
      {
        room_zone: 'Open office A (north)',
        approx_sq_ft: Math.round(sqFt * 0.28),
        is_high_risk: false,
        risk_reason: '',
        suggested_tasks: [
          'Vacuum carpet corridors top→bottom',
          'Wipe desks and monitors',
          'Empty trash / replace liners',
        ],
      },
      {
        room_zone: 'Executive suite',
        approx_sq_ft: Math.round(sqFt * 0.1),
        is_high_risk: false,
        risk_reason: '',
        suggested_tasks: [
          'Detail polish desks',
          'Glass partition wipe',
          'Spot-clean carpet',
        ],
      },
      {
        room_zone: 'Breakroom / pantry',
        approx_sq_ft: Math.round(sqFt * 0.06),
        is_high_risk: true,
        risk_reason: 'Food-contact surfaces; grease and appliance soils',
        suggested_tasks: [
          'Sanitize counters and appliance fronts',
          'Empty organics / replace liners',
          'Mop resilient floor with kitchen chem',
        ],
      },
      {
        room_zone: 'Restrooms (floor 1)',
        approx_sq_ft: Math.round(sqFt * 0.08),
        is_high_risk: true,
        risk_reason: 'High-touch plumbing; pathogen risk',
        suggested_tasks: [
          'Disinfect toilets and sinks',
          'Restock consumables',
          'Mop with restroom chem',
        ],
      },
      {
        room_zone: 'Clinic / exam corridor',
        approx_sq_ft: Math.round(sqFt * 0.22),
        is_high_risk: true,
        risk_reason: 'Medical / bio-hazard waste present',
        suggested_tasks: [
          'Don PPE before entry',
          'Verify bio-hazard bin lids sealed (photo QA)',
          'Disinfect exam surfaces and touchpoints',
        ],
      },
      {
        room_zone: 'Mechanical / server alcove',
        approx_sq_ft: Math.round(sqFt * 0.04),
        is_high_risk: false,
        risk_reason: '',
        suggested_tasks: [
          'Dust-free wipe of accessible surfaces only',
          'Avoid cable disturbance',
          'Spot mop resilient floor',
        ],
      },
    ],
    property_notes: modifiers.property_address
      ? `Mock walkthrough for ${modifiers.property_address} (scale legend simulated). Set OPENAI_API_KEY for live GPT-4o vision.`
      : 'Mock walkthrough with scale legend + door reference. Set OPENAI_API_KEY for live GPT-4o vision.',
    _source: 'mock',
  };

  if (profile.includes('retail')) {
    base.spatial_summary.detected_fixtures.push({
      fixture_type: 'fitting rooms',
      count: 6,
      labor_intensity: 'medium',
    });
    base.room_zones = base.room_zones.filter(
      (z) => !/clinic|exam/i.test(z.room_zone)
    );
    base.room_zones.push({
      room_zone: 'Sales floor / aisles',
      approx_sq_ft: Math.round(sqFt * 0.45),
      is_high_risk: false,
      risk_reason: '',
      suggested_tasks: [
        'Dust-mop hard floors',
        'Spot-clean glass fixtures',
        'Empty trash islands',
      ],
    });
  }

  return applyScaleCalibration(base, modifiers);
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
    throw Object.assign(
      new Error(
        'OPENAI_API_KEY missing — cannot run live GPT-4o vision. Set the key or use mock=1 in non-production.'
      ),
      { status: 503, code: 'OPENAI_KEY_MISSING' }
    );
  }

  if (!imageBuffer?.length) {
    throw Object.assign(
      new Error('Image buffer required for GPT-4o walkthrough path'),
      { status: 400, code: 'VISION_IMAGE_REQUIRED' }
    );
  }

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_VISION_MODEL?.trim() || 'gpt-4o',
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
              text: `Analyze this site walkthrough / floorplan upload. Contextual parameters: ${JSON.stringify(customPromptModifiers)}.
Prioritize reading any scale bar or written legend. Isolate cleanable area from structural voids. Extract spatial data and room zones only — no financial math.`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${imageBuffer.toString('base64')}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw Object.assign(new Error('Empty GPT-4o vision response'), {
        status: 502,
        code: 'OPENAI_EMPTY_RESPONSE',
      });
    }
    const parsed = JSON.parse(content);
    parsed._source = 'gpt-4o';
    return applyScaleCalibration(parsed, customPromptModifiers);
  } catch (err) {
    if (err.code && err.status) throw err;
    const msg = err?.error?.message || err.message || String(err);
    throw Object.assign(
      new Error(`GPT-4o vision failed: ${msg}. Check OPENAI_API_KEY and model access.`),
      { status: 502, code: 'OPENAI_VISION_FAILED', cause: err }
    );
  }
}
