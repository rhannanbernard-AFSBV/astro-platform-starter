import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

describe('signedUrls', () => {
  before(() => {
    process.env.ALLOW_INSECURE_JWT = 'true';
    process.env.JWT_SECRET =
      process.env.JWT_SECRET || 'ci-test-secret-at-least-32-characters-long!!';
  });

  it('signs and verifies protected paths', async () => {
    const {
      signStaticPath,
      verifySignedQuery,
      signedAbsoluteUrl,
    } = await import('./signedUrls.js');
    const { pathname, exp, sig } = signStaticPath('/qa-photos/demo.jpg', 600);
    assert.equal(pathname, '/qa-photos/demo.jpg');
    assert.equal(verifySignedQuery(pathname, exp, sig), true);
    assert.equal(verifySignedQuery(pathname, exp, 'deadbeef'), false);
    assert.equal(verifySignedQuery(pathname, 1, sig), false);
    const abs = signedAbsoluteUrl('/insurance/coi.pdf', 60);
    assert.match(abs, /\/insurance\/coi\.pdf\?exp=\d+&sig=[a-f0-9]+/);
  });
});
