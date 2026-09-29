const fs = require("fs");
const path = require("path");

function patchFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, "utf8");
  let modified = false;

  // 1. Add versionMajor >= 18 -> 2026 in getVersionInfo
  if (content.includes("versionMajor === 17") && !content.includes("versionMajor >= 18")) {
    content = content.replace(
      /if\s*\(\s*ret\.versionMajor\s*===\s*17\s*\)\s*\{[\s\r\n]*ret\.versionYear\s*=\s*2022;?[\s\r\n]*return\s+ret;?[\s\r\n]*\}/g,
      `if (ret.versionMajor === 17) {\n      ret.versionYear = 2022\n      return ret\n    }\n    if (ret.versionMajor >= 18) {\n      ret.versionYear = 2026\n      return ret\n    }`
    );
    modified = true;
  }

  // 2. Allow 2026 in supportedYears for findVisualStudio2019OrNewer*
  if (content.includes("[2019, 2022]") && !content.includes("[2019, 2022, 2026]")) {
    content = content.replaceAll("[2019, 2022]", "[2019, 2022, 2026]");
    modified = true;
  }

  // 3. Add versionYear >= 2026 -> 'v144' in getToolset
  if (content.includes("versionYear === 2022") && !content.includes("versionYear >= 2026")) {
    content = content.replace(
      /else\s+if\s*\(\s*versionYear\s*===\s*2022\s*\)\s*\{[\s\r\n]*return\s+['"]v143['"];?[\s\r\n]*\}/g,
      `else if (versionYear === 2022) {\n      return 'v143'\n    } else if (versionYear >= 2026) {\n      return 'v144'\n    }`
    );
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`Successfully patched ${filePath} for VS 2026/18 toolset.`);
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
      patchFile(fullPath);
    }
  }
}

findAndPatch(path.join(process.cwd(), "node_modules"));
