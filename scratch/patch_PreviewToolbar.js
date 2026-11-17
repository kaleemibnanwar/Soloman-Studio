const fs = require("fs");
const content = fs.readFileSync("src/components/preview_panel/PreviewToolbar.tsx", "utf-8");

let newContent = content.replace('"tests",\n] as const', '"tests",\n  "logger",\n] as const');

newContent = newContent.replace(
  'import { useTranslation } from "react-i18next";',
  'import { useTranslation } from "react-i18next";\nimport { Activity } from "lucide-react";',
);

newContent = newContent.replace(
  "    tests: {",
  `    logger: {
      icon: <Activity size={16} />,
      label: "LLM Logger",
      testId: "logger-mode-button",
    },
    tests: {`,
);

fs.writeFileSync("src/components/preview_panel/PreviewToolbar.tsx", newContent);
