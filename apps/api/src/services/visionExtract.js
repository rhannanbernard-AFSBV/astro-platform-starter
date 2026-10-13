import OpenAI from 'openai';

/**
 * GPT-4o vision extracts spatial_summary / fixtures / substrates / scale / checklist ONLY.
 * Financial fields are intentionally omitted from the extraction schema.
 * Multi-frame fusion + deterministic scale live in this module (no LLM math for money).
 */

const EXTRACTION_SCHEMA = {
  name: 'spatial_extraction_schema_v2',
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
          total_pixel_area: { type: 'number' },
          reference_feature: { type: 'string' },
          reference_real_world_ft: { type: 'number' },
          reference_pixel_length: { type: 'number' },
          confidence: { type: 'number' },
          notes: { type: 'string' },
        },
        required: [
          'scale_detected',
          'scale_text',
          'units',
          'pixels_per_foot',
          'total_pixel_area',
          'reference_feature',
          'reference_real_world_ft',
          'reference_pixel_length',
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
          excluded_breakdown: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                feature: { type: 'string' },
                approx_sq_ft: { type: 'number' },
                reason: { type: 'string' },
              },
              required: ['feature', 'approx_sq_ft', 'reason'],
            },
          },
          measurement_method: { type: 'string' },
          area_confidence: { type: 'number' },
          substrate_breakdown: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                material: { type: 'string' },
                texture_notes: { type: 'string' },
                percentage: { type: 'number' },
                approx_sq_ft: { type: 'number' },
                confidence: { type: 'number' },
              },
              required: [
                'material',
                'texture_notes',
                'percentage',
                'approx_sq_ft',
                'confidence',
              ],
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
                confidence: { type: 'number' },
                notes: { type: 'string' },
              },
              required: [
                'fixture_type',
                'count',
                'labor_intensity',
                'confidence',
                'notes',
              ],
            },
          },
        },
        required: [
          'total_cleanable_sq_ft',
          'excluded_structural_sq_ft',
          'excluded_breakdown',
          'measurement_method',
          'area_confidence',
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
            substrate_hint: { type: 'string' },
            confidence: { type: 'number' },
            source_frame_indices: {
              type: 'array',
              items: { type: 'number' },
            },
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
            'substrate_hint',
            'confidence',
            'source_frame_indices',
            'suggested_tasks',
          ],
        },
      },
      fusion_notes: { type: 'string' },
      uncertain_fields: {
        type: 'array',
        items: { type: 'string' },
      },
      overall_confidence: { type: 'number' },
      property_notes: { type: 'string' },
    },
    required: [
      'scale_and_legend',
      'spatial_summary',
      'room_zones',
      'fusion_notes',
      'uncertain_fields',
      'overall_confidence',
      'property_notes',
    ],
  },
};

const SYSTEM_PROMPT = `You are OmniClean's premium spatial measurement engine for floorplans, blueprints, and multi-frame site walkthrough photos/video stills.

Extract ONLY spatial / facility data — never prices, taxes, margins, labor hours, ISSA rates, TOT, or SZV.

## Precision requirements (A+)

1) Scale & legend (priority order):
   - Read diagram scale bars or written scales (e.g. 1/8"=1'-0").
   - Else measure a known reference: door leaf (~3 ft), hallway clear width (~5–6 ft), parking stall, or tile module.
   - Report pixels_per_foot when estimable; else 0.
   - When possible estimate total_pixel_area of the CLEANABLE floor polygon (exclude walls/columns/voids from the pixel area).
   - reference_pixel_length = pixel length of the reference feature when used.

2) Cleanable area:
   - total_cleanable_sq_ft = walkable/cleanable floor only.
   - Exclude structural walls, columns, shafts, stair cores, elevators, shafts, uncleaned voids.
   - List exclusions in excluded_breakdown with feature + approx_sq_ft + reason.
   - excluded_structural_sq_ft = sum of exclusions.

3) Substrates:
   - Identify floor textures/materials (LVT, VCT, terrazzo, carpet pile, concrete, ceramic, wood, epoxy…).
   - texture_notes: brief visual cue (e.g. "high-pile loop", "polished speckled").
   - Percentages should sum ≈100; include approx_sq_ft and per-item confidence.

4) Fixtures:
   - Count touchpoints with labor_intensity low|medium|high and per-item confidence.
   - Include restrooms, glass, HVAC, desks, medical/bio-hazard, appliances, etc. when visible.

5) Room zones:
   - Sequence top→bottom, left→right for a cleaning route.
   - Flag medical/bio-hazard/kitchen/restroom as high risk.
   - source_frame_indices: 0-based indices of frames where the zone appears.
   - substrate_hint for the dominant floor in that zone.

6) Multi-frame fusion (CRITICAL):
   - Reconcile ALL frames into ONE coherent spatial_summary / room_zones set.
   - Do NOT only describe the first image.
   - Union rooms across frames; merge duplicate zones by name (sum/average sq ft carefully).
   - Prefer the strongest scale evidence from any frame (legend > door/hallway reference > contextual).
   - Sum fixture counts across frames when they are clearly different rooms; do not double-count the same fixture seen twice.
   - fusion_notes: short explanation of how frames were merged.

7) Confidence / uncertainty:
   - overall_confidence and area_confidence in [0,1].
   - uncertain_fields: list field paths you are unsure about (e.g. "spatial_summary.total_cleanable_sq_ft", "scale_and_legend.pixels_per_foot", "detected_fixtures[sinks]").
   - Never invent a silent default like 12500 sq ft. If area is unknown, set a best estimate with low confidence and list it in uncertain_fields.

measurement_method must be one of: "scale_legend", "reference_feature", "contextual_estimate", "user_hint".

If the user provides hint_sq_ft, note it — server may apply it deterministically after extraction.`;

