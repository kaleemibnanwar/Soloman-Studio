const fs = require("fs");
const content = fs.readFileSync("src/components/preview_panel/PreviewToolbar.tsx", "utf-8");

let newContent = content.replace(
  'const TAB_ORDER = [\n  "preview",\n  "code",\n  "publish",\n  "configure",\n  "problems",\n  "security",\n  "tests",\n  "logger",\n]',
  'const TAB_ORDER = [\n  "preview",\n  "code",\n  "logger",\n  "publish",\n  "configure",\n  "problems",\n  "security",\n  "tests",\n]',
);

fs.writeFileSync("src/components/preview_panel/PreviewToolbar.tsx", newContent);
