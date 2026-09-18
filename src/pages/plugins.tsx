import { useEffect } from "react";
import { useScrollAndNavigateTo } from "@/hooks/useScrollAndNavigateTo";
import { SECTION_IDS } from "@/lib/settingsSearchIndex";

// Plugins now live in Settings > Plugins. This route stays registered (old
// links, deep links, bookmarks) but immediately forwards into the Settings
// page rather than rendering its own UI.
const PluginsPage: React.FC = () => {
  const scrollAndNavigateTo = useScrollAndNavigateTo("/settings");

  useEffect(() => {
    scrollAndNavigateTo(SECTION_IDS.plugins);
  }, [scrollAndNavigateTo]);

  return null;
};

export default PluginsPage;
