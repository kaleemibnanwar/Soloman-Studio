import re

with open('src/components/chat_project/ChatProjectPreview.tsx', 'r') as f:
    content = f.read()

# 1. Imports
imports = """
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Copy,
  Scissors,
  ClipboardPaste,
  Trash2,
  FilePlus,
  FolderPlus,
  Pencil,
  ExternalLink,
} from "lucide-react";
import { useFileManager, type FileManagerApi } from "../preview_panel/useFileManager";
import {
  NamePromptDialog,
  ConfirmDeleteDialog,
  MoveToDialog,
  ConflictDialog,
} from "../preview_panel/FileTreeDialogs";
import { useLoadApps } from "@/hooks/useLoadApps";
"""
content = content.replace('import { PptxPreview } from "@/components/preview_panel/PptxPreview";', 'import { PptxPreview } from "@/components/preview_panel/PptxPreview";' + imports)

# 2. Add useFileManager and useLoadApps to ChatProjectPreview (after filesQuery is declared)
hooks = """
  const { apps } = useLoadApps();
  const app = apps.find(a => a.id === projectId);
  const appRootPath = app?.resolvedPath ?? app?.path;

  const existingPaths = useMemo(() => new Set(filesQuery.data?.map(n => n.path) ?? []), [filesQuery.data]);

  const fileManager = useFileManager({
    appId: projectId,
    existingPaths,
    refresh: () => filesQuery.refetch(),
    onMoved: (paths) => {
      setSelectedPath((current) => (current && paths.includes(current) ? null : current));
    }
  });
"""
# insert after `const filesQuery = useQuery({ ... });` which ends around line 240
# Actually, I'll insert it right before `const emptyVisible = `
content = content.replace('  const emptyVisible = filesQuery.isSuccess && (filesQuery.data?.length ?? 0) === 0;', hooks + '\n  const emptyVisible = filesQuery.isSuccess && (filesQuery.data?.length ?? 0) === 0;')

# 3. Add Dialogs before the end of the ChatProjectPreview return statement
# I will use a very specific replace. The end of ChatProjectPreview is:
#               )}
#             </div>
#           </div>
#         </Panel>
#       </PanelGroup>
#     </div>
#   );
# }
end_of_component = """        </Panel>
      </PanelGroup>
    </div>
  );
}"""

dialogs = """        </Panel>
      </PanelGroup>
      {projectId != null && (
        <>
          <NamePromptDialog
            open={fileManager.nameDialog != null}
            title={
              fileManager.nameDialog?.kind === "rename"
                ? "Rename"
                : fileManager.nameDialog?.kind === "new-folder"
                  ? "New folder"
                  : "New file"
            }
            description={
              fileManager.nameDialog?.kind === "rename"
                ? "Enter a new name for this item."
                : `Create in "${fileManager.nameDialog?.targetDir || "root"}"`
            }
            initialValue={
              fileManager.nameDialog?.kind === "rename"
                ? (fileManager.nameDialog.path?.split("/").pop() ?? "")
                : ""
            }
            submitLabel={fileManager.nameDialog?.kind === "rename" ? "Rename" : "Create"}
            onOpenChange={(open) => {
              if (!open) fileManager.closeNameDialog();
            }}
            onSubmit={fileManager.submitNameDialog}
          />
          <ConfirmDeleteDialog
            open={fileManager.deleteTarget != null}
            name={fileManager.deleteTarget?.path.split("/").pop() ?? ""}
            isDirectory={fileManager.deleteTarget?.isDirectory ?? false}
            busy={fileManager.deleteBusy}
            onOpenChange={(open) => {
              if (!open) fileManager.closeDeleteDialog();
            }}
            onConfirm={fileManager.confirmDelete}
          />
          <MoveToDialog
            open={fileManager.moveTarget != null}
            name={fileManager.moveTarget?.path.split("/").pop() ?? ""}
            initialDir={fileManager.moveTarget?.path.split("/").slice(0, -1).join("/") ?? ""}
            onOpenChange={(open) => {
              if (!open) fileManager.closeMoveDialog();
            }}
            onSubmit={fileManager.submitMoveTo}
          />
          <ConflictDialog
            open={fileManager.conflictItems != null}
            items={fileManager.conflictItems ?? []}
            existing={existingPaths}
            onOpenChange={(open) => {
              if (!open) fileManager.onResolveConflicts(null);
            }}
            onResolve={fileManager.onResolveConflicts}
          />
        </>
      )}
    </div>
  );
}"""
content = content.replace(end_of_component, dialogs)

