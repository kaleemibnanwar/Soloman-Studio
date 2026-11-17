const fs = require("fs");
const path = require("path");

function patchVisualStudioFinder(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, "utf8");
  let modified = false;

  // 1. Support VS 18+ by mapping versionMajor >= 18 to versionYear = 2022 (toolset v143)
  if (content.includes("versionMajor === 17") && !content.includes("versionMajor >= 18")) {
    content = content.replace(
      /if\s*\(\s*ret\.versionMajor\s*===\s*17\s*\)\s*\{[\s\r\n]*ret\.versionYear\s*=\s*2022;?[\s\r\n]*return\s+ret;?[\s\r\n]*\}/g,
      "if (ret.versionMajor === 17) {\n      ret.versionYear = 2022\n      return ret\n    }\n    if (ret.versionMajor >= 18) {\n      ret.versionYear = 2022\n      return ret\n    }",
    );
    modified = true;
  }

  // 2. Also ensure if versionYear is >= 2022, toolset v143 is returned
  if (content.includes("versionYear === 2022") && !content.includes("versionYear >= 2022")) {
    content = content.replace(
      /else\s+if\s*\(\s*versionYear\s*===\s*2022\s*\)\s*\{[\s\r\n]*return\s+['"]v143['"];?[\s\r\n]*\}/g,
      "else if (versionYear >= 2022) {\n      return 'v143'\n    }",
    );
    modified = true;
  }

  // 3. In case v144 was previously patched in
  if (content.includes("return 'v144'")) {
    content = content.replaceAll("return 'v144'", "return 'v143'");
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`Successfully patched ${filePath} for VS 2026/18 compatibility.`);
  }
}

function patchGypSpectre(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, "utf8");
  if (
    content.includes("'SpectreMitigation': 'Spectre'") ||
    content.includes('"SpectreMitigation": "Spectre"')
  ) {
    content = content
      .replaceAll("'SpectreMitigation': 'Spectre'", "'SpectreMitigation': 'false'")
      .replaceAll('"SpectreMitigation": "Spectre"', '"SpectreMitigation": "false"');
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`Successfully patched ${filePath} to disable Spectre mitigation.`);
  }
}

function patchMsvsGenerator(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, "utf8");
  if (
    content.includes("spectre_mitigation = msbuild_attributes.get('SpectreMitigation')") &&
    !content.includes("spectre_mitigation = 'false'")
  ) {
    content = content.replace(
      "spectre_mitigation = msbuild_attributes.get('SpectreMitigation')",
      "spectre_mitigation = 'false' # disabled by patch-node-gyp",
    );
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`Successfully patched ${filePath} to disable Spectre in MSVS generator.`);
  }
}

function findAndPatch(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findAndPatch(fullPath);
    } else if (entry.name === "find-visualstudio.js") {
      patchVisualStudioFinder(fullPath);
    } else if (entry.name.endsWith(".gyp") || entry.name.endsWith(".gypi")) {
      patchGypSpectre(fullPath);
    } else if (entry.name === "msvs.py") {
      patchMsvsGenerator(fullPath);
    }
  }
}

findAndPatch(path.join(process.cwd(), "node_modules"));
