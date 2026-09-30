# Build, Release & Auto-Update Guide

> A reference for building **Octopus Studio** on Linux, Windows, and macOS — and a
> reusable template for setting up the same pipeline in another Electron project.
>
> Everything here is derived from this repository's actual config, not theory. Where
> the repo contains two competing mechanisms (e.g. two packaging tools), the guide
> calls out which one is authoritative.

---

## 1. The big picture

Octopus Studio is an **Electron** app (React renderer, Vite bundler) with three native
Node add-ons. Five subsystems cooperate to ship a release:

| Subsystem | Tool / File | Job |
|---|---|---|
| **Bundler** | Vite (`vite.*.config.mts`, Electron Forge Vite plugin) | Compile main/preload/renderer/worker processes |
| **Packager** | **Electron Forge** (`forge.config.ts`) | Produce per-platform installers |
| **Signer** | Azure Trusted Signing (Win) / Apple `codesign`+`notarytool` (mac) | Sign + notarize binaries |
| **Updater** | `update-electron-app` + `update.electronjs.org` | In-app updates (mac/Windows) |
| **Distributor** | GitHub Actions (`release.yml`) + GitHub Releases | Host artifacts, feed the updater |

**Authoritative build system:** Electron Forge. A second, *experimental* config —
`electron-builder.config.mjs` — exists in the repo but is **not** wired into CI or the
`package.json` scripts yet. Its top-of-file comment says it is intended to *replace*
`forge.config.ts` but is "NOT verifiable here." Treat Forge as the source of truth; the
`release/` directory you'll see (e.g. `latest-linux.yml`, `octopus-studio_1.10.0_amd64.deb`)
is output from that electron-builder experiment, not from the shipped Forge pipeline.

---

## 2. The two-repository system (private code / public release)

This is the single most important architectural decision in the pipeline.

```
git remote -v
# origin   git@github.com:kaleemibnanwar/OctopusStudio-source.git   (PRIVATE — source code)
# public   https://github.com/kaleemibnanwar/OctopusStudio.git       (PUBLIC — releases only)
```

| Repo | Purpose | Contents | Visibility |
|---|---|---|---|
| `OctopusStudio-source` (remote `origin`) | Development | Full source, history, CI, issues | **Private** |
| `OctopusStudio` (remote `public`) | Distribution | `main` branch mirror (README, download page) + GitHub Releases with binaries | **Public** |

### Why two repos?

1. **The auto-updater requires a public repo.** `update.electronjs.org` (the free
   Electron update service) can only read GitHub Releases from a **public** repository.
   You can't keep the code private *and* point the updater at a private repo.
2. **Separation of concerns.** Contributors clone `OctopusStudio` (public) and get a
   working download + README. Only maintainers with write access see `-source`.
3. **Release hygiene.** The public repo never contains the actual application source in
   a meaningful form — just a mirror of the marketing/README surface and release
   binaries.

### How the mirror is maintained

The `public` repo's `main` branch is a lightweight mirror (README, license, screenshots —
see the clone URL baked into `README.md`'s "Getting Started"). There is **no automated
bidirectional sync** in this repo; the `public` remote is pushed manually. Release
*binary* distribution, however, **is** automated — see §6.

> **For your own project:** create two GitHub repos, add both as remotes, and mirror the
> branch you want public (`git push public main`). The rest of the pipeline just needs a
> Personal Access Token with write access to the public repo (`PUBLIC_REPO_TOKEN`).

---

## 3. How the build is configured (`forge.config.ts`)

Electron Forge drives everything. The config has five parts worth understanding before
touching any platform.

### 3.1 `packagerConfig` — the packaged app

