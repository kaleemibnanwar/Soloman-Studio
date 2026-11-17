import re

with open('src/ipc/utils/agent_tool_registry.ts', 'r') as f:
    content = f.read()

old_tool = """  {
    name: "generate_image",
    description: "Generate an image asset for the app.",
    isAllowedByDefault: false,
  },"""

new_tool = old_tool + """
  {
    name: "generate_video",
    description: "Generate a video asset for the app.",
    isAllowedByDefault: false,
  },"""

content = content.replace(old_tool, new_tool)
with open('src/ipc/utils/agent_tool_registry.ts', 'w') as f:
    f.write(content)
