/**
 * Lazy loader for office-open. The main bundle is CommonJS, and office-open is
 * ESM-only (`exports` has an `import` condition but no `require`). A static
 * `import` compiles to `require("office-open/…")`, which throws
 * ERR_PACKAGE_PATH_NOT_EXPORTED at runtime. Dynamic `import()` resolves the
 * `import` condition and works from CommonJS, so we go through these helpers.
 */

export async function generateDocx(options: unknown): Promise<Uint8Array> {
  const { generateDocumentSync } = await import("office-open/docx");
  return generateDocumentSync(options as never);
}

export async function generateXlsx(options: unknown): Promise<Uint8Array> {
  const { generateWorkbookSync } = await import("office-open/xlsx");
  return generateWorkbookSync(options as never);
}

export async function generatePptx(options: unknown): Promise<Uint8Array> {
  const { generatePresentationSync } = await import("office-open/pptx");
  return generatePresentationSync(options as never);
}

export async function parseDocx(buffer: Uint8Array): Promise<unknown> {
  const { parseDocument } = await import("office-open/docx");
  return parseDocument(buffer as never);
}

export async function parseXlsx(buffer: Uint8Array): Promise<unknown> {
  const { parseWorkbook } = await import("office-open/xlsx");
  return parseWorkbook(buffer as never);
}

export async function parsePptx(buffer: Uint8Array): Promise<unknown> {
  const { parsePresentation } = await import("office-open/pptx");
  return parsePresentation(buffer as never);
}
