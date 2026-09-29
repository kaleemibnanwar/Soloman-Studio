import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PptxPreview } from "../PptxPreview";
import { ipc } from "@/ipc/types";

vi.mock("@/ipc/types", () => ({
  ipc: {
    office: {
      parseFile: vi.fn(),
    },
  },
}));

describe("PptxPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a presentation with slide shapes, titles, and bullets", async () => {
    vi.mocked(ipc.office.parseFile).mockResolvedValueOnce({
      kind: "pptx",
      data: {
        size: "16:9",
        slides: [
          {
            children: [
              {
                shape: {
                  x: 685800,
                  y: 500000,
                  width: 10820400,
                  height: 700000,
                  geometry: "rect",
                  fill: { type: "none" },
                  textBody: {
                    paragraphs: [
                      {
                        children: [
                          {
                            text: "Quarterly Review",
                            size: 28,
                            bold: true,
                            color: "0F172A",
                          },
                        ],
                      },
                    ],
                  },
                },
              },
              {
                shape: {
                  x: 685800,
                  y: 1500000,
                  width: 10820400,
                  height: 4500000,
                  geometry: "rect",
                  fill: { type: "solid", color: "F8FAFC" },
                  textBody: {
                    paragraphs: [
                      {
                        properties: {
                          bullet: { type: "char", char: "•" },
                        },
                        children: [
                          {
                            text: "Key growth initiatives executed",
                            size: 14,
                            color: "1E293B",
                          },
                        ],
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    });

    render(<PptxPreview appId={1} filePath="deck.pptx" />);

    await waitFor(() => {
      expect(screen.getAllByText("Quarterly Review").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Key growth initiatives executed").length).toBeGreaterThan(0);
    });
  });

  it("renders tables inside slides with proper headers and data", async () => {
    vi.mocked(ipc.office.parseFile).mockResolvedValueOnce({
      kind: "pptx",
      data: {
        size: "16:9",
        slides: [
          {
            children: [
              {
                table: {
                  x: 685800,
                  y: 1500000,
                  width: 10820400,
                  height: 4000000,
                  columnWidths: [5000000, 5000000],
                  rows: [
                    {
                      cells: [{ text: "Metric" }, { text: "Value" }],
                    },
                    {
                      cells: [{ text: "Revenue" }, { text: "$10M" }],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    });

    render(<PptxPreview appId={1} filePath="deck.pptx" />);

    await waitFor(() => {
      expect(screen.getAllByText("Metric").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Value").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Revenue").length).toBeGreaterThan(0);
      expect(screen.getAllByText("$10M").length).toBeGreaterThan(0);
    });
  });

  it("handles errors gracefully when file parsing fails", async () => {
    vi.mocked(ipc.office.parseFile).mockRejectedValueOnce(new Error("File not found"));

    render(<PptxPreview appId={1} filePath="deck.pptx" />);

    await waitFor(() => {
      expect(screen.getByText("File not found")).toBeTruthy();
    });
  });
});