function rescaleSubstrates(out, newTotal, factor) {
  out.spatial_summary.substrate_breakdown = (
    out.spatial_summary.substrate_breakdown || []
  ).map((s) => ({
    ...s,
    approx_sq_ft:
      s.approx_sq_ft != null
        ? Math.round(Number(s.approx_sq_ft) * factor * 100) / 100
        : Math.round(((newTotal * Number(s.percentage)) / 100) * 100) / 100,
  }));
  if (Array.isArray(out.room_zones)) {
    out.room_zones = out.room_zones.map((z) => ({
      ...z,
      approx_sq_ft:
        z.approx_sq_ft != null
          ? Math.round(Number(z.approx_sq_ft) * factor * 100) / 100
          : z.approx_sq_ft,
    }));
  }
  if (Array.isArray(out.spatial_summary.excluded_breakdown)) {
    out.spatial_summary.excluded_breakdown =
      out.spatial_summary.excluded_breakdown.map((e) => ({
        ...e,
        approx_sq_ft:
          e.approx_sq_ft != null
            ? Math.round(Number(e.approx_sq_ft) * factor * 100) / 100
            : e.approx_sq_ft,
      }));
    out.spatial_summary.excluded_structural_sq_ft = out.spatial_summary
      .excluded_breakdown.length
      ? Math.round(
          out.spatial_summary.excluded_breakdown.reduce(
            (a, e) => a + (Number(e.approx_sq_ft) || 0),
            0
          ) * 100
        ) / 100
      : Math.round(
          (Number(out.spatial_summary.excluded_structural_sq_ft) || 0) *
            factor *
            100
        ) / 100;
  }
}

/**
 * Normalize confidence + uncertain_fields so calibrate UI can surface AI doubt.
 */
