import { describe, expect, it } from "vitest";
import { heatHaze } from "../src/client/scene/post";

describe("heat haze", () => {
  it("shimmers on summer afternoons only", () => {
    expect(heatHaze("unhala", 14)).toBe(1);
    expect(heatHaze("unhala", 8)).toBe(0);
    expect(heatHaze("unhala", 18)).toBe(0);
    expect(heatHaze("unhala", 11.5)).toBeGreaterThan(0);
    expect(heatHaze("unhala", 11.5)).toBeLessThan(1);
    expect(heatHaze("kharif", 14)).toBe(0);
    expect(heatHaze("rabi", 14)).toBe(0);
  });
});
