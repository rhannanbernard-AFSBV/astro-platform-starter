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
});
