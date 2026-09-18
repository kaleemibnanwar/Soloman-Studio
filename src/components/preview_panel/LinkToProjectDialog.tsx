import { useEffect, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLoadApps } from "@/hooks/useLoadApps";
import { ipc } from "@/ipc/types";
import { showError, showSuccess } from "@/lib/toast";

interface LinkToProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceAppId: number;
  sourcePath: string;
}

/**
 * Lets the user pick another project and create a symlink there pointing
 * back at `sourcePath` in the current project, so both projects share the
 * same file/folder on disk.
 */
export function LinkToProjectDialog({
  open,
  onOpenChange,
  sourceAppId,
  sourcePath,
}: LinkToProjectDialogProps) {
  const { apps } = useLoadApps();
  const [targetAppId, setTargetAppId] = useState<string>("");
  const [targetPath, setTargetPath] = useState(sourcePath);
  const [isLinking, setIsLinking] = useState(false);

  const candidateApps = apps.filter((app) => app.id !== sourceAppId);

  useEffect(() => {
    if (open) {
      setTargetPath(sourcePath);
      setTargetAppId((current) =>
        current && candidateApps.some((app) => String(app.id) === current)
          ? current
          : (candidateApps[0] ? String(candidateApps[0].id) : ""),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourcePath]);

  const handleLink = async () => {
    if (!targetAppId || !targetPath.trim()) return;
    setIsLinking(true);
    try {
      await ipc.symlink.createSymlink({
        sourceAppId,
        sourcePath,
        targetAppId: Number(targetAppId),
        targetPath: targetPath.trim(),
      });
      const targetName =
        candidateApps.find((app) => String(app.id) === targetAppId)?.name ??
        "the target project";
      showSuccess(`Linked "${sourcePath}" into ${targetName}`);
      onOpenChange(false);
    } catch (error) {
      showError(
        `Failed to create link: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Link to another project</DialogTitle>
          <DialogDescription>
            Creates a symlink in the target project pointing at{" "}
            <span className="font-mono text-xs">{sourcePath}</span>. Edits in
            either project affect the same file.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <label htmlFor="link-target-project" className="text-sm font-medium">
              Target project
            </label>
            <Select
              value={targetAppId}
              onValueChange={(v) => v && setTargetAppId(v)}
            >
              <SelectTrigger id="link-target-project" className="w-full">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {candidateApps.map((app) => (
                  <SelectItem key={app.id} value={String(app.id)}>
                    {app.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label htmlFor="link-target-path" className="text-sm font-medium">
              Path in target project
            </label>
            <Input
              id="link-target-path"
              value={targetPath}
              onChange={(e) => setTargetPath(e.target.value)}
              placeholder="e.g. shared/component.tsx"
            />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLinking}
          >
            Cancel
          </Button>
          <Button
            onClick={handleLink}
            disabled={isLinking || !targetAppId || !targetPath.trim()}
          >
            {isLinking ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Linking...
              </>
            ) : (
              <>
                <Link2 className="mr-2 h-4 w-4" /> Create Link
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
