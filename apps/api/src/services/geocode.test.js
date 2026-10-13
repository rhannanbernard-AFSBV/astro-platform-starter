import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  nominatimEndpoint,
  nominatimHostAllowlist,
} from './geocode.js';

describe('geocode / Nominatim config', () => {
  it('defaults to public Nominatim search endpoint', () => {
    delete process.env.NOMINATIM_URL;
    const u = nominatimEndpoint();
    assert.equal(u.hostname, 'nominatim.openstreetmap.org');
    assert.match(u.pathname, /search/);
  });

  it('allowlist defaults to endpoint host', () => {
    delete process.env.NOMINATIM_ALLOWLIST;
    delete process.env.NOMINATIM_URL;
    const list = nominatimHostAllowlist();
    assert.ok(list.includes('nominatim.openstreetmap.org'));
  });

  it('respects NOMINATIM_ALLOWLIST', () => {
    process.env.NOMINATIM_ALLOWLIST = 'geo.example.com, nominatim.openstreetmap.org';
    const list = nominatimHostAllowlist();
    assert.deepEqual(list, ['geo.example.com', 'nominatim.openstreetmap.org']);
    delete process.env.NOMINATIM_ALLOWLIST;
  });
});