export function enrichExtractionConfidence(extraction) {
  const out = structuredClone
    ? structuredClone(extraction)
    : JSON.parse(JSON.stringify(extraction));
  const scale = out.scale_and_legend || {};
  const spatial = out.spatial_summary || {};
  const uncertain = new Set(
    Array.isArray(out.uncertain_fields)
      ? out.uncertain_fields.map(String)
      : []
  );

  const scaleConf = Number(scale.confidence);
  if (!Number.isFinite(scaleConf) || scaleConf <= 0) {
    scale.confidence = scale.scale_detected ? 0.55 : 0.25;
  }
  if (!scale.scale_detected || !(Number(scale.pixels_per_foot) > 0)) {
    uncertain.add('scale_and_legend.pixels_per_foot');
  }

  let areaConf = Number(spatial.area_confidence);
  if (!Number.isFinite(areaConf)) {
    areaConf =
      spatial.measurement_method === 'scale_legend'
        ? 0.82
        : spatial.measurement_method === 'reference_feature'
          ? 0.68
          : spatial.measurement_method === 'user_hint'
            ? 0.9
            : 0.45;
  }
  spatial.area_confidence = Math.max(0, Math.min(1, areaConf));
  if (spatial.area_confidence < 0.6) {
    uncertain.add('spatial_summary.total_cleanable_sq_ft');
  }

  spatial.substrate_breakdown = (spatial.substrate_breakdown || []).map(
    (s) => ({
      ...s,
      texture_notes: s.texture_notes || '',
      confidence:
        Number.isFinite(Number(s.confidence)) && Number(s.confidence) > 0
          ? Number(s.confidence)
          : 0.6,
    })
  );
  spatial.detected_fixtures = (spatial.detected_fixtures || []).map((f) => ({
    ...f,
    notes: f.notes || '',
    confidence:
      Number.isFinite(Number(f.confidence)) && Number(f.confidence) > 0
        ? Number(f.confidence)
        : 0.55,
  }));
  spatial.excluded_breakdown = Array.isArray(spatial.excluded_breakdown)
    ? spatial.excluded_breakdown
    : [];

  out.room_zones = (out.room_zones || []).map((z, i) => ({
    ...z,
    substrate_hint: z.substrate_hint || '',
    source_frame_indices: Array.isArray(z.source_frame_indices)
      ? z.source_frame_indices
      : [0],
    confidence:
      Number.isFinite(Number(z.confidence)) && Number(z.confidence) > 0
        ? Number(z.confidence)
        : 0.55,
  }));

  const lowFixtures = spatial.detected_fixtures.filter(
    (f) => Number(f.confidence) < 0.5
  );
  for (const f of lowFixtures) {
    uncertain.add(`detected_fixtures[${f.fixture_type}]`);
  }
  const lowZones = out.room_zones.filter((z) => Number(z.confidence) < 0.5);
  for (const z of lowZones) {
    uncertain.add(`room_zones[${z.room_zone}]`);
  }

  let overall = Number(out.overall_confidence);
  if (!Number.isFinite(overall)) {
    const parts = [
      Number(scale.confidence) || 0.4,
      spatial.area_confidence,
      ...spatial.substrate_breakdown.map((s) => Number(s.confidence) || 0.5),
      ...spatial.detected_fixtures.map((f) => Number(f.confidence) || 0.5),
      ...out.room_zones.map((z) => Number(z.confidence) || 0.5),
    ];
    overall = parts.length
      ? parts.reduce((a, b) => a + b, 0) / parts.length
      : 0.5;
  }
  out.overall_confidence = Math.round(Math.max(0, Math.min(1, overall)) * 100) / 100;
  out.uncertain_fields = [...uncertain];
  out.fusion_notes = out.fusion_notes || '';
  out.scale_and_legend = scale;
  out.spatial_summary = spatial;
  out._extraction_confidence = {
    overall: out.overall_confidence,
    area: spatial.area_confidence,
    scale: Number(scale.confidence) || 0,
    uncertain_fields: out.uncertain_fields,
  };
  return out;
}

/**
 * Deterministic area from legend: sq_ft = total_pixel_area / (pixels_per_foot^2).
 * Also supports reference_feature: pixels_per_foot = reference_pixel_length / reference_real_world_ft.
 * Prefer explicit calibrated hint only when the estimator sets hint_sq_ft.
 * Never silently invent a 12500 (or any) default area.
 */
