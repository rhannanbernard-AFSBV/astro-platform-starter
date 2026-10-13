import express from 'express';
import { verifyToken } from '../services/auth.js';
import { verifySignedQuery } from '../services/signedUrls.js';

/**
 * Gate static artifact dirs: require Bearer JWT OR valid ?exp=&sig= signed URL.
 */
export function protectedStatic(dir) {
  const staticMw = express.static(dir, {
    fallthrough: false,
    index: false,
  });

  return function protectedStaticHandler(req, res, next) {
    const pathname = req.baseUrl + (req.path === '/' ? '' : req.path);
    const header = req.header('authorization') || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (match) {
      const payload = verifyToken(match[1].trim());
      if (payload?.tenant_id && payload?.sub) {
        return staticMw(req, res, next);
      }
    }

    if (verifySignedQuery(pathname, req.query.exp, req.query.sig)) {
      return staticMw(req, res, next);
    }

    return res.status(401).json({
      error: 'Authentication required for this file (Bearer JWT or signed URL)',
      code: 'FILE_AUTH_REQUIRED',
    });
  };
}
