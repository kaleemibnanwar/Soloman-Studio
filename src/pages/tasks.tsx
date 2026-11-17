import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ipc } from "@/ipc/types";
import type {
  MissionArtifact,
  MissionChatRun,
  MissionConsensus,
  MissionStatus,
  MissionSummary,
} from "@/ipc/types/mission";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { showError, showSuccess } from "@/lib/toast";
import { useLanguageModelsByProviders } from "@/hooks/useLanguageModelsByProviders";
import { useLoadApps } from "@/hooks/useLoadApps";
import { createModelSelection } from "@/lib/modelEffort";
import { cn } from "@/lib/utils";
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  FileCode,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Power,
  ShieldAlert,
  Target,
  Trash2,
  Users,
  X,
} from "lucide-react";

type Task = Awaited<ReturnType<typeof ipc.task.listTasks>>["items"][number];

const TASKS_PAGE_SIZE = 10;

type SchedulePreset = "manual" | "hourly" | "daily" | "weekly" | "custom";

const PRESET_MINUTES: Record<Exclude<SchedulePreset, "custom" | "manual">, number> = {
  hourly: 60,
  daily: 1440,
  weekly: 10080,
};

const PRESET_OPTIONS: { value: SchedulePreset; label: string; hint: string }[] = [
  { value: "manual", label: "Manual", hint: "Run on demand" },
  { value: "hourly", label: "Hourly", hint: "Every 60 min" },
  { value: "daily", label: "Daily", hint: "Every 24 h" },
  { value: "weekly", label: "Weekly", hint: "Every 7 days" },
  { value: "custom", label: "Custom", hint: "Set interval" },
];

function minutesToPreset(minutes: number | null): {
  preset: SchedulePreset;
  custom: string;
} {
  if (minutes == null) return { preset: "manual", custom: "" };
  for (const [key, value] of Object.entries(PRESET_MINUTES)) {
    if (value === minutes) return { preset: key as SchedulePreset, custom: "" };
  }
  return { preset: "custom", custom: String(minutes) };
}

function formatSchedule(minutes: number | null): string {
  if (minutes == null) return "Manual";
  if (minutes === 60) return "Hourly";
  if (minutes === 1440) return "Daily";
  if (minutes === 10080) return "Weekly";
  if (minutes % 1440 === 0) {
    return `Every ${minutes / 1440} day${minutes / 1440 > 1 ? "s" : ""}`;
  }
  if (minutes % 60 === 0) {
    return `Every ${minutes / 60} hour${minutes / 60 > 1 ? "s" : ""}`;
  }
  return `Every ${minutes} min`;
}