export function applyScaleCalibration(extraction, modifiers = {}) {
  const out = structuredClone
    ? structuredClone(extraction)
    : JSON.parse(JSON.stringify(extraction));
  const scale = out.scale_and_legend || {};
  const hint = Number(modifiers.hint_sq_ft);
  let ppf = Number(scale.pixels_per_foot);

  // Derive ppf from reference feature when legend ppf missing
  const refFt = Number(scale.reference_real_world_ft);
  const refPx = Number(scale.reference_pixel_length);
  let derivedFromReference = false;
  if (
    !(Number.isFinite(ppf) && ppf > 0) &&
    Number.isFinite(refFt) &&
    refFt > 0 &&
    Number.isFinite(refPx) &&
    refPx > 0
  ) {
    ppf = refPx / refFt;
    scale.pixels_per_foot = Math.round(ppf * 1000) / 1000;
    derivedFromReference = true;
    out.scale_and_legend = scale;
  }

  const pixelArea = Number(
    modifiers.total_pixel_area ??
      scale.total_pixel_area ??
      out.spatial_summary?.total_pixel_area
  );

  // 1) Explicit user calibration hint (estimator UI) — highest priority when set
  if (Number.isFinite(hint) && hint > 0) {
    const current = Number(out.spatial_summary.total_cleanable_sq_ft) || hint;
    const factor = current > 0 ? hint / current : 1;
    out.spatial_summary.total_cleanable_sq_ft = Math.round(hint * 100) / 100;
    out.spatial_summary.measurement_method = 'user_hint';
    out.spatial_summary.area_confidence = Math.max(
      Number(out.spatial_summary.area_confidence) || 0,
      0.9
    );
    rescaleSubstrates(out, hint, factor);
    out.property_notes =
      `${out.property_notes || ''} | Calibrated to user hint_sq_ft=${hint}.`.trim();
    out._scale_calibration = 'user_hint';
    return enrichExtractionConfidence(out);
  }

  // 2) Deterministic legend / reference path: pixels_per_foot + pixel area → sq ft
  if (
    Number.isFinite(ppf) &&
    ppf > 0 &&
    Number.isFinite(pixelArea) &&
    pixelArea > 0
  ) {
    const computed = Math.round((pixelArea / (ppf * ppf)) * 100) / 100;
    const current = Number(out.spatial_summary.total_cleanable_sq_ft) || computed;
    const factor = current > 0 ? computed / current : 1;
    out.spatial_summary.total_cleanable_sq_ft = computed;
    out.spatial_summary.measurement_method =
      scale.scale_detected && !derivedFromReference
        ? 'scale_legend'
        : 'reference_feature';
    out.spatial_summary.total_pixel_area = pixelArea;
    out.spatial_summary.area_confidence = Math.max(
      Number(out.spatial_summary.area_confidence) || 0,
      scale.scale_detected && !derivedFromReference ? 0.85 : 0.7
    );
    rescaleSubstrates(out, computed, factor);
    out.property_notes =
      `${out.property_notes || ''} | Deterministic area from pixels_per_foot=${ppf} × pixel_area=${pixelArea}.`.trim();
    out._scale_calibration =
      scale.scale_detected && !derivedFromReference
        ? 'pixels_per_foot'
        : 'reference_pixels_per_foot';
    return enrichExtractionConfidence(out);
  }

  if (
    scale.scale_detected &&
    Number.isFinite(ppf) &&
    ppf > 0 &&
    Number(out.spatial_summary.total_cleanable_sq_ft) > 0
  ) {
    out.spatial_summary.measurement_method = 'scale_legend';
    out._scale_calibration = 'scale_legend_advisory';
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
    // Do not invent a default sq ft — keep vision estimate or 0 and mark uncertain
    if (!(Number(out.spatial_summary.total_cleanable_sq_ft) > 0)) {
      out.spatial_summary.total_cleanable_sq_ft = 0;
      out.spatial_summary.area_confidence = 0.15;
      out.property_notes =
        `${out.property_notes || ''} | No scale/reference/hint — area unknown; calibrate required.`.trim();
    }
  }

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

  return enrichExtractionConfidence(out);
}

/**
 * Reconcile multiple per-frame extractions summaries into one coherent result.
 * Used for tests and optional multi-call fusion; live GPT-4o path also fuses in-prompt.
 */
