/**
 * Pure path helpers for the file tree's file-manager actions. Kept free of React
 * so they can be unit-tested and shared between FileTree and its dialogs.
 */

/** Parent directory of an app-relative path; "" for a root-level path. */
export function parentDirOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

/** Join a directory ("" for root) with a name into an app-relative path. */
export function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

/** Basename of an app-relative path. */
export function basenameOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/**
 * Returns a non-colliding destination for `dest` by appending " (2)", " (3)", …
 * before the extension, mirroring OS file-manager copy behavior. `existing`
 * holds every current file and directory path.
 */
export function resolveDestPath(existing: ReadonlySet<string>, dest: string): string {
  if (!existing.has(dest)) {
    return dest;
  }

  const dir = parentDirOf(dest);
  const base = basenameOf(dest);
  const extIdx = base.lastIndexOf(".");
  // Keep ".gitignore"-style hidden files intact: a leading dot is not an
  // extension separator.
  const stem = extIdx > 0 ? base.slice(0, extIdx) : base;
  const ext = extIdx > 0 ? base.slice(extIdx) : "";

  let n = 2;
  for (;;) {
    const candidate = joinPath(dir, `${stem} (${n})${ext}`);
    if (!existing.has(candidate)) {
      return candidate;
    }
    n += 1;
  }
}