function formatRelativeTime(date: Date | null): string {
  if (!date) return "Never run";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface TaskFormState {
  title: string;
  prompt: string;
  preset: SchedulePreset;
  customMinutes: string;
  projectId: string; // "default" = default chat project
  mcpServerIds: Set<number>;
  modelSelection: string; // "default" = default model
  enabled: boolean;
}

function emptyForm(): TaskFormState {
  return {
    title: "",
    prompt: "",
    preset: "manual",
    customMinutes: "",
    projectId: "default",
    mcpServerIds: new Set(),
    modelSelection: "default",
    enabled: true,
  };
}

export default function TasksPage() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [tokenTotals, setTokenTotals] = useState<Record<number, number>>({});
  const [loadingTokenIds, setLoadingTokenIds] = useState<Set<number>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm] = useState<TaskFormState>(emptyForm());
  const [mcpServers, setMcpServers] = useState<Awaited<ReturnType<typeof ipc.mcp.listServers>>>([]);
  const [directoryBusy, setDirectoryBusy] = useState(false);

  // Autonomous Missions State
  const [viewMode, setViewMode] = useState<"missions" | "tasks">("missions");
  const [missions, setMissions] = useState<MissionSummary[]>([]);
  const [activeConsensus, setActiveConsensus] = useState<MissionConsensus | null>(null);
  const [consensusActiveTab, setConsensusActiveTab] = useState<string>("overview");
  const [loadingMissions, setLoadingMissions] = useState(false);
  const [newMissionOpen, setNewMissionOpen] = useState(false);
  const [consensusModalOpen, setConsensusModalOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [artifactModalOpen, setArtifactModalOpen] = useState(false);
  const [viewingArtifact, setViewingArtifact] = useState<MissionArtifact | null>(null);
  const [artifactContent, setArtifactContent] = useState<string | null>(null);
  const [loadingArtifact, setLoadingArtifact] = useState(false);
  const [missionForm, setMissionForm] = useState({
    projectId: null as number | null,
    title: "",
    objective: "",
    context: "",
    deliverables: "",
    hitlEnabled: true,
    hitlExternalCommunication: true,
    hitlGitPush: true,
    hitlFinancialSpend: true,
    hitlDestructiveFs: true,
  });

  const loadMissions = async () => {
    try {
      setLoadingMissions(true);
      const res = await ipc.mission.listMissions({ projectId: selectedProjectId });
      setMissions(res);
    } catch {
      // ignore
    } finally {
      setLoadingMissions(false);
    }
  };

  useEffect(() => {
    void loadMissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  useEffect(() => {
    if (viewMode !== "missions") return;
    const timer = window.setInterval(() => void loadMissions(), 5_000);
    return () => window.clearInterval(timer);
    // Keep pending mobile/tool approvals live without owning mission state in the renderer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, viewMode]);

  const openMissionConsensus = async (
    slug: string,
    projectId = selectedProjectId,
    initialTab = "overview",
  ) => {
    try {
      const consensus = await ipc.mission.getMission({ projectId, slug });
      setActiveConsensus(consensus);
      setConsensusActiveTab(initialTab);
      setConsensusModalOpen(true);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to load mission consensus");
    }
  };

  const openArtifact = async (
    artifact: MissionArtifact,
    projectId = selectedProjectId,
    slug = activeConsensus?.slug,
  ) => {
    if (!slug) return;
    setViewingArtifact(artifact);
    setArtifactModalOpen(true);
    setLoadingArtifact(true);
    try {
      const res = await ipc.mission.readArtifact({
        projectId,
        slug,
        relativePath: artifact.relativePath,
      });
      setArtifactContent(res.content);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to load artifact content");
      setArtifactContent(null);
    } finally {
      setLoadingArtifact(false);
    }
  };

  const handleCreateMission = async () => {
    if (!missionForm.title.trim() || !missionForm.objective.trim()) {
      showError("Please enter both a title and an objective");
      return;
    }
    try {
      await ipc.mission.createMission({
        projectId: missionForm.projectId,
        title: missionForm.title.trim(),
        objective: missionForm.objective.trim(),
        context: missionForm.context
          .split("\n")
          .map((entry) => entry.trim())
          .filter(Boolean),
        deliverables: missionForm.deliverables
          .split("\n")
          .map((entry) => entry.trim())
          .filter(Boolean),
        hitlPolicy: {
          enabled: missionForm.hitlEnabled,
          blockExternalCommunication: missionForm.hitlExternalCommunication,
          blockGitPush: missionForm.hitlGitPush,
          blockFinancialSpend: missionForm.hitlFinancialSpend,
          blockDestructiveFs: missionForm.hitlDestructiveFs,
        },
      });
      showSuccess("Autonomous mission created");
      setNewMissionOpen(false);
      setMissionForm({
        projectId: null,
        title: "",
        objective: "",
        context: "",
        deliverables: "",
        hitlEnabled: true,
        hitlExternalCommunication: true,
        hitlGitPush: true,
        hitlFinancialSpend: true,
        hitlDestructiveFs: true,
      });
      void loadMissions();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to create mission");
    }
  };

  const openNewMission = () => {
    setMissionForm((form) => ({ ...form, projectId: selectedProjectId }));
    setNewMissionOpen(true);
  };

  const handleStartMission = async (slug: string, projectId = selectedProjectId) => {
    try {
      await ipc.mission.startMission({ projectId, slug });
      showSuccess("Mission execution started");
      void loadMissions();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to start mission");
    }
  };

  const handleApproveAction = async (
    slug: string,
    approvalId: string,
    decision: "approved" | "rejected",
    projectId = selectedProjectId,
  ) => {
    try {
      await ipc.mission.approveAction({
        projectId,
        slug,
        approvalId,
        decision,
      });
      showSuccess(`Action ${decision}`);
      void loadMissions();
      if (activeConsensus && activeConsensus.slug === slug) {
        void openMissionConsensus(slug);
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to resolve approval");
    }
  };

  const handleUpdateMissionStatus = async (
    slug: string,
    status: MissionStatus,
    projectId = selectedProjectId,
  ) => {
    try {
      await ipc.mission.updateStatus({
        projectId,
        slug,
        status,
      });
      showSuccess(`Mission status set to ${status}`);
      void loadMissions();
      if (activeConsensus && activeConsensus.slug === slug) {
        setActiveConsensus((prev) => (prev ? { ...prev, status } : null));
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to update mission status");
    }
  };

  const { data: modelsByProviders } = useLanguageModelsByProviders();
  const { apps, refreshApps } = useLoadApps();

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

  const projectOptions = useMemo(
    () =>
      [...apps]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((app) => ({
          id: app.id,
          label: app.name,
          type: app.type,
          directory: app.directory ?? null,
        })),
    [apps],
  );

  const codeProjects = projectOptions.filter((p) => p.type === "app");
  const chatProjects = projectOptions.filter((p) => p.type === "chat");

  const selectedProject = useMemo(
    () =>
      form.projectId === "default"
        ? null
        : (projectOptions.find((p) => String(p.id) === form.projectId) ?? null),
    [form.projectId, projectOptions],
  );
  const isCodelessSelected = selectedProject?.type === "chat";

  const chooseDirectory = async () => {
    try {
      const { path: picked, canceled } = await ipc.chatProject.pickDirectory();
      if (canceled || !picked || !selectedProject) return;
      setDirectoryBusy(true);
      await ipc.chatProject.setDirectory({
        projectId: selectedProject.id,
        directory: picked,
      });
      await refreshApps();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to choose directory");
    } finally {
      setDirectoryBusy(false);
    }
  };

  const clearDirectory = async () => {
    if (!selectedProject) return;
    try {
      setDirectoryBusy(true);
      await ipc.chatProject.setDirectory({
        projectId: selectedProject.id,
        directory: null,
      });
      await refreshApps();
    } catch {
      showError("Failed to clear directory");
    } finally {
      setDirectoryBusy(false);
    }
  };

  const load = async (targetPage: number = page) => {
    const result = await ipc.task.listTasks({
      page: targetPage,
      pageSize: TASKS_PAGE_SIZE,
    });
    setTasks(result.items);
    setTotalCount(result.totalCount);
    // A delete can empty out the last page — step back rather than show blank.
    if (result.items.length === 0 && targetPage > 1) {
      setPage(targetPage - 1);
    }
  };

  useEffect(() => {
    void ipc.mcp
      .listServers()
      .then(setMcpServers)
      .catch(() => {});
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(totalCount / TASKS_PAGE_SIZE));

  const toggleExpanded = (task: Task) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(task.id)) {
        next.delete(task.id);
        return next;
      }
      next.add(task.id);
      return next;
    });
    if (
      tokenTotals[task.id] === undefined &&
      !loadingTokenIds.has(task.id) &&
      task.lastChatId != null
    ) {
      setLoadingTokenIds((prev) => new Set(prev).add(task.id));
      void ipc.task
        .getTaskTokenTotal(task.id)
        .then((total) => {
          setTokenTotals((prev) => ({ ...prev, [task.id]: total }));
        })
        .catch(() => {})
        .finally(() => {
          setLoadingTokenIds((prev) => {
            const next = new Set(prev);
            next.delete(task.id);
            return next;
          });
        });
    }
  };

  const patch = (partial: Partial<TaskFormState>) => setForm((prev) => ({ ...prev, ...partial }));

  const openCreate = () => {
    setEditingTask(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditingTask(task);
    const { preset, custom } = minutesToPreset(task.scheduleMinutes);
    setForm({
      title: task.title,
      prompt: task.prompt,
      preset,
      customMinutes: custom,
      projectId: task.projectId != null ? String(task.projectId) : "default",
      mcpServerIds: new Set(task.mcpServerIds ?? []),
      modelSelection: task.modelSelection ? JSON.stringify(task.modelSelection) : "default",
      enabled: task.enabled,
    });
    setDialogOpen(true);
  };

  const scheduleMinutes = (): number | null => {
    if (form.preset === "manual") return null;
    if (form.preset === "custom") {
      const n = Number(form.customMinutes);
      if (!Number.isInteger(n) || n <= 0) return null;
      return n;
    }
    return PRESET_MINUTES[form.preset];
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.prompt.trim()) {
      showError("Title and prompt are required");
      return;
    }
    const minutes = scheduleMinutes();
    if (form.preset === "custom" && minutes == null) {
      showError("Enter a valid number of minutes for the custom schedule");
      return;
    }
    const base = {
      title: form.title.trim(),
      prompt: form.prompt.trim(),
      scheduleMinutes: minutes,
      projectId: form.projectId !== "default" ? Number(form.projectId) : null,
      mcpServerIds: form.mcpServerIds.size ? [...form.mcpServerIds] : null,
      modelSelection: form.modelSelection !== "default" ? JSON.parse(form.modelSelection) : null,
    };
    try {
      if (editingTask) {
        await ipc.task.updateTask({ taskId: editingTask.id, ...base });
        showSuccess("Task updated");
        setDialogOpen(false);
        await load();
      } else {
        await ipc.task.createTask(base);
        showSuccess("Task created");
        setDialogOpen(false);
        // New tasks sort to the top — jump to page 1 so it's visible.
        setPage(1);
        await load(1);
      }
    } catch (error) {
      showError(
        error instanceof Error ? `Failed to save task: ${error.message}` : "Failed to save task",
      );
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Delete this task?")) return;
    try {
      await ipc.task.deleteTask(id);
      showSuccess("Task deleted");
      await load();
    } catch {
      showError("Failed to delete task");
    }
  };

  const handleRun = async (id: number) => {
    try {
      await ipc.task.runTaskNow(id);
      showSuccess("Task started");
      await load();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to run task");
    }
  };

  const handleToggleEnabled = async (task: Task, enabled: boolean) => {
    try {
      await ipc.task.updateTask({ taskId: task.id, enabled });
      await load();
    } catch {
      showError("Failed to update task");
    }
  };

  const openLatestRun = async (task: Task) => {
    if (task.lastChatId == null) return;
    navigate({ to: "/chat", search: { id: task.lastChatId } });
  };

  const taskProjectLabel = (task: Task): string | null => {
    if (task.projectId == null) return null;
    const app = apps.find((a) => a.id === task.projectId);
    return app ? app.name : `Project #${task.projectId}`;
  };

  const taskProjectKind = (task: Task): "code" | "codeless" | null => {
    if (task.projectId == null) return null;
    const app = apps.find((a) => a.id === task.projectId);
    return app ? (app.type === "chat" ? "codeless" : "code") : null;
  };

  const mcpNames = useMemo(() => {
    const byId = new Map(mcpServers.map((s) => [s.id, s.name]));
    return (ids: number[] | null) => (ids ?? []).map((id) => byId.get(id) ?? `#${id}`);
  }, [mcpServers]);

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight">
              {viewMode === "missions" ? "Autonomous Missions" : "Scheduled Tasks"}
            </h1>
            <Badge variant="secondary" className="text-xs font-normal">
              {viewMode === "missions" ? "AutoCompany Hierarchy" : "Automation"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {viewMode === "missions"
              ? "Goal-driven missions with Lead Strategist managers, specialized workers, consensus memory, and mobile approvals."
              : "Saved prompts that run on a schedule or on demand, in a chat."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* View Mode Toggle: Missions vs Tasks */}
          <div className="flex items-center rounded-lg border bg-muted/40 p-1 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("missions")}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium transition-colors flex items-center gap-1.5",
                viewMode === "missions"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Target size={13} className={viewMode === "missions" ? "text-primary" : ""} />
              <span>Missions ({missions.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("tasks")}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium transition-colors flex items-center gap-1.5",
                viewMode === "tasks"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <CalendarClock size={13} className={viewMode === "tasks" ? "text-primary" : ""} />
              <span>Scheduled Tasks ({tasks.length})</span>
            </button>
          </div>

          {/* Project Selector Filter */}
          <div className="w-44">
            <Select
              value={selectedProjectId != null ? String(selectedProjectId) : "all"}
              onValueChange={(val) => {
                setSelectedProjectId(val === "all" ? null : Number(val));
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="All projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projectOptions.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {viewMode === "missions" ? (
            <Button onClick={openNewMission} className="gap-1.5 shadow-sm">
              <Plus size={15} />
              <span>New Mission</span>
            </Button>
          ) : (
            <Button onClick={openCreate} className="gap-1.5 shadow-sm">
              <Plus size={15} />
              <span>New Task</span>
            </Button>
          )}
        </div>
      </div>

      {viewMode === "missions" ? (
        <div className="mt-6 flex flex-col gap-4">
          {loadingMissions && missions.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
              <Loader2 className="size-5 animate-spin" />
              <span className="text-sm">Loading autonomous missions…</span>
            </div>
          ) : missions.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-14 px-6 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
                <Target size={24} />
              </div>
              <h3 className="text-base font-semibold">No Autonomous Missions Found</h3>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                Set up a mission (e.g. Lead Generation &amp; Outreach, Feature Refactoring, or QA
                Sentinel). The Lead Strategist decomposes milestones, assembles specialist coworker
                bots, and keeps a persistent memory log in{" "}
                <code className="text-[11px] bg-muted px-1 py-0.5 rounded">
                  .soloman/missions/consensus.md
                </code>
                .
              </p>
              <Button onClick={openNewMission} className="mt-4 gap-1.5 shadow-sm">
                <Plus size={15} />
                <span>Create Mission</span>
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 max-w-4xl">
              {missions.map((m) => {
                const isBlocked = m.status === "BLOCKED";
                const isDone = m.status === "DONE";
                const isPlanning = m.status === "PLANNING";
                const percent =
                  m.totalMilestones > 0
                    ? Math.round((m.completedMilestones / m.totalMilestones) * 100)
                    : 0;

                return (
                  <div
                    key={`${m.projectId ?? "default"}:${m.slug}`}
                    className={cn(
                      "group rounded-xl border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-sm",
                      isBlocked && "border-amber-500/40 bg-amber-500/[0.02]",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "flex size-10 shrink-0 items-center justify-center rounded-lg border",
                            isBlocked
                              ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                              : isDone
                                ? "bg-green-500/10 text-green-500 border-green-500/20"
                                : isPlanning
                                  ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                                  : "bg-primary/10 text-primary border-primary/20",
                          )}
                        >
                          {isBlocked ? (
                            <ShieldAlert size={20} />
                          ) : isDone ? (
                            <CheckCircle2 size={20} />
                          ) : (
                            <Target size={20} />
                          )}
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold leading-none">{m.title}</h3>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[11px] font-medium uppercase tracking-wider",
                                m.status === "IN PROGRESS" &&
                                  "border-emerald-500/30 text-emerald-500 bg-emerald-500/10",
                                m.status === "BLOCKED" &&
                                  "border-amber-500/30 text-amber-500 bg-amber-500/10 animate-pulse",
                                m.status === "PLANNING" &&
                                  "border-blue-500/30 text-blue-500 bg-blue-500/10",
                                m.status === "DONE" &&
                                  "border-green-500/30 text-green-500 bg-green-500/10",
                                m.status === "PAUSED" && "text-muted-foreground border-border",
                                m.status === "ABORTED" && "text-destructive border-destructive/30",
                              )}
                            >
                              {m.status}
                            </Badge>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                            <Badge variant="secondary" className="gap-1 font-normal text-muted-foreground">
                              <Folder size={11} className="text-primary" />
                              <span className="font-medium text-foreground">
                                {m.projectName || "Default Workspace"}
                              </span>
                            </Badge>
                            {m.projectPath && (
                              <button
                                type="button"
                                className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground hover:underline transition-colors max-w-sm truncate"
                                title={`Open: ${m.missionDirPath || m.projectPath}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void ipc.system.openFilePath(m.missionDirPath || m.projectPath!);
                                }}
                              >
                                <FolderOpen size={11} className="shrink-0 text-primary" />
                                <span className="truncate">{m.missionDirPath || m.projectPath}</span>
                              </button>
                            )}
                          </div>
                          <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 max-w-2xl">
                            {m.objective}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {m.latestChatId != null && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate({ to: "/chat", search: { id: m.latestChatId! } });
                            }}
                            className="gap-1.5 text-xs h-8 text-primary border-primary/30 hover:bg-primary/10"
                            title="Open latest AI chat run"
                          >
                            <MessageSquare size={13} />
                            <span>AI Chat #{m.latestChatId}</span>
                          </Button>
                        )}

                        {m.artifactsCount != null && m.artifactsCount > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openMissionConsensus(m.slug, m.projectId, "artifacts")}
                            className="gap-1.5 text-xs h-8 text-muted-foreground hover:text-foreground"
                            title="View mission output reports & artifacts"
                          >
                            <FileText size={13} className="text-primary" />
                            <span>{m.artifactsCount} Reports</span>
                          </Button>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openMissionConsensus(m.slug, m.projectId)}
                          className="gap-1.5 text-xs h-8"
                        >
                          <FileText size={13} />
                          <span>Consensus</span>
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            m.status === "PAUSED" ||
                            m.status === "PLANNING" ||
                            m.status === "BLOCKED"
                              ? handleStartMission(m.slug, m.projectId)
                              : handleUpdateMissionStatus(m.slug, "PAUSED", m.projectId)
                          }
                          className="text-xs h-8"
                        >
                          {m.status === "PAUSED" ||
                          m.status === "PLANNING" ||
                          m.status === "BLOCKED" ? (
                            <Play size={13} className="text-emerald-500" />
                          ) : (
                            <Power size={13} className="text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Progress Bar & Milestones Indicator */}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              isDone ? "bg-green-500" : isBlocked ? "bg-amber-500" : "bg-primary",
                            )}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="font-medium text-foreground">
                          {m.completedMilestones}/{m.totalMilestones} Phases
                        </span>
                        <span className="text-muted-foreground">({percent}%)</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 text-[11px]">
                          <Users size={12} className="text-muted-foreground" />
                          <span>Manager: {m.manager}</span>
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Updated{" "}
                          {new Date(m.updatedAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Pending Approvals Warning Strip */}
                    {m.pendingApprovalsCount > 0 && (
                      <div className="mt-3 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                        <div className="flex items-center gap-2">
                          <ShieldAlert size={15} className="shrink-0 animate-bounce" />
                          <span>
                            <strong>Action Approval Required:</strong> An autonomous worker
                            requested permission for sensitive execution.
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openMissionConsensus(m.slug, m.projectId)}
                          className="h-7 text-xs border-amber-500/40 bg-background text-amber-600 dark:text-amber-300 hover:bg-amber-500/20"
                        >
                          Review Approval
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          {tasks.length === 0 ? (
            <div className="mt-12 flex flex-col items-center gap-3 text-center text-muted-foreground">
              <CalendarClock size={28} />
              <div>
                <p className="text-sm font-medium text-foreground">No tasks yet.</p>
                <p className="mt-1 text-xs">
                  Create a task to run a prompt now, on a schedule, or both — in any code or
                  codeless project.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-6 flex max-w-3xl flex-col gap-2">
              {tasks.map((task) => {
                const mcpNamesForTask = mcpNames(task.mcpServerIds);
                const isExpanded = expandedIds.has(task.id);
                const tokenTotal = tokenTotals[task.id];
                const tokensLoading = loadingTokenIds.has(task.id);
                return (
                  <div
                    key={task.id}
                    className={`rounded-lg border ${task.enabled ? "" : "opacity-70"}`}
                  >
                    <div className="flex items-center gap-2 p-2.5">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(task)}
                        aria-expanded={isExpanded}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left hover:bg-muted/60"
                      >
                        <ChevronDown
                          size={15}
                          className={`shrink-0 text-muted-foreground transition-transform ${
                            isExpanded ? "" : "-rotate-90"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">{task.title}</span>
                            <Badge
                              variant={task.enabled ? "default" : "secondary"}
                              className="shrink-0"
                            >
                              {task.enabled ? "Scheduled" : "Paused"}
                            </Badge>
                            {taskProjectKind(task) === "code" && (
                              <Badge variant="outline" className="shrink-0">
                                Code
                              </Badge>
                            )}
                            {taskProjectKind(task) === "codeless" && (
                              <Badge variant="outline" className="shrink-0">
                                Codeless
                              </Badge>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                            <span>{formatSchedule(task.scheduleMinutes)}</span>
                            <span>·</span>
                            <span>{formatRelativeTime(task.lastRunAt)}</span>
                          </div>
                        </div>
                      </button>

                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Run now"
                          onClick={() => handleRun(task.id)}
                        >
                          <Play size={15} />
                        </Button>
                        {task.lastChatId != null && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Open latest run"
                            onClick={() => openLatestRun(task)}
                          >
                            <ExternalLink size={15} />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          title={task.enabled ? "Pause" : "Resume"}
                          onClick={() => handleToggleEnabled(task, !task.enabled)}
                        >
                          <Power
                            size={15}
                            className={task.enabled ? "text-primary" : "text-muted-foreground"}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit"
                          onClick={() => openEdit(task)}
                        >
                          <Pencil size={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete"
                          onClick={() => handleDelete(task.id)}
                        >
                          <Trash2 size={15} className="text-destructive" />
                        </Button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="space-y-2 border-t px-4 py-3">
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                          {task.prompt}
                        </p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            Project:{" "}
                            <span className="font-medium text-foreground">
                              {taskProjectLabel(task) ?? "Default chat project"}
                            </span>
                          </span>
                          {mcpNamesForTask.length > 0 && (
                            <span>
                              Tools:{" "}
                              <span className="font-medium text-foreground">
                                {mcpNamesForTask.join(", ")}
                              </span>
                            </span>
                          )}
                          <span>
                            Tokens:{" "}
                            <span className="font-medium text-foreground">
                              {tokensLoading ? "Loading…" : (tokenTotal ?? 0).toLocaleString()}
                            </span>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {totalCount > TASKS_PAGE_SIZE && (
                <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    {totalCount} task{totalCount === 1 ? "" : "s"} · Page {page} of {totalPages}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      title="Previous page"
                    >
                      <ChevronLeft size={15} />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      title="Next page"
                    >
                      <ChevronRight size={15} />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTask ? "Edit task" : "New task"}</DialogTitle>
            <DialogDescription>
              Configure what runs, when, where, and with which tools.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-title">Title</Label>
              <Input
                id="task-title"
                value={form.title}
                onChange={(e) => patch({ title: e.target.value })}
                placeholder="e.g. Weekly project summary"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-prompt">Prompt</Label>
              <Textarea
                id="task-prompt"
                rows={3}
                value={form.prompt}
                onChange={(e) => patch({ prompt: e.target.value })}
                placeholder="What should the agent do?"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Schedule</Label>
              <div className="grid grid-cols-3 gap-2">
                {PRESET_OPTIONS.map((opt) => {
                  const active = form.preset === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => patch({ preset: opt.value })}
                      className={cn(
                        "flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left text-sm transition-colors",
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
              {form.preset === "custom" && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={form.customMinutes}
                    onChange={(e) => patch({ customMinutes: e.target.value })}
                    placeholder="N"
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">minutes</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label>Target project</Label>
              <Select
                value={form.projectId}
                onValueChange={(value) => patch({ projectId: value ?? "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Default chat project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default chat project</SelectItem>
                  {codeProjects.length > 0 && (
                    <>
                      <SelectSeparator />
                      <SelectGroup>
                        <SelectLabel>Code projects</SelectLabel>
                        {codeProjects.map((opt) => (
                          <SelectItem key={opt.id} value={String(opt.id)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </>
                  )}
                  {chatProjects.length > 0 && (
                    <>
                      <SelectSeparator />
                      <SelectGroup>
                        <SelectLabel>Codeless projects</SelectLabel>
                        {chatProjects.map((opt) => (
                          <SelectItem key={opt.id} value={String(opt.id)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            {isCodelessSelected && (
              <div className="flex flex-col gap-2 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FolderOpen size={15} className="text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">Workspace folder</div>
                      <div className="text-xs text-muted-foreground">
                        Read &amp; write Markdown docs here for context.
                      </div>
                    </div>
                  </div>
                </div>
                {selectedProject.directory ? (
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1 text-xs">
                      {selectedProject.directory}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={directoryBusy}
                      onClick={clearDirectory}
                      title="Clear folder"
                    >
                      <X size={14} />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={directoryBusy}
                    onClick={chooseDirectory}
                    className="self-start"
                  >
                    {directoryBusy ? (
                      <Loader2 size={14} className="mr-2 animate-spin" />
                    ) : (
                      <FolderOpen size={14} className="mr-2" />
                    )}
                    Choose folder
                  </Button>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label>Model</Label>
              <Select
                value={form.modelSelection}
                onValueChange={(value) => patch({ modelSelection: value ?? "" })}
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
                <div className="flex flex-col gap-2 rounded-md border p-3">
                  {mcpServers.map((server) => (
                    <label
                      key={server.id}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={form.mcpServerIds.has(server.id)}
                        onCheckedChange={(checked) => {
                          const next = new Set(form.mcpServerIds);
                          if (checked) {
                            next.add(server.id);
                          } else {
                            next.delete(server.id);
                          }
                          patch({ mcpServerIds: next });
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

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Enabled</div>
                <div className="text-xs text-muted-foreground">
                  Recurring tasks only run while enabled. Manual tasks can still be run on demand.
                </div>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={(checked) => patch({ enabled: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>{editingTask ? "Save changes" : "Create task"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Autonomous Mission Dialog */}
      <Dialog open={newMissionOpen} onOpenChange={setNewMissionOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Autonomous Mission</DialogTitle>
            <DialogDescription>
              Define the objective and supporting context. The Lead Strategist will plan phases,
              stage specialized coworker bots, and log state to consensus.md.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2 text-xs">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Project context</Label>
              <Select
                value={missionForm.projectId == null ? "default" : String(missionForm.projectId)}
                onValueChange={(value) =>
                  setMissionForm((form) => ({
                    ...form,
                    projectId: value === "default" ? null : Number(value),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Default workspace" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default workspace</SelectItem>
                  {projectOptions.map((project) => (
                    <SelectItem key={project.id} value={String(project.id)}>
                      {project.label} ({project.type === "chat" ? "docs" : "code"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Workers receive this project’s files and can use paths below as supporting context.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Mission Title</Label>
              <Input
                value={missionForm.title}
                onChange={(e) => setMissionForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. B2B Lead Generation & Outreach, Onboarding UX Overhaul"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Objective & Strategy Scope</Label>
              <Textarea
                value={missionForm.objective}
                onChange={(e) => setMissionForm((f) => ({ ...f, objective: e.target.value }))}
                placeholder="Detail what the team should achieve, required methodologies, and quality criteria…"
                rows={4}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">
                Supporting Context & Docs{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                value={missionForm.context}
                onChange={(e) => setMissionForm((f) => ({ ...f, context: e.target.value }))}
                placeholder={"One path, URL, or note per line\ne.g. docs/market-analysis.md"}
                rows={3}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">
                Expected Deliverables{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                value={missionForm.deliverables}
                onChange={(e) => setMissionForm((f) => ({ ...f, deliverables: e.target.value }))}
                placeholder={"One expected outcome per line\ne.g. 50 verified leads"}
                rows={3}
              />
            </div>

            <div className="rounded-xl border bg-muted/20 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-foreground">Approval gates</div>
                  <div className="text-[11px] text-muted-foreground">
                    Workers pause before sensitive actions and notify connected mobile clients.
                  </div>
                </div>
                <Switch
                  checked={missionForm.hitlEnabled}
                  onCheckedChange={(checked) =>
                    setMissionForm((form) => ({ ...form, hitlEnabled: checked }))
                  }
                />
              </div>
              {missionForm.hitlEnabled && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    ["hitlExternalCommunication", "Email & public messages"],
                    ["hitlGitPush", "Git pushes"],
                    ["hitlFinancialSpend", "Paid actions"],
                    ["hitlDestructiveFs", "Destructive changes"],
                  ].map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2"
                    >
                      <Checkbox
                        checked={Boolean(missionForm[key as keyof typeof missionForm])}
                        onCheckedChange={(checked) =>
                          setMissionForm((form) => ({ ...form, [key]: checked === true }))
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" size="sm" onClick={() => setNewMissionOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateMission}>
              Launch Mission
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mission Consensus Ledger Dialog */}
      <Dialog open={consensusModalOpen} onOpenChange={setConsensusModalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {activeConsensus && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center justify-between gap-2 pr-4">
                  <DialogTitle className="text-lg">{activeConsensus.title}</DialogTitle>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-medium uppercase tracking-wider",
                      activeConsensus.status === "IN PROGRESS" &&
                        "border-emerald-500/30 text-emerald-500 bg-emerald-500/10",
                      activeConsensus.status === "BLOCKED" &&
                        "border-amber-500/30 text-amber-500 bg-amber-500/10 animate-pulse",
                      activeConsensus.status === "PLANNING" &&
                        "border-blue-500/30 text-blue-500 bg-blue-500/10",
                      activeConsensus.status === "DONE" &&
                        "border-green-500/30 text-green-500 bg-green-500/10",
                      activeConsensus.status === "PAUSED" && "text-muted-foreground border-border",
                      activeConsensus.status === "ABORTED" &&
                        "text-destructive border-destructive/30",
                    )}
                  >
                    {activeConsensus.status}
                  </Badge>
                </div>

                {/* Workspace Execution Location Banner */}
                <div className="mt-2 rounded-lg border bg-muted/40 p-2.5 text-xs space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Folder size={14} className="text-primary" />
                      <span className="font-semibold text-foreground text-xs">
                        Workspace: {activeConsensus.projectName || "Default Workspace"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[11px] gap-1 px-2"
                        onClick={() => {
                          const target =
                            activeConsensus.missionDirPath || activeConsensus.projectPath;
                          if (target) void ipc.system.openFilePath(target);
                        }}
                      >
                        <FolderOpen size={11} />
                        <span>Open Folder</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[11px] gap-1 px-2"
                        onClick={() => {
                          const target =
                            activeConsensus.missionDirPath || activeConsensus.projectPath || "";
                          navigator.clipboard.writeText(target);
                          showSuccess("Workspace path copied");
                        }}
                      >
                        <Copy size={11} />
                        <span>Copy Path</span>
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
                    <span className="text-muted-foreground/70">Location:</span>
                    <span className="truncate select-all">
                      {activeConsensus.missionDirPath || activeConsensus.projectPath}
                    </span>
                  </div>
                </div>
              </DialogHeader>

              <Tabs
                value={consensusActiveTab}
                onValueChange={setConsensusActiveTab}
                className="w-full mt-2"
              >
                <TabsList className="grid grid-cols-5 w-full h-8 text-xs">
                  <TabsTrigger value="overview" className="text-xs">
                    Milestones
                  </TabsTrigger>
                  <TabsTrigger value="chats" className="text-xs">
                    AI Chats ({activeConsensus.chatRuns?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="artifacts" className="text-xs">
                    Output Reports ({activeConsensus.artifacts?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="team" className="text-xs">
                    Team
                  </TabsTrigger>
                  <TabsTrigger value="ledger" className="text-xs">
                    Ledger &amp; Log
                  </TabsTrigger>
                </TabsList>

                {/* Tab 1: Milestones & Progress */}
                <TabsContent value="overview" className="space-y-4 py-2 text-xs">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-lg border p-3">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Active command
                      </div>
                      <div className="mt-1 font-semibold">
                        {activeConsensus.activeBot || "Awaiting dispatch"}
                      </div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Next milestone
                      </div>
                      <div className="mt-1 font-mono text-[11px]">
                        {activeConsensus.nextMilestoneId || "Complete"}
                      </div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Human gates
                      </div>
                      <div className="mt-1 font-semibold">
                        {activeConsensus.hitlPolicy.enabled ? "Enabled" : "Disabled"}
                      </div>
                    </div>
                  </div>

                  {/* Objective */}
                  <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
                    <div className="font-semibold text-foreground">Objective</div>
                    <p className="text-muted-foreground leading-relaxed">
                      {activeConsensus.objective}
                    </p>
                  </div>

                  {/* Pending Approvals (HITL Section) */}
                  {activeConsensus.approvalsPending.filter((a) => a.status === "pending").length >
                    0 && (
                    <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.04] p-4 space-y-3">
                      <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
                        <ShieldAlert size={16} />
                        <span>Pending Human-in-the-Loop Approvals</span>
                      </div>

                      <div className="space-y-2">
                        {activeConsensus.approvalsPending
                          .filter((a) => a.status === "pending")
                          .map((approval) => (
                            <div
                              key={approval.id}
                              className="rounded-lg border bg-background p-3 space-y-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <span className="font-medium text-foreground">
                                    {approval.summary}
                                  </span>
                                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                                    <span>
                                      Bot: <strong>🤖 {approval.requestingBot}</strong>
                                    </span>
                                    <span>·</span>
                                    <span>
                                      Tool: <code className="text-primary">{approval.tool}</code>
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      handleApproveAction(
                                        activeConsensus.slug,
                                        approval.id,
                                        "rejected",
                                      )
                                    }
                                    className="h-7 text-xs text-destructive hover:bg-destructive/10"
                                  >
                                    Reject
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      handleApproveAction(
                                        activeConsensus.slug,
                                        approval.id,
                                        "approved",
                                      )
                                    }
                                    className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                  >
                                    Approve
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Milestones & Progress */}
                  <div>
                    <div className="font-semibold text-foreground mb-1.5">
                      Milestones &amp; Responsibilities
                    </div>
                    <div className="space-y-2">
                      {activeConsensus.milestones.map((m) => (
                        <div
                          key={m.id}
                          className="rounded border bg-card p-2.5 text-xs space-y-1.5 transition-colors hover:border-primary/30"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {m.status === "done" ? (
                                <CheckCircle2 size={15} className="text-green-500 shrink-0" />
                              ) : m.status === "in_progress" ? (
                                <Loader2 size={15} className="animate-spin text-primary shrink-0" />
                              ) : (
                                <span className="size-3.5 rounded-full border border-muted-foreground/40 shrink-0" />
                              )}
                              <span
                                className={cn(
                                  "font-medium truncate",
                                  m.status === "done"
                                    ? "line-through text-muted-foreground"
                                    : "text-foreground",
                                )}
                              >
                                {m.title}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {m.botName && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] gap-1 text-primary border-primary/30"
                                >
                                  <span>🤖</span>
                                  <span>{m.botName}</span>
                                </Badge>
                              )}

                              {m.chatId != null && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[11px] gap-1 text-primary border-primary/40 hover:bg-primary/10"
                                  onClick={() =>
                                    navigate({ to: "/chat", search: { id: m.chatId! } })
                                  }
                                >
                                  <MessageSquare size={11} />
                                  <span>Chat #{m.chatId}</span>
                                  <ExternalLink size={10} />
                                </Button>
                              )}
                            </div>
                          </div>

                          {m.summary && (
                            <div className="rounded bg-muted/30 p-2 text-[11px] text-muted-foreground font-mono whitespace-pre-wrap max-h-24 overflow-y-auto">
                              {m.summary}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                {/* Tab 2: AI Chat Histories */}
                <TabsContent value="chats" className="space-y-3 py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-foreground">
                        AI Execution &amp; Chat Histories
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Full conversational turns and tool activities executed by specialist bots.
                      </div>
                    </div>
                  </div>

                  {!activeConsensus.chatRuns || activeConsensus.chatRuns.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                      <MessageSquare className="size-8 mx-auto mb-2 opacity-40 text-primary" />
                      <p className="font-medium text-foreground">No AI Chat Histories Yet</p>
                      <p className="text-[11px] mt-1">
                        When the mission is started, each milestone dispatches an AI worker turn
                        that creates a tracked chat session.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                      {activeConsensus.chatRuns.map((run) => (
                        <div
                          key={run.chatId}
                          className="rounded-lg border bg-card p-3 space-y-2 hover:border-primary/40 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className="text-xs font-semibold text-primary border-primary/30"
                              >
                                🤖 {run.botName}
                              </Badge>
                              <span className="font-medium text-foreground text-xs">
                                {run.milestoneTitle}
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1.5 text-primary border-primary/40 hover:bg-primary/10 font-medium"
                              onClick={() =>
                                navigate({ to: "/chat", search: { id: run.chatId } })
                              }
                            >
                              <MessageSquare size={13} />
                              <span>Open Chat #{run.chatId}</span>
                              <ExternalLink size={11} />
                            </Button>
                          </div>

                          {run.lastRunAt && (
                            <div className="text-[11px] text-muted-foreground">
                              Executed on {new Date(run.lastRunAt).toLocaleString()}
                            </div>
                          )}

                          {run.summary && (
                            <div className="rounded bg-muted/30 p-2 text-[11px] text-muted-foreground font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                              {run.summary}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Tab 3: Output Reports & Artifacts */}
                <TabsContent value="artifacts" className="space-y-3 py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-foreground">
                        Mission Output Reports &amp; Deliverables
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Saved artifacts, reports, certifications, and datasets generated by
                        autonomous bots.
                      </div>
                    </div>
                    {activeConsensus.missionDirPath && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() =>
                          void ipc.system.openFilePath(
                            `${activeConsensus.missionDirPath}/artifacts`,
                          )
                        }
                      >
                        <FolderOpen size={12} />
                        <span>Open Artifacts Dir</span>
                      </Button>
                    )}
                  </div>

                  {!activeConsensus.artifacts || activeConsensus.artifacts.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                      <FileText className="size-8 mx-auto mb-2 opacity-40 text-primary" />
                      <p className="font-medium text-foreground">No Output Reports Generated Yet</p>
                      <p className="text-[11px] mt-1">
                        Artifacts such as QA certifications, outreach proposals, and leads will
                        appear here as specialist workers finish their phases.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                      {activeConsensus.artifacts.map((art) => (
                        <div
                          key={art.relativePath}
                          className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 hover:border-primary/40 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              {art.isReport ? <FileText size={18} /> : <FileCode size={18} />}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground text-xs truncate">
                                  {art.name}
                                </span>
                                {art.isReport && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                  >
                                    Report
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                                <span>{(art.size / 1024).toFixed(1)} KB</span>
                                <span>·</span>
                                <span>
                                  {new Date(art.updatedAt).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                                <span>·</span>
                                <span className="font-mono text-[10px] truncate max-w-xs">
                                  {art.relativePath}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1 text-primary hover:bg-primary/10 font-medium"
                              onClick={() =>
                                openArtifact(
                                  art,
                                  activeConsensus.projectId,
                                  activeConsensus.slug,
                                )
                              }
                            >
                              <Eye size={12} />
                              <span>View</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs gap-1"
                              title="Open in system editor"
                              onClick={() => void ipc.system.openFilePath(art.fullPath)}
                            >
                              <ExternalLink size={12} />
                              <span>Open</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs gap-1 px-2"
                              title="Show in folder"
                              onClick={() => void ipc.system.showItemInFolder(art.fullPath)}
                            >
                              <FolderOpen size={12} />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Tab 4: Team */}
                <TabsContent value="team" className="space-y-4 py-2 text-xs">
                  <div>
                    <div className="font-semibold text-foreground mb-1.5">
                      Specialized Worker Team
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {activeConsensus.teamRoster.map((r) => (
                        <div key={r.name} className="rounded border bg-card p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground">🤖 {r.name}</span>
                            <span className="text-[10px] text-muted-foreground capitalize">
                              {r.role}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">{r.responsibilities}</p>
                          {r.mcpTools && r.mcpTools.length > 0 && (
                            <div className="text-[10px] text-primary/80 pt-0.5">
                              MCPs: {r.mcpTools.join(", ")}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                {/* Tab 5: Ledger & Decisions */}
                <TabsContent value="ledger" className="space-y-4 py-2 text-xs">
                  {/* Consensus Decisions */}
                  {activeConsensus.decisions.length > 0 && (
                    <div>
                      <div className="font-semibold text-foreground mb-1">
                        Consensus Decisions Log
                      </div>
                      <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                        {activeConsensus.decisions.map((d, idx) => (
                          <li key={idx}>{d}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Execution Ledger & History */}
                  <div>
                    <div className="font-semibold text-foreground mb-1">
                      Execution Ledger &amp; History
                    </div>
                    <div className="max-h-60 overflow-y-auto rounded border bg-muted/20 p-2.5 font-mono text-[10px] space-y-1 text-muted-foreground">
                      {activeConsensus.history.map((h, idx) => (
                        <div key={idx} className="leading-relaxed">
                          {h}
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <DialogFooter className="pt-2">
                <Button variant="outline" size="sm" onClick={() => setConsensusModalOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Artifact Preview Dialog */}
      <Dialog open={artifactModalOpen} onOpenChange={setArtifactModalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {viewingArtifact && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center justify-between gap-2 pr-4">
                  <div className="flex items-center gap-2">
                    <FileText className="text-primary size-5" />
                    <DialogTitle className="text-base font-mono">
                      {viewingArtifact.name}
                    </DialogTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => {
                        if (artifactContent) {
                          navigator.clipboard.writeText(artifactContent);
                          showSuccess("Artifact content copied to clipboard");
                        }
                      }}
                    >
                      <Copy size={12} />
                      <span>Copy</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => void ipc.system.openFilePath(viewingArtifact.fullPath)}
                    >
                      <ExternalLink size={12} />
                      <span>Open in Editor</span>
                    </Button>
                  </div>
                </div>
                <DialogDescription className="font-mono text-[11px] truncate">
                  {viewingArtifact.fullPath}
                </DialogDescription>
              </DialogHeader>

              <div className="py-2">
                {loadingArtifact ? (
                  <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                    <Loader2 className="size-5 animate-spin" />
                    <span className="text-xs">Loading report content…</span>
                  </div>
                ) : (
                  <div className="rounded-lg border bg-muted/20 p-4 font-mono text-xs whitespace-pre-wrap max-h-[60vh] overflow-y-auto leading-relaxed select-text">
                    {artifactContent || "(Empty file)"}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setArtifactModalOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
