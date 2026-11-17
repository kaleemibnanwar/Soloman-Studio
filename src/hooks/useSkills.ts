import { useQuery } from "@tanstack/react-query";
import { ipc } from "@/ipc/types";
import { queryKeys } from "@/lib/queryKeys";

export function useSkills() {
  const listQuery = useQuery({
    queryKey: queryKeys.skills.list,
    queryFn: async () => (await ipc.skill.listSkills()).skills,
    meta: { showErrorToast: true },
  });

  return {
    skills: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    error: listQuery.error,
  };
}
