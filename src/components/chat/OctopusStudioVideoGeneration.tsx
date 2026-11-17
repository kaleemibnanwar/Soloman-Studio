import type React from "react";
import { useEffect, useState, type ReactNode } from "react";
import { Eye, Video as VideoIcon } from "lucide-react";
import { useAtomValue } from "jotai";
import { CustomTagState } from "./stateTypes";
import {
  OctopusStudioCard,
  OctopusStudioCardHeader,
  OctopusStudioBadge,
  OctopusStudioExpandIcon,
  OctopusStudioStateIndicator,
  OctopusStudioCardContent,
} from "./OctopusStudioCardPrimitives";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { useLoadApp } from "@/hooks/useLoadApp";

interface OctopusStudioVideoGenerationNode {
  properties: {
    prompt: string;
    path: string;
    state: CustomTagState;
  };
}

interface OctopusStudioVideoGenerationProps {
  children?: ReactNode;
  node?: OctopusStudioVideoGenerationNode;
}

export const OctopusStudioVideoGeneration: React.FC<OctopusStudioVideoGenerationProps> = ({
  children,
  node,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const prompt = node?.properties?.prompt ?? "";
  const videoPath = node?.properties?.path ?? "";

  useEffect(() => {
    setVideoError(false);
  }, [videoPath]);
  const state = node?.properties?.state;
  const inProgress = state === "pending";
  const aborted = state === "aborted";

  const selectedAppId = useAtomValue(selectedAppIdAtom);
  const { app } = useLoadApp(selectedAppId);
  const appPath = app?.resolvedPath ?? app?.path ?? "";
  const normalizedVideoPath = videoPath.split("\\").join("/");
  const hasTraversal = normalizedVideoPath.split("/").some((seg: string) => seg === "..");
  const videoUrl =
    appPath && normalizedVideoPath && !hasTraversal
      ? `octopus-studio-media://media/${encodeURIComponent(appPath)}/${normalizedVideoPath
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`
      : "";
  const absolutePath =
    appPath && normalizedVideoPath && !hasTraversal
      ? `${appPath}/${normalizedVideoPath}`
      : undefined;
  const canViewVideo = state === "finished" && !!videoPath && !!videoUrl && !videoError;

  return (
    <OctopusStudioCard
      state={state}
      accentColor="violet"
      isExpanded={isExpanded}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex flex-col">
        <div className="flex items-start">
          <div className="flex-1 min-w-0">
            <OctopusStudioCardHeader icon={<VideoIcon size={15} />} accentColor="violet">
              <OctopusStudioBadge color="violet">Video Generation</OctopusStudioBadge>
              {!isExpanded && prompt && (
                <span className="text-sm text-muted-foreground italic truncate">{prompt}</span>
              )}
              {inProgress && (
                <OctopusStudioStateIndicator state="pending" pendingLabel="Generating..." />
              )}
              {aborted && (
                <OctopusStudioStateIndicator state="aborted" abortedLabel="Did not finish" />
              )}
              <div className="ml-auto flex items-center gap-1">
                <OctopusStudioExpandIcon isExpanded={isExpanded} />
              </div>
            </OctopusStudioCardHeader>
            <OctopusStudioCardContent isExpanded={isExpanded}>
              <div className="text-sm text-muted-foreground space-y-2">
                {prompt && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">Prompt:</span>
                    <div className="italic mt-0.5 text-foreground">{prompt}</div>
                  </div>
                )}
                {videoPath && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">Saved to:</span>
                    <div className="mt-0.5 font-mono text-xs text-foreground">{videoPath}</div>
                  </div>
                )}
                {absolutePath && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">
                      Absolute path (OS):
                    </span>
                    <div className="mt-0.5 font-mono text-xs text-foreground select-all">
                      {absolutePath}
                    </div>
                  </div>
                )}
                {children && <div className="mt-0.5 text-foreground">{children}</div>}
              </div>
            </OctopusStudioCardContent>
          </div>
        </div>
        {canViewVideo && (
          <div className="mt-3 p-2 bg-black/5 rounded-xl flex justify-center">
            <video
              controls
              src={videoUrl}
              title={prompt || "Generated video"}
              className="max-h-64 rounded-lg shadow-sm"
              onError={() => setVideoError(true)}
            />
          </div>
        )}
      </div>
    </OctopusStudioCard>
  );
};
