const fs = require("fs");
const content = fs.readFileSync("src/components/preview_panel/PreviewToolbar.tsx", "utf-8");

let newContent = content.replace(
  'const VERSION_TAB_ORDER = ["preview", "code"] as const satisfies readonly [',
  'const VERSION_TAB_ORDER = ["preview", "code", "logger"] as const satisfies readonly [',
);
newContent = newContent.replace(
  "  ToolbarMode,\n  ToolbarMode,\n];",
  "  ToolbarMode,\n  ToolbarMode,\n  ToolbarMode,\n];",
);

fs.writeFileSync("src/components/preview_panel/PreviewToolbar.tsx", newContent);
