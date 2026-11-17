import re

with open('src/ipc/utils/agent_tools.ts', 'r') as f:
    content = f.read()

# Replace the incorrect markdown output I just added in the previous step
old_return = r'''        return `Successfully generated video for prompt: "${prompt}".\n\nSaved to: .octopusStudio/media/${filename}\n\nYou MUST now present this to the user by rendering exactly this markdown block:\n\n<octopus-studio-video-generation>\n  <properties>\n    {"prompt": "${prompt}", "path": ".octopusStudio/media/${filename}", "state": "finished"}\n  </properties>\n</octopus-studio-video-generation>`;'''

new_return = r'''        return `Successfully generated video for prompt: "${prompt}".\n\nSaved to: .octopusStudio/media/${filename}\n\nYou MUST now present this to the user by rendering exactly this markdown block:\n\n<octopus-studio-video-generation prompt="${prompt}" path=".octopusStudio/media/${filename}"></octopus-studio-video-generation>`;'''

content = content.replace(old_return, new_return)
with open('src/ipc/utils/agent_tools.ts', 'w') as f:
    f.write(content)
