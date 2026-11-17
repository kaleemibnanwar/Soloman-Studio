import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SOURCE_IMAGE = "/home/kalim/Downloads/Metallic Ribbon S with Sparkle.png";
const TMP_DIR = "/tmp/logo_build";

if (!fs.existsSync(SOURCE_IMAGE)) {
  console.error("Source image not found at:", SOURCE_IMAGE);
  process.exit(1);
}

fs.mkdirSync(TMP_DIR, { recursive: true });

console.log("1. Generating master trimmed image...");
const masterCropped = path.join(TMP_DIR, "master_cropped.png");
execSync(
  `convert "${SOURCE_IMAGE}" -crop 792x882+376+93 +repage -channel A -level 0.4%,100% +channel "${masterCropped}"`,
);

// Function to generate a square transparent icon of given size
function makeSquareTransparent(targetSize, heightFraction = 0.82) {
  const outFile = path.join(TMP_DIR, `icon_${targetSize}x${targetSize}.png`);
  const targetH = Math.round(targetSize * heightFraction);
  execSync(
    `convert "${masterCropped}" -filter Lanczos -resize x${targetH} -background none -gravity center -extent ${targetSize}x${targetSize} "${outFile}"`,
  );
  return outFile;
}

// Function to create macOS .icns file
function makeIcns(pngMap, outPath) {
  // pngMap is { ostype: filePath }
  const entries = [];
  for (const [ostype, filePath] of Object.entries(pngMap)) {
    entries.push({ ostype, buffer: fs.readFileSync(filePath) });
  }
  const totalBodyLength = entries.reduce((acc, e) => acc + 8 + e.buffer.length, 0);
  const totalLength = 8 + totalBodyLength;
  const header = Buffer.alloc(8);
  header.write("icns", 0, 4, "ascii");
  header.writeUInt32BE(totalLength, 4);

  const chunks = [header];
  for (const entry of entries) {
    const chunkHeader = Buffer.alloc(8);
    chunkHeader.write(entry.ostype, 0, 4, "ascii");
    chunkHeader.writeUInt32BE(8 + entry.buffer.length, 4);
    chunks.push(chunkHeader);
    chunks.push(entry.buffer);
  }
  fs.writeFileSync(outPath, Buffer.concat(chunks));
}

console.log("2. Generating studio icon sizes...");
const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const sizeFiles = {};
for (const s of sizes) {
  sizeFiles[s] = makeSquareTransparent(s);
}

// Studio paths
const STUDIO_ROOT = "/home/kalim/OctopusCloud/octopus-studio";
console.log("3. Writing Studio assets...");
for (const s of sizes) {
  fs.copyFileSync(sizeFiles[s], path.join(STUDIO_ROOT, `assets/icon/${s}x${s}.png`));
}
fs.copyFileSync(sizeFiles[1024], path.join(STUDIO_ROOT, "assets/icon/logo.png"));
fs.copyFileSync(sizeFiles[1024], path.join(STUDIO_ROOT, "assets/logo.png"));

// Generate studio logo.ico
console.log("4. Generating Studio logo.ico...");
const icoCmd = `convert "${sizeFiles[16]}" "${sizeFiles[24]}" "${sizeFiles[32]}" "${sizeFiles[48]}" "${sizeFiles[64]}" "${sizeFiles[128]}" "${sizeFiles[256]}" "${path.join(
  STUDIO_ROOT,
  "assets/icon/logo.ico",
)}"`;
execSync(icoCmd);

// Generate studio logo.icns
console.log("5. Generating Studio logo.icns...");
makeIcns(
  {
    icp4: sizeFiles[16],
    icp5: sizeFiles[32],
    icp6: sizeFiles[64],
    ic11: sizeFiles[32],
    ic12: sizeFiles[64],
    ic07: sizeFiles[128],
    ic08: sizeFiles[256],
    ic13: sizeFiles[256],
    ic09: sizeFiles[512],
    ic14: sizeFiles[512],
    ic10: sizeFiles[1024],
  },
  path.join(STUDIO_ROOT, "assets/icon/logo.icns"),
);

// Chrome extensions in studio
console.log("6. Updating Chrome extension icons in Studio...");
const octolimbIcons = path.join(STUDIO_ROOT, "octolimb/chrome-extension/icons");
if (fs.existsSync(octolimbIcons)) {
  fs.copyFileSync(sizeFiles[16], path.join(octolimbIcons, "icon-16.png"));
  fs.copyFileSync(sizeFiles[32], path.join(octolimbIcons, "icon-32.png"));
  fs.copyFileSync(sizeFiles[48], path.join(octolimbIcons, "icon-48.png"));
  fs.copyFileSync(sizeFiles[128], path.join(octolimbIcons, "icon-128.png"));
}

