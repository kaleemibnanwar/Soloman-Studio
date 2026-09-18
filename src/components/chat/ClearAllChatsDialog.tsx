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
import { useTranslation } from "react-i18next";

interface ClearAllChatsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmClear: () => void;
  appName: string;
  chatCount: number;
}

export function ClearAllChatsDialog({
  isOpen,
  onOpenChange,
  onConfirmClear,
  appName,
  chatCount,
}: ClearAllChatsDialogProps) {
  const { t } = useTranslation("chat");
  const { t: tc } = useTranslation("common");

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("clearAllChats")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("clearAllChatsConfirmation", {
              name: appName,
              count: chatCount,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirmClear}
            className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:text-white dark:hover:bg-red-700"
          >
            {t("clearAllChats")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
