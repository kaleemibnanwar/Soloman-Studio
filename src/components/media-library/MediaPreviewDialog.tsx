import type React from "react";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { MediaKind } from "@/lib/mediaKind";

interface MediaPreviewDialogProps {
  kind: MediaKind;
  url: string;
  name: string;
  onClose: () => void;
}

/**
 * Lightbox-style preview for media files. Images render static; video and audio
 * render a playable control. Reused by the Media library preview action.
 */
export const MediaPreviewDialog: React.FC<MediaPreviewDialogProps> = ({
  kind,
  url,
  name,
  onClose,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={onClose}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${name}`}
    >
      <button
        ref={closeButtonRef}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close"
      >
        <X size={20} />
      </button>

      {kind === "image" ? (
        <img
          src={url}
          alt={name}
          className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
          onClick={(e) => e.stopPropagation()}
        />
      ) : kind === "video" ? (
        <video
          src={url}
          controls
          autoPlay
          className="max-w-[90vw] max-h-[90vh] rounded-lg"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <audio
          src={url}
          controls
          autoPlay
          className="w-full max-w-xl"
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
};
