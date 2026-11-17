import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SpreadsheetGrid } from "../spreadsheet/SpreadsheetGrid";
import { makeGrid, emptySheet, DEFAULT_MIN_ROWS, DEFAULT_MIN_COLS } from "../spreadsheet/types";

describe("SpreadsheetGrid", () => {
  it("renders a full grid with at least DEFAULT_MIN_ROWS and DEFAULT_MIN_COLS", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const initialSheets = [
      {
        id: "sheet-1",
        name: "Sheet1",
        grid: [[{ text: "Item" }, { text: "Price" }]],
      },
    ];

    render(
      <SpreadsheetGrid
        fileLabel="test.xlsx"
        initialSheets={initialSheets}
        allowMultipleSheets
        allowFormatting
        onSave={onSave}
      />,
    );

    // Initial cells exist
    expect(screen.getByText("Item")).toBeTruthy();
    expect(screen.getByText("Price")).toBeTruthy();

    // Headers A, B, ..., Z exist
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("Z")).toBeTruthy();

    // Row numbers 1 and 100 exist
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("100")).toBeTruthy();
  });

  it("allows adding more rows dynamically via the bottom controls", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const initialSheets = [
      {
        id: "sheet-1",
        name: "Sheet1",
        grid: makeGrid(10, 5),
      },
    ];

    render(
      <SpreadsheetGrid
        fileLabel="test.xlsx"
        initialSheets={initialSheets}
        allowMultipleSheets
        allowFormatting
        onSave={onSave}
      />,
    );

    // Initial min rows 100 is rendered
    expect(screen.getByText("100")).toBeTruthy();

    // Click "Add Rows" button to add 100 more rows
    const addRowsBtn = screen.getByRole("button", { name: /Add Rows/i });
    fireEvent.click(addRowsBtn);

    // Now row 200 should exist
    await waitFor(() => {
      expect(screen.getByText("200")).toBeTruthy();
    });
  });
});
