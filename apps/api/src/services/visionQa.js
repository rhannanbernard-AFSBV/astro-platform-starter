import OpenAI from 'openai';
import { log } from './logger.js';

/**
 * GPT-4o vision check of a crew QA photo against the zone's ai_audit_prompt.
 * Mock path when OPENAI_API_KEY is missing (or ALLOW_MOCK_VISION).
 */

function mockVisionQa({ auditPrompt, notes }) {
  const prompt = String(auditPrompt || '').toLowerCase();
  const note = String(notes || '').toLowerCase();
  // Deterministic soft pass for demos — still records audit trail
  const passed =
    !/fail|reject|blurry|empty/i.test(note) &&
    (prompt.length > 0 || note.includes('offline'));
  return {
    passed,
    score: passed ? 0.82 : 0.25,
    findings: passed
      ? ['Mock QA: photo accepted against audit prompt (no OPENAI_API_KEY).']
      : ['Mock QA: notes indicate failure; photo rejected.'],
    source: 'mock',
  };
}

/**
 * @returns {{ passed: boolean, score: number, findings: string[], source: string }}
 */
export async function evaluateQaPhoto({
  imageBuffer,
  mimeType,
  auditPrompt,
  notes,
  forceMock = false,
}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const allowMock =
    forceMock ||
    !apiKey ||
    process.env.ALLOW_MOCK_VISION === 'true' ||
    (process.env.NODE_ENV !== 'production' &&
      process.env.OMNI_ENV !== 'production');

  if (!apiKey || forceMock) {
    if (!allowMock && !forceMock) {
      throw Object.assign(
        new Error(
          'OPENAI_API_KEY missing — cannot run live vision QA. Set the key or use mock in non-production.'
        ),
        { status: 503, code: 'OPENAI_KEY_MISSING' }
      );
    }
    const result = mockVisionQa({ auditPrompt, notes });
    log.metric('vision_qa_mock', { passed: result.passed });
    return result;
  }

  if (!imageBuffer?.length) {
    throw Object.assign(new Error('photo file is required for vision QA'), {
      status: 400,
    });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_VISION_MODEL?.trim() || 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are OmniClean's AI audit inspector for commercial cleaning QA photos.
Return JSON only: {"passed":boolean,"score":number,"findings":string[]}.
score is 0..1 confidence that the photo satisfies the audit checklist.
passed=true only if the image clearly shows the required conditions.
Do NOT invent financial or tax data.`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Audit prompt for this high-risk zone:\n${auditPrompt || '(none)'}\nCrew notes: ${notes || '(none)'}\nDoes this photo satisfy the audit?`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType || 'image/jpeg'};base64,${imageBuffer.toString('base64')}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw Object.assign(new Error('Empty GPT-4o QA response'), {
        status: 502,
        code: 'OPENAI_EMPTY_RESPONSE',
      });
    }
    const parsed = JSON.parse(content);
    const result = {
      passed: Boolean(parsed.passed),
      score: Number(parsed.score) || 0,
      findings: Array.isArray(parsed.findings)
        ? parsed.findings.map(String)
        : [],
      source: 'gpt-4o',
    };
    log.metric('vision_qa_live', { passed: result.passed });
    return result;
  } catch (err) {
    if (err.code && err.status) throw err;
    const msg = err?.error?.message || err.message || String(err);
    throw Object.assign(new Error(`Vision QA failed: ${msg}`), {
      status: 502,
      code: 'OPENAI_VISION_QA_FAILED',
      cause: err,
    });
  }
}
