import re

def patch_file(filename, is_video=False):
    with open(filename, 'r') as f:
        content = f.read()

    # Add absolutePath calculation to Video (Image already has it)
    if is_video:
        old_url = """  const videoUrl =
    appPath && normalizedVideoPath && !hasTraversal
      ? `octopus-studio-media://media/${encodeURIComponent(appPath)}/${normalizedVideoPath
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`
      : "";"""
        new_url = old_url + """\n  const absolutePath =
    appPath && normalizedVideoPath && !hasTraversal
      ? `${appPath}/${normalizedVideoPath}`
      : undefined;"""
        if "const absolutePath =" not in content:
            content = content.replace(old_url, new_url)

    # Find the Saved to section and add absolute path below it
    if is_video:
        old_saved = """                {videoPath && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">
                      Saved to:
                    </span>
                    <div className="mt-0.5 font-mono text-xs text-foreground">
                      {videoPath}
                    </div>
                  </div>
                )}"""
        new_saved = old_saved + """
                {absolutePath && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">
                      Absolute path (OS):
                    </span>
                    <div className="mt-0.5 font-mono text-xs text-foreground select-all">
                      {absolutePath}
                    </div>
                  </div>
                )}"""
    else:
        old_saved = """                {imagePath && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">
                      Saved to:
                    </span>
                    <div className="mt-0.5 font-mono text-xs text-foreground">
                      {imagePath}
                    </div>
                  </div>
                )}"""
        new_saved = old_saved + """
                {absolutePath && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">
                      Absolute path (OS):
                    </span>
                    <div className="mt-0.5 font-mono text-xs text-foreground select-all">
                      {absolutePath}
                    </div>
                  </div>
                )}"""

    if "Absolute path (OS):" not in content:
        content = content.replace(old_saved, new_saved)
    
    # Auto expand video
    if is_video:
        old_state = "const [isExpanded, setIsExpanded] = useState(false);"
        new_state = "const [isExpanded, setIsExpanded] = useState(true);"
        content = content.replace(old_state, new_state)

        # Make sure video renders correctly
        old_video_render = "{canViewVideo && isExpanded && ("
        new_video_render = "{canViewVideo && ("
        content = content.replace(old_video_render, new_video_render)

    with open(filename, 'w') as f:
        f.write(content)

patch_file('src/components/chat/OctopusStudioImageGeneration.tsx', is_video=False)
patch_file('src/components/chat/OctopusStudioVideoGeneration.tsx', is_video=True)
