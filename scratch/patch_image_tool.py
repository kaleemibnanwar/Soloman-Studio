import re

with open('src/ipc/utils/agent_tools.ts', 'r') as f:
    content = f.read()

old_image_stub = '  tools.generate_image = stub("Generate an image asset for the app.");'

new_image_tool = """
  tools.generate_image = {
    description: "Generate an image asset for the app.",
    inputSchema: schema(
      { prompt: { type: "string", description: "The prompt for the image" } },
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
          throw new Error("No image model selected in settings.");
        }

        const { base64 } = await generateImageWithFallback(model, settings, prompt);

        const mediaDir = path.join(params.appPath, '.octopusStudio', 'media');
        await fs.promises.mkdir(mediaDir, { recursive: true });
        
        const buffer = Buffer.from(base64, 'base64');
        const filename = `image_${Date.now()}.png`;
        const destPath = path.join(mediaDir, filename);
        
        await fs.promises.writeFile(destPath, buffer);
        
        return `Successfully generated image for prompt: "${prompt}".\\n\\nSaved to: .octopusStudio/media/${filename}\\n\\nYou MUST now present this to the user by rendering exactly this markdown block:\\n\\n<octopus-studio-image-generation prompt="${prompt}" path=".octopusStudio/media/${filename}"></octopus-studio-image-generation>`;
      } catch (e) {
        return `Failed to generate image: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
  };
"""

content = content.replace(old_image_stub, new_image_tool)
with open('src/ipc/utils/agent_tools.ts', 'w') as f:
    f.write(content)
