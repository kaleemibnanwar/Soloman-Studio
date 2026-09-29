import re

with open('src/components/chat/OctopusStudioMarkdownParser.tsx', 'r') as f:
    content = f.read()

old_bad = """    case "octopus-studio-video-generation":
      return (
        <OctopusStudioVideoGeneration
          node={block as any}
        >"""

new_good = """    case "octopus-studio-video-generation":
      return (
        <OctopusStudioVideoGeneration
          node={{
            properties: {
              prompt: attributes.prompt || "",
              path: attributes.path || "",
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >"""

content = content.replace(old_bad, new_good)
with open('src/components/chat/OctopusStudioMarkdownParser.tsx', 'w') as f:
    f.write(content)
