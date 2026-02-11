import type {
  HomeAssistantDeviceRegistry,
  HomeAssistantEntityRegistry,
  HomeAssistantFilterMode,
  HomeAssistantMatcher,
} from "@home-assistant-matter-hub/common";

/**
 * Test if an entity matches any or all of the matchers based on mode.
 * @param matchers - Array of matchers to test
 * @param device - Device registry entry (optional)
 * @param entity - Entity registry entry
 * @param mode - "any" (OR) or "all" (AND), defaults to "any"
 */
export function testMatchers(
  matchers: HomeAssistantMatcher[],
  device: HomeAssistantDeviceRegistry | undefined,
  entity: HomeAssistantEntityRegistry,
  mode: HomeAssistantFilterMode = "any",
) {
  if (mode === "all") {
    return matchers.every((matcher) => testMatcher(matcher, device, entity));
  }
  return matchers.some((matcher) => testMatcher(matcher, device, entity));
}

export function testMatcher(
  matcher: HomeAssistantMatcher,
  device: HomeAssistantDeviceRegistry | undefined,
  entity: HomeAssistantEntityRegistry,
): boolean {
  switch (matcher.type) {
    case "domain":
      return entity.entity_id.split(".")[0] === matcher.value;
    case "label":
      return (
        (!!entity?.labels && entity.labels.includes(matcher.value)) ||
        (!!device?.labels && device.labels.includes(matcher.value))
      );
    case "entity_category":
      return entity?.entity_category === matcher.value;
    case "platform":
      return entity?.platform === matcher.value;
    case "pattern":
      return patternToRegex(matcher.value).test(entity.entity_id);
    case "regex":
      return testRegex(matcher.value, entity.entity_id);
    case "area":
      return (entity?.area_id ?? device?.area_id) === matcher.value;
    case "device_name":
      return testDeviceName(matcher.value, device);
    case "product_name":
      return testProductName(matcher.value, device);
  }
  return false;
}

function escapeRegExp(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

function patternToRegex(pattern: string): RegExp {
  const regex = pattern
    .split("*")
    .map((part) => escapeRegExp(part))
    .join(".*");
  return new RegExp(`^${regex}$`);
}

function testRegex(pattern: string, value: string): boolean {
  try {
    const regex = new RegExp(pattern);
    return regex.test(value);
  } catch {
    return false;
  }
}

function testDeviceName(
  pattern: string,
  device: HomeAssistantDeviceRegistry | undefined,
): boolean {
  if (!device) {
    return false;
  }
  const deviceName = device.name_by_user ?? device.name ?? device.default_name;
  if (!deviceName) {
    return false;
  }
  const lowerPattern = pattern.toLowerCase();
  const lowerDeviceName = deviceName.toLowerCase();
  if (lowerPattern.includes("*")) {
    return patternToRegex(lowerPattern).test(lowerDeviceName);
  }
  return lowerDeviceName.includes(lowerPattern);
}

function testProductName(
  pattern: string,
  device: HomeAssistantDeviceRegistry | undefined,
): boolean {
  if (!device) {
    return false;
  }
  const productName = device.model ?? device.default_model;
  if (!productName) {
    return false;
  }
  const lowerPattern = pattern.toLowerCase();
  const lowerProductName = productName.toLowerCase();
  if (lowerPattern.includes("*")) {
    return patternToRegex(lowerPattern).test(lowerProductName);
  }
  return lowerProductName.includes(lowerPattern);
}
