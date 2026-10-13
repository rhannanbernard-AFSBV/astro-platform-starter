import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyScaleCalibration,
  enrichExtractionConfidence,
  fuseSpatialExtracted,
  mockSpatialExtraction,
} from './visionExtract.js';

function bareFrame(overrides = {}) {
  return {
    scale_and_legend: {
      scale_detected: false,
      scale_text: '',
      units: 'ft',
      pixels_per_foot: 0,
      total_pixel_area: 0,
      reference_feature: 'door',
      reference_real_world_ft: 3,
      reference_pixel_length: 36,
      confidence: 0.6,
      notes: 'door leaf',
      ...(overrides.scale_and_legend || {}),
    },
    spatial_summary: {
      total_cleanable_sq_ft: 4000,
      excluded_structural_sq_ft: 200,
      excluded_breakdown: [
        { feature: 'walls', approx_sq_ft: 200, reason: 'structure' },
      ],
      measurement_method: 'reference_feature',
      area_confidence: 0.55,
      substrate_breakdown: [
        {
          material: 'LVT',
          texture_notes: 'plank',
          percentage: 100,
          approx_sq_ft: 4000,
          confidence: 0.7,
        },
      ],
      detected_fixtures: [
        {
          fixture_type: 'sinks',
          count: 2,
          labor_intensity: 'medium',
          confidence: 0.6,
          notes: '',
        },
      ],
      ...(overrides.spatial_summary || {}),
    },
    room_zones: overrides.room_zones || [
      {
        room_zone: 'Lobby',
        approx_sq_ft: 1200,
        is_high_risk: false,
        risk_reason: '',
        substrate_hint: 'LVT',
        confidence: 0.7,
        source_frame_indices: [0],
        suggested_tasks: ['Dust'],
      },
    ],
    fusion_notes: '',
    uncertain_fields: overrides.uncertain_fields || [],
    overall_confidence: 0.6,
    property_notes: 'frame',
    ...overrides,
  };
}

