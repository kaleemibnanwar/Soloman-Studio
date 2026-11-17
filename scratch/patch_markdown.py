import re

with open('src/components/chat/OctopusStudioMarkdownParser.tsx', 'r') as f:
    content = f.read()

# 1. Add import for OctopusStudioVideoGeneration
import_image = 'import { OctopusStudioImageGeneration } from "./OctopusStudioImageGeneration";'
import_video = import_image + '\nimport { OctopusStudioVideoGeneration } from "./OctopusStudioVideoGeneration";'
content = content.replace(import_image, import_video)

# 2. Add video support to MARKDOWN_COMPONENTS
old_components = "const MARKDOWN_COMPONENTS = { code: CodeHighlight, a: customLink };"
new_components = """const MARKDOWN_COMPONENTS = {
  code: CodeHighlight,
  a: customLink,
  img: (props: any) => {
    if (props.src?.match(/\.(mp4|webm|ogg)$/i)) {
      return <video controls src={props.src} className="max-w-full rounded-md mt-2 mb-2" title={props.alt} />;
    }
    return <img {...props} />;
  }
};"""
content = content.replace(old_components, new_components)

# 3. Add to switch case
old_switch = """    case "octopus-studio-image-generation":
      return (
        <OctopusStudioImageGeneration
          node={block as any}
        >
          {block.children.map((child, i) => (
            <MemoBlockCustomTag key={i} block={child} isStreaming={isStreaming} />
          ))}
        </OctopusStudioImageGeneration>
      );"""

new_switch = old_switch + """
    case "octopus-studio-video-generation":
      return (
        <OctopusStudioVideoGeneration
          node={block as any}
        >
          {block.children.map((child, i) => (
            <MemoBlockCustomTag key={i} block={child} isStreaming={isStreaming} />
          ))}
        </OctopusStudioVideoGeneration>
      );"""

content = content.replace(old_switch, new_switch)

with open('src/components/chat/OctopusStudioMarkdownParser.tsx', 'w') as f:
    f.write(content)