# 4. Modify TreeItem props
tree_item_props_old = """  onSelect: (node: ChatProjectFileNode) => void;
}) {"""
tree_item_props_new = """  onSelect: (node: ChatProjectFileNode) => void;
  fileManager: FileManagerApi;
  appRootPath?: string;
}) {"""
content = content.replace(tree_item_props_old, tree_item_props_new)


tree_item_destruct_old = """function TreeItem({
  treeNode,
  depth,
  expanded,
  onToggle,
  selectedPath,
  onSelect,
}: {"""
tree_item_destruct_new = """function TreeItem({
  treeNode,
  depth,
  expanded,
  onToggle,
  selectedPath,
  onSelect,
  fileManager,
  appRootPath,
}: {"""
content = content.replace(tree_item_destruct_old, tree_item_destruct_new)

# 5. Modify TreeItem return
tree_item_return_old = """  return (
    <div>
      <button"""
tree_item_return_new = """  const absPath = appRootPath ? `${appRootPath}/${node.path}` : "";

  const handleCopyPath = () => {
    if (!absPath) return;
    navigator.clipboard
      .writeText(absPath)
      .then(() => showSuccess("Copied absolute path"))
      .catch(() => showError("Failed to copy path"));
  };

  const handleReveal = () => {
    if (!absPath) return;
    ipc.system.showItemInFolder(absPath).catch((err) => {
      showError("Failed to reveal folder: " + String(err));
    });
  };

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button"""
content = content.replace(tree_item_return_old, tree_item_return_new)

# 6. Close ContextMenu and add items
tree_item_end_old = """        )}
      </button>"""
tree_item_end_new = """        )}
      </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {isDir && (
          <>
            <ContextMenuItem onClick={() => fileManager.actions.newFile(node.path)}>
              <FilePlus size={14} />
              New file
            </ContextMenuItem>
            <ContextMenuItem onClick={() => fileManager.actions.newFolder(node.path)}>
              <FolderPlus size={14} />
              New folder
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!fileManager.canPaste}
              onClick={() => fileManager.actions.paste(node.path)}
            >
              <ClipboardPaste size={14} />
              Paste
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onClick={() => fileManager.actions.rename(node.path)}>
          <Pencil size={14} />
          Rename
        </ContextMenuItem>
        <ContextMenuItem onClick={() => fileManager.actions.copy(node.path)}>
          <Copy size={14} />
          Copy
        </ContextMenuItem>
        <ContextMenuItem onClick={() => fileManager.actions.cut(node.path)}>
          <Scissors size={14} />
          Cut
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => fileManager.actions.moveTo(node.path, isDir)}
        >
          <FolderOpen size={14} />
          Move to…
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => fileManager.actions.delete(node.path, isDir)}
          variant="destructive"
        >
          <Trash2 size={14} />
          Delete
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleCopyPath} disabled={!absPath}>
          <Copy size={14} />
          Copy path
        </ContextMenuItem>
        <ContextMenuItem onClick={handleReveal} disabled={!absPath}>
          <ExternalLink size={14} />
          Reveal in folder
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>"""
content = content.replace(tree_item_end_old, tree_item_end_new)

# 7. Pass fileManager and appRootPath to recursive TreeItem calls
tree_item_rec_old = """            onSelect={onSelect}
          />"""
tree_item_rec_new = """            onSelect={onSelect}
            fileManager={fileManager}
            appRootPath={appRootPath}
          />"""
content = content.replace(tree_item_rec_old, tree_item_rec_new)

# 8. Pass fileManager and appRootPath to initial TreeItem map
tree_item_init_old = """                    selectedPath={selectedPath}
                    onSelect={handleSelect}
                  />"""
tree_item_init_new = """                    selectedPath={selectedPath}
                    onSelect={handleSelect}
                    fileManager={fileManager}
                    appRootPath={appRootPath}
                  />"""
content = content.replace(tree_item_init_old, tree_item_init_new)

with open('src/components/chat_project/ChatProjectPreview.tsx', 'w') as f:
    f.write(content)
