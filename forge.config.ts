import path from "path";
import { windowsSign } from "./windowsSign";
import {
  removeUnusedAppPackageFiles,
  removeUnusedCopiedResources,
} from "./src/lib/packaging_cleanup";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerAppImage } from "./makers/MakerAppImage";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { existsSync, readFileSync, readdirSync } from "fs";
import { createRequire } from "module";

console.log("AZURE_CODE_SIGNING_DLIB", process.env.AZURE_CODE_SIGNING_DLIB);

const require = createRequire(import.meta.url);
const { isPrereleaseVersion } = require("./scripts/release-version-utils.js") as {
  isPrereleaseVersion: (version: string) => boolean;
};
const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };
const windowsIconUrl = `https://github.com/kaleemibnanwar/Soloman-Studio/releases/download/v${packageJson.version}/logo.ico`;

const pgRuntimeDependencies = [
  "pg",
  "pg-cloudflare",
  "pg-connection-string",
  "pg-int8",
  "pg-pool",
  "pg-protocol",
  "pg-types",
  "pgpass",
  "postgres-array",
  "postgres-bytea",
  "postgres-date",
  "postgres-interval",
  "split2",
  "xtend",
] as const;

function isPgRuntimeDependency(file: string): boolean {
  return pgRuntimeDependencies.some((dependency) => {
    const modulePath = `/node_modules/${dependency}`;
    return file === modulePath || file.startsWith(`${modulePath}/`);
  });
}

const opencodeRootPackages = new Set<string>();
opencodeRootPackages.add("@opencode");

function addOpenCodeDep(dep: string): void {
  const parts = dep.split("/");
  opencodeRootPackages.add(parts[0]);
  if (parts.length > 1) opencodeRootPackages.add(parts[0] + "/" + parts[1]);
  const rootDepPkg = path.join(__dirname, "node_modules", dep, "package.json");
  if (existsSync(rootDepPkg)) {
    try {
      const json = JSON.parse(readFileSync(rootDepPkg, "utf8")) as {
        dependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
      };
      for (const d of Object.keys({ ...json.dependencies, ...json.optionalDependencies })) {
        if (!opencodeRootPackages.has(d)) addOpenCodeDep(d);
      }
    } catch {}
  }
}

function scanOpenCodePackageJsons(dir: string): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanOpenCodePackageJsons(full);
    } else if (entry.name === "package.json") {
      try {
        const json = JSON.parse(readFileSync(full, "utf8")) as {
          dependencies?: Record<string, string>;
          optionalDependencies?: Record<string, string>;
        };
        for (const dep of Object.keys({ ...json.dependencies, ...json.optionalDependencies })) {
          addOpenCodeDep(dep);
        }
      } catch {}
    }
  }
}

scanOpenCodePackageJsons(path.join(__dirname, "node_modules", "@opencode"));

function isOpenCodeRuntimeDependency(file: string): boolean {
  if (!file.startsWith("/node_modules/")) return false;
  const relative = file.slice("/node_modules/".length);
  const slashIdx = relative.indexOf("/");
  const firstPart = slashIdx === -1 ? relative : relative.slice(0, slashIdx);
  if (firstPart.startsWith("@")) {
    if (opencodeRootPackages.has(firstPart)) return true;
    const secondSlashIdx = relative.indexOf("/", slashIdx + 1);
    const scopePart = secondSlashIdx === -1 ? relative : relative.slice(0, secondSlashIdx);
    return opencodeRootPackages.has(scopePart);
  }
  return opencodeRootPackages.has(firstPart);
}