const browserbridgeIcons = path.join(
  STUDIO_ROOT,
  "browserbridge-extension/chrome-extension/public",
);
if (fs.existsSync(browserbridgeIcons)) {
  fs.copyFileSync(sizeFiles[32], path.join(browserbridgeIcons, "icon-32.png"));
  fs.copyFileSync(sizeFiles[128], path.join(browserbridgeIcons, "icon-128.png"));
}

// Mobile App assets
console.log("7. Generating Mobile App assets...");
const MOBILE_ROOT = "/home/kalim/OctopusCloud/MobileAPPClient";
const mobileAppIcon = path.join(TMP_DIR, "mobile_app_icon_1024.png");
// App icon has solid #0d1117 background with safe padding (height 720)
execSync(
  `convert "${masterCropped}" -filter Lanczos -resize x720 -background "#0d1117" -gravity center -extent 1024x1024 -alpha remove -alpha off "${mobileAppIcon}"`,
);

fs.copyFileSync(mobileAppIcon, path.join(MOBILE_ROOT, "assets/icon.png"));
const iosAppIcon = path.join(
  MOBILE_ROOT,
  "ios/OctopusController/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png",
);
if (fs.existsSync(path.dirname(iosAppIcon))) {
  fs.copyFileSync(mobileAppIcon, iosAppIcon);
}

// Splash mark and splash-icon (512x512 transparent)
const splashMark = makeSquareTransparent(512, 0.78);
fs.copyFileSync(splashMark, path.join(MOBILE_ROOT, "assets/soloman-mark.png"));
fs.copyFileSync(splashMark, path.join(MOBILE_ROOT, "assets/splash-icon.png"));

// Android adaptive icons (432x432)
// Foreground has transparent background, safe-zone height 260
const androidFg = path.join(TMP_DIR, "android_fg_432.png");
execSync(
  `convert "${masterCropped}" -filter Lanczos -resize x260 -background none -gravity center -extent 432x432 "${androidFg}"`,
);
fs.copyFileSync(androidFg, path.join(MOBILE_ROOT, "assets/android-icon-foreground.png"));

// Background (432x432 solid #0d1117)
const androidBg = path.join(TMP_DIR, "android_bg_432.png");
execSync(`convert -size 432x432 xc:"#0d1117" "${androidBg}"`);
fs.copyFileSync(androidBg, path.join(MOBILE_ROOT, "assets/android-icon-background.png"));

// Monochrome (grayscale of foreground)
const androidMono = path.join(TMP_DIR, "android_mono_432.png");
execSync(`convert "${androidFg}" -colorspace Gray "${androidMono}"`);
fs.copyFileSync(androidMono, path.join(MOBILE_ROOT, "assets/android-icon-monochrome.png"));

// Mobile favicon (48x48)
fs.copyFileSync(sizeFiles[48], path.join(MOBILE_ROOT, "assets/favicon.png"));

// Android launcher mipmaps
const mipmaps = {
  "mipmap-mdpi": { fg: 108, icon: 48 },
  "mipmap-hdpi": { fg: 162, icon: 72 },
  "mipmap-xhdpi": { fg: 216, icon: 96 },
  "mipmap-xxhdpi": { fg: 324, icon: 144 },
  "mipmap-xxxhdpi": { fg: 432, icon: 192 },
};
const androidResDir = path.join(MOBILE_ROOT, "android/app/src/main/res");
for (const [folder, dims] of Object.entries(mipmaps)) {
  const dir = path.join(androidResDir, folder);
  if (fs.existsSync(dir)) {
    execSync(
      `convert "${androidFg}" -filter Lanczos -resize ${dims.fg}x${dims.fg} "${path.join(dir, "ic_launcher_foreground.webp")}"`,
    );
    execSync(
      `convert "${path.join(dir, "ic_launcher_foreground.webp")}" -colorspace Gray "${path.join(dir, "ic_launcher_monochrome.webp")}"`,
    );
    execSync(
      `convert "${mobileAppIcon}" -filter Lanczos -resize ${dims.icon}x${dims.icon} "${path.join(dir, "ic_launcher.webp")}"`,
    );
    execSync(
      `convert "${mobileAppIcon}" -filter Lanczos -resize ${dims.icon}x${dims.icon} "${path.join(dir, "ic_launcher_round.webp")}"`,
    );
  }
}

