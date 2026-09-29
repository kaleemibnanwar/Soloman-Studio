import React, { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { ipc } from "@/ipc/types";
import { useSettings } from "@/hooks/useSettings";
import { CommunityCodeConsentDialog } from "./CommunityCodeConsentDialog";
import type { Template } from "@/shared/templates";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { showWarning } from "@/lib/toast";

interface TemplateCardProps {
  template: Template;
  isSelected: boolean;
  onSelect: (templateId: string) => void;
  onCreateApp: () => void;
}

export const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  isSelected,
  onSelect,
  onCreateApp,
}) => {
  const { settings, updateSettings } = useSettings();
  const [showConsentDialog, setShowConsentDialog] = useState(false);

  const handleCardClick = () => {
    // If it's a community template and user hasn't accepted community code yet, show dialog
    if (!template.isOfficial && !settings?.acceptedCommunityCode) {
      setShowConsentDialog(true);
      return;
    }

    if (template.requiresNeon && !settings?.neon?.accessToken) {
      showWarning("Please connect your Neon account to use this template.");
      return;
    }

    // Otherwise, proceed with selection
    onSelect(template.id);
  };

  const handleConsentAccept = () => {
    // Update settings to accept community code
    updateSettings({ acceptedCommunityCode: true });

    // Select the template
    onSelect(template.id);

    // Close dialog
    setShowConsentDialog(false);
  };

  const handleConsentCancel = () => {
    // Just close dialog, don't update settings or select template
    setShowConsentDialog(false);
  };

  const handleGithubClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (template.githubUrl) {
      ipc.system.openExternalUrl(template.githubUrl);
    }
  };

  return (
    <>
      <div
        onClick={handleCardClick}
        className={`
          bg-card border rounded-lg overflow-hidden
          transform transition-all duration-300 ease-in-out
          cursor-pointer group relative
          ${isSelected ? "ring-2 ring-primary" : "hover:-translate-y-1"}
        `}
      >
        <div className="relative">
          <img
            src={template.imageUrl}
            alt={template.title}
            className={`w-full h-52 object-cover transition-opacity duration-300 group-hover:opacity-80 ${
              isSelected ? "opacity-75" : ""
            }`}
          />
          {isSelected && (
            <span className="absolute top-3 right-3 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-md">
              Selected
            </span>
          )}
        </div>
        <div className="p-4">
          <div className="flex justify-between items-center mb-1.5">
            <h2
              className={`text-lg font-semibold ${isSelected ? "text-primary" : "text-foreground"}`}
            >
              {template.title}
            </h2>
            {template.isOfficial && !template.isExperimental && (
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  isSelected ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                }`}
              >
                Official
              </span>
            )}
            {template.isExperimental && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                Experimental
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-3 h-10 overflow-y-auto">
            {template.description}
          </p>
          {template.githubUrl && (
            <a
              className="inline-flex items-center text-sm font-medium text-primary transition-opacity duration-200 hover:opacity-80"
              onClick={handleGithubClick}
            >
              View on GitHub <ArrowLeft className="w-4 h-4 ml-1 transform rotate-180" />
            </a>
          )}

          <Button
            onClick={(e) => {
              e.stopPropagation();
              onCreateApp();
            }}
            size="sm"
            className={cn(
              "w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold mt-2",
              settings?.selectedTemplateId !== template.id && "invisible",
            )}
          >
            Create App
          </Button>
        </div>
      </div>

      <CommunityCodeConsentDialog
        isOpen={showConsentDialog}
        onAccept={handleConsentAccept}
        onCancel={handleConsentCancel}
      />
    </>
  );
};
