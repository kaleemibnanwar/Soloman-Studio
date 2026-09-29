import { useState } from "react";
import { Bot, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgentTasks } from "@/hooks/useAgentTasks";
import type { AgentTaskSnapshot } from "@/ipc/types/agent_task";

const ROLE_LABELS: Record<string, string> = {
  explorer: "Explorer",
  executor: "Executor",
  tester: "Tester",
  debugger: "Debugger",
  reviewer: "Reviewer",
  architect: "Architect",
  verifier: "Verifier",
};

const STATUS_STYLES: Record<string, string> = {
  running: "border-primary/30 bg-primary/10 text-primary",
  pending: "border-primary/30 bg-primary/10 text-primary",
  completed: "border-border bg-muted text-muted-foreground",
  partial: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  blocked: "border-destructive/30 bg-destructive/10 text-destructive",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
};

function formatUsd(cost: number | null): string {
  if (cost == null) return "—";
  return cost < 0.0001 ? "<$0.0001" : `$${cost.toFixed(4)}`;
}

/**
 * Collapsible transparency panel for the sub-agent orchestration in a chat:
 * how many subtasks ran, their status, which model tier handled each, and the
 * attributed token/cost spend. Sits next to the composer so it's visible
 * during a run without opening a separate drawer.
 */
export function AgentTaskSummary({ chatId }: { chatId: number | undefined }) {
  const tasks = useAgentTasks(chatId);
  const [expanded, setExpanded] = useState(false);

  if (tasks.length === 0) return null;

  const totalCost = tasks.reduce((sum, t) => sum + (t.costUsd ?? 0), 0);
  const hasCost = tasks.some((t) => t.costUsd != null);
  const activeCount = tasks.filter((t) => t.status === "running" || t.status === "pending").length;

  return (
    <div data-testid="agent-task-summary" className="border-b border-border bg-muted/30 text-xs">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0 flex-1 text-muted-foreground">
          <Bot className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">
            {tasks.length} subtask{tasks.length === 1 ? "" : "s"}
            {activeCount > 0 && ` · ${activeCount} running`}
          </span>
        </span>
        <span className="flex items-center gap-2 flex-shrink-0">
          {hasCost && (
            <span className="tabular-nums text-muted-foreground">{formatUsd(totalCost)}</span>
          )}
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </span>
      </button>

      {expanded && (
        <ul className="px-3 pb-2 space-y-1">
          {tasks.map((task) => (
            <AgentTaskRow key={task.id} task={task} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AgentTaskRow({ task }: { task: AgentTaskSnapshot }) {
  const statusStyle = STATUS_STYLES[task.status] ?? STATUS_STYLES.completed;
  const active = task.status === "running" || task.status === "pending";
  const tokens =
    task.inputTokens != null || task.outputTokens != null
      ? `${task.inputTokens ?? 0}+${task.outputTokens ?? 0}`
      : null;

  return (
    <li className="flex items-center gap-2 py-0.5" title={task.notes ?? task.description}>
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full flex-shrink-0",
          active && "bg-primary animate-pulse",
          task.status === "completed" && "bg-muted-foreground",
          task.status === "partial" && "bg-amber-500",
          (task.status === "blocked" || task.status === "failed") && "bg-destructive",
        )}
      />
      <span className="font-medium flex-shrink-0">{ROLE_LABELS[task.role] ?? task.role}</span>
      <span
        className={cn(
          "inline-flex items-center rounded border px-1.5 py-px flex-shrink-0",
          statusStyle,
        )}
      >
        {task.status}
      </span>
      {task.cached && <span className="text-muted-foreground flex-shrink-0">cached</span>}
      <span className="text-muted-foreground truncate min-w-0 flex-1">{task.description}</span>
      {tokens && (
        <span className="tabular-nums text-muted-foreground flex-shrink-0">{tokens}tok</span>
      )}
      <span className="tabular-nums text-muted-foreground flex-shrink-0 w-16 text-right">
        {formatUsd(task.costUsd)}
      </span>
    </li>
  );
}
