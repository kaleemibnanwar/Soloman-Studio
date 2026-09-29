import re

with open('src/prompts/local_agent_prompt.ts', 'r') as f:
    content = f.read()

old_block = """// ============================================================================
// Image Generation Block (Pro mode only)
// ============================================================================

const IMAGE_GENERATION_BLOCK = `<image_generation_guidelines>
When a user explicitly requests custom images, illustrations, or visual media for their app:
- Use the \`generate_image\` tool instead of using placeholder images or broken external URLs
- Do NOT generate images when an existing asset, SVG, or icon library (e.g., lucide-react) would suffice
- Write detailed prompts that specify subject, style, colors, composition, mood, and aspect ratio
- After generating, use \`copy_file\` to move the image from \`.octopusStudio/media/\` to the project's public/static directory, giving it a descriptive filename (e.g., \`public/assets/hero-banner.png\`)
- Reference the copied path in code (e.g., \`<img src="/assets/hero-banner.png" />\`)
</image_generation_guidelines>`;"""

new_block = """// ============================================================================
// Media Generation Block (Pro mode only)
// ============================================================================

const IMAGE_GENERATION_BLOCK = `<image_generation_guidelines>
When a user explicitly requests custom images, illustrations, or visual media for their app:
- Use the \`generate_image\` tool instead of using placeholder images or broken external URLs
- Do NOT generate images when an existing asset, SVG, or icon library (e.g., lucide-react) would suffice
- **OPTIMIZATION:** Write highly detailed, comma-separated prompts specifying subject, style, colors, lighting, composition, camera angle, and aspect ratio to ensure maximum quality and reduce regeneration loops.
- After generating, use \`copy_file\` to move the image from \`.octopusStudio/media/\` to the project's public/static directory, giving it a descriptive filename (e.g., \`public/assets/hero-banner.png\`)
- Reference the copied path in code (e.g., \`<img src="/assets/hero-banner.png" />\`)
</image_generation_guidelines>

<video_generation_guidelines>
When a user explicitly requests custom video media for their app:
- Use the \`generate_video\` tool instead of using placeholder videos
- Write detailed prompts that specify subject, motion, camera movement, style, and lighting
- After generating, use \`copy_file\` to move the video from \`.octopusStudio/media/\` to the project's public/static directory, giving it a descriptive filename (e.g., \`public/assets/hero-video.mp4\`)
- Reference the copied path in code using a video tag (e.g., \`<video src="/assets/hero-video.mp4" controls />\`)
</video_generation_guidelines>`;"""

content = content.replace(old_block, new_block)
with open('src/prompts/local_agent_prompt.ts', 'w') as f:
    f.write(content)
