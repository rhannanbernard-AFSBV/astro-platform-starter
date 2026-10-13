/**
 * Structured JSON logs + in-process counters for basic ops metrics.
 */

const counters = new Map();

function bump(name, by = 1) {
  counters.set(name, (counters.get(name) || 0) + by);
}

export function getMetricsSnapshot() {
  return {
    uptime_s: Math.floor(process.uptime()),
    counters: Object.fromEntries(counters),
  };
}

export function resetMetricsForTests() {
  counters.clear();
}

function emit(level, msg, fields = {}) {
  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    service: 'omniclean-api',
    ...fields,
  };
  const text = JSON.stringify(line);
  if (level === 'error') console.error(text);
  else if (level === 'warn') console.warn(text);
  else console.log(text);
}

export const log = {
  info(msg, fields) {
    emit('info', msg, fields);
  },
  warn(msg, fields) {
    emit('warn', msg, fields);
  },
  error(msg, fields) {
    emit('error', msg, fields);
  },
  metric(name, fields = {}) {
    bump(name);
    emit('info', `metric:${name}`, { metric: name, ...fields });
  },
};

/** Express request logger (skips noisy health) */
export function requestLogMiddleware(req, res, next) {
  const start = Date.now();
  const skip =
    req.path === '/' ||
    req.path === '/api/health' ||
    req.path === '/api/metrics';
  res.on('finish', () => {
    if (skip) return;
    bump('http_requests');
    bump(`http_status_${res.statusCode}`);
    log.info('http_request', {
      method: req.method,
      path: req.originalUrl?.split('?')[0],
      status: res.statusCode,
      ms: Date.now() - start,
      tenant_id: req.tenantId || undefined,
    });
  });
  next();
}