| Setting | Value | Why |
|---|---|---|
| `executableName` | `octopus-studio` | `productName` ("Octopus Studio") has a space; Linux binaries/.deb conventions reject that |
| `derefSymlinks` | `true` | Local `file:` native deps install as symlinks; dereference so packaged app has real files |
| `windowsSign` | Azure signing (only when `WINDOWS_SIGN=true`) | see §4.3 |
| `osxSign` / `osxNotarize` | Apple team ID / notarization (when env vars set) | see §4.2 |
| `asar.unpackDir` | native modules + node-pty | native `.node` binaries can't load from inside an ASAR archive |
| `extraResource` | `node_modules/dugite/git`, `node_modules/@vscode` | bundle a real `git` + ripgrep (`@vscode/ripgrep`) so the app works offline |
| `protocols` | `octopusStudio://` deep link | register a custom URL scheme |
| `ignore` | whitelist of native/kept modules | shrink the package to what's actually needed |
| `afterCopy` / `afterCopyExtraResources` | `src/lib/packaging_cleanup.ts` | prune native build junk, Electron locales, git credential manager |

### 3.2 `rebuildConfig` — native modules

```ts
const nativeRebuildModules = [
  "better-sqlite3",   // SQLite database (local DB for the app)
  "node-pty",         // terminal emulation
  "mustardscript",    // scripting runtime
  ...(process.platform === "darwin" ? ["octopusStudio-keychain-reader"] : []),
];
```

Native modules must be **compiled against Electron's ABI**, not Node's. Forge runs
`@electron/rebuild` under the hood against these modules (`force: true`). The macOS-only
`keychain-reader` wraps Apple's `Security.framework` (see `native/keychain-reader/`) and
is deliberately absent from the list on other platforms.

> **⚠️ ABI gotcha (this repo hit it):** running `npm rebuild better-sqlite3` on the
> command line rebuilds against **Node's** ABI and silently breaks the running Electron
> app's DB. After any test/debug rebuild, you must rebuild back for Electron ABI
> (`npx electron-rebuild -f -w better-sqlite3`, or just re-run the full `npm run make`).

### 3.3 `makers` — per-platform outputs

```ts
new MakerSquirrel(...)  // Windows: Setup.exe + .nupkg + RELEASES
new MakerZIP({}, ["darwin", "win32"])  // macOS + Windows portable zips
new MakerRpm(...)      // Linux .rpm
new MakerDeb(...)      // Linux .deb
new MakerAppImage(...) // Linux AppImage (custom maker, see §4.1)
```

### 3.4 `publishers` — GitHub release publishing

```ts
{ name: "@electron-forge/publisher-github",
  config: { repository: { owner: "octopusStudio-sh", name: "octopus-studio" },
            draft: true, force: true,
            prerelease: isPrereleaseVersion(packageJson.version) } }
```

A prerelease version (e.g. `1.11.0-beta.1`) is detected by `scripts/release-version-utils.js`
(the `-` in the version string) and marks the GitHub release as a prerelease.

### 3.5 `plugins` — Vite, native unpacking, fuses

- `AutoUnpackNativesPlugin` — auto-detects and unpacks native modules from the ASAR.
- `VitePlugin` — compiles the **five** entry points: `main`, `preload`, the
  `code_explorer` worker, the `supabase_dependency_analysis` worker, and the `sandbox`
  worker.
- `FusesPlugin` — flips Electron security fuses (`RunAsNode` off, ASAR integrity
  validation on, only load app from ASAR, etc.) at package time. Fuses must be flipped
  **before** code signing.

---

## 4. Building for each platform

### 4.1 Linux (`ubuntu-latest`)

**Command (CI):**
```bash
npx electron-forge make --platform=linux --arch=x64
```

**Outputs** (`out/make/`): `.deb`, `.rpm`, `.AppImage`, `.zip`.

The **AppImage** is a custom maker (`makers/MakerAppImage.ts`) because Forge has no
built-in AppImage maker. It:
1. Downloads the AppImage `type2-runtime` and **verifies its SHA-256** against a pinned
   hash (`RUNTIME_SHA256`) before using it — a supply-chain guard.
2. Builds the `AppDir`, writes a `.desktop` file, and runs `mksquashfs`
   (`requiredExternalBinaries: ["mksquashfs"]` — must be installed on the build host).
3. Prepends the runtime to the squashfs to produce a single executable.

**Native notes:** better-sqlite3/node-pty/mustardscript are rebuilt against Electron's
ABI. The bundled `git` (from `dugite`) needs its relative symlinks preserved — the AppImage
maker uses `verbatimSymlinks: true` when copying.

