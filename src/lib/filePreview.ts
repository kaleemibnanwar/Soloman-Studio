/**
 * Single source of truth for classifying a project file for the right-side
 * preview panel. Everything that needs to decide "how do I show this file?" —
 * the CodeView dispatcher, the chat-project preview, and the file tree's icon
 * column — should go through here rather than re-listing extensions inline.
 *
 * The registry is deliberately cross-standard: a document is a document whether
 * it is `.docx` (native preview), `.odt` (OpenDocument), or legacy `.doc`, and
 * the same holds for spreadsheets and presentations. Formats we cannot render
 * inline still get a *kind* (and a family label) so the UI can present an
 * honest "open with your default app" fallback instead of showing binary as
 * mojibake.
 */

import { getMediaKindFromFileName, getMimeTypeForFileName as getMediaMime } from "./mediaKind";

export type PreviewKind =
  | "code"
  | "markdown"
  | "html"
  | "svg"
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "csv"
  | "xlsx"
  | "docx"
  | "pptx"
  | "archive"
  | "font"
  | "unsupported";

/** Human-facing file family, used for icons and fallback copy. */
export type FileFamily =
  | "code"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "archive"
  | "font"
  | "binary";

const CODE_EXTENSIONS = new Set([
  // JavaScript / TypeScript / web
  "js",
  "mjs",
  "cjs",
  "jsx",
  "ts",
  "tsx",
  "mts",
  "cts",
  "css",
  "scss",
  "sass",
  "less",
  "styl",
  "json",
  "jsonc",
  "json5",
  "yaml",
  "yml",
  "toml",
  "xml",
  "xsl",
  "xsd",
  "dtd",
  "graphql",
  "gql",
  "proto",
  "prisma",
  // Systems languages
  "c",
  "cc",
  "cpp",
  "cxx",
  "h",
  "hh",
  "hpp",
  "hxx",
  "cs",
  "go",
  "rs",
  "zig",
  "java",
  "kt",
  "kts",
  "scala",
  "groovy",
  "gradle",
  "swift",
  "m",
  "mm",
  "dart",
  "lua",
  "r",
  "jl",
  "nim",
  // Scripting
  "py",
  "rb",
  "php",
  "pl",
  "pm",
  "sh",
  "bash",
  "zsh",
  "fish",
  "ps1",
  "bat",
  "cmd",
  "sql",
  "r",
  "sol",
  "tf",
  "tfvars",
  "hcl",
  "ex",
  "exs",
  "erl",
  "hrl",
  "hs",
  "clj",
  "cljs",
  "cljc",
  "edn",
  "fs",
  "fsx",
  "fsi",
  "vb",
  "vbs",
  "f",
  "f90",
  "for",
  // Config / dotfiles (no extension, or dot-prefixed names)
  "env",
  "gitignore",
  "gitattributes",
  "editorconfig",
  "ini",
  "conf",
  "cfg",
  "properties",
  "lock",
  "npmrc",
  "nvmrc",
  "babelrc",
  "prettierrc",
  "eslintrc",
  // Documents-as-text
  "rtf",
  "tex",
  "rst",
  "org",
  "adoc",
  "asciidoc",
  "textile",
]);

const EXTENSION_KIND: Record<string, PreviewKind> = {
  // Markup / markdown
  ".md": "markdown",
  ".markdown": "markdown",
  ".mdx": "markdown",
  ".html": "html",
  ".htm": "html",
  ".svg": "svg",

  // Spreadsheets
  ".csv": "csv",
  ".tsv": "csv",
  ".xlsx": "xlsx",
  ".xlsm": "xlsx",
  ".xls": "unsupported",
  ".ods": "unsupported",
  ".numbers": "unsupported",

  // Documents
  ".docx": "docx",
  ".doc": "unsupported",
  ".odt": "unsupported",
  ".pages": "unsupported",
  ".wpd": "unsupported",
  ".wps": "unsupported",

  // Presentations
  ".pptx": "pptx",
  ".pptm": "pptx",
  ".ppt": "unsupported",
  ".odp": "unsupported",
  ".key": "unsupported",

  // Documents / spreadsheets / presentations not yet parseable — treat as
  // binary fallback, not code. (Kept out of CODE_EXTENSIONS on purpose.)

  // PDF
  ".pdf": "pdf",

  // Archives
  ".zip": "archive",
  ".tar": "archive",
  ".gz": "archive",
  ".tgz": "archive",
  ".bz2": "archive",
  ".xz": "archive",
  ".7z": "archive",
  ".rar": "archive",
  ".jar": "archive",

  // Fonts
  ".ttf": "font",
  ".otf": "font",
  ".woff": "font",
  ".woff2": "font",
  ".eot": "font",
};