// Based on https://github.com/electron/forge/blob/6b2d547a7216c30fde1e1fddd1118eee5d872945/packages/plugin/vite/src/VitePlugin.ts#L124
const ignore = (file: string) => {
  if (!file) return false;
  // `file` always starts with `/`
  // @see - https://github.com/electron/packager/blob/v18.1.3/src/copy-filter.ts#L89-L93
  if (file === "/node_modules") {
    return false;
  }
  if (file.startsWith("/drizzle")) {
    return false;
  }
  if (file.startsWith("/assets")) {
    return false;
  }
  if (file.startsWith("/scaffold")) {
    return false;
  }

  if (file.startsWith("/worker") && !file.startsWith("/workers")) {
    return false;
  }
  if (file.startsWith("/node_modules/stacktrace-js")) {
    return false;
  }
  if (file.startsWith("/node_modules/stacktrace-js/dist")) {
    return false;
  }
  if (file.startsWith("/node_modules/html-to-image")) {
    return false;
  }
  // `turndown`'s Node entry does `require("@mixmark-io/domino")` at module load
  // (when `window` is undefined). The bundler leaves it as an external require
  // rather than inlining it (turndown's `browser` field maps the module to
  // `false`), so it must be shipped in node_modules for the packaged app.
  // Match the whole `@mixmark-io` scope (like `@mustardscript` below): the
  // packager's walk skips the scope directory itself if it is not kept, so the
  // nested `@mixmark-io/domino` package would otherwise never be reached.
  if (file.startsWith("/node_modules/@mixmark-io")) {
    return false;
  }
  if (file.startsWith("/node_modules/better-sqlite3")) {
    return false;
  }
  if (file.startsWith("/node_modules/octopusStudio-keychain-reader")) {
    return false;
  }
  if (file.startsWith("/node_modules/node-pty")) {
    return false;
  }
  if (file.startsWith("/node_modules/mustardscript")) {
    return false;
  }
  if (file.startsWith("/node_modules/@mustardscript")) {
    return false;
  }
  if (file.startsWith("/node_modules/node-addon-api")) {
    return false;
  }
  if (file.startsWith("/node_modules/bindings")) {
    return false;
  }
  if (file.startsWith("/node_modules/file-uri-to-path")) {
    return false;
  }
  // Kept external in vite.main.config.mts (see comment there); must ship in
  // node_modules so the packaged app's `require("ws")` resolves.
  if (file.startsWith("/node_modules/ws")) {
    return false;
  }
  // Kept external in vite.main.config.mts — office-open is a large ESM package
  // (docx/pptx/xlsx); ship it in node_modules so the packaged app can load it.
  if (file.startsWith("/node_modules/office-open")) {
    return false;
  }
  if (file.startsWith("/node_modules/@office-open")) {
    return false;
  }
  // @office-open dependencies
  if (file.startsWith("/node_modules/fflate")) {
    return false;
  }
  if (file.startsWith("/node_modules/@noble")) {
    return false;
  }
  if (file === "/node_modules/@typescript") {
    return false;
  }
  if (file.startsWith("/node_modules/@typescript/typescript6")) {
    return false;
  }
  if (file.startsWith("/node_modules/@typescript/old")) {
    return false;
  }
  if (isPgRuntimeDependency(file)) {
    return false;
  }
  if (isOpenCodeRuntimeDependency(file)) {
    return false;
  }
  if (file.startsWith("/.vite")) {
    return false;
  }

  return true;
};

const isEndToEndTestBuild = process.env.E2E_TEST_BUILD === "true";
const isWindowsSigningEnabled = process.env.WINDOWS_SIGN === "true";
const shouldSkipNativeRebuild = process.env.OCTOPUS_STUDIO_SKIP_NATIVE_REBUILD === "true";
const electronZipDir = process.env.ELECTRON_ZIP_DIR?.trim();
const nativeRebuildModules = [
  "better-sqlite3",
  "node-pty",
  "mustardscript",
  ...(process.platform === "darwin" ? ["octopusStudio-keychain-reader"] : []),
];

if (isWindowsSigningEnabled && !process.env.AZURE_CODE_SIGNING_DLIB) {
  throw new Error(
    "WINDOWS_SIGN is enabled but AZURE_CODE_SIGNING_DLIB is not set. " +
      "Ensure Azure Trusted Signing tools are installed.",
  );
}

const debIconConfig = {
  "16x16": path.resolve(__dirname, "assets/icon/16x16.png"),
  "24x24": path.resolve(__dirname, "assets/icon/24x24.png"),
  "32x32": path.resolve(__dirname, "assets/icon/32x32.png"),
  "48x48": path.resolve(__dirname, "assets/icon/48x48.png"),
  "64x64": path.resolve(__dirname, "assets/icon/64x64.png"),
  "128x128": path.resolve(__dirname, "assets/icon/128x128.png"),
  "256x256": path.resolve(__dirname, "assets/icon/256x256.png"),
  "512x512": path.resolve(__dirname, "assets/icon/512x512.png"),
  "1024x1024": path.resolve(__dirname, "assets/icon/logo.png"),
};

