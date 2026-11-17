import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export const selectedAppIdAtom = atom<number | null>(null);

/** Keys for the collapsible groups in the sidebar's merged list. */
export type SidebarSectionKey = "tasks" | "coding-projects" | "chat-projects" | "chats";

// Which sidebar sections the user has collapsed — persisted so a section
// collapsed in one session stays collapsed the next time the app launches.
export const collapsedSidebarSectionsAtom = atomWithStorage<
  Partial<Record<SidebarSectionKey, boolean>>
>("collapsed-sidebar-sections", {}, undefined, { getOnInit: true });

export type PreviewMode =
  | "preview"
  | "code"
  | "problems"
  | "configure"
  | "publish"
  | "security"
  | "tests"
  | "plan";

export const previewModeAtom = atom<PreviewMode>("preview");
