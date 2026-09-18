import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The app's standard section/page header: an optional mono-caps eyebrow over
 * the title, an optional trailing action, and an optional top hairline for
 * separating stacked sections — hierarchy comes from the rule, not a shadow.
 */
export function SectionHeading({
  as,
  eyebrow,
  title,
  action,
  hairline = false,
  size = "section",
  className,
}: {
  as?: ElementType;
  eyebrow?: string;
  title: ReactNode;
  action?: ReactNode;
  hairline?: boolean;
  size?: "page" | "section";
  className?: string;
}) {
  const Heading = as ?? (size === "page" ? "h1" : "h2");

  return (
    <div
      className={cn(
        "flex items-end justify-between gap-3",
        hairline && "border-t border-border pt-8",
        className,
      )}
    >
      <div>
        {eyebrow && (
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <Heading
          className={cn(
            eyebrow && "mt-1",
            size === "page"
              ? "text-3xl font-bold text-foreground"
              : "text-lg font-semibold text-foreground",
          )}
        >
          {title}
        </Heading>
      </div>
      {action}
    </div>
  );
}
