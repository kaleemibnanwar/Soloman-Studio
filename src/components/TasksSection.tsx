import { useEffect, useMemo, useState } from "react";
import { Plus, MoreVertical, ListTodo, Pencil, Trash2, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { ipc } from "@/ipc/types";
import { queryKeys } from "@/lib/queryKeys";
import type { Task } from "@/ipc/types/task";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { showError, showSuccess } from "@/lib/toast";
import { useLanguageModelsByProviders } from "@/hooks/useLanguageModelsByProviders";
import { createModelSelection } from "@/lib/modelEffort";
import { cn } from "@/lib/utils";
import { SectionHeader, HeaderIconButton } from "@/components/SidebarSectionHeader";
import { useSidebarSectionCollapse } from "@/hooks/useSidebarSectionCollapse";

type SchedulePreset = "manual" | "60" | "1440" | "10080" | "43200" | "custom";

const SCHEDULE_OPTIONS: { key: SchedulePreset; label: string; hint: string }[] = [
  { key: "manual", label: "Manual", hint: "On demand" },
  { key: "60", label: "60 min", hint: "Every hour" },
  { key: "1440", label: "24 hr", hint: "Every day" },
  { key: "10080", label: "7 days", hint: "Every week" },
  { key: "43200", label: "30 days", hint: "Every month" },
  { key: "custom", label: "Custom", hint: "Set interval" },
];

function minutesToPreset(minutes: number | null): SchedulePreset {
  if (minutes == null) return "manual";
  if (minutes === 60) return "60";
  if (minutes === 1440) return "1440";
  if (minutes === 10080) return "10080";
  if (minutes === 43200) return "43200";
  return "custom";
}

function presetToMinutes(preset: SchedulePreset, custom: string): number | null {
  if (preset === "manual") return null;
  if (preset === "custom") {
    const n = Number(custom);
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  return Number(preset);
}

function formatSchedule(minutes: number | null): string {
  if (minutes == null) return "Manual";
  const opt = SCHEDULE_OPTIONS.find((o) => o.key === minutesToPreset(minutes));
  if (minutesToPreset(minutes) === "custom") {
    return minutes % 1440 === 0
      ? `Every ${minutes / 1440}d`
      : minutes % 60 === 0
        ? `Every ${minutes / 60}h`
        : `Every ${minutes} min`;
  }
  return opt?.label ?? "Manual";
}

/** Scheduled-tasks list, surfaced in the sidebar's merged list. */
export function TasksSection() {
  const { data: tasks = [], isLoading: loading } = useQuery({
    queryKey: queryKeys.tasks.list,
    queryFn: async () => {
      const result = await ipc.task.listTasks({ page: 1, pageSize: 100 });
      return result.items;
    },
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [schedulePreset, setSchedulePreset] = useState<SchedulePreset>("manual");
  const [customMinutes, setCustomMinutes] = useState("");
  const [mcpServerIds, setMcpServerIds] = useState<Set<number>>(new Set());
  const [modelSelection, setModelSelection] = useState<string>("default");
  const [mcpServers, setMcpServers] = useState<Awaited<ReturnType<typeof ipc.mcp.listServers>>>([]);
  const [saving, setSaving] = useState(false);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const { collapsed, toggle: toggleCollapsed } = useSidebarSectionCollapse("tasks");

  const { data: modelsByProviders } = useLanguageModelsByProviders();

  const modelOptions = useMemo(() => {
    if (!modelsByProviders) return [];
    const options: { value: string; label: string }[] = [];
    for (const [provider, models] of Object.entries(modelsByProviders)) {
      for (const model of models) {
        const selection = createModelSelection({
          model: { provider, name: model.apiName },
          catalogModel: model,
          preferredEffortLevel: null,
        });
        options.push({
          value: JSON.stringify(selection),
          label: `${provider}: ${model.displayName || model.apiName}`,
        });
      }
    }
    return options;
  }, [modelsByProviders]);

  useEffect(() => {
    void ipc.mcp
      .listServers()
      .then(setMcpServers)
      .catch(() => {});
  }, []);

  const openCreate = () => {
    setEditingTask(null);
    setTitle("");
    setPrompt("");
    setSchedulePreset("manual");
    setCustomMinutes("");
    setMcpServerIds(new Set());
    setModelSelection("default");
    setDialogOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setTitle(task.title);
    setPrompt(task.prompt);
    setSchedulePreset(minutesToPreset(task.scheduleMinutes));
    setCustomMinutes(
      minutesToPreset(task.scheduleMinutes) === "custom" ? String(task.scheduleMinutes ?? "") : "",
    );
    setMcpServerIds(new Set(task.mcpServerIds ?? []));
    setModelSelection(task.modelSelection ? JSON.stringify(task.modelSelection) : "default");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!title.trim() || !prompt.trim()) {
      showError("Title and prompt are required.");
      return;
    }
    const minutes = presetToMinutes(schedulePreset, customMinutes);
    if (schedulePreset === "custom" && minutes == null) {
      showError("Enter a valid number of minutes for the custom schedule.");
      return;
    }
    const base = {
      title: title.trim(),
      prompt: prompt.trim(),
      scheduleMinutes: minutes,
      mcpServerIds: mcpServerIds.size ? [...mcpServerIds] : null,
      modelSelection: modelSelection !== "default" ? JSON.parse(modelSelection) : null,
    };
    setSaving(true);
    try {
      if (editingTask) {
        await ipc.task.updateTask({ taskId: editingTask.id, ...base });
        showSuccess("Task updated");
      } else {
        await ipc.task.createTask(base);
        showSuccess("Task created");
      }
      setDialogOpen(false);
      // The create/update contract publishes a "tasks" invalidation, so the
      // useQuery above refetches automatically.
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to save task");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingTask) return;
    try {
      await ipc.task.deleteTask(deletingTask.id);
      showSuccess("Task deleted");
      setDeletingTask(null);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to delete task");
    }
  };

  return (
    <>
      <SectionHeader
        label="Tasks"
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        actions={
          <HeaderIconButton title="New task" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />
          </HeaderIconButton>
        }
      />
      {collapsed ? null : loading ? (
        <div className="flex items-center gap-2 pl-6 pr-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading tasks...
        </div>
      ) : tasks.length === 0 ? (
        <div className="pl-6 pr-3 py-2 text-xs text-muted-foreground/60">No tasks yet</div>
      ) : (
        tasks.map((task) => (
          <div key={task.id} className="group flex items-center">
            <button
              type="button"
              onClick={() => openEdit(task)}
              title={formatSchedule(task.scheduleMinutes)}
              className="flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-lg pl-6 pr-3 text-left text-[13px] font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            >
              <ListTodo className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate">{task.title}</span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex h-9 w-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/50 hover:text-sidebar-accent-foreground"
                aria-label="Task actions"
                title="Task actions"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="space-y-1 p-2">
                <DropdownMenuItem onClick={() => openEdit(task)} className="px-3 py-2">
                  <Pencil className="mr-2 h-4 w-4" />
                  <span>Edit</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setDeletingTask(task)}
                  className="px-3 py-2 text-destructive hover:bg-destructive/10 focus:bg-destructive/10"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  <span>Delete</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTask ? "Edit task" : "New task"}</DialogTitle>
            <DialogDescription>
              {editingTask
                ? "Update this scheduled task."
                : "Create a scheduled task for the agent."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-title">Title</Label>
              <Input
                id="task-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Weekly project summary"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-prompt">Prompt</Label>
              <Textarea
                id="task-prompt"
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="What should the agent do?"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Schedule</Label>
              <div className="grid grid-cols-3 gap-2">
                {SCHEDULE_OPTIONS.map((opt) => {
                  const active = schedulePreset === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setSchedulePreset(opt.key)}
                      className={cn(
                        "flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors",
                        active
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <span className="font-medium">{opt.label}</span>
                      <span className="text-[11px] opacity-70">{opt.hint}</span>
                    </button>
                  );
                })}
              </div>
              {schedulePreset === "custom" && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(e.target.value)}
                    placeholder="N"
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">minutes</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Model</Label>
              <Select
                value={modelSelection}
                onValueChange={(value) => setModelSelection(value ?? "default")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Default model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default model</SelectItem>
                  {modelOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {mcpServers.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label>Tools (MCP servers)</Label>
                <div className="flex max-h-40 flex-col gap-2 overflow-y-auto rounded-md border p-3">
                  {mcpServers.map((server) => (
                    <label
                      key={server.id}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={mcpServerIds.has(server.id)}
                        onCheckedChange={(checked) => {
                          const next = new Set(mcpServerIds);
                          if (checked) {
                            next.add(server.id);
                          } else {
                            next.delete(server.id);
                          }
                          setMcpServerIds(next);
                        }}
                      />
                      <span>
                        {server.name}
                        {!server.enabled && (
                          <span className="ml-2 text-xs text-muted-foreground">(disabled)</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editingTask ? "Save changes" : "Create task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletingTask != null}
        onOpenChange={(open) => {
          if (!open) setDeletingTask(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task</AlertDialogTitle>
            <AlertDialogDescription>
              Delete "{deletingTask?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive/60"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
