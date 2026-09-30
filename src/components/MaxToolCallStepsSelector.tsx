import React from "react";
import { useSettings } from "@/hooks/useSettings";
import { SettingField } from "@/components/settings/SettingField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_MAX_TOOL_CALL_STEPS,
  MAX_MAX_TOOL_CALL_STEPS,
  MIN_MAX_TOOL_CALL_STEPS,
} from "@/constants/settings_constants";
import { useTranslation } from "react-i18next";

interface OptionInfo {
  value: string;
  label: string;
  description: string;
}

const defaultValue = "default";

const options: OptionInfo[] = [
  {
    value: String(MIN_MAX_TOOL_CALL_STEPS),
    label: `Low (${MIN_MAX_TOOL_CALL_STEPS})`,
    description: `Limits tool calls to ${MIN_MAX_TOOL_CALL_STEPS}. Good for focused tasks.`,
  },
  {
    value: "100",
    label: "Medium (100)",
    description: "Moderate limit for straightforward multi-step tasks.",
  },
  {
    value: defaultValue,
    label: `Default (${DEFAULT_MAX_TOOL_CALL_STEPS})`,
    description: "Balanced limit for most tasks.",
  },
  {
    value: "500",
    label: "High (500)",
    description: "Extended limit for complex, long-running tasks (may increase cost and time).",
  },
  {
    value: String(MAX_MAX_TOOL_CALL_STEPS),
    label: `Maximum (${MAX_MAX_TOOL_CALL_STEPS})`,
    description: `Allows up to ${MAX_MAX_TOOL_CALL_STEPS} tool calls for exceptionally large tasks.`,
  },
];

export const MaxToolCallStepsSelector: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const { t } = useTranslation("settings");

  const handleValueChange = (value: string) => {
    if (value === "default") {
      updateSettings({ maxToolCallSteps: undefined });
    } else {
      const numValue = Math.min(
        MAX_MAX_TOOL_CALL_STEPS,
        Math.max(MIN_MAX_TOOL_CALL_STEPS, parseInt(value, 10)),
      );
      updateSettings({ maxToolCallSteps: numValue });
    }
  };

  // Determine the current value
  const rawValue = settings?.maxToolCallSteps;
  const currentValue =
    rawValue == null || rawValue === DEFAULT_MAX_TOOL_CALL_STEPS
      ? defaultValue
      : rawValue.toString();

  // Find the current option to display its description
  const currentOption =
    options.find((opt) => opt.value === currentValue) ||
    options.find((opt) => opt.value === defaultValue) ||
    options[0];

  return (
    <SettingField
      htmlFor="max-tool-call-steps"
      label={t("ai.maxToolCallSteps")}
      description={currentOption.description}
    >
      <Select value={currentValue} onValueChange={(v) => v && handleValueChange(v)}>
        <SelectTrigger
          className="w-full sm:w-[240px]"
          id="max-tool-call-steps"
          aria-describedby="max-tool-call-steps-description"
        >
          <SelectValue placeholder={t("ai.selectMaxToolCallSteps")} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingField>
  );
};
