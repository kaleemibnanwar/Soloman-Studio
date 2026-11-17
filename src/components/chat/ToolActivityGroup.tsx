import type { ReactNode } from "react";
import { CheckCircle2, CircleX, Loader2, Wrench } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface ToolActivityGroupProps {
  total: number;
  completed: number;
  failed: number;
  running: number;
  children: ReactNode;
}

export function ToolActivityGroup({
  total,
  completed,
  failed,
  running,
  children,
}: ToolActivityGroupProps) {
  const countLabel = `${total} ${total === 1 ? "call" : "calls"}`;

  return (
    <Accordion className="not-prose my-2" data-testid="tool-activity-group">
      <AccordionItem
        value="tool-activity"
        className="overflow-hidden rounded-xl border border-border/60 bg-(--background-lightest)"
      >
        <AccordionTrigger className="min-h-11 items-center px-3 py-2.5 hover:no-underline [&>svg]:translate-y-0">
          <span className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
              <Wrench className="size-3.5" />
            </span>
            <span className="min-w-0 text-sm font-medium text-foreground">Tool activity</span>
            <span className="shrink-0 rounded-full bg-muted/60 px-2 py-0.5 font-mono text-[11px] font-normal text-muted-foreground ring-1 ring-inset ring-border/60">
              {countLabel}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-3 pr-1 text-[11px] font-normal text-muted-foreground">
              {running > 0 && (
                <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                  {running} running
                </span>
              )}
              {failed > 0 && (
                <span className="flex items-center gap-1 text-destructive">
                  <CircleX className="size-3" aria-hidden="true" />
                  {failed} failed
                </span>
              )}
              {running === 0 && failed === 0 && completed > 0 && (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-3" aria-hidden="true" />
                  Completed
                </span>
              )}
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="border-t border-border/50 px-2 pt-1.5 pb-2">
          <div className="scrollbar-on-hover max-h-[min(50vh,32rem)] overflow-y-auto pr-1">
            {children}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
