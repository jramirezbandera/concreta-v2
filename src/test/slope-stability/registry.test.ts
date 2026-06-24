import { describe, it, expect } from "vitest";
import { getModuleByRoute, MODULE_SCHEMA_VERSIONS } from "../../data/moduleRegistry";

describe("slope-stability — registro del módulo", () => {
  it("registra Taludes en la categoría Geotecnia, no shipped (Phase 1)", () => {
    const entry = getModuleByRoute("/geotec/taludes");
    expect(entry).toBeDefined();
    expect(entry?.key).toBe("concreta-slope-stability");
    expect(entry?.label).toBe("Taludes");
    expect(entry?.group).toBe("Geotecnia");
    expect(entry?.shipped).toBe(false);
  });

  it("declara una versión de esquema para la persistencia", () => {
    expect(MODULE_SCHEMA_VERSIONS["slope-stability"]).toBeDefined();
  });
});
