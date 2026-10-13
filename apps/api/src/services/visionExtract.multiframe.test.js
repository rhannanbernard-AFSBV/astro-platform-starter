import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectWalkthroughMedia,
  mockSpatialExtraction,
} from './visionExtract.js';

describe('multi-frame walkthrough media', () => {
  it('collects image + images[] + video meta', () => {
    const media = collectWalkthroughMedia({
      image: {
        buffer: Buffer.from('a'),
        mimetype: 'image/jpeg',
        originalname: 'a.jpg',
      },
      images: [
        {
          buffer: Buffer.from('b'),
          mimetype: 'image/png',
          originalname: 'b.png',
        },
      ],
      video: {
        buffer: Buffer.from('vid'),
        mimetype: 'video/mp4',
        originalname: 'walk.mp4',
      },
    });
    assert.equal(media.frames.length, 2);
    assert.ok(media.video);
    assert.equal(media.video.mimeType, 'video/mp4');
  });

  it('mock marks multi-frame + video coverage', () => {
    const m = mockSpatialExtraction({
      frame_count: 3,
      video_received: true,
      hint_sq_ft: 10000,
    });
    assert.equal(m._frame_count, 3);
    assert.equal(m._video_received, true);
    assert.match(m._source, /multiframe/);
  });
});
