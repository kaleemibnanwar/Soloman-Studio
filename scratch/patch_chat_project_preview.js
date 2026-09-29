const fs = require("fs");
const content = fs.readFileSync("src/components/chat_project/ChatProjectPreview.tsx", "utf-8");

let newContent = content.replace(
  "export function ChatProjectPreview({ projectId, projectName }: ChatProjectPreviewProps) {",
  'import { useAtom } from "jotai";\nimport { previewModeAtom } from "@/atoms/appAtoms";\nimport { LlmLoggerPanel } from "../preview_panel/LlmLoggerPanel";\n\nexport function ChatProjectPreview({ projectId, projectName }: ChatProjectPreviewProps) {\n  const [previewMode, setPreviewMode] = useAtom(previewModeAtom);',
);

newContent = newContent.replace(
  '<div className="text-[11px] text-muted-foreground">Docs &amp; files</div>',
  '<div className="flex items-center gap-2 mt-1">\n            <button\n              onClick={() => setPreviewMode("preview")}\n              className={`text-xs px-2 py-0.5 rounded-sm transition-colors ${previewMode !== "logger" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}\n            >\n              Docs & files\n            </button>\n            <button\n              onClick={() => setPreviewMode("logger")}\n              className={`text-xs px-2 py-0.5 rounded-sm transition-colors ${previewMode === "logger" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}\n            >\n              LLM Logger\n            </button>\n          </div>',
);

newContent = newContent.replace(
  '<div className="border-b border-border px-3 py-2">\n        <GoogleDriveSyncPanel appId={projectId} />\n      </div>\n\n      <div className="flex min-h-0 flex-1">',
  '<div className="border-b border-border px-3 py-2">\n        <GoogleDriveSyncPanel appId={projectId} />\n      </div>\n\n      {previewMode === "logger" ? (\n        <LlmLoggerPanel />\n      ) : (\n      <div className="flex min-h-0 flex-1">',
);

// We need to close the wrapping div that we bypassed
newContent = newContent.replace(
  "        </div>\n      </div>\n    </div>\n  );\n}",
  "        </div>\n      </div>\n      )}\n    </div>\n  );\n}",
);

fs.writeFileSync("src/components/chat_project/ChatProjectPreview.tsx", newContent);
