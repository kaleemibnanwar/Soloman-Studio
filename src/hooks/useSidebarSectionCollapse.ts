import { useAtom } from "jotai";
import { useCallback } from "react";
import { collapsedSidebarSectionsAtom, type SidebarSectionKey } from "@/atoms/appAtoms";

/** Persisted expand/collapse state for one group in the sidebar's merged list. */
export function useSidebarSectionCollapse(key: SidebarSectionKey) {
  const [collapsedSections, setCollapsedSections] = useAtom(collapsedSidebarSectionsAtom);
  const collapsed = collapsedSections[key] ?? false;

  const toggle = useCallback(() => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, [key, setCollapsedSections]);

  return { collapsed, toggle };
}