describe('premium fusion + scale + confidence', () => {
  it('fuses multiple frames into one coherent spatial_summary', () => {
    const a = bareFrame({
      room_zones: [
        {
          room_zone: 'Lobby',
          approx_sq_ft: 1000,
          is_high_risk: false,
          risk_reason: '',
          substrate_hint: 'terrazzo',
          confidence: 0.8,
          source_frame_indices: [0],
          suggested_tasks: ['Dust lobby'],
        },
      ],
      spatial_summary: {
        total_cleanable_sq_ft: 5000,
        excluded_structural_sq_ft: 100,
        excluded_breakdown: [],
        measurement_method: 'contextual_estimate',
        area_confidence: 0.5,
        substrate_breakdown: [
          {
            material: 'terrazzo',
            texture_notes: 'polished',
            percentage: 40,
            approx_sq_ft: 2000,
            confidence: 0.8,
          },
          {
            material: 'carpet',
            texture_notes: 'pile',
            percentage: 60,
            approx_sq_ft: 3000,
            confidence: 0.7,
          },
        ],
        detected_fixtures: [
          {
            fixture_type: 'sinks',
            count: 2,
            labor_intensity: 'high',
            confidence: 0.7,
            notes: '',
          },
        ],
      },
    });
    const b = bareFrame({
      scale_and_legend: {
        scale_detected: true,
        scale_text: "1/8\"=1'-0\"",
        units: 'ft',
        pixels_per_foot: 10,
        total_pixel_area: 10 * 10 * 4500,
        reference_feature: '',
        reference_real_world_ft: 0,
        reference_pixel_length: 0,
        confidence: 0.92,
        notes: 'legend',
      },
      room_zones: [
        {
          room_zone: 'Lobby',
          approx_sq_ft: 1100,
          is_high_risk: false,
          risk_reason: '',
          substrate_hint: 'terrazzo',
          confidence: 0.75,
          source_frame_indices: [1],
          suggested_tasks: ['Mop'],
        },
        {
          room_zone: 'Clinic',
          approx_sq_ft: 2200,
          is_high_risk: true,
          risk_reason: 'bio-hazard',
          substrate_hint: 'LVT',
          confidence: 0.85,
          source_frame_indices: [1],
          suggested_tasks: ['PPE'],
        },
      ],
      spatial_summary: {
        total_cleanable_sq_ft: 4500,
        excluded_structural_sq_ft: 150,
        excluded_breakdown: [
          { feature: 'elevator', approx_sq_ft: 150, reason: 'shaft' },
        ],
        measurement_method: 'scale_legend',
        area_confidence: 0.88,
        substrate_breakdown: [
          {
            material: 'LVT',
            texture_notes: 'clinic',
            percentage: 55,
            approx_sq_ft: 2475,
            confidence: 0.8,
          },
          {
            material: 'terrazzo',
            texture_notes: 'lobby',
            percentage: 45,
            approx_sq_ft: 2025,
            confidence: 0.8,
          },
        ],
        detected_fixtures: [
          {
            fixture_type: 'sinks',
            count: 4,
            labor_intensity: 'high',
            confidence: 0.8,
            notes: '',
          },
          {
            fixture_type: 'bio-hazard waste stations',
            count: 3,
            labor_intensity: 'high',
            confidence: 0.9,
            notes: '',
          },
        ],
      },
    });

    const fused = fuseSpatialExtracted([a, b], {});
    assert.equal(fused._source, 'fused-multiframe');
    assert.equal(fused._frame_count, 2);
    assert.equal(fused.spatial_summary.total_cleanable_sq_ft, 4500); // deterministic ppf path
    assert.equal(fused._scale_calibration, 'pixels_per_foot');
    assert.ok(fused.room_zones.some((z) => /clinic/i.test(z.room_zone)));
    const lobby = fused.room_zones.find((z) => /lobby/i.test(z.room_zone));
    assert.ok(lobby);
    assert.ok(lobby.source_frame_indices.includes(0));
    assert.ok(lobby.source_frame_indices.includes(1));
    const sinks = fused.spatial_summary.detected_fixtures.find((f) =>
      /sink/i.test(f.fixture_type)
    );
    assert.equal(sinks.count, 4);
    assert.ok(fused.extraction_confidence || fused._extraction_confidence);
    assert.ok(Array.isArray(fused.uncertain_fields));
    assert.match(fused.fusion_notes || '', /Fused 2/);
  });

  it('reference_pixel_length derives pixels_per_foot without inventing area', () => {
    const raw = bareFrame({
      scale_and_legend: {
        scale_detected: false,
        scale_text: '',
        units: 'ft',
        pixels_per_foot: 0,
        total_pixel_area: 20 * 20 * 1200,
        reference_feature: 'door leaf',
        reference_real_world_ft: 3,
        reference_pixel_length: 60, // → 20 px/ft
        confidence: 0.7,
        notes: '',
      },
      spatial_summary: {
        total_cleanable_sq_ft: 9999,
        excluded_structural_sq_ft: 0,
        excluded_breakdown: [],
        measurement_method: 'contextual_estimate',
        area_confidence: 0.4,
        substrate_breakdown: [
          {
            material: 'LVT',
            texture_notes: '',
            percentage: 100,
            approx_sq_ft: 9999,
            confidence: 0.5,
          },
        ],
        detected_fixtures: [],
      },
    });
    const out = applyScaleCalibration(raw, {});
    assert.equal(out.spatial_summary.total_cleanable_sq_ft, 1200);
    assert.equal(out._scale_calibration, 'reference_pixels_per_foot');
    assert.ok(out.scale_and_legend.pixels_per_foot > 0);
  });

  it('never invents 12500 when scale and area are missing', () => {
    const raw = bareFrame({
      scale_and_legend: {
        scale_detected: false,
        scale_text: '',
        units: 'ft',
        pixels_per_foot: 0,
        total_pixel_area: 0,
        reference_feature: '',
        reference_real_world_ft: 0,
        reference_pixel_length: 0,
        confidence: 0.2,
        notes: 'no scale',
      },
      spatial_summary: {
        total_cleanable_sq_ft: 0,
        excluded_structural_sq_ft: 0,
        excluded_breakdown: [],
        measurement_method: 'contextual_estimate',
        area_confidence: 0.1,
        substrate_breakdown: [],
        detected_fixtures: [],
      },
    });
    const out = applyScaleCalibration(raw, {});
    assert.equal(out.spatial_summary.total_cleanable_sq_ft, 0);
    assert.notEqual(out.spatial_summary.total_cleanable_sq_ft, 12500);
    assert.ok(
      out.uncertain_fields.includes('spatial_summary.total_cleanable_sq_ft')
    );
  });

  it('enrichExtractionConfidence surfaces low-confidence fixtures', () => {
    const m = mockSpatialExtraction({ frame_count: 2 });
    const enriched = enrichExtractionConfidence({
      ...m,
      spatial_summary: {
        ...m.spatial_summary,
        detected_fixtures: [
          {
            fixture_type: 'mystery unit',
            count: 1,
            labor_intensity: 'low',
            confidence: 0.2,
            notes: '',
          },
        ],
      },
      overall_confidence: undefined,
      uncertain_fields: [],
    });
    assert.ok(
      enriched.uncertain_fields.some((u) => /mystery unit/i.test(u))
    );
    assert.ok(enriched._extraction_confidence.overall > 0);
  });

  it('mock multi-frame includes confidence + exclusions', () => {
    const m = mockSpatialExtraction({ frame_count: 4, video_received: true });
    assert.equal(m._source, 'mock-multiframe');
    assert.ok(m.spatial_summary.excluded_breakdown.length >= 1);
    assert.ok(m.overall_confidence > 0.5);
    assert.ok(Array.isArray(m.uncertain_fields));
    assert.ok(m.room_zones.every((z) => Array.isArray(z.source_frame_indices)));
  });
});
