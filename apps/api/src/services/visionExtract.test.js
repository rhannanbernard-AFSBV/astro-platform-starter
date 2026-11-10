import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyScaleCalibration,
  mockSpatialExtraction,
} from './visionExtract.js';

describe('visionExtract', () => {
  it('mock includes scale legend and richer fixtures', () => {
    const m = mockSpatialExtraction({ hint_sq_ft: 10000 });
    assert.equal(m._source, 'mock');
    assert.equal(m.scale_and_legend.scale_detected, true);
    assert.ok(m.scale_and_legend.pixels_per_foot > 0);
    assert.equal(m.spatial_summary.total_cleanable_sq_ft, 10000);
    assert.ok(m.spatial_summary.detected_fixtures.length >= 5);
    assert.ok(
      m.spatial_summary.detected_fixtures.some((f) =>
        /bio-hazard/i.test(f.fixture_type)
      )
    );
    assert.ok(m.room_zones.some((z) => z.is_high_risk));
    assert.equal(m.meta?.scale_calibration || m._scale_calibration, 'user_hint');
  });

  it('applyScaleCalibration prefers user hint', () => {
    const raw = mockSpatialExtraction({});
    raw.spatial_summary.total_cleanable_sq_ft = 5000;
    const calibrated = applyScaleCalibration(raw, { hint_sq_ft: 8000 });
    assert.equal(calibrated.spatial_summary.total_cleanable_sq_ft, 8000);
    assert.equal(calibrated._scale_calibration, 'user_hint');
  });

  it('deterministic pixels_per_foot path recomputes area without hint', () => {
    const raw = {
      scale_and_legend: {
        scale_detected: true,
        pixels_per_foot: 10,
        total_pixel_area: 10 * 10 * 2500, // 2500 sq ft
        scale_text: '1"=10\'',
        units: 'ft',
        reference_feature: '',
        reference_real_world_ft: 0,
        confidence: 0.9,
        notes: '',
      },
      spatial_summary: {
        total_cleanable_sq_ft: 9999,
        substrate_breakdown: [
          { material: 'LVT', percentage: 100, approx_sq_ft: 9999 },
        ],
        detected_fixtures: [],
        excluded_structural_sq_ft: 0,
        measurement_method: 'contextual_estimate',
      },
      room_zones: [],
      property_notes: '',
    };
    const out = applyScaleCalibration(raw, {});
    assert.equal(out.spatial_summary.total_cleanable_sq_ft, 2500);
    assert.equal(out._scale_calibration, 'pixels_per_foot');
    assert.equal(out.spatial_summary.measurement_method, 'scale_legend');
  });

  it('mock without hint uses deterministic legend path (not default 12500 hint)', () => {
    const m = mockSpatialExtraction({});
    assert.equal(m.spatial_summary.total_cleanable_sq_ft, 10000);
    assert.equal(m._scale_calibration, 'pixels_per_foot');
    assert.notEqual(m.spatial_summary.total_cleanable_sq_ft, 12500);
    assert.ok(m._extraction_confidence?.overall > 0);
    assert.ok(Array.isArray(m.uncertain_fields));
    assert.ok(m.spatial_summary.excluded_breakdown?.length >= 1);
  });
});
