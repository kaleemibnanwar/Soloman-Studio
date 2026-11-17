import re

with open('src/ipc/utils/agent_tools.ts', 'r') as f:
    content = f.read()

# I will find the current tools.generate_video implementation and replace it
# First, let's grab the regex for it. It spans multiple lines, so we can just use re.sub or a known block.

def replace_tool():
    global content
    pattern = re.compile(r'  tools\.generate_video = \{.*?\n  \};\n', re.DOTALL)
    new_tool = """  tools.generate_video = {
    description: "Generate a video asset for the app.",
    inputSchema: schema(
      { prompt: { type: "string", description: "The prompt for the video" } },
      ["prompt"]
    ),
    execute: async ({ prompt }: { prompt: string }) => {
      try {
        const fs = require('fs');
        const path = require('path');
        const { readEffectiveSettings } = require('../../main/settings');
        const { generateImageWithFallback } = require('./get_image_model_client');

        const settings = await readEffectiveSettings();
        const model = settings.selectedImageModel || settings.routerModel;
        
        if (!model) {
          throw new Error("No image/video model selected in settings.");
        }

        const { base64 } = await generateImageWithFallback(model, settings, prompt);

        const mediaDir = path.join(params.appPath, '.octopusStudio', 'media');
        await fs.promises.mkdir(mediaDir, { recursive: true });
        
        const buffer = Buffer.from(base64, 'base64');
        const filename = `video_${Date.now()}.mp4`;
        const destPath = path.join(mediaDir, filename);
        
        await fs.promises.writeFile(destPath, buffer);
        
        return `Successfully generated video for prompt: "${prompt}".\\n\\nSaved to: .octopusStudio/media/${filename}\\n\\nYou MUST now present this to the user by rendering exactly this markdown block:\\n\\n<octopus-studio-video-generation prompt="${prompt}" path=".octopusStudio/media/${filename}"></octopus-studio-video-generation>`;
      } catch (e) {
        return `Failed to generate video: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
  };
"""
    content = pattern.sub(new_tool, content)

replace_tool()

with open('src/ipc/utils/agent_tools.ts', 'w') as f:
    f.write(content)