export function fuseSpatialExtracted(extractions = [], modifiers = {}) {
  const list = (extractions || []).filter(Boolean);
  if (!list.length) {
    throw Object.assign(new Error('fuseSpatialExtracted requires ≥1 extraction'), {
      status: 400,
      code: 'FUSION_EMPTY',
    });
  }
  if (list.length === 1) {
    const single = applyScaleCalibration(list[0], modifiers);
    single.fusion_notes =
      single.fusion_notes || 'Single-frame extract (no multi-frame merge).';
    single._frame_count = 1;
    single._source = single._source || 'fused-single';
    return enrichExtractionConfidence(single);
  }

  // Prefer strongest scale evidence
  const scaleRank = (e) => {
    const s = e.scale_and_legend || {};
    if (s.scale_detected && Number(s.pixels_per_foot) > 0) {
      return 3 + (Number(s.confidence) || 0);
    }
    if (s.reference_feature && Number(s.reference_real_world_ft) > 0) {
      return 2 + (Number(s.confidence) || 0);
    }
    return Number(s.confidence) || 0;
  };
  const bestScaleSrc = [...list].sort((a, b) => scaleRank(b) - scaleRank(a))[0];

  // Merge zones by normalized name
  const zoneMap = new Map();
  list.forEach((ext, frameIdx) => {
    for (const z of ext.room_zones || []) {
      const key = String(z.room_zone || '')
        .trim()
        .toLowerCase();
      if (!key) continue;
      const prev = zoneMap.get(key);
      const frames = new Set([
        ...(prev?.source_frame_indices || []),
        ...(Array.isArray(z.source_frame_indices)
          ? z.source_frame_indices
          : [frameIdx]),
        frameIdx,
      ]);
      if (!prev) {
        zoneMap.set(key, {
          ...z,
          source_frame_indices: [...frames].sort((a, b) => a - b),
        });
      } else {
        const sq =
          ((Number(prev.approx_sq_ft) || 0) + (Number(z.approx_sq_ft) || 0)) / 2;
        zoneMap.set(key, {
          ...prev,
          approx_sq_ft: Math.round(sq * 100) / 100,
          is_high_risk: Boolean(prev.is_high_risk || z.is_high_risk),
          risk_reason: prev.risk_reason || z.risk_reason || '',
          substrate_hint: prev.substrate_hint || z.substrate_hint || '',
          confidence: Math.max(
            Number(prev.confidence) || 0,
            Number(z.confidence) || 0
          ),
          suggested_tasks: [
            ...new Set([
              ...(prev.suggested_tasks || []),
              ...(z.suggested_tasks || []),
            ]),
          ].slice(0, 8),
          source_frame_indices: [...frames].sort((a, b) => a - b),
        });
      }
    }
  });

  // Merge fixtures by type (max count across frames to avoid double-count same room;
  // if zones differ, prefer sum when frame indices disjoint — use max as conservative default)
  const fixMap = new Map();
  for (const ext of list) {
    for (const f of ext.spatial_summary?.detected_fixtures || []) {
      const key = String(f.fixture_type || '')
        .trim()
        .toLowerCase();
      if (!key) continue;
      const prev = fixMap.get(key);
      if (!prev) {
        fixMap.set(key, { ...f });
      } else {
        fixMap.set(key, {
          ...prev,
          count: Math.max(Number(prev.count) || 0, Number(f.count) || 0),
          labor_intensity:
            intensityRank(f.labor_intensity) > intensityRank(prev.labor_intensity)
              ? f.labor_intensity
              : prev.labor_intensity,
          confidence: Math.max(
            Number(prev.confidence) || 0,
            Number(f.confidence) || 0
          ),
          notes: [prev.notes, f.notes].filter(Boolean).join(' | ').slice(0, 240),
        });
      }
    }
  }

  // Substrate: average percentages weighted by area confidence
  const subMap = new Map();
  for (const ext of list) {
    const w = Number(ext.spatial_summary?.area_confidence) || 0.5;
    for (const s of ext.spatial_summary?.substrate_breakdown || []) {
      const key = String(s.material || '')
        .trim()
        .toLowerCase();
      if (!key) continue;
      const prev = subMap.get(key) || {
        material: s.material,
        texture_notes: s.texture_notes || '',
        percentage: 0,
        weight: 0,
        confidence: 0,
      };
      prev.percentage += (Number(s.percentage) || 0) * w;
      prev.weight += w;
      prev.confidence = Math.max(prev.confidence, Number(s.confidence) || 0);
      prev.texture_notes = prev.texture_notes || s.texture_notes || '';
      subMap.set(key, prev);
    }
  }
  let substrates = [...subMap.values()].map((s) => ({
    material: s.material,
    texture_notes: s.texture_notes,
    percentage:
      s.weight > 0 ? Math.round((s.percentage / s.weight) * 10) / 10 : 0,
    approx_sq_ft: 0,
    confidence: s.confidence || 0.5,
  }));
  const pctSum = substrates.reduce((a, s) => a + s.percentage, 0) || 1;
  substrates = substrates.map((s) => ({
    ...s,
    percentage: Math.round((s.percentage / pctSum) * 1000) / 10,
  }));

  // Area: prefer deterministic scale on best scale source; else mean of finite areas
  const areas = list
    .map((e) => Number(e.spatial_summary?.total_cleanable_sq_ft))
    .filter((n) => Number.isFinite(n) && n > 0);
  const meanArea = areas.length
    ? Math.round((areas.reduce((a, b) => a + b, 0) / areas.length) * 100) / 100
    : 0;

  const exclMap = new Map();
  for (const ext of list) {
    for (const e of ext.spatial_summary?.excluded_breakdown || []) {
      const key = String(e.feature || '')
        .trim()
        .toLowerCase();
      if (!key) continue;
      const prev = exclMap.get(key);
      if (!prev) exclMap.set(key, { ...e });
      else {
        exclMap.set(key, {
          ...prev,
          approx_sq_ft: Math.max(
            Number(prev.approx_sq_ft) || 0,
            Number(e.approx_sq_ft) || 0
          ),
        });
      }
    }
  }
  const excluded_breakdown = [...exclMap.values()];
  const excluded_structural_sq_ft =
    Math.round(
      excluded_breakdown.reduce((a, e) => a + (Number(e.approx_sq_ft) || 0), 0) *
        100
    ) / 100;

  const uncertain = new Set();
  for (const ext of list) {
    for (const u of ext.uncertain_fields || []) uncertain.add(String(u));
  }
  if (areas.length > 1) {
    const min = Math.min(...areas);
    const max = Math.max(...areas);
    if (max - min > meanArea * 0.25) {
      uncertain.add('spatial_summary.total_cleanable_sq_ft');
    }
  }

  const fused = {
    scale_and_legend: {
      ...(bestScaleSrc.scale_and_legend || {}),
    },
    spatial_summary: {
      total_cleanable_sq_ft: meanArea,
      excluded_structural_sq_ft,
      excluded_breakdown,
      measurement_method:
        bestScaleSrc.spatial_summary?.measurement_method ||
        'contextual_estimate',
      area_confidence: Math.min(
        ...list.map((e) => Number(e.spatial_summary?.area_confidence) || 0.5)
      ),
      substrate_breakdown: substrates,
      detected_fixtures: [...fixMap.values()],
      total_pixel_area:
        Number(bestScaleSrc.scale_and_legend?.total_pixel_area) ||
        Number(bestScaleSrc.spatial_summary?.total_pixel_area) ||
        0,
    },
    room_zones: [...zoneMap.values()],
    fusion_notes: `Fused ${list.length} frame extracts: strongest scale from frame with confidence ${Number(bestScaleSrc.scale_and_legend?.confidence) || 0}; zones unioned; fixtures max-merged.`,
    uncertain_fields: [...uncertain],
    overall_confidence:
      list.reduce((a, e) => a + (Number(e.overall_confidence) || 0.5), 0) /
      list.length,
    property_notes: list
      .map((e) => e.property_notes)
      .filter(Boolean)
      .join(' · ')
      .slice(0, 800),
    _source: 'fused-multiframe',
    _frame_count: list.length,
  };

  // Recompute substrate approx from fused area after scale path
  const calibrated = applyScaleCalibration(fused, {
    ...modifiers,
    total_pixel_area:
      modifiers.total_pixel_area ??
      fused.spatial_summary.total_pixel_area ??
      fused.scale_and_legend.total_pixel_area,
  });
  calibrated._source = 'fused-multiframe';
  calibrated._frame_count = list.length;
  return calibrated;
}

