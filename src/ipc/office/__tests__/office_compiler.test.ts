import { describe, it, expect } from "vitest";
import {
  compileDocxDocument,
  compilePptxPresentation,
  compileXlsxWorkbook,
  parseInlineRuns,
  parseCsvText,
} from "../office_compiler";
import {
  generateDocx,
  generatePptx,
  generateXlsx,
  parseDocx,
  parsePptx,
  parseXlsx,
} from "../office_open";

describe("office_compiler", () => {
  describe("parseInlineRuns", () => {
    it("parses bold, italic, bold-italic, and code spans", () => {
      const runs = parseInlineRuns("Normal text **bold** and *italic* and `code` span") as {
        text: string;
        bold?: boolean;
        italic?: boolean;
        font?: { name: string };
      }[];
      expect(runs.length).toBeGreaterThan(3);
      expect(runs.some((r) => r.text === "bold" && r.bold === true)).toBe(true);
      expect(runs.some((r) => r.text === "italic" && r.italic === true)).toBe(true);
      expect(runs.some((r) => r.text === "code" && r.font?.name === "Consolas")).toBe(true);
    });
  });

  describe("parseCsvText", () => {
    it("parses CSV rows with commas and quotes", () => {
      const csv = `Col1,Col2,"Col 3, with comma"\nVal1,Val2,Val3`;
      const rows = parseCsvText(csv);
      expect(rows.length).toBe(2);
      expect(rows[0][2]).toBe("Col 3, with comma");
      expect(rows[1][0]).toBe("Val1");
    });
  });

  describe("compileDocxDocument", () => {
    it("compiles markdown into a complete, valid DOCX binary that parseDocx reads", async () => {
      const options = compileDocxDocument({
        title: "Test Report",
        subtitle: "Automated Suite",
        author: "Codex Agent",
        date: "2026-09-29",
        colorScheme: "emerald",
        markdown: `
# Heading 1
Paragraph text with **bold** words.

## Heading 2
- Bullet item 1
- Bullet item 2

1. Numbered item 1
2. Numbered item 2

> This is a callout box.

| Feature | Status |
| --- | --- |
| Compiler | Active |
| AST | Valid |
`,
      });

      const buffer = await generateDocx(options);
      expect(buffer.length).toBeGreaterThan(1000);

      const parsed = (await parseDocx(buffer)) as {
        sections?: { children?: unknown[] }[];
      };
      expect(parsed.sections?.length).toBeGreaterThan(0);
      const text = JSON.stringify(parsed);
      expect(text).toContain("Test Report");
      expect(text).toContain("Heading 1");
      expect(text).toContain("Bullet item 1");
      expect(text).toContain("This is a callout box");
      expect(text).toContain("Compiler");
    });

    it("compiles structured blocks into DOCX", async () => {
      const options = compileDocxDocument({
        title: "Block Document",
        blocks: [
          { type: "heading", level: 1, text: "Section A" },
          { type: "paragraph", text: "This is a paragraph." },
          { type: "bullet_list", items: ["Item 1", "Item 2"] },
          { type: "callout", text: "Important notice" },
          {
            type: "table",
            headers: ["A", "B"],
            rows: [
              ["1", "2"],
              ["3", "4"],
            ],
          },
        ],
      });

      const buffer = await generateDocx(options);
      const parsed = (await parseDocx(buffer)) as unknown;
      const text = JSON.stringify(parsed);
      expect(text).toContain("Section A");
      expect(text).toContain("Important notice");
    });
  });

  describe("compilePptxPresentation", () => {
    it("compiles custom slide layouts into a valid PPTX deck", async () => {
      const options = compilePptxPresentation({
        title: "Executive Deck",
        colorScheme: "ruby",
        slides: [
          {
            layout: "title",
            title: "Strategy 2026",
            subtitle: "Growth Plan",
            eyebrow: "INTERNAL ONLY",
          },
          { layout: "bullets", title: "Key Drivers", items: ["Market expansion", "AI Automation"] },
          {
            layout: "stats",
            title: "Metrics",
            stats: [
              { value: "5x", label: "Scale" },
              { value: "$10M", label: "ARR" },
            ],
          },
          {
            layout: "split",
            title: "Pros & Cons",
            left: { title: "Advantages", items: ["Speed", "Cost"] },
            right: { title: "Tradeoffs", items: ["Migration time"] },
          },
          { layout: "quote", quote: "Quality is not an act, it is a habit.", author: "Aristotle" },
          { layout: "table", title: "Plan", headers: ["Q1", "Q2"], rows: [["Alpha", "Beta"]] },
          { layout: "closing", title: "Thank You" },
        ],
      });

      const buffer = await generatePptx(options);
      expect(buffer.length).toBeGreaterThan(1000);

      const parsed = (await parsePptx(buffer)) as {
        slides?: { children?: unknown[] }[];
      };
      expect(parsed.slides?.length).toBe(7);
      const text = JSON.stringify(parsed);
      expect(text).toContain("Strategy 2026");
      expect(text).toContain("Market expansion");
      expect(text).toContain("Aristotle");
    });

    it("generates a default presentation if slides array is empty", async () => {
      const options = compilePptxPresentation({
        title: "Starter Deck",
      });
      const buffer = await generatePptx(options);
      const parsed = (await parsePptx(buffer)) as { slides?: unknown[] };
      expect(parsed.slides?.length).toBeGreaterThan(2);
    });
  });

  describe("compileXlsxWorkbook", () => {
    it("compiles sheets with formatting, formulas, and auto column widths", async () => {
      const options = compileXlsxWorkbook({
        title: "Sales Report",
        colorScheme: "teal",
        sheets: [
          {
            name: "Q1 Sales",
            title: "Q1 Performance",
            headers: ["Rep", "Region", "Quota", "Revenue", "Attainment"],
            rows: [
              ["Alice", "North", "$50000", "$65000", "130%"],
              ["Bob", "South", "$50000", "$48000", "96%"],
              ["Charlie", "West", "$60000", "$72000", "120%"],
            ],
            totals: true,
          },
        ],
      });

      const buffer = await generateXlsx(options);
      expect(buffer.length).toBeGreaterThan(1000);

      const parsed = (await parseXlsx(buffer)) as {
        worksheets?: { name?: string; rows?: unknown[] }[];
      };
      expect(parsed.worksheets?.length).toBe(1);
      expect(parsed.worksheets?.[0]?.name).toBe("Q1 Sales");
      const text = JSON.stringify(parsed);
      expect(text).toContain("Alice");
      expect(text).toContain("Attainment");
    });

    it("compiles CSV text directly into a workbook", async () => {
      const options = compileXlsxWorkbook({
        title: "Imported CSV",
        csv: `Metric,Value\nVisitors,10500\nSignups,2100\nConversion,20%`,
      });

      const buffer = await generateXlsx(options);
      const parsed = (await parseXlsx(buffer)) as {
        worksheets?: { rows?: unknown[] }[];
      };
      expect(parsed.worksheets?.length).toBe(1);
      const text = JSON.stringify(parsed);
      expect(text).toContain("Visitors");
      expect(text).toContain("Signups");
    });
  });
});
