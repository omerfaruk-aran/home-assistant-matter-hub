import type { BridgeFeatureFlags } from "@home-assistant-matter-hub/common";
import { describe, expect, it } from "vitest";
import {
  adjustPositionForReading,
  adjustPositionForWriting,
} from "./cover-position-utils.js";

describe("adjustPositionForReading", () => {
  it("inverts by default (no flags)", () => {
    expect(adjustPositionForReading(80, undefined, false)).toBe(20);
    expect(adjustPositionForReading(0, undefined, false)).toBe(100);
    expect(adjustPositionForReading(100, undefined, false)).toBe(0);
    expect(adjustPositionForReading(50, undefined, false)).toBe(50);
  });

  it("inverts with empty flags", () => {
    expect(adjustPositionForReading(80, {}, false)).toBe(20);
  });

  it("skips inversion with coverDoNotInvertPercentage", () => {
    const flags: BridgeFeatureFlags = { coverDoNotInvertPercentage: true };
    expect(adjustPositionForReading(80, flags, false)).toBe(80);
    expect(adjustPositionForReading(0, flags, false)).toBe(0);
    expect(adjustPositionForReading(100, flags, false)).toBe(100);
  });

  it("skips inversion with coverUseHomeAssistantPercentage", () => {
    const flags: BridgeFeatureFlags = {
      coverUseHomeAssistantPercentage: true,
    };
    expect(adjustPositionForReading(80, flags, false)).toBe(80);
    expect(adjustPositionForReading(0, flags, false)).toBe(0);
  });

  it("skips inversion with matterSemantics", () => {
    expect(adjustPositionForReading(80, undefined, true)).toBe(80);
    expect(adjustPositionForReading(0, undefined, true)).toBe(0);
  });

  it("coverSwapOpenClose skips inversion (position passes through)", () => {
    const flags: BridgeFeatureFlags = { coverSwapOpenClose: true };
    expect(adjustPositionForReading(80, flags, false)).toBe(80);
    expect(adjustPositionForReading(0, flags, false)).toBe(0);
    expect(adjustPositionForReading(100, flags, false)).toBe(100);
  });

  it("coverUseHomeAssistantPercentage takes precedence over coverSwapOpenClose (#148)", () => {
    const flags: BridgeFeatureFlags = {
      coverSwapOpenClose: true,
      coverUseHomeAssistantPercentage: true,
    };
    expect(adjustPositionForReading(80, flags, false)).toBe(80);
    expect(adjustPositionForReading(0, flags, false)).toBe(0);
    expect(adjustPositionForReading(100, flags, false)).toBe(100);
  });

  it("coverDoNotInvertPercentage takes precedence over coverSwapOpenClose", () => {
    const flags: BridgeFeatureFlags = {
      coverSwapOpenClose: true,
      coverDoNotInvertPercentage: true,
    };
    expect(adjustPositionForReading(80, flags, false)).toBe(80);
  });

  it("matterSemantics takes precedence over coverSwapOpenClose", () => {
    const flags: BridgeFeatureFlags = { coverSwapOpenClose: true };
    expect(adjustPositionForReading(80, flags, true)).toBe(80);
  });
});

describe("adjustPositionForWriting", () => {
  it("inverts by default (no flags)", () => {
    expect(adjustPositionForWriting(20, undefined, false)).toBe(80);
    expect(adjustPositionForWriting(0, undefined, false)).toBe(100);
    expect(adjustPositionForWriting(100, undefined, false)).toBe(0);
  });

  it("skips inversion with coverUseHomeAssistantPercentage", () => {
    const flags: BridgeFeatureFlags = {
      coverUseHomeAssistantPercentage: true,
    };
    expect(adjustPositionForWriting(20, flags, false)).toBe(20);
    expect(adjustPositionForWriting(0, flags, false)).toBe(0);
  });

  it("coverSwapOpenClose skips inversion (position passes through)", () => {
    const flags: BridgeFeatureFlags = { coverSwapOpenClose: true };
    expect(adjustPositionForWriting(20, flags, false)).toBe(20);
    expect(adjustPositionForWriting(80, flags, false)).toBe(80);
    expect(adjustPositionForWriting(0, flags, false)).toBe(0);
    expect(adjustPositionForWriting(100, flags, false)).toBe(100);
  });

  it("coverUseHomeAssistantPercentage takes precedence over coverSwapOpenClose (#148)", () => {
    const flags: BridgeFeatureFlags = {
      coverSwapOpenClose: true,
      coverUseHomeAssistantPercentage: true,
    };
    expect(adjustPositionForWriting(20, flags, false)).toBe(20);
    expect(adjustPositionForWriting(80, flags, false)).toBe(80);
  });

  it("reading and writing are symmetric", () => {
    const flagCombos: (BridgeFeatureFlags | undefined)[] = [
      undefined,
      {},
      { coverSwapOpenClose: true },
      { coverUseHomeAssistantPercentage: true },
      { coverDoNotInvertPercentage: true },
      { coverSwapOpenClose: true, coverUseHomeAssistantPercentage: true },
    ];

    for (const flags of flagCombos) {
      for (const matterSem of [false, true]) {
        for (let pos = 0; pos <= 100; pos += 25) {
          const read = adjustPositionForReading(pos, flags, matterSem);
          if (read != null) {
            const roundTrip = adjustPositionForWriting(read, flags, matterSem);
            expect(roundTrip).toBe(pos);
          }
        }
      }
    }
  });
});
