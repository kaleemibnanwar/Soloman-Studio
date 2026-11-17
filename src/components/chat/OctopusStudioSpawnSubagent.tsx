import React, { useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  AlertTriangle,
  CircleX,
  Cpu,
  Coins,
  FileText,
  ChevronDown,
  ChevronRight,
  Code2,
  Sparkles,
} from "lucide-react";
import { CodeHighlight } from "./CodeHighlight";
import {
  OctopusStudioCard,
  OctopusStudioCardHeader,
  OctopusStudioBadge,
  OctopusStudioExpandIcon,
  OctopusStudioCardContent,
  OctopusStudioStateIndicator,
} from "./OctopusStudioCardPrimitives";
import { CustomTagState } from "./stateTypes";

interface OctopusStudioSpawnSubagentProps {
  children?: React.ReactNode;
  resultContent?: string;
  state?: CustomTagState;
  isError?: boolean;
}

interface SubagentConfig {
  description: string;
  role: string;
  allowedFiles?: string[];
  context?: string;
  prettyRaw: string;
}

function parseSubagentConfig(raw: string): SubagentConfig {
  try {
    const config = JSON.parse(raw);
    return {
      description: config.description || "Executing sub-task...",
      role: config.role || "executor",
      allowedFiles: config.allowed_files || config.allowedFiles,
      context: config.context,
      prettyRaw: JSON.stringify(config, null, 2),
    };
  } catch {
    return {
      description: "Executing sub-task...",
      role: "executor",
      prettyRaw: raw,
    };
  }
}

interface ParsedSubagentResult {
  isStructured: boolean;
  status?: "complete" | "partial" | "blocked" | string;
  resultText?: string;
  errorText?: string;
  notes?: string;
  model?: string;
  tier?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  actionsTaken?: Array<{
    toolName: string;
    args?: Record<string, unknown>;
    result?: unknown;
  }>;
  rawJson: string;
}

function parseSubagentResult(raw: string): ParsedSubagentResult {
  if (!raw || typeof raw !== "string") {
    return { isStructured: false, rawJson: "" };
  }
  const trimmed = raw.trim();
  try {
    const data = JSON.parse(trimmed);
    if (
      data &&
      typeof data === "object" &&
      ("status" in data || "outputs" in data || "notes" in data || "taskId" in data)
    ) {
      const outputs = data.outputs;
      let resultText: string | undefined;
      let errorText: string | undefined;

      if (outputs) {
        if (typeof outputs.result === "string") {
          resultText = outputs.result;
        } else if (typeof outputs === "string") {
          resultText = outputs;
        } else if (outputs.error) {
          errorText = String(outputs.error);
        } else {
          resultText = JSON.stringify(outputs, null, 2);
        }
      }

      return {
        isStructured: true,
        status: data.status,
        resultText,
        errorText: errorText || (data.status === "blocked" ? data.notes : undefined),
        notes: data.notes,
        model: data.model,
        tier: data.tier,
        inputTokens: typeof data.inputTokens === "number" ? data.inputTokens : undefined,
        outputTokens: typeof data.outputTokens === "number" ? data.outputTokens : undefined,
        costUsd: typeof data.costUsd === "number" ? data.costUsd : undefined,
        actionsTaken: Array.isArray(data.actionsTaken) ? data.actionsTaken : undefined,
        rawJson: JSON.stringify(data, null, 2),
      };
    }
  } catch {
    // Non-JSON output
  }
  return {
    isStructured: false,
    resultText: raw,
    rawJson: raw,
  };
}

