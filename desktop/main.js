/**
 * Allyanna Accounting — Electron main process (Windows desktop).
 *
 * Lifecycle:
 *  1. On ready (Windows): silently spawn allyanna-backend.exe in the background
 *  2. Wait for http://127.0.0.1:8000/health
 *  3. Load the Next.js static UI (served by the backend, or local ui-dist fallback)
 *  4. On window close / app quit: cleanly kill the backend process tree
 *
 * All local asset paths use Node path.join so Windows backslashes resolve correctly.
 */

"use strict";

const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");

const BACKEND_HOST = process.env.ALLYANNA_HOST || "127.0.0.1";
const BACKEND_PORT = Number(process.env.ALLYANNA_PORT || 8000);
const HEALTH_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}/health`;
const APP_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}/`;

/** @type {import('child_process').ChildProcess | null} */
let backendProcess = null;
/** @type {BrowserWindow | null} */
let mainWindow = null;
let isQuitting = false;

function resourcesRoot() {
  // Packaged: process.resourcesPath → …\resources
  // Dev: desktop/
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  return path.join(__dirname);
}

function resolveBackendExecutable() {
  const root = resourcesRoot();
  const candidates = [
    // electron-builder extraResources layout
    path.join(root, "backend", "allyanna-backend.exe"),
    path.join(root, "backend", "allyanna-backend", "allyanna-backend.exe"),
    // Electron Forge extraResource (folder name preserved)
    path.join(root, "allyanna-backend", "allyanna-backend.exe"),
    // Dev / CI artifacts copied beside desktop/
    path.join(root, "bin", "allyanna-backend", "allyanna-backend.exe"),
    path.join(__dirname, "bin", "allyanna-backend", "allyanna-backend.exe"),
    path.join(__dirname, "bin", "allyanna-backend.exe"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { type: "exe", path: candidate };
    }
  }

  // Dev fallback: run uvicorn via python -m app from ../backend
  const backendDir = path.join(__dirname, "..", "backend");
  if (fs.existsSync(path.join(backendDir, "app", "__main__.py"))) {
    return { type: "python", path: backendDir };
  }

  return null;
}

function resolveUiDir() {
  const root = resourcesRoot();
  const candidates = [
    path.join(root, "ui"),
    path.join(root, "ui-dist"),
    path.join(__dirname, "ui-dist"),
    path.join(__dirname, "..", "frontend", "out"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "index.html"))) {
      return candidate;
    }
  }
  return null;
}

function resolveUiFallbackHtml() {
  const dir = resolveUiDir();
  return dir ? path.join(dir, "index.html") : null;
}

function waitForHealth(timeoutMs = 45000, intervalMs = 250) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(HEALTH_URL, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });
      req.on("error", () => retry());
      req.setTimeout(2000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Backend health check timed out: ${HEALTH_URL}`));
        return;
      }
      setTimeout(tick, intervalMs);
    };

    tick();
  });
}

function startBackend() {
  const resolved = resolveBackendExecutable();
  if (!resolved) {
    throw new Error(
      "Could not find allyanna-backend.exe under resources/backend or a local backend/ tree.",
    );
  }

  const env = {
    ...process.env,
    ALLYANNA_LOCAL_MODE: "1",
    ALLYANNA_DB_ENGINE: "sqlite",
    ALLYANNA_HOST: BACKEND_HOST,
    ALLYANNA_PORT: String(BACKEND_PORT),
  };

  // Point UI dir at packaged static export when present (Windows-safe path.join).
  const uiDir = resolveUiDir();
  if (uiDir) {
    env.ALLYANNA_UI_DIR = uiDir;
  }

  if (resolved.type === "exe") {
    // windowsHide: silent background launch (no console window)
    backendProcess = spawn(resolved.path, [], {
      cwd: path.dirname(resolved.path),
      env,
      stdio: "ignore",
      windowsHide: true,
      detached: false,
    });
  } else {
    const python =
      process.env.ALLYANNA_PYTHON ||
      (process.platform === "win32" ? "python" : "python3");
    backendProcess = spawn(python, ["-m", "app"], {
      cwd: resolved.path,
      env,
      stdio: "ignore",
      windowsHide: true,
    });
  }

  backendProcess.on("exit", (code, signal) => {
    backendProcess = null;
    if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox(
        "Allyanna Backend Stopped",
        `The local backend exited unexpectedly (code=${code}, signal=${signal}).`,
      );
    }
  });
}

function killBackend() {
  if (!backendProcess || backendProcess.killed) {
    backendProcess = null;
    return;
  }

  const pid = backendProcess.pid;
  try {
    if (process.platform === "win32" && pid) {
      // Kill the whole process tree on Windows (silent).
      spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else if (pid) {
      process.kill(pid, "SIGTERM");
    }
  } catch {
    try {
      backendProcess.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
  backendProcess = null;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: "Allyanna Accounting",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    show: false,
  });

  mainWindow.once("ready-to-show", () => {
    if (mainWindow) mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  try {
    startBackend();
    await waitForHealth();
    await mainWindow.loadURL(APP_URL);
  } catch (err) {
    const fallback = resolveUiFallbackHtml();
    const message = err instanceof Error ? err.message : String(err);
    if (fallback) {
      await mainWindow.loadFile(fallback);
      dialog.showMessageBox(mainWindow, {
        type: "warning",
        title: "Backend unavailable",
        message:
          "Loaded local UI without a live backend. Payroll/API calls will fail until the backend starts.",
        detail: message,
      });
    } else {
      dialog.showErrorBox("Allyanna failed to start", message);
      app.quit();
    }
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(createWindow);

  app.on("before-quit", () => {
    isQuitting = true;
    killBackend();
  });

  app.on("window-all-closed", () => {
    isQuitting = true;
    killBackend();
    // Desktop accounting app: quit on last window (including macOS).
    app.quit();
  });
}
