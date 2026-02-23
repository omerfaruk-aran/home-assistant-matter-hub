import type { HomeAssistantEntityInformation } from "@home-assistant-matter-hub/common";
import type { EndpointType } from "@matter/main";
import { ModeSelectDevice } from "@matter/main/devices";
import { BasicInformationServer } from "../../../behaviors/basic-information-server.js";
import { HomeAssistantEntityBehavior } from "../../../behaviors/home-assistant-entity-behavior.js";
import { IdentifyServer } from "../../../behaviors/identify-server.js";
import { ModeSelectServer } from "../../../behaviors/mode-select-server.js";

interface SelectAttributes {
  options?: string[];
}

function getSelectOptions(entity: HomeAssistantEntityInformation): string[] {
  const attrs = entity.state.attributes as SelectAttributes;
  return attrs.options ?? [];
}

const SelectModeServer = ModeSelectServer({
  getOptions: getSelectOptions,
  getCurrentOption: (entity) => entity.state.state ?? undefined,
  selectOption: (option) => ({
    action: "select.select_option",
    data: { option },
  }),
});

function buildSupportedModes(options: string[]) {
  return options.map((label, index) => ({
    label: label.length > 64 ? label.substring(0, 64) : label,
    mode: index,
    semanticTags: [],
  }));
}

const SelectEndpointType = ModeSelectDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomeAssistantEntityBehavior,
  SelectModeServer,
);

export function SelectDevice(
  homeAssistantEntity: HomeAssistantEntityBehavior.State,
): EndpointType | undefined {
  const attrs = homeAssistantEntity.entity.state.attributes as SelectAttributes;
  const options = attrs.options ?? [];

  if (options.length === 0) {
    return undefined;
  }

  const currentOption = homeAssistantEntity.entity.state.state;
  const currentIndex = currentOption
    ? options.findIndex((o) => o.toLowerCase() === currentOption.toLowerCase())
    : 0;

  return SelectEndpointType.set({
    homeAssistantEntity,
    modeSelect: {
      description:
        homeAssistantEntity.customName ??
        (
          homeAssistantEntity.entity.state.attributes as {
            friendly_name?: string;
          }
        ).friendly_name ??
        "Select",
      supportedModes: buildSupportedModes(options),
      currentMode: currentIndex >= 0 ? currentIndex : 0,
    },
  });
}

export function InputSelectDevice(
  homeAssistantEntity: HomeAssistantEntityBehavior.State,
): EndpointType | undefined {
  const attrs = homeAssistantEntity.entity.state.attributes as SelectAttributes;
  const options = attrs.options ?? [];

  if (options.length === 0) {
    return undefined;
  }

  const currentOption = homeAssistantEntity.entity.state.state;
  const currentIndex = currentOption
    ? options.findIndex((o) => o.toLowerCase() === currentOption.toLowerCase())
    : 0;

  return SelectEndpointType.set({
    homeAssistantEntity,
    modeSelect: {
      description:
        homeAssistantEntity.customName ??
        (
          homeAssistantEntity.entity.state.attributes as {
            friendly_name?: string;
          }
        ).friendly_name ??
        "Input Select",
      supportedModes: buildSupportedModes(options),
      currentMode: currentIndex >= 0 ? currentIndex : 0,
    },
  });
}
