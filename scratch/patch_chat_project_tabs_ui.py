import re

with open('src/components/chat_project/ChatProjectPreview.tsx', 'r') as f:
    content = f.read()

old_ui = r'<div className="text-\[11px\] text-muted-foreground">\s*Docs &amp; files\s*</div>'
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

content = re.sub(old_ui, new_ui, content)

with open('src/components/chat_project/ChatProjectPreview.tsx', 'w') as f:
    f.write(content)
