import re

with open('src/ipc/utils/agent_tools.ts', 'r') as f:
    content = f.read()

old_stub = '  tools.generate_image = stub("Generate an image asset for the app.");'
new_stub = old_stub + '\n  tools.generate_video = stub("Generate a video asset for the app.");'

content = content.replace(old_stub, new_stub)
with open('src/ipc/utils/agent_tools.ts', 'w') as f:
    f.write(content)
