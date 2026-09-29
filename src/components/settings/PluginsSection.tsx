import { useEffect, useState } from "react";
import { LibraryBig, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { PluginsList } from "@/components/plugins/PluginsList";
import { CatalogSection } from "@/components/plugins/catalog/CatalogSection";
import { useDeepLink } from "@/contexts/DeepLinkContext";
import { SETTING_IDS } from "@/lib/settingsSearchIndex";

/**
 * Plugins, as a Settings section. The connected-plugin list stays inline;
 * the catalog (a large, browsable grid) opens in a modal instead of always
 * being rendered on the page, so this section reads like the rest of
 * Settings rather than a standalone catalog page.
 */
export function PluginsSection() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const { lastDeepLink } = useDeepLink();

  // The octopusStudio://add-mcp-server deep link lands on Settings; open the
  // add dialog so the prefilled form (see AddPluginDialog) is visible.
  useEffect(() => {
    if (lastDeepLink?.type === "add-mcp-server") {
      setIsAddDialogOpen(true);
    }
  }, [lastDeepLink?.timestamp]);

  return (
    <div className="space-y-6">
      <div id={SETTING_IDS.pluginsList} className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => setIsCatalogOpen(true)}>
          <LibraryBig size={16} />
          Browse catalog
        </Button>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus size={16} />
          Add Plugin
        </Button>
      </div>

      <PluginsList addDialogOpen={isAddDialogOpen} onAddDialogOpenChange={setIsAddDialogOpen} />

      <Dialog open={isCatalogOpen} onOpenChange={setIsCatalogOpen}>
        <DialogContent
          id={SETTING_IDS.pluginsCatalog}
          className="max-h-[85vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-4xl"
        >
          {/* CatalogSection renders its own heading + search row; this title
              is for screen readers / the dialog's accessible name only. */}
          <DialogTitle className="sr-only">Add from catalog</DialogTitle>
          <CatalogSection />
        </DialogContent>
      </Dialog>
    </div>
  );
}
