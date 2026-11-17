/**
 * Builds a octopus-studio-media:// protocol URL for serving media files in Electron.
 */
export function buildOctopusStudioMediaUrl(appPath: string, fileName: string): string {
  return `octopus-studio-media://media/${encodeURIComponent(appPath)}/.soloman/media/${encodeURIComponent(fileName)}`;
}

/**
 * Builds a renderer-safe media URL whose filesystem path is resolved in main.
 */
export function buildOctopusStudioMediaUrlForApp(appId: number, fileName: string): string {
  return `octopus-studio-media://media/app-id/${appId}/.soloman/media/${encodeURIComponent(fileName)}`;
}

/**
 * Builds a versioned URL for a bounded media-library thumbnail derivative.
 * The source version lets Chromium cache the derivative without showing stale
 * content after an image is replaced in place.
 */
export function buildOctopusStudioMediaThumbnailUrl(
  appPath: string,
  fileName: string,
  modifiedAtMs: number,
  sizeBytes: number,
): string {
  const url = new URL(buildOctopusStudioMediaUrl(appPath, fileName));
  url.searchParams.set("thumbnail", "1");
  url.searchParams.set("v", `${modifiedAtMs}:${sizeBytes}`);
  return url.toString();
}

/**
 * Builds a octopus-studio-chat-project-media:// protocol URL for serving chat project media.
 */
export function buildChatProjectMediaUrl(projectId: number, relativePath: string): string {
  return `octopus-studio-chat-project-media://file/${projectId}/${encodeURI(relativePath)}`;
}
