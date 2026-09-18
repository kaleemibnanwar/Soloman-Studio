import { useCallback, useEffect, useState } from "react";
import { ipc } from "@/ipc/types";
import type { WorkerProposal } from "@/ipc/types/worker_proposal";

const POLL_INTERVAL_MS = 2500;

/** Pending + resolved proposals for the Approval Queue, polled while mounted. */
export function useWorkerProposals(projectId?: number) {
  const [proposals, setProposals] = useState<WorkerProposal[]>([]);

  const load = useCallback(async () => {
    try {
      setProposals(await ipc.workerProposal.listProposals({ projectId }));
    } catch {
      // Non-fatal: keep the last snapshot.
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  return { proposals, reload: load };
}
