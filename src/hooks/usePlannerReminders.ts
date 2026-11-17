import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ipc } from "@/ipc/types";
import { queryKeys } from "@/lib/queryKeys";

const REMINDER_WINDOWS = [
  { key: "hour", milliseconds: 60 * 60_000, label: "due in one hour" },
  { key: "five", milliseconds: 5 * 60_000, label: "due in five minutes" },
] as const;

/**
 * Delivers desktop reminders while Soloman Studio is running. Sent markers are
 * stored per due-date, so editing a deadline schedules a fresh pair of alerts.
 */
export function usePlannerReminders() {
  const { data: tasks = [] } = useQuery({
    queryKey: queryKeys.planner.list({}),
    queryFn: () => ipc.planner.listTasks({}),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (
      typeof window.Notification === "undefined" ||
      window.Notification.permission !== "granted"
    ) {
      return;
    }

    const now = Date.now();
    for (const task of tasks) {
      if (!task.dueAt || task.status === "done") continue;
      const remaining = task.dueAt.getTime() - now;
      for (const reminder of REMINDER_WINDOWS) {
        // A 90-second window tolerates renderer suspension and the 30-second poll.
        if (remaining > reminder.milliseconds || remaining < reminder.milliseconds - 90_000) {
          continue;
        }
        const marker = `planner-reminder:${task.id}:${task.dueAt.toISOString()}:${reminder.key}`;
        if (window.localStorage.getItem(marker)) continue;
        new window.Notification(task.title, {
          body: `Planner task ${reminder.label}.`,
          tag: marker,
        });
        window.localStorage.setItem(marker, "sent");
      }
    }
  }, [tasks]);
}
