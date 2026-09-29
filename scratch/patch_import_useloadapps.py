import re

with open('src/components/chat_project/ChatProjectPreview.tsx', 'r') as f:
    content = f.read()

imports = """import { useLoadApps } from "@/hooks/useLoadApps";
"""

content = re.sub(r'(import { useAtom } from "jotai";)', r'\1\n' + imports, content)

with open('src/components/chat_project/ChatProjectPreview.tsx', 'w') as f:
    f.write(content)