const config: ForgeConfig = {
  packagerConfig: {
    // Allow fully offline packaging from a directory containing the matching
    // electron-v<version>-<platform>-<arch>.zip.
    ...(electronZipDir ? { electronZipDir } : {}),
    // productName ("Soloman Studio") has a space, which Linux binaries and
    // .deb packaging conventions don't want. Pin the on-disk executable name
    // to the sanitized package name so MakerDeb/electron-installer-debian
    // (which expect a binary named after package.json's `name`) find it.
    executableName: "soloman-studio",
    // E2E test builds install local file: dependencies as links on Windows.
    // Dereference them so packaging does not require symlink privileges in the temp app.
    // Local file: native packages install as symlinks; dereference them so the
    // packaged app contains loadable runtime files.
    derefSymlinks: true,
    windowsSign: isWindowsSigningEnabled ? windowsSign : undefined,
    afterCopy: [
      (buildPath, _electronVersion, platform, arch, callback) => {
        removeUnusedAppPackageFiles(buildPath, platform, arch).then(
          () => callback(),
          (error) => callback(error as Error),
        );
      },
    ],
    afterCopyExtraResources: [
      (buildPath, _electronVersion, platform, _arch, callback) => {
        removeUnusedCopiedResources(buildPath, platform).then(
          () => callback(),
          (error) => callback(error as Error),
        );
      },
    ],
    protocols: [
      {
        name: "Soloman Studio",
        schemes: ["solomanStudio", "soloman", "octopusStudio"],
      },
    ],
    icon: path.resolve(__dirname, "assets/icon/logo"),

    osxSign:
      isEndToEndTestBuild || !process.env.APPLE_IDENTITY
        ? undefined
        : ({
            identity: process.env.APPLE_IDENTITY,
            // Surface the actual signing error instead of silently continuing
            // (@electron/packager defaults continueOnError to true, which masks failures)
            continueOnError: false,
            // Skip provisioning profile search (not needed for Developer ID distribution,
            // and the cwd scan crashes on broken symlinks like CLAUDE.md)
            preEmbedProvisioningProfile: false,
          } as Record<string, unknown>),
    osxNotarize:
      isEndToEndTestBuild ||
      !process.env.APPLE_API_KEY_ID ||
      !process.env.APPLE_API_ISSUER ||
      !process.env.APPLE_API_KEY_PATH
        ? undefined
        : {
            appleApiKey: process.env.APPLE_API_KEY_PATH,
            appleApiKeyId: process.env.APPLE_API_KEY_ID,
            appleApiIssuer: process.env.APPLE_API_ISSUER,
          },
    asar: {
      // Native modules and node-pty helper binaries must be loadable from disk.
      unpackDir:
        "{node_modules/octopusStudio-keychain-reader,node_modules/node-pty,node_modules/mustardscript,node_modules/@mustardscript}",
    },
    ignore,
    extraResource: ["node_modules/dugite/git", "node_modules/@vscode"],
    // ignore: [/node_modules\/(?!(better-sqlite3|bindings|file-uri-to-path)\/)/],
  },
  rebuildConfig: shouldSkipNativeRebuild
    ? { onlyModules: [] }
    : {
        extraModules: nativeRebuildModules,
        force: true,
      },
  makers:
    process.env.MAKE_TARGET === "deb"
      ? [
          new MakerDeb({
            options: {
              name: "soloman-studio",
              productName: "Soloman Studio",
              genericName: "Soloman Studio",
              desktopTemplate: path.resolve(__dirname, "scripts/desktop.ejs"),
              mimeType: [
                "x-scheme-handler/solomanStudio",
                "x-scheme-handler/soloman",
                "x-scheme-handler/octopusStudio",
              ],
              icon: debIconConfig,
            },
          }),
        ]
      : [
          new MakerSquirrel(
            // @ts-expect-error - incorrect types exported by MakerSquirrel
            isWindowsSigningEnabled
              ? {
                  windowsSign,
                  iconUrl: windowsIconUrl,
                  setupIcon: path.resolve(__dirname, "assets/icon/logo.ico"),
                }
              : {
                  iconUrl: windowsIconUrl,
                  setupIcon: path.resolve(__dirname, "assets/icon/logo.ico"),
                },
          ),
          new MakerZIP({}, ["darwin", "win32"]),
          new MakerRpm({
            options: {
              mimeType: [
                "x-scheme-handler/solomanStudio",
                "x-scheme-handler/soloman",
                "x-scheme-handler/octopusStudio",
              ],
              icon: debIconConfig,
            },
          }),
          new MakerDeb({
            options: {
              name: "soloman-studio",
              productName: "Soloman Studio",
              genericName: "Soloman Studio",
              desktopTemplate: path.resolve(__dirname, "scripts/desktop.ejs"),
              mimeType: [
                "x-scheme-handler/solomanStudio",
                "x-scheme-handler/soloman",
                "x-scheme-handler/octopusStudio",
              ],
              icon: debIconConfig,
            },
          }),
          new MakerAppImage({
            icon: path.resolve(__dirname, "assets/icon/logo.png"),
          }),
        ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: {
          owner: "octopusStudio-sh",
          name: "octopus-studio",
        },
        draft: true,
        force: true,
        prerelease: isPrereleaseVersion(packageJson.version),
      },
    },
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: "src/main.ts",
          config: "vite.main.config.mts",
          target: "main",
        },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.mts",
          target: "preload",
        },
        {
          entry: "workers/code_explorer/code_explorer_worker.ts",
          config: "vite.code-explorer-worker.config.mts",
          target: "main",
        },
        {
          entry: "workers/supabase_dependency_analysis/supabase_dependency_analysis_worker.ts",
          config: "vite.supabase-dependency-analysis-worker.config.mts",
          target: "main",
        },
        {
          entry: "src/ipc/utils/sandbox/sandbox_worker.ts",
          config: "vite.sandbox-worker.config.mts",
          target: "main",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.mts",
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: isEndToEndTestBuild,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