function intensityRank(v) {
  const s = String(v || '').toLowerCase();
  if (s === 'high') return 3;
  if (s === 'medium') return 2;
  if (s === 'low') return 1;
  return 0;
}

/**
 * Richer deterministic mock when OPENAI_API_KEY is missing / mock=1.
 * Uses deterministic profile sizes — never a silent 12500 default.
 */
export function mockSpatialExtraction(modifiers = {}) {
  const profile = String(modifiers.facility_profile || 'medical_office').toLowerCase();
  const mockProfileSqFt = profile.includes('retail') ? 8200 : 10000;
  const ppf = 12.5;
  const totalPixelArea = mockProfileSqFt * ppf * ppf;
  const sqFt = Number(modifiers.hint_sq_ft) || mockProfileSqFt;
  const frameCount = Math.max(1, Number(modifiers.frame_count) || 1);

  const base = {
    scale_and_legend: {
      scale_detected: true,
      scale_text: "1/8\" = 1'-0\"",
      units: 'ft',
      pixels_per_foot: ppf,
      total_pixel_area: totalPixelArea,
      reference_feature: 'standard door leaf',
      reference_real_world_ft: 3,
      reference_pixel_length: 3 * ppf,
      confidence: 0.86,
      notes: 'Mock legend: architectural scale bar + 3 ft door reference.',
    },
    spatial_summary: {
      total_cleanable_sq_ft: sqFt,
      total_pixel_area: totalPixelArea,
      excluded_structural_sq_ft: Math.round(sqFt * 0.08),
      excluded_breakdown: [
        {
          feature: 'structural walls / columns',
          approx_sq_ft: Math.round(sqFt * 0.05),
          reason: 'non-cleanable footprint',
        },
        {
          feature: 'elevator / stair core',
          approx_sq_ft: Math.round(sqFt * 0.03),
          reason: 'vertical shaft void',
        },
      ],
      measurement_method: 'scale_legend',
      area_confidence: 0.84,
      substrate_breakdown: [
        {
          material: 'LVT',
          texture_notes: 'plank wood-look resilient',
          percentage: 42,
          approx_sq_ft: Math.round(sqFt * 0.42),
          confidence: 0.8,
        },
        {
          material: 'high-pile carpet',
          texture_notes: 'loop pile corridors',
          percentage: 28,
          approx_sq_ft: Math.round(sqFt * 0.28),
          confidence: 0.75,
        },
        {
          material: 'terrazzo',
          texture_notes: 'polished speckled lobby',
          percentage: 18,
          approx_sq_ft: Math.round(sqFt * 0.18),
          confidence: 0.78,
        },
        {
          material: 'porous concrete',
          texture_notes: 'sealed utility zones',
          percentage: 12,
          approx_sq_ft: Math.round(sqFt * 0.12),
          confidence: 0.7,
        },
      ],
      detected_fixtures: [
        {
          fixture_type: 'restroom plumbing fixtures',
          count: 18,
          labor_intensity: 'high',
          confidence: 0.82,
          notes: 'toilets + sinks + urinals',
        },
        {
          fixture_type: 'glass partitions',
          count: 8,
          labor_intensity: 'medium',
          confidence: 0.7,
          notes: '',
        },
        {
          fixture_type: 'HVAC diffusers',
          count: 46,
          labor_intensity: 'low',
          confidence: 0.65,
          notes: '',
        },
        {
          fixture_type: 'executive desks',
          count: 14,
          labor_intensity: 'medium',
          confidence: 0.72,
          notes: '',
        },
        {
          fixture_type: 'bio-hazard waste stations',
          count: 4,
          labor_intensity: 'high',
          confidence: 0.88,
          notes: 'clinic corridor',
        },
        {
          fixture_type: 'exam / treatment tables',
          count: 6,
          labor_intensity: 'high',
          confidence: 0.8,
          notes: '',
        },
        {
          fixture_type: 'breakroom appliances',
          count: 5,
          labor_intensity: 'medium',
          confidence: 0.74,
          notes: '',
        },
      ],
    },
    room_zones: [
      {
        room_zone: 'Lobby / reception',
        approx_sq_ft: Math.round(sqFt * 0.12),
        is_high_risk: false,
        risk_reason: '',
        substrate_hint: 'terrazzo',
        confidence: 0.85,
        source_frame_indices: [0],
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
        substrate_hint: 'high-pile carpet',
        confidence: 0.78,
        source_frame_indices: frameCount > 1 ? [0, 1] : [0],
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
        substrate_hint: 'LVT',
        confidence: 0.76,
        source_frame_indices: [Math.min(1, frameCount - 1)],
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
        substrate_hint: 'LVT',
        confidence: 0.8,
        source_frame_indices: [Math.min(2, frameCount - 1)],
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
        substrate_hint: 'ceramic / resilient',
        confidence: 0.86,
        source_frame_indices: [Math.min(2, frameCount - 1)],
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
        substrate_hint: 'LVT',
        confidence: 0.83,
        source_frame_indices: frameCount > 1 ? [1, Math.min(3, frameCount - 1)] : [0],
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
        substrate_hint: 'porous concrete',
        confidence: 0.7,
        source_frame_indices: [Math.min(frameCount - 1, 3)],
        suggested_tasks: [
          'Dust-free wipe of accessible surfaces only',
          'Avoid cable disturbance',
          'Spot mop resilient floor',
        ],
      },
    ],
    fusion_notes:
      frameCount > 1
        ? `Mock fusion across ${frameCount} guided walkthrough frames (doorway → floor texture → rooms).`
        : 'Mock single-frame extract with legend + door reference.',
    uncertain_fields:
      frameCount < 3
        ? ['room_zones[Mechanical / server alcove]', 'detected_fixtures[HVAC diffusers]']
        : ['detected_fixtures[HVAC diffusers]'],
    overall_confidence: frameCount >= 3 ? 0.82 : 0.74,
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
      confidence: 0.77,
      notes: '',
    });
    base.room_zones = base.room_zones.filter(
      (z) => !/clinic|exam/i.test(z.room_zone)
    );
    base.room_zones.push({
      room_zone: 'Sales floor / aisles',
      approx_sq_ft: Math.round(sqFt * 0.45),
      is_high_risk: false,
      risk_reason: '',
      substrate_hint: 'LVT',
      confidence: 0.8,
      source_frame_indices: [0],
      suggested_tasks: [
        'Dust-mop hard floors',
        'Spot-clean glass fixtures',
        'Empty trash islands',
      ],
    });
  }

  const calibrated = applyScaleCalibration(base, modifiers);
  calibrated._frame_count = frameCount;
  calibrated._video_received = Boolean(modifiers.video_received);
  if (frameCount > 1 || modifiers.video_received) {
    calibrated.property_notes =
      `${calibrated.property_notes || ''} | Multi-frame walkthrough mock (${frameCount} frame(s)${modifiers.video_received ? ', video attached' : ''}).`.trim();
    calibrated._source = 'mock-multiframe';
  }
  return calibrated;
}