// Android native splashscreen drawables
const androidRes = path.join(MOBILE_ROOT, "android/app/src/main/res");
const splashSizes = {
  "drawable-mdpi": 288,
  "drawable-hdpi": 432,
  "drawable-xhdpi": 576,
  "drawable-xxhdpi": 864,
  "drawable-xxxhdpi": 1152,
};
for (const [folder, dim] of Object.entries(splashSizes)) {
  const targetDir = path.join(androidRes, folder);
  if (fs.existsSync(targetDir)) {
    const splashFile = path.join(TMP_DIR, `splash_${dim}.png`);
    const splashH = Math.round(dim * 0.75);
    execSync(
      `convert "${masterCropped}" -filter Lanczos -resize x${splashH} -background none -gravity center -extent ${dim}x${dim} "${splashFile}"`,
    );
    fs.copyFileSync(splashFile, path.join(targetDir, "splashscreen_logo.png"));
  }
}

// Website assets (cloud_platform)
console.log("8. Generating Website assets...");
const CLOUD_ROOT = "/home/kalim/OctopusCloud/cloud_platform";
const staticBrand = path.join(CLOUD_ROOT, "static/brand");
const staticMedia = path.join(staticBrand, "media_assets");
const staticFilesBrand = path.join(CLOUD_ROOT, "staticfiles/brand");
const staticFilesMedia = path.join(staticFilesBrand, "media_assets");

// Favicon
fs.copyFileSync(sizeFiles[48], path.join(CLOUD_ROOT, "static/favicon.png"));
fs.copyFileSync(sizeFiles[48], path.join(CLOUD_ROOT, "staticfiles/favicon.png"));

// 50x50 symbols
const symbol50 = makeSquareTransparent(50, 0.88);
fs.copyFileSync(symbol50, path.join(staticBrand, "soloman-symbol.png"));
fs.copyFileSync(symbol50, path.join(staticBrand, "soloman-symbol-transparent.png"));
fs.copyFileSync(symbol50, path.join(staticBrand, "soloman-logo-v2.png"));
fs.copyFileSync(symbol50, path.join(staticFilesBrand, "soloman-symbol.png"));
fs.copyFileSync(symbol50, path.join(staticFilesBrand, "soloman-symbol-transparent.png"));
fs.copyFileSync(symbol50, path.join(staticFilesBrand, "soloman-logo-v2.png"));

// 60x60 v2-logo
const logo60 = makeSquareTransparent(60, 0.88);
fs.copyFileSync(logo60, path.join(staticBrand, "v2-logo.png"));
fs.copyFileSync(logo60, path.join(staticFilesBrand, "v2-logo.png"));

// media_assets/logo-clean.png (48x48)
fs.copyFileSync(sizeFiles[48], path.join(staticMedia, "logo-clean.png"));
fs.copyFileSync(sizeFiles[48], path.join(staticFilesMedia, "logo-clean.png"));

// media_assets/logo-dark.png & logo-light.png (180x180)
const logo180 = makeSquareTransparent(180, 0.85);
fs.copyFileSync(logo180, path.join(staticMedia, "logo-dark.png"));
fs.copyFileSync(logo180, path.join(staticMedia, "logo-light.png"));
fs.copyFileSync(logo180, path.join(staticFilesMedia, "logo-dark.png"));
fs.copyFileSync(logo180, path.join(staticFilesMedia, "logo-light.png"));

// soloman-mark-dark.png & soloman-mark-light.png (1024x1024)
fs.copyFileSync(sizeFiles[1024], path.join(staticBrand, "soloman-mark-dark.png"));
fs.copyFileSync(sizeFiles[1024], path.join(staticBrand, "soloman-mark-light.png"));
fs.copyFileSync(sizeFiles[1024], path.join(staticFilesBrand, "soloman-mark-dark.png"));
fs.copyFileSync(sizeFiles[1024], path.join(staticFilesBrand, "soloman-mark-light.png"));

// studio_web_dist
const studioWebDistLogo = path.join(CLOUD_ROOT, "studio_web_dist/assets/logo-BaK_uosG.png");
if (fs.existsSync(studioWebDistLogo)) {
  fs.copyFileSync(sizeFiles[512], studioWebDistLogo);
}

console.log("All logo and icon assets successfully generated!");
