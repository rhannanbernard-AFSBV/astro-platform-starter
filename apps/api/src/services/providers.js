/**
 * Provider readiness + clear operator errors for OpenAI vision and email.
 */

export function openaiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function emailTransportName() {
  if (process.env.RESEND_API_KEY?.trim()) return 'resend';
  if (process.env.SENDGRID_API_KEY?.trim()) return 'sendgrid';
  if (process.env.SMTP_HOST?.trim()) return 'smtp';
  return 'dry_run';
}

export function emailProviderConfigured() {
  return emailTransportName() !== 'dry_run';
}

export function allowVisionMock() {
  if (process.env.ALLOW_MOCK_VISION === 'true') return true;
  if (process.env.ALLOW_MOCK_VISION === 'false') return false;
  const env = (process.env.NODE_ENV || 'development').toLowerCase();
  return env !== 'production';
}

export function allowEmailDryRun() {
  if (process.env.ALLOW_EMAIL_DRY_RUN === 'true') return true;
  if (process.env.REQUIRE_EMAIL_PROVIDER === 'true') return false;
  const env = (process.env.NODE_ENV || 'development').toLowerCase();
  return env !== 'production';
}

/**
 * Decide mock vs live vision. Throws with actionable message when live cannot run.
 */
export function resolveVisionMode({ forceMock, hasImage }) {
  if (forceMock) {
    if (!allowVisionMock()) {
      throw Object.assign(
        new Error(
          'Mock vision is disabled in this environment. Set OPENAI_API_KEY and upload an image, or set ALLOW_MOCK_VISION=true for demos.'
        ),
        { status: 400, code: 'VISION_MOCK_DISABLED' }
      );
    }
    return { useMock: true, reason: 'client_requested_mock' };
  }

  if (!openaiConfigured()) {
    if (!allowVisionMock()) {
      throw Object.assign(
        new Error(
          'OPENAI_API_KEY is required for live GPT-4o walkthroughs. Add the key to the API environment (Railway/hosting secrets).'
        ),
        { status: 503, code: 'OPENAI_KEY_MISSING' }
      );
    }
    return { useMock: true, reason: 'openai_key_missing_fallback_mock' };
  }

  if (!hasImage) {
    throw Object.assign(
      new Error(
        'Live vision requires an image upload (floorplan / walkthrough photo). Attach field "image", or pass mock=1 for demo spatial data.'
      ),
      { status: 400, code: 'VISION_IMAGE_REQUIRED' }
    );
  }

  return { useMock: false, reason: 'openai_live' };
}

/**
 * Guard outbound email when dry-run is not allowed.
 */
export function assertEmailSendable() {
  if (emailProviderConfigured()) return emailTransportName();
  if (allowEmailDryRun()) return 'dry_run';
  throw Object.assign(
    new Error(
      'No email provider configured. Set RESEND_API_KEY, SENDGRID_API_KEY, or SMTP_HOST (+ SMTP_USER/SMTP_PASS). For non-prod demos set ALLOW_EMAIL_DRY_RUN=true.'
    ),
    { status: 503, code: 'EMAIL_PROVIDER_MISSING' }
  );
}

export function providerStatus() {
  return {
    openai_configured: openaiConfigured(),
    vision_mock_allowed: allowVisionMock(),
    email_transport: emailTransportName(),
    email_dry_run_allowed: allowEmailDryRun(),
  };
}