/**
 * Normalize multer / client uploads into a media list.
 */
export function collectWalkthroughMedia(files = {}) {
  const frames = [];
  const pushFile = (f) => {
    if (!f?.buffer?.length) return;
    const mime = (f.mimetype || '').toLowerCase();
    if (mime.startsWith('video/')) return;
    frames.push({
      buffer: f.buffer,
      mimeType: f.mimetype || 'image/jpeg',
      filename: f.originalname,
    });
  };
  if (files.image) pushFile(Array.isArray(files.image) ? files.image[0] : files.image);
  for (const f of files.images || []) pushFile(f);
  const videoFile = files.video
    ? Array.isArray(files.video)
      ? files.video[0]
      : files.video
    : null;
  const video =
    videoFile?.buffer?.length &&
    String(videoFile.mimetype || '').toLowerCase().startsWith('video/')
      ? {
          mimeType: videoFile.mimetype,
          filename: videoFile.originalname,
          byte_length: videoFile.buffer.length,
        }
      : null;
  return { frames, video };
}

export async function processWalkthroughImage(
  imageBuffer,
  mimeType,
  customPromptModifiers = {}
) {
  return processWalkthroughMedia(
    [{ buffer: imageBuffer, mimeType }],
    customPromptModifiers
  );
}

/**
 * Multi-frame walkthrough extraction via GPT-4o (single fused call) + deterministic scale.
 */
