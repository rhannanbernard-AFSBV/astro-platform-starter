import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateQaPhoto } from './visionQa.js';

describe('visionQa', () => {
  it('mock path passes clean notes', async () => {
    const r = await evaluateQaPhoto({
      imageBuffer: Buffer.from('fake'),
      mimeType: 'image/jpeg',
      auditPrompt: 'AI Audit: photograph sealed bins',
      notes: 'offline QA sync',
      forceMock: true,
    });
    assert.equal(r.source, 'mock');
    assert.equal(r.passed, true);
  });

  it('mock path rejects fail notes', async () => {
    const r = await evaluateQaPhoto({
      imageBuffer: Buffer.from('fake'),
      mimeType: 'image/jpeg',
      auditPrompt: 'AI Audit',
      notes: 'blurry fail',
      forceMock: true,
    });
    assert.equal(r.passed, false);
  });
});
