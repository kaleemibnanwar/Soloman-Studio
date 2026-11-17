export type MediaKind = "image" | "video" | "audio";

/** File extension → MIME type for the media kinds we preview. */
const EXTENSION_MIME: Record<string, string> = {
  // Images
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".heic": "image/heic",
  // Video
  ".mp4": "video/mp4",
  ".m4v": "video/x-m4v",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".ogv": "video/ogg",
  // Audio
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".opus": "audio/opus",
  ".wma": "audio/x-ms-wma",
};

function mimeToKind(mime: string): MediaKind | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

/** Classify a MIME type (e.g. "video/mp4") as image/video/audio, or null. */
export function getMediaKindFromMimeType(mime: string): MediaKind | null {
  if (!mime) return null;
  return mimeToKind(mime.trim().toLowerCase());
}

/** MIME type for a file name by extension, or null when it's not previewable media. */
export function getMimeTypeForFileName(name: string): string | null {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return EXTENSION_MIME[ext] ?? null;
}

/** Classify a file name (by extension) as image/video/audio, or null. */
export function getMediaKindFromFileName(name: string): MediaKind | null {
  const mime = getMimeTypeForFileName(name);
  return mime ? mimeToKind(mime) : null;
}
