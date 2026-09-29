const fs = require("fs");
const path = require("path");

function patchFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, "utf8");
  let modified = false;

  // 1. Add versionMajor >= 18 -> 2026
  if (content.includes("ret.versionMajor === 17") && !content.includes("ret.versionMajor >= 18")) {
    content = content.replace(
      /if \(ret\.versionMajor === 17\) \{\s*ret\.versionYear = 2022\s*return ret\s*\}/,
      `if (ret.versionMajor === 17) {\n      ret.versionYear = 2022\n      return ret\n    }\n    if (ret.versionMajor >= 18) {\n      ret.versionYear = 2026\n      return ret\n    }`,
    );
    modified = true;
  }

  // 2. Allow 2026 in supportedYears for findVisualStudio2019OrNewer*
  if (content.includes("[2019, 2022]") && !content.includes("[2019, 2022, 2026]")) {
    content = content.replaceAll("[2019, 2022]", "[2019, 2022, 2026]");
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`Successfully patched ${filePath} for VS 2026/18 compatibility.`);
  }
}

// Find all find-visualstudio.js files under node_modules
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
