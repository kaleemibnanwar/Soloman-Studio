const fs = require("fs");
const content = fs.readFileSync("src/components/preview_panel/PreviewPanel.tsx", "utf-8");

let newContent = content.replace(
  ') : previewMode === "plan" ? (\n                  <PlanPanel />\n                ) : (',
  ') : previewMode === "plan" ? (\n                  <PlanPanel />\n                ) : previewMode === "logger" ? (\n                  <LlmLoggerPanel />\n                ) : (',
);

fs.writeFileSync("src/components/preview_panel/PreviewPanel.tsx", newContent);
