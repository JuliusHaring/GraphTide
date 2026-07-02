import { describe, expect, it } from "vitest";
import { mergeProperties } from "./properties.js";

describe("mergeProperties", () => {
  it("merges property updates", () => {
    expect(
      mergeProperties({ name: "Alice", role: "engineer" }, { properties: { name: "Alice Smith" } }),
    ).toEqual({ name: "Alice Smith", role: "engineer" });
  });

  it("removes properties listed in unsetProperties", () => {
    expect(
      mergeProperties(
        { name: "Alice", role: "engineer" },
        { properties: { name: "Alice Smith" }, unsetProperties: ["role"] },
      ),
    ).toEqual({ name: "Alice Smith" });
  });
});
