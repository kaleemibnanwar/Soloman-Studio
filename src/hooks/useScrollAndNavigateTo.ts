import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { activeSettingsSectionAtom } from "@/atoms/viewAtoms";
import { SECTION_IDS, SETTINGS_SEARCH_INDEX } from "@/lib/settingsSearchIndex";

type ScrollOptions = {
  behavior?: ScrollBehavior;
  block?: ScrollLogicalPosition;
  inline?: ScrollLogicalPosition;
  onScrolled?: (id: string, element: HTMLElement) => void;
  highlight?: boolean;
};

const KNOWN_SECTION_IDS = new Set<string>(Object.values(SECTION_IDS));

/**
 * Returns an async function that navigates to the given route, activates the
 * target settings section, and scrolls/highlights the element with `id`.
 */
export function useScrollAndNavigateTo(to: string = "/settings", options?: ScrollOptions) {
  const navigate = useNavigate();
  const setActiveSection = useSetAtom(activeSettingsSectionAtom);

  return useCallback(
    async (id: string, sectionId?: string) => {
      const resolvedSectionId =
        sectionId ??
        (KNOWN_SECTION_IDS.has(id)
          ? id
          : SETTINGS_SEARCH_INDEX.find((item) => item.id === id)?.sectionId) ??
        id;

      setActiveSection(resolvedSectionId);
      await navigate({ to });

      // Wait a frame so React mounts the newly selected settings section before querying the DOM.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });

      const element = document.getElementById(id);
      if (element) {
        if (id === resolvedSectionId) {
          window.scrollTo({ top: 0, behavior: options?.behavior ?? "auto" });
        } else {
          element.scrollIntoView({
            behavior: options?.behavior ?? "smooth",
            block: options?.block ?? "start",
            inline: options?.inline,
          });
        }
        options?.onScrolled?.(id, element);

        if (options?.highlight) {
          element.classList.remove("settings-highlight");
          void element.offsetWidth; // force reflow to restart animation
          element.classList.add("settings-highlight");
          const onEnd = () => {
            element.classList.remove("settings-highlight");
          };
          element.addEventListener("animationend", onEnd, { once: true });
          element.addEventListener("animationcancel", onEnd, { once: true });
        }

        return true;
      }
      return false;
    },
    [
      navigate,
      to,
      options?.behavior,
      options?.block,
      options?.inline,
      options?.onScrolled,
      options?.highlight,
      setActiveSection,
    ],
  );
}
