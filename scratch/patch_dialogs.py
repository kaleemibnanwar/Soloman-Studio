import re

with open('src/components/chat_project/ChatProjectPreview.tsx', 'r') as f:
    content = f.read()

dialogs = """      </div>
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

content = re.sub(r'      </div>\n    </div>\n  \);\n}', dialogs, content, count=1)

with open('src/components/chat_project/ChatProjectPreview.tsx', 'w') as f:
    f.write(content)
