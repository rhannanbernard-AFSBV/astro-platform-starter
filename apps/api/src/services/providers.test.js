import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveVisionMode,
  assertEmailSendable,
  emailTransportName,
  providerStatus,
} from './providers.js';

const KEYS = [
  'OPENAI_API_KEY',
  'RESEND_API_KEY',
  'SENDGRID_API_KEY',
  'SMTP_HOST',
  'ALLOW_MOCK_VISION',
  'ALLOW_EMAIL_DRY_RUN',
  'REQUIRE_EMAIL_PROVIDER',
  'NODE_ENV',
  'OMNI_ENV',
];

describe('providers', () => {
  const snap = {};

  beforeEach(() => {
    for (const k of KEYS) snap[k] = process.env[k];
    for (const k of KEYS) delete process.env[k];
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (snap[k] === undefined) delete process.env[k];
      else process.env[k] = snap[k];
    }
  });

  it('falls back to mock when OpenAI key missing in development', () => {
    const mode = resolveVisionMode({ forceMock: false, hasImage: true });
    assert.equal(mode.useMock, true);
    assert.equal(mode.reason, 'openai_key_missing_fallback_mock');
  });

  it('requires image for live vision when key present', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    assert.throws(
      () => resolveVisionMode({ forceMock: false, hasImage: false }),
      (err) => err.code === 'VISION_IMAGE_REQUIRED'
    );
  });

  it('uses live OpenAI when key + image present', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const mode = resolveVisionMode({ forceMock: false, hasImage: true });
    assert.equal(mode.useMock, false);
    assert.equal(mode.reason, 'openai_live');
  });

  it('blocks mock in production without ALLOW_MOCK_VISION', () => {
    process.env.NODE_ENV = 'production';
    assert.throws(
      () => resolveVisionMode({ forceMock: true, hasImage: false }),
      (err) => err.code === 'VISION_MOCK_DISABLED'
    );
  });

  it('prefers Resend over SendGrid over SMTP', () => {
    process.env.SMTP_HOST = 'smtp.example';
    assert.equal(emailTransportName(), 'smtp');
    process.env.SENDGRID_API_KEY = 'sg';
    assert.equal(emailTransportName(), 'sendgrid');
    process.env.RESEND_API_KEY = 're';
    assert.equal(emailTransportName(), 'resend');
  });

  it('rejects dry_run email in production', () => {
    process.env.NODE_ENV = 'production';
    assert.throws(() => assertEmailSendable(), (err) => err.code === 'EMAIL_PROVIDER_MISSING');
  });

  it('allows dry_run in development', () => {
    assert.equal(assertEmailSendable(), 'dry_run');
  });

  it('reports provider status shape', () => {
    const s = providerStatus();
    assert.equal(typeof s.openai_configured, 'boolean');
    assert.equal(typeof s.vision_mock_allowed, 'boolean');
    assert.ok(['dry_run', 'resend', 'sendgrid', 'smtp'].includes(s.email_transport));
  });
});
