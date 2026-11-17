import { describe, expect, it } from "vitest";
import {
  getMediaKindFromFileName,
  getMediaKindFromMimeType,
  getMimeTypeForFileName,
} from "../mediaKind";

describe("getMediaKindFromMimeType", () => {
  it("classifies image, video, and audio mime types", () => {
    expect(getMediaKindFromMimeType("image/png")).toBe("image");
    expect(getMediaKindFromMimeType("video/mp4")).toBe("video");
    expect(getMediaKindFromMimeType("audio/mpeg")).toBe("audio");
  });

  it("returns null for non-media mime types", () => {
    expect(getMediaKindFromMimeType("text/plain")).toBeNull();
    expect(getMediaKindFromMimeType("")).toBeNull();
  });
});

describe("getMediaKindFromFileName", () => {
  it("classifies by extension case-insensitively", () => {
    expect(getMediaKindFromFileName("photo.JPG")).toBe("image");
    expect(getMediaKindFromFileName("clip.mp4")).toBe("video");
    expect(getMediaKindFromFileName("song.mp3")).toBe("audio");
  });

  it("returns null for non-media extensions", () => {
    expect(getMediaKindFromFileName("notes.md")).toBeNull();
    expect(getMediaKindFromFileName("data.csv")).toBeNull();
    expect(getMediaKindFromFileName("noextension")).toBeNull();
  });
});

describe("getMimeTypeForFileName", () => {
  it("maps common extensions to mime types", () => {
    expect(getMimeTypeForFileName("a.png")).toBe("image/png");
    expect(getMimeTypeForFileName("a.mp4")).toBe("video/mp4");
    expect(getMimeTypeForFileName("a.mp3")).toBe("audio/mpeg");
  });

  it("returns null for unknown extensions", () => {
    expect(getMimeTypeForFileName("a.xyz")).toBeNull();
  });
});
