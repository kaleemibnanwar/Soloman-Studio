import { SettingField } from "@/components/settings/SettingField";
import { ModelPicker } from "@/components/ModelPicker";

/**
 * Settings-page control for `settings.routerModel` — the lightweight model that
 * decides which candidate to use for each task/sub-task when auto model mode is
 * on.
 */
export function RouterModelSetting() {
  return (
    <SettingField
      label="Router Model"
      description="The model that decides which candidate to use for each task or sub-task."
    >
      <div className="inline-flex w-full items-center rounded-lg border border-input bg-transparent px-1 py-0.5 sm:w-[240px]">
        <ModelPicker settingKey="routerModel" />
      </div>
    </SettingField>
  );
}
