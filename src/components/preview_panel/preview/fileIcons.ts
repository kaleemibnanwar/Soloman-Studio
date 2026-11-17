import {
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Presentation,
  Type,
  type LucideIcon,
} from "lucide-react";
import { getFileFamily } from "@/lib/filePreview";

const FAMILY_ICONS: Record<string, LucideIcon> = {
  code: FileCode2,
  document: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  pdf: FileText,
  archive: FileArchive,
  font: Type,
  binary: File,
};

/** Icon for a file by extension, shared by the file tree and the previews. */
export function getFileIconByPath(filePath: string): LucideIcon {
  return FAMILY_ICONS[getFileFamily(filePath)] ?? File;
}
