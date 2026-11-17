import { useEffect, useState } from "react";
import { ipc } from "@/ipc/types";
import type { AgentTaskSnapshot } from "@/ipc/types/agent_task";

const POLL_INTERVAL_MS = 1000;

/**
 * Sub-agent tasks for a chat, polled while any are still in flight (so the
 * composer's status list stays live during a run and stops polling once done).
 */
export function useRunningAgents(chatId: number | undefined): AgentTaskSnapshot[] {
  const [tasks, setTasks] = useState<AgentTaskSnapshot[]>([]);

  useEffect(() => {
    if (chatId == null) {
      setTasks([]);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const load = async () => {
      try {
        const result = await ipc.agentTask.listForChat({ chatId });
        if (cancelled) return;
        setTasks(result.filter((t) => t.status === "running" || t.status === "pending"));
        const stillActive = result.some(
          (task) => task.status === "running" || task.status === "pending",
        );
        if (!stillActive && timer) {
          clearInterval(timer);
          timer = undefined;
        }
      } catch {
        // Non-fatal: keep the last known snapshot.
      }
    };

    void load();
    timer = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [chatId]);

  return tasks;
}
