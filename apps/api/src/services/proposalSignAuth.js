import crypto from 'node:crypto';
import { query } from '../db/client.js';
import { sendEmail } from './email.js';
import { getProposalByToken } from './proposalActions.js';

const OTP_TTL_MS = () =>
  Math.max(60_000, Number(process.env.PROPOSAL_SIGN_OTP_TTL_MS || 15 * 60 * 1000));
const OTP_MAX_ATTEMPTS = () =>
  Math.max(3, Number(process.env.PROPOSAL_SIGN_OTP_MAX_ATTEMPTS || 5));
const ONE_TIME_TTL_MS = () =>
  Math.max(60_000, Number(process.env.PROPOSAL_SIGN_TOKEN_TTL_MS || 10 * 60 * 1000));

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function generateOtp() {
  // 6-digit numeric, cryptographically strong
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, '0');
}

function generateOneTimeToken() {
  return crypto.randomBytes(24).toString('hex');
}

/**
 * Email a one-time OTP to the signer. Portal access_token alone is not enough to sign.
 */
export async function requestSignOtp({ accessToken, signerEmail }) {
  const proposal = await getProposalByToken(accessToken);
  if (proposal.status === 'Signed' || proposal.access_token_revoked_at) {
    throw Object.assign(new Error('Proposal already signed or link revoked'), {
      status: 409,
      code: 'PROPOSAL_ALREADY_SIGNED',
    });
  }
  const email = String(signerEmail || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw Object.assign(new Error('signer_email is required for sign OTP'), {
      status: 400,
      code: 'SIGN_OTP_EMAIL_REQUIRED',
    });
  }

  const otp = generateOtp();
  const expires = new Date(Date.now() + OTP_TTL_MS());
  await query(
    `UPDATE proposals SET
       sign_otp_hash = $1,
       sign_otp_expires_at = $2,
       sign_otp_attempts = 0,
       sign_otp_sent_to = $3,
       sign_one_time_token_hash = NULL,
       sign_one_time_token_expires_at = NULL,
       sign_one_time_token_used_at = NULL
     WHERE proposal_id = $4`,
    [sha256(otp), expires.toISOString(), email, proposal.proposal_id]
  );

  const subject = `OmniClean signing code for ${proposal.client_name}`;
  const html = `<p>Your OmniClean proposal signing code is:</p>
    <p style="font-size:28px;letter-spacing:4px;font-weight:700;">${otp}</p>
    <p>It expires in ${Math.round(OTP_TTL_MS() / 60000)} minutes. Do not forward this code.</p>
    <p>If you did not request this, ignore this email.</p>`;

  let emailResult;
  try {
    emailResult = await sendEmail({
      tenantId: proposal.tenant_id,
      proposalId: proposal.proposal_id,
      to: email,
      subject,
      html,
      from: proposal.company_email
        ? `${proposal.tenant_name} <${proposal.company_email}>`
        : undefined,
    });
  } catch (err) {
    // Dev without email provider: surface OTP in response when dry_run / allowed
    if (
      err.code === 'EMAIL_PROVIDER_MISSING' &&
      (process.env.NODE_ENV || '').toLowerCase() !== 'production' &&
      (process.env.OMNI_ENV || '').toLowerCase() !== 'production'
    ) {
      return {
        status: 'otp_issued_dev',
        sent_to: email,
        expires_at: expires.toISOString(),
        transport: 'none',
        // Dev-only convenience — never returned in production
        dev_otp: otp,
        message:
          'Email provider missing — OTP returned in response for local/dev only',
      };
    }
    throw err;
  }

  return {
    status: 'otp_sent',
    sent_to: email,
    expires_at: expires.toISOString(),
    transport: emailResult.transport,
    // Include OTP only for dry_run so local demos work without inbox
    ...(emailResult.transport === 'dry_run' ? { dev_otp: otp } : {}),
  };
}

/**
 * Verify OTP → issue short-lived one-time sign token (hash stored server-side).
 */
export async function verifySignOtp({ accessToken, otp }) {
  const proposal = await getProposalByToken(accessToken);
  if (proposal.status === 'Signed' || proposal.access_token_revoked_at) {
    throw Object.assign(new Error('Proposal already signed or link revoked'), {
      status: 409,
      code: 'PROPOSAL_ALREADY_SIGNED',
    });
  }
  if (!proposal.sign_otp_hash || !proposal.sign_otp_expires_at) {
    throw Object.assign(new Error('Request a signing OTP first'), {
      status: 400,
      code: 'SIGN_OTP_REQUIRED',
    });
  }
  if (new Date(proposal.sign_otp_expires_at).getTime() < Date.now()) {
    throw Object.assign(new Error('Signing OTP expired — request a new code'), {
      status: 410,
      code: 'SIGN_OTP_EXPIRED',
    });
  }
  if (Number(proposal.sign_otp_attempts || 0) >= OTP_MAX_ATTEMPTS()) {
    throw Object.assign(new Error('Too many OTP attempts — request a new code'), {
      status: 429,
      code: 'SIGN_OTP_LOCKED',
    });
  }

  const ok = sha256(String(otp || '').trim()) === proposal.sign_otp_hash;
  if (!ok) {
    await query(
      `UPDATE proposals SET sign_otp_attempts = sign_otp_attempts + 1
       WHERE proposal_id = $1`,
      [proposal.proposal_id]
    );
    throw Object.assign(new Error('Invalid signing OTP'), {
      status: 401,
      code: 'SIGN_OTP_INVALID',
    });
  }

  const oneTime = generateOneTimeToken();
  const expires = new Date(Date.now() + ONE_TIME_TTL_MS());
  await query(
    `UPDATE proposals SET
       sign_otp_hash = NULL,
       sign_otp_expires_at = NULL,
       sign_otp_attempts = 0,
       sign_one_time_token_hash = $1,
       sign_one_time_token_expires_at = $2,
       sign_one_time_token_used_at = NULL
     WHERE proposal_id = $3`,
    [sha256(oneTime), expires.toISOString(), proposal.proposal_id]
  );

  return {
    status: 'otp_verified',
    sign_token: oneTime,
    expires_at: expires.toISOString(),
  };
}