export async function processWalkthroughMedia(
  frames = [],
  customPromptModifiers = {}
) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw Object.assign(
      new Error(
        'OPENAI_API_KEY missing — cannot run live GPT-4o vision. Set the key or use mock=1 in non-production (advanced/dev toggle).'
      ),
      { status: 503, code: 'OPENAI_KEY_MISSING' }
    );
  }

  const usable = (frames || []).filter((f) => f?.buffer?.length);
  if (!usable.length) {
    throw Object.assign(
      new Error(
        'At least one camera/photo frame is required for GPT-4o walkthrough. Video-only uploads need accompanying stills (or enable mock via advanced/dev toggle).'
      ),
      { status: 400, code: 'VISION_IMAGE_REQUIRED' }
    );
  }

  const maxFrames = Math.max(
    1,
    Math.min(12, Number(process.env.VISION_MAX_FRAMES || 8))
  );
  const selected = usable.slice(0, maxFrames);

  try {
    const openai = new OpenAI({ apiKey });
    const imageParts = selected.map((f) => ({
      type: 'image_url',
      image_url: {
        url: `data:${f.mimeType || 'image/jpeg'};base64,${f.buffer.toString('base64')}`,
        detail: 'high',
      },
    }));
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
              text: `Analyze this multi-frame site walkthrough / floorplan upload (${selected.length} image frame(s)${customPromptModifiers.video_received ? ' + video coverage note' : ''}).

Frame order is the guided capture sequence (e.g. doorway for scale → floor texture → each room). Contextual parameters: ${JSON.stringify(customPromptModifiers)}.

FUSION RULES:
- Produce ONE coherent spatial_summary and room_zones list covering ALL frames.
- Prefer scale legend when any frame shows one; else door/hallway reference.
- Union rooms; do not ignore later frames.
- Fill uncertain_fields for anything you cannot verify visually.
- Extract spatial data only — no financial math.`,
            },
            ...imageParts,
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
    parsed._source = selected.length > 1 ? 'gpt-4o-multiframe' : 'gpt-4o';
    parsed._frame_count = selected.length;
    if (!parsed.fusion_notes) {
      parsed.fusion_notes =
        selected.length > 1
          ? `GPT-4o fused ${selected.length} walkthrough frames in one pass.`
          : 'Single-frame GPT-4o extract.';
    }
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

export { EXTRACTION_SCHEMA, SYSTEM_PROMPT };
