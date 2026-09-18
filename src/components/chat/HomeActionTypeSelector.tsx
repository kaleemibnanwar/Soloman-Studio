import { useAtom } from "jotai";
import {
  MessageCircle,
  Lightbulb,
  FolderPlus,
  CheckIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { homeActionTypeAtom, type HomeActionType } from "@/atoms/chatAtoms";

const OPTIONS: {
  value: HomeActionType;
  label: string;
  icon: typeof MessageCircle;
}[] = [
  { value: "chat", label: "Chat", icon: MessageCircle },
  { value: "research", label: "Research", icon: Lightbulb },
  { value: "chatProject", label: "Chat project", icon: FolderPlus },
];

/** What the home composer does with the prompt on submit. */
export function HomeActionTypeSelector() {
  const [actionType, setActionType] = useAtom(homeActionTypeAtom);
  const current = OPTIONS.find((o) => o.value === actionType) ?? OPTIONS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center justify-center whitespace-nowrap rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border-none bg-transparent shadow-none text-foreground/80 hover:text-foreground hover:bg-muted/60 h-7 max-w-[220px] px-2 gap-1.5 cursor-pointer"
        data-testid="home-action-type-selector"
        title={current.label}
      >
        <current.icon className="size-3.5 text-primary" />
        <span className="truncate">{current.label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48" align="start">
        {OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => setActionType(opt.value)}
          >
            <opt.icon className="size-3.5" />
            <span>{opt.label}</span>
            {opt.value === actionType && (
              <CheckIcon className="ml-auto size-3.5 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
