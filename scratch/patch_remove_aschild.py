import re

with open('src/components/chat_project/ChatProjectPreview.tsx', 'r') as f:
    content = f.read()

content = content.replace('<ContextMenuTrigger asChild>', '<ContextMenuTrigger>')

with open('src/components/chat_project/ChatProjectPreview.tsx', 'w') as f:
    f.write(content)
