import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MediaPreview } from "../MediaPreview";
import { SvgPreview } from "../SvgPreview";
import { PdfPreview } from "../PdfPreview";
import { UnsupportedFilePreview } from "../UnsupportedFilePreview";
import { FontPreview } from "../FontPreview";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

vi.mock("@/lib/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
  showWarning: vi.fn(),
}));

vi.mock("@/ipc/types", () => ({
  ipc: {
    app: { openFileExternally: vi.fn() },
    system: { showItemInFolder: vi.fn() },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MediaPreview", () => {
  it("renders an image via the app-file protocol", () => {
    const { container } = render(
      <MediaPreview appId={7} filePath="assets/photo.png" kind="image" />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe("octopus-studio-file://file/7/assets/photo.png");
  });

  it("renders a video element with controls", () => {
    const { container } = render(<MediaPreview appId={7} filePath="clip.mp4" kind="video" />);
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video!.getAttribute("src")).toBe("octopus-studio-file://file/7/clip.mp4");
    expect(video!.hasAttribute("controls")).toBe(true);
  });

  it("renders an audio element with controls", () => {
    const { container } = render(<MediaPreview appId={7} filePath="song.mp3" kind="audio" />);
    const audio = container.querySelector("audio");
    expect(audio).not.toBeNull();
    expect(audio!.getAttribute("src")).toBe("octopus-studio-file://file/7/song.mp3");
    expect(audio!.hasAttribute("controls")).toBe(true);
  });
});

describe("SvgPreview", () => {
  it("renders SVG as an image on the protocol URL", () => {
    const { container } = render(<SvgPreview appId={7} filePath="logo.svg" />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe("octopus-studio-file://file/7/logo.svg");
  });
});

describe("PdfPreview", () => {
  it("embeds the PDF in an iframe", () => {
    const { container } = render(<PdfPreview appId={7} filePath="report.pdf" />);
    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe!.getAttribute("src")).toBe("octopus-studio-file://file/7/report.pdf");
  });
});

describe("FontPreview", () => {
  it("registers the font face from the protocol URL", () => {
    const { container } = render(<FontPreview appId={7} filePath="brand.ttf" />);
    const style = container.querySelector("style");
    expect(style?.textContent).toContain("octopus-studio-file://file/7/brand.ttf");
    expect(screen.getByText("Aa Bb Cc")).toBeTruthy();
  });
});

describe("UnsupportedFilePreview", () => {
  it("offers to open a legacy office file with the default app", () => {
    render(<UnsupportedFilePreview appId={7} filePath="legacy.doc" />);
    expect(screen.getByRole("button", { name: "Open with default app" })).toBeTruthy();
    expect(screen.getByText(/can't render this Document format inline yet/i)).toBeTruthy();
  });

  it("labels an unknown binary as a plain file", () => {
    render(<UnsupportedFilePreview appId={7} filePath="blob.bin" />);
    expect(screen.getByRole("button", { name: "Open with default app" })).toBeTruthy();
    expect(screen.getByText(/can't render this file type inline/i)).toBeTruthy();
  });
});
