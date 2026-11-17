import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  CalendarClock,
  BellRing,
  BriefcaseBusiness,
  CheckCircle2,
  CircleDashed,
  Clock3,
  GripVertical,
  Inbox,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { ipc } from "@/ipc/types";
import type { PlannerTask, PlannerTaskStatus } from "@/ipc/types/planner";
import { useLoadApps } from "@/hooks/useLoadApps";
import { queryKeys } from "@/lib/queryKeys";
import { showError, showSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const COLUMNS: Array<{
  id: PlannerTaskStatus;
  label: string;
  description: string;
  icon: typeof Inbox;
  accent: string;
}> = [
  {
    id: "backlog",
    label: "Backlog",
    description: "Ideas waiting for a decision",
    icon: Inbox,
    accent: "bg-muted-foreground/45",
  },
  {
    id: "todo",
    label: "To do",
    description: "Ready to be picked up",
    icon: CircleDashed,
    accent: "bg-foreground/55",
  },
  {
    id: "in_progress",
    label: "In progress",
    description: "Work happening now",
    icon: Clock3,
    accent: "bg-foreground/75",
  },
  {
    id: "done",
    label: "Done",
    description: "Completed work",
    icon: CheckCircle2,
    accent: "bg-foreground",
  },
];

type Priority = PlannerTask["priority"];

interface TaskForm {
  appId: number | null;
  title: string;
  description: string;
  status: PlannerTaskStatus;
  priority: Priority;
  dueAt: string;
  botName: string;
}

const EMPTY_FORM: TaskForm = {
  appId: null,
  title: "",
  description: "",
  status: "todo",
  priority: "medium",
  dueAt: "",
  botName: "",
};

function toDateTimeInput(date: Date | null) {
  if (!date) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDueDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function TaskCard({
  task,
  projectName,
  onEdit,
  onDelete,
  onOpen,
}: {
  task: PlannerTask;
  projectName: string | null;
  onEdit: (task: PlannerTask) => void;
  onDelete: (task: PlannerTask) => void;
  onOpen: (task: PlannerTask) => void;
}) {
  const overdue =
    task.dueAt !== null && task.dueAt.getTime() < Date.now() && task.status !== "done";
  return (
    <article
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/planner-task", String(task.id));
      }}
      className="group rounded-lg border border-border bg-card p-3 shadow-[0_6px_25px_rgba(0,0,0,0.035)] transition-[border-color,transform] hover:-translate-y-px hover:border-muted-foreground dark:shadow-none"
      data-testid={`planner-task-${task.id}`}
      onClick={() => onOpen(task)}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 size-4 shrink-0 cursor-grab text-muted-foreground/35 group-hover:text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-5 text-foreground">{task.title}</h3>
          {task.description ? (
            <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
              {task.description}
            </p>
          ) : null}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Actions for ${task.title}`}
            className="-mr-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 focus-visible:opacity-100"
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(task)}>
              <Pencil className="mr-2 size-4" /> Edit task
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(task)}>
              <Trash2 className="mr-2 size-4" /> Delete task
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 pl-6">
        {task.botName ? (
          <Badge
            variant="outline"
            className="gap-1 border-primary/40 bg-primary/10 text-primary text-[11px] font-medium"
          >
            <span>🤖</span>
            <span className="truncate">{task.botName}</span>
          </Badge>
        ) : null}
        <Badge variant="outline" className="max-w-full gap-1 font-normal text-muted-foreground">
          <BriefcaseBusiness className="size-3" />
          <span className="truncate">{projectName ?? "No project"}</span>
        </Badge>
        <Badge
          variant="secondary"
          className={cn(
            "capitalize",
            task.priority === "high" && "bg-destructive/10 text-destructive",
            task.priority === "low" && "text-muted-foreground",
          )}
        >
          {task.priority}
        </Badge>
        {task.dueAt ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground",
              overdue && "text-destructive",
            )}
          >
            <CalendarClock className="size-3.5" />
            {formatDueDate(task.dueAt)}
          </span>
        ) : null}
      </div>
    </article>
  );
}

export default function PlannerPage() {
  const search = useSearch({ from: "/planner" });
  const navigate = useNavigate({ from: "/planner" });
  const queryClient = useQueryClient();
  const { apps } = useLoadApps();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PlannerTask | null>(null);
  const [detailTask, setDetailTask] = useState<PlannerTask | null>(null);
  const [deletingTask, setDeletingTask] = useState<PlannerTask | null>(null);
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM);
  const [dragOverColumn, setDragOverColumn] = useState<PlannerTaskStatus | null>(null);
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [dueFilter, setDueFilter] = useState<"all" | "open" | "overdue">("all");

  const projects = useMemo(
    () =>
      [...apps]
        .filter((app) => !app.isDefaultChatProject)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [apps],
  );
  const selectedAppId = search.appId;
  const projectNames = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );

  const tasksQuery = useQuery({
    queryKey: queryKeys.planner.list({ appId: selectedAppId }),
    queryFn: () => ipc.planner.listTasks({ appId: selectedAppId }),
  });

  const visibleTasks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const now = Date.now();
    return (tasksQuery.data ?? []).filter((task) => {
      if (normalized && !`${task.title} ${task.description}`.toLowerCase().includes(normalized))
        return false;
      if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
      if (dueFilter === "open" && (!task.dueAt || task.status === "done")) return false;
      if (
        dueFilter === "overdue" &&
        !(task.dueAt && task.dueAt.getTime() < now && task.status !== "done")
      )
        return false;
      return true;
    });
  }, [dueFilter, priorityFilter, query, tasksQuery.data]);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.planner.list({ appId: selectedAppId }) });
  const saveMutation = useMutation({
    mutationFn: async () => {
      const values = {
        appId: form.appId,
        title: form.title.trim(),
        description: form.description.trim(),
        status: form.status,
        priority: form.priority,
        dueAt: form.dueAt ? new Date(form.dueAt) : null,
        botName: form.botName.trim() || null,
      };
      return editingTask
        ? ipc.planner.updateTask({ taskId: editingTask.id, ...values })
        : ipc.planner.createTask(values);
    },
    onSuccess: () => {
      void refresh();
      setDialogOpen(false);
      showSuccess(editingTask ? "Task updated" : "Task created");
    },
    onError: showError,
  });

  const openCreate = (status: PlannerTaskStatus = "todo") => {
    setEditingTask(null);
    setForm({ ...EMPTY_FORM, appId: selectedAppId ?? null, status });
    setDialogOpen(true);
  };
  const openEdit = (task: PlannerTask) => {
    setDetailTask(null);
    setEditingTask(task);
    setForm({
      appId: task.appId,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueAt: toDateTimeInput(task.dueAt),
      botName: task.botName ?? "",
    });
    setDialogOpen(true);
  };

  const moveTask = async (taskId: number, status: PlannerTaskStatus) => {
    const position = (tasksQuery.data ?? []).filter((task) => task.status === status).length;
    try {
      await ipc.planner.moveTask({ taskId, status, position });
      await refresh();
    } catch (error) {
      showError(error);
    }
  };

  const deleteTask = async () => {
    if (!deletingTask) return;
    try {
      await ipc.planner.deleteTask(deletingTask.id);
      await refresh();
      setDeletingTask(null);
      showSuccess("Task deleted");
    } catch (error) {
      showError(error);
    }
  };

  return (
    <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b border-border bg-card px-7 py-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.145em] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary" /> Project workspace
            </div>
            <h1 className="text-[25px] font-semibold tracking-[-0.04em]">Planner</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Move work from idea to done. Due tasks remind you one hour and five minutes before.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tasks…"
              className="w-44"
              aria-label="Search planner tasks"
            />
            <Select
              value={priorityFilter}
              onValueChange={(value) => setPriorityFilter(value as Priority | "all")}
            >
              <SelectTrigger className="w-32" aria-label="Filter by priority">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priority</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={dueFilter}
              onValueChange={(value) => setDueFilter(value as typeof dueFilter)}
            >
              <SelectTrigger className="w-32" aria-label="Filter by deadline">
                <SelectValue placeholder="Deadline" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any deadline</SelectItem>
                <SelectItem value="open">Has deadline</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={selectedAppId ? String(selectedAppId) : "all"}
              onValueChange={(value) => {
                if (!value) return;
                void navigate({ search: value === "all" ? {} : { appId: Number(value) } });
              }}
            >
              <SelectTrigger className="w-56" aria-label="Project">
                <SelectValue>
                  {selectedAppId ? projectNames.get(selectedAppId) : "All tasks"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tasks</SelectItem>
                {projects.map((app) => (
                  <SelectItem key={app.id} value={String(app.id)}>
                    {app.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => openCreate()}>
              <Plus className="mr-2 size-4" /> New task
            </Button>
          </div>
        </div>
      </header>

      <section className="scrollbar-on-hover min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-5">
        <div className="grid h-full min-w-[960px] grid-cols-4 gap-4">
          {COLUMNS.map((column) => {
            const columnTasks = visibleTasks.filter((task) => task.status === column.id);
            const Icon = column.icon;
            return (
              <div
                key={column.id}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverColumn(column.id);
                }}
                onDragLeave={() => setDragOverColumn(null)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOverColumn(null);
                  const taskId = Number(event.dataTransfer.getData("text/planner-task"));
                  if (Number.isInteger(taskId) && taskId > 0) void moveTask(taskId, column.id);
                }}
                className={cn(
                  "flex min-h-0 flex-col rounded-lg border border-border bg-card transition-colors",
                  dragOverColumn === column.id && "border-primary/50 bg-primary/5",
                )}
              >
                <div className="shrink-0 border-b border-border/70 px-3.5 py-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-5 w-1 rounded-full", column.accent)} />
                    <Icon className="size-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold">{column.label}</h2>
                    <Badge
                      variant="secondary"
                      className="ml-auto min-w-6 justify-center tabular-nums"
                    >
                      {columnTasks.length}
                    </Badge>
                  </div>
                  <p className="mt-1 pl-7 text-[11px] text-muted-foreground">
                    {column.description}
                  </p>
                </div>
                <div className="scrollbar-on-hover min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
                  {columnTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      projectName={
                        task.appId === null
                          ? null
                          : (projectNames.get(task.appId) ?? "Unknown project")
                      }
                      onEdit={openEdit}
                      onDelete={setDeletingTask}
                      onOpen={setDetailTask}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => openCreate(column.id)}
                    className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                  >
                    <Plus className="size-3.5" /> Add task
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <Dialog
        open={detailTask !== null}
        onOpenChange={(open) => {
          if (!open) setDetailTask(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {detailTask
            ? (() => {
                const overdue =
                  detailTask.dueAt &&
                  detailTask.dueAt.getTime() < Date.now() &&
                  detailTask.status !== "done";
                return (
                  <>
                    <DialogHeader className="text-left">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <DialogTitle className="text-xl tracking-[-0.04em]">
                            {detailTask.title}
                          </DialogTitle>
                          <DialogDescription className="mt-1">
                            Task details and next actions
                          </DialogDescription>
                        </div>
                        <Badge variant="outline" className="capitalize">
                          {detailTask.status.replace("_", " ")}
                        </Badge>
                      </div>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="flex flex-wrap gap-2">
                        {detailTask.botName ? (
                          <Badge
                            variant="outline"
                            className="gap-1 border-primary/40 bg-primary/10 text-primary font-medium"
                          >
                            <span>🤖</span>
                            <span>{detailTask.botName}</span>
                          </Badge>
                        ) : null}
                        <Badge variant="secondary" className="capitalize">
                          {detailTask.priority} priority
                        </Badge>
                        <Badge variant="outline">
                          {detailTask.appId
                            ? (projectNames.get(detailTask.appId) ?? "Unknown project")
                            : "No project"}
                        </Badge>
                        {detailTask.dueAt ? (
                          <Badge variant={overdue ? "destructive" : "outline"}>
                            {overdue ? "Overdue · " : "Due · "}
                            {formatDueDate(detailTask.dueAt)}
                          </Badge>
                        ) : (
                          <Badge variant="outline">No deadline</Badge>
                        )}
                      </div>
                      <div className="rounded-lg border border-border bg-muted/25 p-3.5 text-sm leading-6 text-muted-foreground">
                        {detailTask.description ||
                          "No notes yet. Add context so the next person can pick this up quickly."}
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                        <div>
                          <span className="block uppercase tracking-wider">Created</span>
                          <strong className="mt-1 block font-medium text-foreground">
                            {detailTask.createdAt.toLocaleDateString()}
                          </strong>
                        </div>
                        <div>
                          <span className="block uppercase tracking-wider">Updated</span>
                          <strong className="mt-1 block font-medium text-foreground">
                            {detailTask.updatedAt.toLocaleDateString()}
                          </strong>
                        </div>
                      </div>
                    </div>
                    <DialogFooter className="gap-2 sm:justify-between">
                      <Button
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => {
                          setDeletingTask(detailTask);
                          setDetailTask(null);
                        }}
                      >
                        <Trash2 className="mr-2 size-4" />
                        Delete
                      </Button>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => openEdit(detailTask)}>
                          <Pencil className="mr-2 size-4" />
                          Edit task
                        </Button>
                        <Button
                          onClick={() => {
                            void moveTask(
                              detailTask.id,
                              detailTask.status === "done" ? "todo" : "done",
                            );
                            setDetailTask(null);
                          }}
                        >
                          {detailTask.status === "done" ? "Reopen task" : "Mark done"}
                        </Button>
                      </div>
                    </DialogFooter>
                  </>
                );
              })()
            : null}
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="border-b border-border bg-muted/35 px-6 py-5 pr-12 text-left">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ListChecks className="size-5" />
              </div>
              <div>
                <DialogTitle>{editingTask ? "Edit task" : "Add work item"}</DialogTitle>
                <DialogDescription className="mt-1">
                  Capture the outcome now. Project and deadline are optional.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-5 px-6 py-5">
            <div className="space-y-1.5">
              <Label htmlFor="planner-title">Title</Label>
              <Input
                id="planner-title"
                autoFocus
                value={form.title}
                maxLength={180}
                placeholder="e.g. Review the onboarding flow"
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="planner-description">
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="planner-description"
                rows={3}
                value={form.description}
                placeholder="What does done look like?"
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Project <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Select
                value={form.appId === null ? "none" : String(form.appId)}
                onValueChange={(value) => {
                  if (!value) return;
                  setForm((current) => ({
                    ...current,
                    appId: value === "none" ? null : Number(value),
                  }));
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {form.appId === null ? "No project" : projectNames.get(form.appId)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="scrollbar-on-hover">
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={String(project.id)}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) => {
                    if (value)
                      setForm((current) => ({ ...current, status: value as PlannerTaskStatus }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue>
                      {COLUMNS.find((column) => column.id === form.status)?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {COLUMNS.map((column) => (
                      <SelectItem key={column.id} value={column.id}>
                        {column.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(value) => {
                    if (value) setForm((current) => ({ ...current, priority: value as Priority }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue className="capitalize">{form.priority}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="planner-bot-name">
                Assigned Coworker Bot{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="planner-bot-name"
                placeholder="e.g. Web Scout, Commercial Communicator, QA Sentinel"
                value={form.botName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, botName: event.target.value }))
                }
              />
            </div>
            <div className="rounded-xl border border-border bg-muted/25 p-3.5">
              <div className="mb-2 flex items-center gap-2">
                <BellRing className="size-4 text-primary" />
                <Label htmlFor="planner-due-at">
                  Deadline <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
              </div>
              <Input
                id="planner-due-at"
                type="datetime-local"
                value={form.dueAt}
                onChange={(event) =>
                  setForm((current) => ({ ...current, dueAt: event.target.value }))
                }
              />
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Reminders arrive one hour before and again five minutes before.
              </p>
            </div>
          </div>
          <DialogFooter className="border-t border-border bg-muted/20 px-6 py-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate(undefined)}
              disabled={!form.title.trim() || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving…" : editingTask ? "Save changes" : "Create task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletingTask !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingTask(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deletingTask?.title}” will be removed from this project. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void deleteTask()}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
