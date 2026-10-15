/**
 * Electron Forge config (alternative to electron-builder).
 *
 * Primary Windows Setup.exe artifact is produced via electron-builder
 * (`npm run dist` → Allyanna_Accounting_Setup.exe).
 *
 * Forge makers:
 *   - Squirrel.Windows (Setup.exe style)
 *   - ZIP portable fallback
 *
 * Path handling uses Node path APIs; do not hardcode `/` separators.
 */

const path = require("path");

/** @type {import('@electron-forge/shared-types').ForgeConfig} */
const config = {
  packagerConfig:
    {
      name: "Allyanna Accounting",
      executableName: "AllyannaAccounting",
      asar: true,
      // Packaged extras live under resources/ via extraResource
      extraResource: [
        path.join(__dirname, "bin", "allyanna-backend"),
        path.join(__dirname, "ui-dist"),
      ],
    },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "AllyannaAccounting",
        authors: "Allyanna",
        description:
          "Allyanna Accounting Software — Sint Maarten local desktop edition",
        // Squirrel Setup.exe; rename/copy to Allyanna_Accounting_Setup.exe in CI if desired.
        setupExe: "Allyanna_Accounting_Setup.exe",
      },
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["win32"],
    },
  ],
  plugins: [
    {
      name: "@electron-forge/plugin-auto-unpack-natives",
      config: {},
    },
  ],
};

module.exports = config;
