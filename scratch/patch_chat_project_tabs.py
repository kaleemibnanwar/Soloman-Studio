import re

with open('src/components/chat_project/ChatProjectPreview.tsx', 'r') as f:
    content = f.read()

# 1. Imports
imports = """import { useAtom } from "jotai";
import { previewModeAtom } from "@/atoms/appAtoms";
import { LlmLoggerPanel } from "../preview_panel/LlmLoggerPanel";
"""
content = re.sub(r'(import { Button } from "@/components/ui/button";)', r'\1\n' + imports, content)

# 2. Add previewMode state
content = content.replace(
  "export function ChatProjectPreview({ projectId, projectName }: ChatProjectPreviewProps) {",
  'export function ChatProjectPreview({ projectId, projectName }: ChatProjectPreviewProps) {\n  const [previewMode, setPreviewMode] = useAtom(previewModeAtom);'
)

# 3. Add Tabs UI
old_ui = '<div className="text-[11px] text-muted-foreground">Docs &amp; files</div>'
new_ui = """<div className="flex items-center gap-2 mt-1">
            <button
              onClick={() => setPreviewMode("preview")}
              className={`text-xs px-2 py-0.5 rounded-sm transition-colors ${previewMode !== "logger" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Docs & files
            </button>
            <button
              onClick={() => setPreviewMode("logger")}
              className={`text-xs px-2 py-0.5 rounded-sm transition-colors ${previewMode === "logger" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              LLM Logger
            </button>
          </div>"""
content = content.replace(old_ui, new_ui)

# 4. Wrap the flex container in ternary
content = content.replace(
  '<div className="flex min-h-0 flex-1">',
  '{previewMode === "logger" ? (\n        <LlmLoggerPanel />\n      ) : (\n      <div className="flex min-h-0 flex-1">'
)

# 5. Close the ternary right before the Dialogs!
content = content.replace(
  '      </div>\n      {projectId != null && (',
  '      </div>\n      )}\n      {projectId != null && ('
)

with open('src/components/chat_project/ChatProjectPreview.tsx', 'w') as f:
    f.write(content)
