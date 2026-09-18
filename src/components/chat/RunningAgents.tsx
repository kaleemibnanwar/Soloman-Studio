import { cn } from "@/lib/utils";
import { useRunningAgents } from "@/hooks/useRunningAgents";

const ROLE_LABELS: Record<string, string> = {
  explorer: "Explorer",
  coder: "Coder",
  tester: "Tester",
  debugger: "Debugger",
  reviewer: "Reviewer",
};

/**
 * Compact, token-consistent list of the sub-agents currently running for a chat.
 * Rendered inside the composer so the user can see parallel work as it happens.
 */
export function RunningAgents({ chatId }: { chatId: number | undefined }) {
  const tasks = useRunningAgents(chatId);
  if (tasks.length === 0) return null;

  return (
    <div
      data-testid="running-agents"
      className="flex flex-wrap items-center gap-1.5 px-3 pt-2"
    >
      {tasks.map((task) => {
        const active = task.status === "running" || task.status === "pending";
        return (
          <span
            key={task.id}
            title={task.description}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs",
              active
                ? "border-primary/30 bg-primary/10 text-primary"
                : task.status === "failed"
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-border bg-muted text-muted-foreground",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                active && "bg-primary animate-pulse",
                task.status === "completed" && "bg-muted-foreground",
                task.status === "failed" && "bg-destructive",
              )}
            />
            {ROLE_LABELS[task.role] ?? task.role}
          </span>
        );
      })}
    </div>
  );
}