### 4.2 macOS (`macos-latest`)

**Command (CI):**
```bash
npx electron-forge make --platform=darwin --arch=arm64   # Apple Silicon
npx electron-forge make --platform=darwin --arch=x64     # Intel
```

**Outputs:** two `.zip` archives (one per architecture). macOS uses a **zip** (not DMG)
because that's what `update-electron-app` / `update.electronjs.org` consumes.

**Signing + notarization** — both are *conditional* on env vars being present:

| Env var | Role |
|---|---|
| `APPLE_TEAM_ID` | `osxSign.identity` — Developer ID code signing |
| `APPLE_ID` | Notarization Apple account |
| `APPLE_PASSWORD` | Notarization app-specific password |

```ts
osxSign: isEndToEndTestBuild || !process.env.APPLE_TEAM_ID ? undefined : {
  identity: process.env.APPLE_TEAM_ID,
  continueOnError: false,              // surface real signing errors
  preEmbedProvisioningProfile: false,  // skip provisioning profile scan
},
osxNotarize: /* requires APPLE_TEAM_ID + APPLE_ID + APPLE_PASSWORD */
```

Key behaviors:
- `continueOnError: false` — a signing failure **fails the build** rather than silently
  shipping an unsigned app.
- `hardenedRuntime` is implied by Forge's notarization path; **Gatekeeper requires
  notarization** for the app to launch on other Macs, and `update.electronjs.org` will
  only serve a **code-signed** macOS app.
- The `octopusStudio-keychain-reader` native add-on (links `Security.framework` +
  `CoreFoundation`) is compiled on macOS only (`scripts/rebuild-keychain-reader.mjs`
  no-ops on other platforms).

**E2E test builds** skip both signing and notarization (`isEndToEndTestBuild`), so CI
can build unsigned apps for Playwright tests.

### 4.3 Windows (`windows-latest`)

**Command (CI, PowerShell):**
```powershell
$env:SpectreMitigation = "false"
$env:VCPKG_DISABLE_SPECTRE_MITIGATION = "1"
# ... activate VS DevShell via vswhere ...
npx electron-forge make --platform=win32 --arch=x64
```

**Outputs:** Squirrel `Setup.exe`, `.nupkg` (Squirrel delta package), `RELEASES` (the
update feed), plus a portable `.zip`.

Windows is where this project hit the most toolchain friction — three workarounds are
baked in:

1. **Spectre mitigation disabled.** Node-gyp's default `Spectre` mitigation requires
   special MSVC libs that break the build. Disabled three ways: the `$env` vars above,
   plus `scripts/patch-node-gyp.js` (run by `postinstall`) which rewrites
   `node-gyp`'s `SpectreMitigation: 'Spectre'` → `'false'` and its MSVS generator.
2. **VS 2026/18 → toolset v143 mapping.** node-gyp only knew about VS 17 (2022). The
   same `patch-node-gyp.js` maps `versionMajor >= 18` → `versionYear 2022` → toolset
   `v143`. (See commit history: "map VS 2026/18 to toolset v143".)
3. **VS DevShell activation.** The workflow locates VS via `vswhere.exe` and runs
   `Enter-VsDevShell` so the native toolchain (cl.exe etc.) is on `PATH` for
   `node-gyp`.

**Code signing (Azure Trusted Signing):** `windowsSign.ts` passes raw `signtool` flags
to Azure's `dlib` (Azure Code Signing Library):

```ts
signWithParams: `/v /debug /dlib ${AZURE_CODE_SIGNING_DLIB} /dmdf ${AZURE_METADATA_JSON}`,
timestampServer: "http://timestamp.acs.microsoft.com",
```

Signing is **off by default**; it's enabled with `WINDOWS_SIGN=true` and requires
`AZURE_CODE_SIGNING_DLIB` + `AZURE_METADATA_JSON` (the config throws if enabled but
unset). The `.exe`, `.nupkg`, and `RELEASES` must all be signed for Squirrel updates.

---

## 5. Native modules: the recurring theme