/**
 * Assert one-time sign token (or OTP if PROPOSAL_SIGN_ALLOW_OTP_ON_SIGN=true) before sign.
 * Consumes the one-time token.
 */
export async function assertSignAuthorization({ accessToken, signToken, otp }) {
  const requireAuth =
    (process.env.PROPOSAL_SIGN_REQUIRE_OTP || 'true').toLowerCase() !== 'false';
  if (!requireAuth) return { mode: 'disabled' };

  const proposal = await getProposalByToken(accessToken);
  if (proposal.access_token_revoked_at) {
    throw Object.assign(new Error('Proposal link revoked after signing'), {
      status: 410,
      code: 'PROPOSAL_TOKEN_REVOKED',
    });
  }

  const token = String(signToken || '').trim();
  if (token && proposal.sign_one_time_token_hash) {
    if (proposal.sign_one_time_token_used_at) {
      throw Object.assign(new Error('Sign token already used'), {
        status: 409,
        code: 'SIGN_TOKEN_USED',
      });
    }
    if (
      proposal.sign_one_time_token_expires_at &&
      new Date(proposal.sign_one_time_token_expires_at).getTime() < Date.now()
    ) {
      throw Object.assign(new Error('Sign token expired — verify OTP again'), {
        status: 410,
        code: 'SIGN_TOKEN_EXPIRED',
      });
    }
    if (sha256(token) !== proposal.sign_one_time_token_hash) {
      throw Object.assign(new Error('Invalid sign token'), {
        status: 401,
        code: 'SIGN_TOKEN_INVALID',
      });
    }
    await query(
      `UPDATE proposals SET sign_one_time_token_used_at = CURRENT_TIMESTAMP
       WHERE proposal_id = $1`,
      [proposal.proposal_id]
    );
    return { mode: 'one_time_token', proposal_id: proposal.proposal_id };
  }

  // Allow OTP directly on sign (single step) when enabled
  const allowOtpOnSign =
    (process.env.PROPOSAL_SIGN_ALLOW_OTP_ON_SIGN || 'true').toLowerCase() !==
    'false';
  if (allowOtpOnSign && otp) {
    // Inline verify without issuing an intermediate one-time token
    if (!proposal.sign_otp_hash || !proposal.sign_otp_expires_at) {
      throw Object.assign(new Error('Request a signing OTP first'), {
        status: 400,
        code: 'SIGN_OTP_REQUIRED',
      });
    }
    if (new Date(proposal.sign_otp_expires_at).getTime() < Date.now()) {
      throw Object.assign(new Error('Signing OTP expired — request a new code'), {
        status: 410,
        code: 'SIGN_OTP_EXPIRED',
      });
    }
    if (Number(proposal.sign_otp_attempts || 0) >= OTP_MAX_ATTEMPTS()) {
      throw Object.assign(new Error('Too many OTP attempts — request a new code'), {
        status: 429,
        code: 'SIGN_OTP_LOCKED',
      });
    }
    if (sha256(String(otp || '').trim()) !== proposal.sign_otp_hash) {
      await query(
        `UPDATE proposals SET sign_otp_attempts = sign_otp_attempts + 1
         WHERE proposal_id = $1`,
        [proposal.proposal_id]
      );
      throw Object.assign(new Error('Invalid signing OTP'), {
        status: 401,
        code: 'SIGN_OTP_INVALID',
      });
    }
    await query(
      `UPDATE proposals SET
         sign_otp_hash = NULL,
         sign_otp_expires_at = NULL,
         sign_otp_attempts = 0,
         sign_one_time_token_hash = NULL,
         sign_one_time_token_used_at = CURRENT_TIMESTAMP
       WHERE proposal_id = $1`,
      [proposal.proposal_id]
    );
    return { mode: 'otp_direct', proposal_id: proposal.proposal_id };
  }

  throw Object.assign(
    new Error(
      'Email OTP verification required before signing. POST /p/:token/request-otp then /verify-otp (or include otp on sign).'
    ),
    { status: 401, code: 'SIGN_AUTH_REQUIRED' }
  );
}

/** After successful sign — revoke reusable portal token for re-sign. */
export async function revokeProposalSignAccess(proposalId) {
  await query(
    `UPDATE proposals SET
       access_token_revoked_at = CURRENT_TIMESTAMP,
       sign_otp_hash = NULL,
       sign_one_time_token_hash = NULL,
       sign_one_time_token_used_at = CURRENT_TIMESTAMP
     WHERE proposal_id = $1`,
    [proposalId]
  );
}
