import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { resolveDestPath } from "./fileTreePaths";

// =============================================================================
// NamePromptDialog — create file / create folder / rename share one input box.
// =============================================================================

export function NamePromptDialog({
  open,
  title,
  description,
  initialValue,
  submitLabel,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description?: string;
  initialValue: string;
  submitLabel: string;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
    }
  }, [open, initialValue]);

  const trimmed = value.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <Input
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && trimmed) {
              onSubmit(trimmed);
            }
          }}
          data-testid="file-tree-name-input"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!trimmed} onClick={() => onSubmit(trimmed)}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// ConfirmDeleteDialog
// =============================================================================

export function ConfirmDeleteDialog({
  open,
  paths = [],
  busy,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  paths?: string[];
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {paths.length === 1 ? "item" : `${paths.length} items`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {paths.length === 1
              ? `Delete "${paths[0].split("/").pop()}"?`
              : `Delete ${paths.length} items?`}{" "}
            This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={onConfirm}
            className={buttonVariants({ variant: "destructive" })}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// =============================================================================
// MoveToDialog
// =============================================================================

export function MoveToDialog({
  open,
  paths = [],
  initialDir,
  fileTree,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  paths?: string[];
  initialDir: string;
  fileTree?: any[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (destDir: string) => void;
}) {
  const [dir, setDir] = useState(initialDir);

  useEffect(() => {
    if (open) {
      setDir(initialDir);
    }
  }, [open, initialDir]);

  const trimmed = dir.trim().replace(/^\/+|\/+$/g, "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move {paths.length === 1 ? "item" : `${paths.length} items`}</DialogTitle>
          <DialogDescription>
            Destination folder, relative to the project root (empty = root).
          </DialogDescription>
        </DialogHeader>
        <Input
          value={dir}
          autoFocus
          onChange={(e) => setDir(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onSubmit(trimmed);
            }
          }}
          placeholder="e.g. src/components"
          data-testid="file-tree-move-input"
        />
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit(trimmed)}>Move</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// ConflictDialog — "a file with this name already exists" resolution.
// =============================================================================

export interface ConflictItem {
  id: string;
  name: string;
  destPath: string;
}

type Resolution = "rename" | "overwrite" | "skip";

export function ConflictDialog({
  open,
  items,
  existing,
  onOpenChange,
  onResolve,
}: {
  open: boolean;
  items: ConflictItem[];
  existing: ReadonlySet<string>;
  onOpenChange: (open: boolean) => void;
  onResolve: (resolved: { id: string; destPath: string; overwrite: boolean }[] | null) => void;
}) {
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});

  useEffect(() => {
    if (open) {
      const init: Record<string, Resolution> = {};
      for (const item of items) {
        init[item.id] = "rename";
      }
      setResolutions(init);
    }
  }, [open, items]);

  const apply = () => {
    const used = new Set(existing);
    const resolved: { id: string; destPath: string; overwrite: boolean }[] = [];
    for (const item of items) {
      const choice = resolutions[item.id] ?? "rename";
      if (choice === "skip") {
        continue;
      }
      if (choice === "overwrite") {
        resolved.push({ id: item.id, destPath: item.destPath, overwrite: true });
      } else {
        const destPath = resolveDestPath(used, item.destPath);
        used.add(destPath);
        resolved.push({ id: item.id, destPath, overwrite: false });
      }
    }
    onResolve(resolved);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Name conflict</DialogTitle>
          <DialogDescription>
            A file or folder with the same name already exists. Choose what to do for each.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
          {items.map((item) => {
            const choice = resolutions[item.id] ?? "rename";
            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 rounded border px-2 py-1.5"
              >
                <span className="min-w-0 truncate text-sm">{item.name}</span>
                <div className="flex flex-shrink-0 gap-1">
                  {(["rename", "overwrite", "skip"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() =>
                        setResolutions((prev) => ({
                          ...prev,
                          [item.id]: opt,
                        }))
                      }
                      className={cn(
                        "rounded px-2 py-1 text-xs",
                        choice === opt
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {opt === "rename" ? "Rename" : opt === "overwrite" ? "Overwrite" : "Skip"}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onResolve(null)}>
            Cancel
          </Button>
          <Button onClick={apply}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
