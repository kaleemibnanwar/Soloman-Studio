import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MarkdownPreview } from "../MarkdownPreview";
import * as useLoadAppFileModule from "@/hooks/useLoadAppFile";

vi.mock("@/lib/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

describe("MarkdownPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders markdown content and displays reading statistics", () => {
    vi.spyOn(useLoadAppFileModule, "useLoadAppFile").mockReturnValue({
      content: "# Title Header\n\nThis is a sample document with some words.",
      loading: false,
      error: null,
      refreshFile: vi.fn(),
    });

    render(<MarkdownPreview appId={1} filePath="README.md" />);

    expect(screen.getByText(/11 words/i)).toBeTruthy();
    expect(screen.getByText(/min read/i)).toBeTruthy();
    expect(screen.getByText("Outline (1)")).toBeTruthy();
  });

  it("toggles the table of contents outline drawer", () => {
    vi.spyOn(useLoadAppFileModule, "useLoadAppFile").mockReturnValue({
      content: "# Section 1\n\nSome text\n\n## Section 2\n\nMore text",
      loading: false,
      error: null,
      refreshFile: vi.fn(),
    });

    render(<MarkdownPreview appId={1} filePath="doc.md" />);

    const outlineBtn = screen.getByRole("button", { name: /Outline/i });
    expect(outlineBtn).toBeTruthy();

    fireEvent.click(outlineBtn);
    expect(screen.getByText("Table of Contents")).toBeTruthy();
    expect(screen.getAllByText("Section 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Section 2").length).toBeGreaterThan(0);
  });
});
