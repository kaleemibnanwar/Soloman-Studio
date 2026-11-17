import re

with open('src/components/chat_project/ChatProjectPreview.tsx', 'r') as f:
    content = f.read()

# Add previewMode state right after `export function ChatProjectPreview({ ... }: ChatProjectPreviewProps) {`
content = re.sub(
  r'(export function ChatProjectPreview\([^)]+\)\s*\{)',
  r'\1\n  const [previewMode, setPreviewMode] = useAtom(previewModeAtom);',
  content,
  count=1
)

with open('src/components/chat_project/ChatProjectPreview.tsx', 'w') as f:
    f.write(content)