Every native add-on in this project is handled the same way — **rebuild for Electron ABI
+ unpack from the ASAR**:

| Module | Platform | Why it's native |
|---|---|---|
| `better-sqlite3` | all | SQLite via C++ bindings (local app DB) |
| `node-pty` | all | fork a real PTY for the terminal |
| `mustardscript` | all | native scripting runtime |
| `octopus-studio-keychain-reader` | macOS only | `Security.framework` keychain access for `safeStorage` recovery |

The packaging cleanup module (`src/lib/packaging_cleanup.ts`) then **strips the build
junk** from those modules after they're packaged — removing `binding.gyp`, `src/`,
`build/obj`, `README.md`, etc. — which is a large part of why the final binaries stay
small.

---

## 6. Auto-update

### The mechanism

```ts
// src/main/auto_update_config.ts
export const PUBLIC_RELEASE_REPOSITORY = "kaleemibnanwar/OctopusStudio";
export const ELECTRON_UPDATE_SERVICE_HOST = "https://update.electronjs.org";

updateSource: { type: UpdateSourceType.ElectronPublicUpdateService,
                repo: PUBLIC_RELEASE_REPOSITORY, host: ELECTRON_UPDATE_SERVICE_HOST },
updateInterval: "60 minutes",
channel: releaseChannel === "beta" ? "beta" : "stable",
```

```ts
// src/main.ts
updateElectronApp({ logger, updateInterval, updateSource });
```

- **Client:** `update-electron-app` — the Electron team's drop-in updater.
- **Server:** `update.electronjs.org` — a free service that scans the **public repo's
  GitHub Releases** and tells the app when a newer version exists.
- **Cadence:** checks at startup and every 60 minutes; downloads in the background; shows
  a restart prompt when ready.
- **Channels:** `stable` and `beta` are mapped from the user's release-channel setting.

### What the updater needs per platform

| Platform | Required artifacts in the release | Notes |
|---|---|---|
| **macOS** | a `.zip` | **must be code-signed** — update.electronjs.org refuses unsigned mac builds |
| **Windows** | `Setup.exe` + `.nupkg` + `RELEASES` | Squirrel.Windows update feed; `electron-squirrel-startup` (already a dependency) suppresses the double-launch artifact |
| **Linux** | — | **not supported** by update-electron-app / update.electronjs.org; Linux users install manually |

> **⚠️ Naming matters.** `update.electronjs.org` matches assets by a fixed naming
> convention, and Squirrel's `RELEASES` file embeds the exact filenames of the `.nupkg`
> and `Setup.exe`. If you rename artifacts after Forge produces them (as the current
> `release.yml` does — `Octopus-Studio-Setup-1.10.0.exe` etc.), **verify the updater can
> still resolve them**; a rename that breaks the `RELEASES`↔nupkg relationship silently
> disables Windows auto-update.

### Why the app-update.yml file exists but isn't used

`release/linux-unpacked/resources/app-update.yml` (`provider: github`, `owner:
kaleemibnanwar`, `repo: OctopusStudio`) is an **electron-builder** updater artifact from
the experimental build path. The shipped app uses `update-electron-app`, not
electron-builder's `autoUpdater`. Don't wire both.

---

## 7. Releasing

### The happy path (automated)

1. **Bump the version** — `npm run bump` runs `scripts/bump-version.mjs`: an interactive
   prompt that creates a `bump-to-vX.Y.Z` branch, edits `package.json` +
   `package-lock.json`, commits, pushes, and opens a PR via `gh`.
2. **Merge**, then **tag** the release commit `vX.Y.Z` (or push the tag). Pushing a
   `v*` tag (or clicking "Run workflow") triggers `.github/workflows/release.yml`.
3. **Matrix build** — three runners (`windows-latest`, `macos-latest`, `ubuntu-latest`)
   build in parallel, each running `npx electron-forge make` for its platform.
4. **Collect** — each runner copies its artifacts into `dist-release/`.
5. **Upload to GitHub Releases** — in **both** repos:

```bash
# source repo (private)
gh release create "$TAG" ... && gh release upload "$TAG" dist-release/* --clobber

# public repo (where the updater reads from)
GH_TOKEN="$PUBLIC_REPO_TOKEN" gh release create "$TAG" --repo kaleemibnanwar/OctopusStudio ...
GH_TOKEN="$PUBLIC_REPO_TOKEN" gh release upload "$TAG" dist-release/* --repo kaleemibnanwar/OctopusStudio --clobber
```

6. **Users update** — the app's next 60-minute check hits `update.electronjs.org`, sees
   the new release in the public repo, and downloads it.

### Notable CI details

- **Custom checkout:** instead of `actions/checkout`, the workflow does a manual
  `git clone` with `x-access-token` and `git checkout ${{ github.ref_name }}`. This
  forces `core.autocrlf false` and sidesteps checkout quirks on Windows.
- **Node memory:** `NODE_OPTIONS=--max-old-space-size=8192` — the Vite build of an app
  this size needs a large heap.
- **Hardcoded fallback version:** `TAG` defaults to `v1.10.0` if the ref is `main` (for
  manual `workflow_dispatch` runs).

### Verification & guard rails (scripts present, but not wired into this simplified release.yml)

The repo carries several scripts inherited from a richer upstream workflow. They are
**not** invoked by the current `release.yml`, but you may want to re-enable them:

| Script | Purpose |
|---|---|
| `scripts/verify-release-assets.js` | Assert every expected asset (deb/rpm/AppImage/nupkg/exe/zip/RELEASES + provenance) is present, and that the release's prerelease flag matches the version. **Note:** hardcodes `octopusStudio-sh/octopus-studio` as owner — update for your org. |
| `scripts/generate-release-provenance.js` | Emit a per-platform JSON manifest (schema v1) of artifact name→SHA-256→size, for supply-chain verification. |
| `scripts/prepare-release-tag.js` | Pin the `vX.Y.Z` tag to the exact commit SHA before release, and refuse to move a published release's tag. |
| `scripts/unauthorized-release-alert.mjs` | If a release is published by anyone other than `github-actions[bot]`, delete it and email the maintainers (Mailgun). |

---

## 8. Secrets & environment reference

### GitHub Actions secrets

| Secret | Used by | Required? |
|---|---|---|
| `GITHUB_TOKEN` | checkout + source-repo release upload | auto-provided |
| `PUBLIC_REPO_TOKEN` | upload to the public release repo (`kaleemibnanwar/OctopusStudio`) | **yes** (workflow hard-fails without it) |
| `APPLE_TEAM_ID` | macOS signing + notarization | for mac releases |
| `APPLE_ID` | notarization | for mac releases |
| `APPLE_PASSWORD` | notarization app-specific password | for mac releases |
| `AZURE_CODE_SIGNING_DLIB` | Windows Azure Trusted Signing | only with `WINDOWS_SIGN=true` |
| `AZURE_METADATA_JSON` | Windows Azure Trusted Signing | only with `WINDOWS_SIGN=true` |
| `SIGNTOOL_PATH` | path to `signtool.exe` | optional (defaults to `signtool.exe`) |
| `MAILGUN_API_KEY` / `MAILGUN_DOMAIN` / `MAILGUN_FROM_EMAIL` / `UNAUTHORIZED_RELEASE_ALERT_EMAILS` | unauthorized-release alert | only if you re-enable that script |

### Local build flags

| Env var | Effect |
|---|---|
| `WINDOWS_SIGN=true` | enable Windows signing (throws if Azure vars unset) |
| `E2E_TEST_BUILD=true` | unsigned, un-notarized build for Playwright (also enables inspect fuses) |
| `MAKE_TARGET=deb` | `npm run make:deb` — build only the `.deb` (used for local Linux iteration) |
| `OCTOPUS_STUDIO_SKIP_NATIVE_REBUILD=true` | skip `electron-rebuild` (fast iteration when native code is unchanged) |

### App runtime config (hardcoded IDs & feature flags)

These are baked into the app rather than passed as CI secrets. They were all
updated as part of the PostHog→Clarity / upstream→fork rebrand:

| Concern | Where | Current state |
|---|---|---|
| **Analytics** | `src/lib/telemetry.ts` | Microsoft Clarity, project `yq5b8j38ea`. Replaced PostHog entirely (`posthog-js` removed). Custom events map to `clarity.event(name)` — **event properties are dropped**; identity maps to `clarity.identify`; opt-in is honored by only calling `initTelemetry()` when the user opted in. |
| **GitHub OAuth** | `src/ipc/handlers/github_handlers.ts:68` | Client ID `Ov23litltJHC4xcxVXKJ` (env `GITHUB_CLIENT_ID` overrides). Uses **Device Flow** — no client secret, no redirect URI. The OAuth app must have "Enable Device Flow" ticked. |
| **Google Drive OAuth** | `src/ipc/google/google_drive_auth.ts:14` | Client ID placeholder `YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com`. **Client secret removed** — the flow uses PKCE (`code_verifier`) + loopback redirect, so the client must be created as a **"Desktop app"** type. |
| **Drive sync UI** | `src/lib/featureFlags.ts` | `GOOGLE_DRIVE_INTEGRATION_ENABLED = false` hides the Settings "Google Account" card, the chat-preview Drive-sync panel, and its Settings search entry. Flip to `true` (and fill in the client ID) to re-enable. |

---

## 9. Troubleshooting — gotchas this repo actually hit

| Symptom | Cause | Fix |
|---|---|---|
| Running app's DB breaks after running tests | `npm rebuild better-sqlite3` rebuilt against **Node** ABI, not Electron | Rebuild for Electron ABI (`npx electron-rebuild -f -w better-sqlite3`) or re-run `npm run make` |
| Windows native build fails on Spectre libs | node-gyp defaults to `Spectre` mitigation | `$env:SpectreMitigation="false"` + `patch-node-gyp.js` (auto via `postinstall`) |
| Windows build can't find VS 2026/18 toolset | node-gyp only maps VS 17→v143 | `patch-node-gyp.js` maps `>=18`→v143 |
| macOS signing silently "succeeds" but ships unsigned | Forge default `continueOnError: true` | Set `osxSign.continueOnError: false` (already done here) |
| Packaged app can't load `git` / `ripgrep` | They weren't shipped | `extraResource: ["node_modules/dugite/git", "node_modules/@vscode"]` + cleanup preserves their layout |
| AppImage fails to build | `mksquashfs` not installed | install `squashfs-tools` on the Linux build host |
| Auto-update never finds a mac update | mac app not code-signed | update.electronjs.org only serves signed mac builds; sign + notarize |
| `.deb`/Linux binary name mismatch | `productName` has a space | `executableName: "octopus-studio"` pins a sanitized name |

---

## 10. Reusable template — apply this to your own Electron project

A copy-paste checklist of the decisions that make this pipeline work:

1. **Two repos.** Private `your-app-source`, public `your-app` (for the updater + public
   download page). Add `PUBLIC_REPO_TOKEN` secret with write access to the public repo.
2. **Pick Forge (or electron-builder) — not both.** The migration half-state in this repo
   is a source of confusion; choose one and delete the other's config.
3. **Pin `executableName`** to a no-space name if your `productName` has spaces.
4. **Enumerate your native modules explicitly** in `rebuildConfig.extraModules` and
   `asar.unpackDir`, and write an `afterCopy` cleanup to strip their build junk.
5. **Ship offline dependencies** (`git`, `ripgrep`) via `extraResource`.
6. **Wire auto-update** with `update-electron-app` pointed at the **public** repo;
   remember it's **mac + Windows only** — document Linux as manual install.
7. **Sign everything you want auto-updated:** Azure Trusted Signing on Windows,
   Developer ID + notarization on macOS. Make signing fail loudly, not silently.
8. **Add the Windows toolchain workarounds** (`SpectreMitigation=false`, VS→toolset
   mapping, DevShell activation) — they're the difference between "works locally" and
   "works on CI".
9. **Gate the release on a tag** (`v*`), build in a 3-OS matrix with
   `fail-fast: false`, and upload to *both* repos.
10. **Add verification** (asset presence + provenance) *before* you trust the pipeline,
    not after a bad release ships.
```
