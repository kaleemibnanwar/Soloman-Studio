import { z } from "zod";
import { createClient, defineContract } from "../contracts/core";

export const OfficePreviewSchema = z.object({
  kind: z.enum(["docx", "pptx", "xlsx"]),
  // Raw parsed office-open options (sections / slides / worksheets).
  data: z.unknown(),
});

export const officeContracts = {
  parseFile: defineContract({
    channel: "office-parse-file",
    input: z.object({ appId: z.number(), relPath: z.string() }),
    output: OfficePreviewSchema.nullable(),
  }),

  writeXlsxFile: defineContract({
    channel: "office-write-xlsx-file",
    input: z.object({
      appId: z.number(),
      relPath: z.string(),
      // office-open WorkbookOptions, round-tripped from parseFile's output.
      workbook: z.unknown(),
    }),
    output: z.object({}),
    invalidates: (input) => [{ family: "versions", appId: input.appId }],
  }),

  writeDocxFile: defineContract({
    channel: "office-write-docx-file",
    input: z.object({
      appId: z.number(),
      relPath: z.string(),
      // office-open DocumentOptions, round-tripped from parseFile's output.
      document: z.unknown(),
    }),
    output: z.object({}),
    invalidates: (input) => [{ family: "versions", appId: input.appId }],
  }),
};

export const officeClient = createClient(officeContracts);
