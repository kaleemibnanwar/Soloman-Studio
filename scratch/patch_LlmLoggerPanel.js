const fs = require("fs");
const content = fs.readFileSync("src/components/preview_panel/LlmLoggerPanel.tsx", "utf-8");

let newContent = content.replace(
  'import { showToast } from "@/lib/toast";',
  'import { showSuccess } from "@/lib/toast";',
);

newContent = newContent.replace(
  'showToast("Copied to clipboard");',
  'showSuccess("Copied to clipboard");',
);

fs.writeFileSync("src/components/preview_panel/LlmLoggerPanel.tsx", newContent);