/** MIME types for non-media file kinds (media is delegated to `mediaKind`). */
const NON_MEDIA_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".html": "text/html",
  ".htm": "text/html",
  ".svg": "image/svg+xml",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".txt": "text/plain",
  ".json": "application/json",
  ".xml": "application/xml",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  // Office (Open XML)
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".pptm": "application/vnd.ms-powerpoint.presentation.macroEnabled.12",
  // Legacy Office (OLE2)
  ".doc": "application/msword",
  ".xls": "application/vnd.ms-excel",
  ".ppt": "application/vnd.ms-powerpoint",
  // OpenDocument
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".odp": "application/vnd.oasis.opendocument.presentation",
  // Fonts
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".eot": "application/vnd.ms-fontobject",
  // Archives
  ".zip": "application/zip",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  ".tgz": "application/gzip",
  ".7z": "application/x-7z-compressed",
  ".rar": "application/vnd.rar",
};

function lowerExt(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx === -1) return "";
  return name.slice(idx).toLowerCase();
}

/** The extension without the leading dot, lowercased ("" when none). */
function extWithoutDot(name: string): string {
  return lowerExt(name).slice(1);
}

/**
 * Classify a file name into its preview kind. Unknown extensions fall back to
 * `code` only when they look like a dotfile/known text name; otherwise they are
 * `unsupported` (binary) rather than being fed to the text editor as mojibake.
 */
export function getFilePreviewKind(name: string): PreviewKind {
  const ext = lowerExt(name);
  if (ext) {
    const kind = EXTENSION_KIND[ext];
    if (kind) return kind;
  }
  // Image/video/audio are classified by the shared media registry.
  const mediaKind = getMediaKindFromFileName(name);
  if (mediaKind) return mediaKind;
  const bare = extWithoutDot(name).toLowerCase();
  const baseName = name.slice(name.lastIndexOf("/") + 1).toLowerCase();
  // Dotfiles (`.env`, `.gitignore`) and code extensions both resolve here.
  if (bare && CODE_EXTENSIONS.has(bare)) return "code";
  if (
    baseName === "dockerfile" ||
    baseName === "makefile" ||
    baseName === "gemfile" ||
    baseName === "rakefile" ||
    baseName === "procfile" ||
    baseName === "license" ||
    baseName === "readme" ||
    baseName === "changelog" ||
    baseName === "authors" ||
    baseName === "notice"
  ) {
    return "code";
  }
  return "unsupported";
}

/** The family a kind belongs to, for icons and fallback copy. */
export function getFileFamily(name: string): FileFamily {
  switch (getFilePreviewKind(name)) {
    case "code":
    case "html":
      return "code";
    case "markdown":
      return "document";
    case "svg":
      return "image";
    case "csv":
      return "spreadsheet";
    case "docx":
      return "document";
    case "xlsx":
      return "spreadsheet";
    case "pptx":
      return "presentation";
    case "image":
      return "image";
    case "video":
      return "video";
    case "audio":
      return "audio";
    case "pdf":
      return "pdf";
    case "archive":
      return "archive";
    case "font":
      return "font";
    case "unsupported": {
      const ext = lowerExt(name);
      if ([".doc", ".odt", ".pages", ".wpd", ".wps", ".rtf"].includes(ext)) return "document";
      if ([".xls", ".ods", ".numbers"].includes(ext)) return "spreadsheet";
      if ([".ppt", ".odp", ".key"].includes(ext)) return "presentation";
      return "binary";
    }
  }
}

/** MIME type for a file name, or null when unknown (media types are reused). */
export function getFileMimeType(name: string): string | null {
  const media = getMediaMime(name);
  if (media) return media;
  return NON_MEDIA_MIME[lowerExt(name)] ?? null;
}

/**
 * Protocol URL used to stream a project file's raw bytes to the renderer
 * (image/video/audio/pdf/archive payloads). The `octopus-studio-file` scheme is
 * registered in the main process and resolves appId + relative path safely.
 */
export function getFileMediaUrl(appId: number | null, filePath: string): string | null {
  if (appId == null) return null;
  const normalized = filePath.replace(/^\/+/, "");
  const segments = normalized
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `octopus-studio-file://file/${appId}/${segments}`;
}

/** Whether a kind is editable in-place through the text/office editors. */
export function isEditableKind(kind: PreviewKind): boolean {
  return kind === "code" || kind === "markdown" || kind === "html" || kind === "svg";
}

/** Whether a kind has a rendered (visual) view distinct from its raw source. */
export function isDualModeKind(kind: PreviewKind): boolean {
  return kind === "markdown" || kind === "html" || kind === "svg";
}
