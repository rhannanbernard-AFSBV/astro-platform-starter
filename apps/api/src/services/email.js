import nodemailer from 'nodemailer';
import { query } from '../db/client.js';

/**
 * Pluggable outbound email:
 * - RESEND_API_KEY → Resend HTTP API
 * - SENDGRID_API_KEY → SendGrid HTTP API
 * - SMTP_HOST (+ SMTP_USER/SMTP_PASS) → nodemailer SMTP
 * - none → file/console dry-run (status=dry_run) so demo still works
 */

export function emailTransportName() {
  if (process.env.RESEND_API_KEY?.trim()) return 'resend';
  if (process.env.SENDGRID_API_KEY?.trim()) return 'sendgrid';
  if (process.env.SMTP_HOST?.trim()) return 'smtp';
  return 'dry_run';
}

export async function sendEmail({
  tenantId,
  proposalId,
  to,
  subject,
  html,
  from,
}) {
  const transport = emailTransportName();
  const fromAddress =
    from ||
    process.env.EMAIL_FROM ||
    'OmniClean Proposals <proposals@omniclean.demo>';

  const logIns = await query(
    `INSERT INTO email_outbox (tenant_id, proposal_id, to_address, subject, transport, status)
     VALUES ($1, $2, $3, $4, $5, 'queued')
     RETURNING email_id`,
    [tenantId, proposalId || null, to, subject, transport]
  );
  const emailId = logIns.rows[0].email_id;

  try {
    let providerMessageId = null;

    if (transport === 'resend') {
      providerMessageId = await sendViaResend({
        from: fromAddress,
        to,
        subject,
        html,
      });
    } else if (transport === 'sendgrid') {
      providerMessageId = await sendViaSendGrid({
        from: fromAddress,
        to,
        subject,
        html,
      });
    } else if (transport === 'smtp') {
      providerMessageId = await sendViaSmtp({
        from: fromAddress,
        to,
        subject,
        html,
      });
    } else {
      console.log(
        `[email:dry_run] to=${to} subject="${subject}" (set RESEND_API_KEY, SENDGRID_API_KEY, or SMTP_HOST to deliver)`
      );
      providerMessageId = `dry_run_${emailId}`;
    }

    await query(
      `UPDATE email_outbox
       SET status = $1, provider_message_id = $2
       WHERE email_id = $3`,
      [transport === 'dry_run' ? 'dry_run' : 'sent', providerMessageId, emailId]
    );

    return {
      email_id: emailId,
      transport,
      status: transport === 'dry_run' ? 'dry_run' : 'sent',
      provider_message_id: providerMessageId,
    };
  } catch (err) {
    await query(
      `UPDATE email_outbox SET status = 'failed', error_message = $1 WHERE email_id = $2`,
      [String(err.message || err).slice(0, 1000), emailId]
    );
    throw err;
  }
}

async function sendViaResend({ from, to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.message || `Resend failed (${res.status})`);
  }
  return body.id || null;
}

async function sendViaSendGrid({ from, to, subject, html }) {
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: parseFrom(from),
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SendGrid failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.headers.get('x-message-id') || null;
}

async function sendViaSmtp({ from, to, subject, html }) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS || '',
          }
        : undefined,
  });
  const info = await transporter.sendMail({ from, to, subject, html });
  return info.messageId || null;
}

function parseFrom(from) {
  const m = String(from).match(/^(.*)<([^>]+)>$/);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, ''), email: m[2].trim() };
  return { email: from };
}
