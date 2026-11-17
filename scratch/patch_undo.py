import re
with open('src/components/chat_project/ChatProjectPreview.tsx', 'r') as f:
    content = f.read()

content = content.replace('{previewMode === "logger" ? (\n        <LlmLoggerPanel />\n      ) : (\n      {previewMode === "logger" ? (\n        <LlmLoggerPanel />\n      ) : (\n      <div className="flex min-h-0 flex-1">', '<div className="flex min-h-0 flex-1">')

with open('src/components/chat_project/ChatProjectPreview.tsx', 'w') as f:
    f.write(content)