export const OctopusStudioSpawnSubagent: React.FC<OctopusStudioSpawnSubagentProps> = ({
  children,
  resultContent,
  state,
  isError,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const merged = state !== undefined;
  const raw = typeof children === "string" ? children : String(children ?? "");

  const config = useMemo(() => parseSubagentConfig(raw), [raw]);
  const parsedResult = useMemo(
    () => (resultContent ? parseSubagentResult(resultContent) : null),
    [resultContent],
  );

  const statusBadge = useMemo(() => {
    if (!parsedResult?.status) return null;
    switch (parsedResult.status) {
      case "complete":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-200 dark:ring-emerald-800 font-medium">
            <CheckCircle2 size={12} className="text-emerald-600 dark:text-emerald-400" />
            Completed
          </span>
        );
      case "partial":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-200 dark:ring-amber-800 font-medium">
            <AlertTriangle size={12} className="text-amber-600 dark:text-amber-400" />
            Partial
          </span>
        );
      case "blocked":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 ring-1 ring-inset ring-red-200 dark:ring-red-800 font-medium">
            <CircleX size={12} className="text-red-600 dark:text-red-400" />
            Blocked
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground ring-1 ring-inset ring-border font-medium capitalize">
            {parsedResult.status}
          </span>
        );
    }
  }, [parsedResult?.status]);

  const totalTokens = useMemo(() => {
    if (parsedResult?.inputTokens !== undefined && parsedResult?.outputTokens !== undefined) {
      return parsedResult.inputTokens + parsedResult.outputTokens;
    }
    return null;
  }, [parsedResult?.inputTokens, parsedResult?.outputTokens]);

  return (
    <OctopusStudioCard
      accentColor="violet"
      state={state}
      isExpanded={expanded}
      onClick={() => setExpanded((v) => !v)}
    >
      <OctopusStudioCardHeader icon={<Bot size={15} />} accentColor="violet">
        <OctopusStudioBadge color="violet">Sub-Agent</OctopusStudioBadge>
        <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 ring-1 ring-inset ring-violet-200 dark:ring-violet-800 capitalize font-medium">
          {config.role}
        </span>
        <span className="flex-1 truncate text-xs text-muted-foreground mr-2 font-medium">
          {config.description}
        </span>

        {statusBadge}
        {merged && <OctopusStudioStateIndicator state={state} />}
        <OctopusStudioExpandIcon isExpanded={expanded} />
      </OctopusStudioCardHeader>

      <OctopusStudioCardContent isExpanded={expanded}>
        <div className="flex flex-col gap-3">
          {/* Subtask Goal & Configuration */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Goal & Configuration
            </span>
            <div className="bg-muted/20 border border-border/50 rounded-lg p-2.5 text-xs text-foreground/90 space-y-1">
              <p className="font-medium text-foreground">{config.description}</p>
              {config.allowedFiles && config.allowedFiles.length > 0 && (
                <div className="text-[11px] text-muted-foreground flex items-center gap-1 pt-1">
                  <FileText size={12} />
                  <span>Allowed files: {config.allowedFiles.join(", ")}</span>
                </div>
              )}
            </div>
          </div>

          {/* Sub-Agent Result View */}
          {(resultContent !== undefined || isError) && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={13} className="text-violet-500" />
                  {isError ? "Sub-Agent Error" : "Sub-Agent Output"}
                </span>

                {/* Metadata Pills */}
                {parsedResult?.isStructured && (
                  <div className="flex items-center gap-1.5">
                    {parsedResult.model && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/60">
                        <Cpu size={10} />
                        {parsedResult.model}
                      </span>
                    )}
                    {totalTokens !== null && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/60">
                        {totalTokens.toLocaleString()} tokens
                      </span>
                    )}
                    {parsedResult.costUsd !== undefined && parsedResult.costUsd > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/60">
                        <Coins size={10} />${parsedResult.costUsd.toFixed(4)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Render Structured Output or Fallback */}
              {parsedResult?.isStructured ? (
                <div className="flex flex-col gap-2">
                  {/* Error Banner */}
                  {parsedResult.errorText && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
                      <CircleX size={15} className="shrink-0 mt-0.5 text-red-500" />
                      <div className="font-mono text-[11px] whitespace-pre-wrap break-words">
                        {parsedResult.errorText}
                      </div>
                    </div>
                  )}

                  {/* Result Body */}
                  {parsedResult.resultText && (
                    <div className="rounded-lg bg-muted/20 border border-border/60 p-3 text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                      {parsedResult.resultText}
                    </div>
                  )}

                  {/* Notes / Summary */}
                  {parsedResult.notes && parsedResult.notes !== parsedResult.resultText && (
                    <div className="text-[11px] text-muted-foreground bg-muted/10 border border-border/40 rounded-md p-2 flex items-center gap-1.5">
                      <span className="font-medium">Note:</span>
                      <span>{parsedResult.notes}</span>
                    </div>
                  )}

                  {/* Actions Taken Collapsible */}
                  {parsedResult.actionsTaken && parsedResult.actionsTaken.length > 0 && (
                    <div className="border border-border/40 rounded-md overflow-hidden text-xs">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowActions((prev) => !prev);
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 bg-muted/30 hover:bg-muted/50 text-[11px] font-medium text-muted-foreground transition-colors"
                      >
                        <span className="flex items-center gap-1">
                          <Code2 size={12} />
                          Actions Performed ({parsedResult.actionsTaken.length})
                        </span>
                        {showActions ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>
                      {showActions && (
                        <div className="p-2 space-y-1.5 bg-muted/10">
                          {parsedResult.actionsTaken.map((action, idx) => (
                            <div
                              key={idx}
                              className="text-[11px] font-mono bg-background/80 border border-border/40 rounded p-1.5"
                            >
                              <span className="font-semibold text-violet-600 dark:text-violet-400">
                                {action.toolName}
                              </span>
                              {action.args && (
                                <span className="text-muted-foreground ml-1.5 truncate">
                                  {JSON.stringify(action.args)}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Toggle Raw JSON */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowRawJson((prev) => !prev);
                      }}
                      className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                    >
                      <Code2 size={12} />
                      {showRawJson ? "Hide raw JSON envelope" : "View raw JSON envelope"}
                    </button>
                    {showRawJson && (
                      <div className="mt-1.5 rounded-md overflow-hidden border border-border/50">
                        <CodeHighlight className="language-json bg-muted/30 p-2 text-[11px]">
                          {parsedResult.rawJson}
                        </CodeHighlight>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-md overflow-hidden border border-border/50">
                  <CodeHighlight className="language-text bg-muted/30 p-2 text-[11px]">
                    {resultContent ?? ""}
                  </CodeHighlight>
                </div>
              )}
            </div>
          )}
        </div>
      </OctopusStudioCardContent>
    </OctopusStudioCard>
  );
};
