import { describe, expect, it } from "vitest";
import {
  getFileFamily,
  getFileMediaUrl,
  getFileMimeType,
  getFilePreviewKind,
  isDualModeKind,
  isEditableKind,
} from "../filePreview";

describe("getFilePreviewKind", () => {
  it("classifies code and markup", () => {
    expect(getFilePreviewKind("src/app.ts")).toBe("code");
    expect(getFilePreviewKind("readme.md")).toBe("markdown");
    expect(getFilePreviewKind("index.html")).toBe("html");
    expect(getFilePreviewKind("logo.svg")).toBe("svg");
  });

  it("classifies media", () => {
    expect(getFilePreviewKind("photo.png")).toBe("image");
    expect(getFilePreviewKind("clip.mp4")).toBe("video");
    expect(getFilePreviewKind("song.mp3")).toBe("audio");
    expect(getFilePreviewKind("doc.pdf")).toBe("pdf");
  });

  it("classifies spreadsheets across standard extensions", () => {
    expect(getFilePreviewKind("data.csv")).toBe("csv");
    expect(getFilePreviewKind("data.tsv")).toBe("csv");
    expect(getFilePreviewKind("book.xlsx")).toBe("xlsx");
    expect(getFilePreviewKind("book.xlsm")).toBe("xlsx");
    expect(getFilePreviewKind("book.xls")).toBe("unsupported");
    expect(getFilePreviewKind("book.ods")).toBe("unsupported");
  });

  it("classifies documents and presentations across standard extensions", () => {
    expect(getFilePreviewKind("notes.docx")).toBe("docx");
    expect(getFilePreviewKind("notes.doc")).toBe("unsupported");
    expect(getFilePreviewKind("notes.odt")).toBe("unsupported");
    expect(getFilePreviewKind("deck.pptx")).toBe("pptx");
    expect(getFilePreviewKind("deck.ppt")).toBe("unsupported");
    expect(getFilePreviewKind("deck.odp")).toBe("unsupported");
  });

  it("classifies archives, fonts, and dotfiles", () => {
    expect(getFilePreviewKind("bundle.zip")).toBe("archive");
    expect(getFilePreviewKind("app.ttf")).toBe("font");
    expect(getFilePreviewKind(".env")).toBe("code");
    expect(getFilePreviewKind(".gitignore")).toBe("code");
    expect(getFilePreviewKind("Dockerfile")).toBe("code");
  });

  it("falls back to unsupported for unknown and binary extensions", () => {
    expect(getFilePreviewKind("mystery.xyz")).toBe("unsupported");
    expect(getFilePreviewKind("noextension")).toBe("unsupported");
  });
});

describe("getFileMimeType", () => {
  it("delegates media types and adds office/archive/font types", () => {
    expect(getFileMimeType("a.png")).toBe("image/png");
    expect(getFileMimeType("a.mp4")).toBe("video/mp4");
    expect(getFileMimeType("a.pdf")).toBe("application/pdf");
    expect(getFileMimeType("a.docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(getFileMimeType("a.zip")).toBe("application/zip");
    expect(getFileMimeType("a.ttf")).toBe("font/ttf");
  });

  it("returns null for unknown extensions", () => {
    expect(getFileMimeType("a.xyz")).toBeNull();
  });
});

describe("getFileFamily", () => {
  it("maps kinds to visual families", () => {
    expect(getFileFamily("a.ts")).toBe("code");
    expect(getFileFamily("a.md")).toBe("document");
    expect(getFileFamily("a.svg")).toBe("image");
    expect(getFileFamily("a.csv")).toBe("spreadsheet");
    expect(getFileFamily("a.doc")).toBe("document");
    expect(getFileFamily("a.xls")).toBe("spreadsheet");
    expect(getFileFamily("a.ppt")).toBe("presentation");
    expect(getFileFamily("a.zip")).toBe("archive");
    expect(getFileFamily("a.ttf")).toBe("font");
    expect(getFileFamily("a.exe")).toBe("binary");
  });
});

describe("getFileMediaUrl", () => {
  it("builds a protocol URL encoding path segments", () => {
    expect(getFileMediaUrl(7, "src/assets/logo.svg")).toBe(
      "octopus-studio-file://file/7/src/assets/logo.svg",
    );
    expect(getFileMediaUrl(7, "a b/c.png")).toBe("octopus-studio-file://file/7/a%20b/c.png");
  });

  it("returns null without an app id", () => {
    expect(getFileMediaUrl(null, "a.png")).toBeNull();
  });
});

describe("isEditableKind / isDualModeKind", () => {
  it("marks text-like kinds editable", () => {
    expect(isEditableKind("code")).toBe(true);
    expect(isEditableKind("markdown")).toBe(true);
    expect(isEditableKind("html")).toBe(true);
    expect(isEditableKind("svg")).toBe(true);
    expect(isEditableKind("image")).toBe(false);
  });

  it("marks rendered+source kinds dual-mode", () => {
    expect(isDualModeKind("markdown")).toBe(true);
    expect(isDualModeKind("html")).toBe(true);
    expect(isDualModeKind("svg")).toBe(true);
    expect(isDualModeKind("code")).toBe(false);
  });
});
