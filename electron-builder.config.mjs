// electron-builder configuration, replacing forge.config.ts.
//
// Verified end-to-end in this environment: the Linux `deb` build (see
// `npm run make:linux`), inspected with `dpkg-deb`.
//
// NOT verifiable here — needs a real test build on those platforms (or CI)
// before this is trusted for production releases:
//   - macOS code signing + notarization (electron-builder/afterSign.mjs)
//   - Windows NSIS packaging + Azure Trusted Signing (electron-builder/windowsSign.mjs)
import { readFileSync } from "node:fs";

const isEndToEndTestBuild = process.env.E2E_TEST_BUILD === "true";
const isWindowsSigningEnabled = process.env.WINDOWS_SIGN === "true";

if (isWindowsSigningEnabled && !process.env.AZURE_CODE_SIGNING_DLIB) {
  throw new Error(
    "WINDOWS_SIGN is enabled but AZURE_CODE_SIGNING_DLIB is not set. " +
      "Ensure Azure Trusted Signing tools are installed.",
  );
}

const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

/** @type {import('electron-builder').Configuration} */
const config = {
  // forge.config.ts never set an explicit macOS bundle ID, so
  // @electron/packager fell back to its own default (`com.electron.<name>`,
  // using package.json's `name`: "octopus-studio"). Matching that default
  // here preserves update/keychain continuity for existing macOS users —
  // VERIFY this against a real prior Forge-built .app's
  // Contents/Info.plist CFBundleIdentifier before shipping; if it differs,
  // use the actual value instead.
  appId: "com.electron.octopus-studio",
  productName: "Octopus Studio",
  // productName ("Octopus Studio") has a space, which Linux binaries and
  // .deb packaging conventions don't want. Pin the on-disk executable name
  // to the sanitized package name, matching Forge's prior config.
  executableName: "octopus-studio",
  copyright: `Copyright © ${new Date().getFullYear()} ${packageJson.author?.name ?? ""}`,

  directories: {
    output: "release",
  },

  files: [
    "dist/main/**",
    "dist/preload/**",
    "dist/renderer/**",
    "assets/**",
    "drizzle/**",
    "scaffold/**",
    "worker/**",
    "package.json",
  ],

  // Matches Forge's `extraResource: ["node_modules/dugite/git", "node_modules/@vscode"]`,
  // which flattened these into `resources/git` and `resources/@vscode`
  // (src/main.ts's resolveLocalGitDirectory and
  // src/ipc/utils/ripgrep_utils.ts's getRgExecutablePath both expect that
  // exact flattened layout).
  extraResources: [
    { from: "node_modules/dugite/git", to: "git" },
    { from: "node_modules/@vscode", to: "@vscode" },
  ],

  // Matches Forge's `asar.unpackDir` plus better-sqlite3 (which Forge's
  // AutoUnpackNativesPlugin unpacked automatically via its own native-module
  // heuristic; electron-builder has no equivalent auto-detection, so it must
  // be listed explicitly here).
  asarUnpack: [
    "node_modules/better-sqlite3/**",
    "node_modules/node-pty/**",
    "node_modules/octopus-studio-keychain-reader/**",
    "node_modules/mustardscript/**",
    "node_modules/@mustardscript/**",
    "node_modules/@crowecawcaw/**",
  ],

  protocols: [
    {
      name: "Octopus Studio",
      schemes: ["octopusStudio"],
    },
  ],

  afterPack: "./electron-builder/afterPack.mjs",
  afterSign: "./electron-builder/afterSign.mjs",

  mac: {
    target: ["zip"],
    icon: "assets/icon/logo.png",
    category: "public.app-category.developer-tools",
    identity: isEndToEndTestBuild ? null : (process.env.APPLE_TEAM_ID ?? null),
    hardenedRuntime: true,
    gatekeeperAssess: false,
    // Signing is skipped for E2E test builds (matches Forge's
    // isEndToEndTestBuild osxSign/osxNotarize skip); notarization is handled
    // by electron-builder/afterSign.mjs instead of electron-builder's
    // built-in notarize (which expects differently-named env vars).
    notarize: false,
  },

  win: {
    target: ["nsis"],
    icon: "assets/icon/logo.ico",
    signtoolOptions: isWindowsSigningEnabled
      ? {
          sign: "./electron-builder/windowsSign.mjs",
          signingHashAlgorithms: ["sha256"],
        }
      : undefined,
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },

  linux: {
    target: ["deb", "rpm", "AppImage"],
    icon: "assets/icon/logo.png",
    category: "Development",
    // The top-level `protocols` config above already produces the
    // x-scheme-handler/octopusStudio MimeType entry for Linux; an explicit
    // `mimeTypes` here would just duplicate it in the .desktop file.
    // Keeps the installed .desktop filename (and therefore StartupWMClass /
    // Electron's app_id) matched to `executableName`, so the taskbar/dock
    // association is correct.
    syncDesktopName: true,
  },

  publish: {
    provider: "github",
    owner: "kaleemibnanwar",
    repo: "OctopusStudio",
  },
};

export default config;
