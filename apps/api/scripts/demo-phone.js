#!/usr/bin/env node
/**
 * One-command phone demo:
 *  - ensures .env (dev, mock vision)
 *  - starts API on 0.0.0.0 (demo user seeded on boot)
 *  - prints "open this on your phone" URL
 *  - tries a zero-config tunnel (localtunnel); falls back to LAN IP
 *
 * Usage (from apps/api): npm run demo:phone
 * Optional: PORT=4000 DEMO_SKIP_TUNNEL=1 npm run demo:phone
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';
const SKIP_TUNNEL = /^(1|true|yes)$/i.test(process.env.DEMO_SKIP_TUNNEL || '');
const DEMO_PATH = '/demo/';

function banner(lines) {
  const width = Math.min(72, Math.max(40, ...lines.map((l) => l.length)) + 4);
  const bar = '═'.repeat(width);
  console.log(`\n╔${bar}╗`);
  for (const line of lines) {
    console.log(`║  ${line.padEnd(width - 2)}║`);
  }
  console.log(`╚${bar}╝\n`);
}

function ensureEnv() {
  const envPath = path.join(apiRoot, '.env');
  const example = path.join(apiRoot, '.env.example');
  if (!fs.existsSync(envPath) && fs.existsSync(example)) {
    fs.copyFileSync(example, envPath);
    console.log('[demo:phone] created .env from .env.example');
  }
}

function lanIpv4() {
  const ifaces = os.networkInterfaces();
  const preferred = [];
  const other = [];
  for (const [name, list] of Object.entries(ifaces)) {
    for (const info of list || []) {
      if (info.family !== 'IPv4' && info.family !== 4) continue;
      if (info.internal) continue;
      const row = { name, address: info.address };
      if (/^(en|eth|wlan|wifi|wl)/i.test(name)) preferred.push(row);
      else other.push(row);
    }
  }
  return (preferred[0] || other[0] || {}).address || null;
}

function waitForHealth(timeoutMs = 45000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/api/health`);
        if (res.ok) return resolve();
      } catch {
        /* still booting */
      }
      if (Date.now() - started > timeoutMs) {
        return reject(new Error(`API did not become healthy on :${PORT}`));
      }
      setTimeout(tick, 400);
    };
    tick();
  });
}

function startApi() {
  const child = spawn(process.execPath, ['--watch', 'src/index.js'], {
    cwd: apiRoot,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST,
      NODE_ENV: process.env.NODE_ENV || 'development',
      // Keep mock vision available for the phone trial
      ALLOW_MOCK_VISION: process.env.ALLOW_MOCK_VISION || 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const prefix = (chunk, stream) => {
    const text = chunk.toString();
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue;
      process[stream].write(`[api] ${line}\n`);
    }
  };
  child.stdout.on('data', (c) => prefix(c, 'stdout'));
  child.stderr.on('data', (c) => prefix(c, 'stderr'));
  child.on('exit', (code, signal) => {
    if (signal) console.log(`[demo:phone] API exited (${signal})`);
    else if (code) console.log(`[demo:phone] API exited with code ${code}`);
  });
  return child;
}

async function tryLocaltunnel() {
  // Prefer a local install; otherwise npx --yes (zero-config, no account).
  const require = createRequire(import.meta.url);
  let localtunnel;
  try {
    localtunnel = require('localtunnel');
  } catch {
    console.log('[demo:phone] fetching localtunnel via npx (one-time)…');
    await new Promise((resolve, reject) => {
      const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const install = spawn(
        npm,
        ['install', '--no-save', '--no-package-lock', 'localtunnel@2'],
        { cwd: apiRoot, stdio: 'inherit', env: process.env }
      );
      install.on('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`localtunnel install failed (${code})`))
      );
    });
    localtunnel = require('localtunnel');
  }

  const tunnel = await localtunnel({ port: PORT });
  return {
    url: tunnel.url.replace(/\/$/, '') + DEMO_PATH,
    close: () => {
      try {
        tunnel.close();
      } catch {
        /* ignore */
      }
    },
  };
}

async function tryCloudflared() {
  const bin = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  return new Promise((resolve) => {
    const child = spawn(
      bin,
      ['tunnel', '--url', `http://127.0.0.1:${PORT}`],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      resolve(null);
    }, 12000);

    const onChunk = (chunk) => {
      const text = chunk.toString();
      process.stderr.write(`[tunnel] ${text}`);
      const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (m && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve({
          url: m[0].replace(/\/$/, '') + DEMO_PATH,
          close: () => {
            try {
              child.kill('SIGTERM');
            } catch {
              /* ignore */
            }
          },
        });
      }
    };
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);
    child.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(null);
    });
    child.on('exit', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(null);
    });
  });
}

async function openTunnel() {
  if (SKIP_TUNNEL) {
    console.log('[demo:phone] DEMO_SKIP_TUNNEL set — using LAN / localhost only');
    return null;
  }
  try {
    const t = await tryLocaltunnel();
    console.log('[demo:phone] tunnel ready (localtunnel)');
    return t;
  } catch (err) {
    console.warn('[demo:phone] localtunnel failed:', err.message);
  }
  try {
    const t = await tryCloudflared();
    if (t) {
      console.log('[demo:phone] tunnel ready (cloudflared)');
      return t;
    }
  } catch (err) {
    console.warn('[demo:phone] cloudflared failed:', err.message);
  }
  console.warn('[demo:phone] no tunnel — phone must be on the same Wi‑Fi (LAN URL below)');
  return null;
}

async function main() {
  ensureEnv();
  console.log(`[demo:phone] starting API on ${HOST}:${PORT}…`);
  const api = startApi();

  const shutdown = (signal) => {
    console.log(`\n[demo:phone] shutting down (${signal})`);
    try {
      api.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    if (globalThis.__demoTunnelCloser) {
      try {
        globalThis.__demoTunnelCloser();
      } catch {
        /* ignore */
      }
    }
    setTimeout(() => process.exit(0), 300);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await waitForHealth();
  } catch (err) {
    console.error('[demo:phone]', err.message);
    api.kill('SIGTERM');
    process.exit(1);
  }

  const lan = lanIpv4();
  const localUrl = `http://127.0.0.1:${PORT}${DEMO_PATH}`;
  const lanUrl = lan ? `http://${lan}:${PORT}${DEMO_PATH}` : null;

  let tunnelUrl = null;
  const tunnel = await openTunnel();
  if (tunnel) {
    tunnelUrl = tunnel.url;
    globalThis.__demoTunnelCloser = tunnel.close;
  }

  const lines = [
    'OmniClean phone demo is ready',
    '',
    'Open this on your phone (Safari / Chrome):',
    tunnelUrl || lanUrl || localUrl,
  ];
  if (tunnelUrl && lanUrl) {
    lines.push('');
    lines.push(`LAN fallback (same Wi‑Fi): ${lanUrl}`);
  } else if (!tunnelUrl && lanUrl) {
    lines.push('');
    lines.push('Same Wi‑Fi required (tunnel unavailable).');
  }
  lines.push('');
  lines.push('Login: demo@omniclean.demo / demo1234');
  lines.push('Flow: login → mock scan → calibrate → bid → checklist');
  lines.push(`This machine: ${localUrl}`);
  banner(lines);

  // Keep process alive while API (and optional tunnel) run
  await new Promise(() => {});
}

main().catch((err) => {
  console.error('[demo:phone] fatal:', err);
  process.exit(1);
});
