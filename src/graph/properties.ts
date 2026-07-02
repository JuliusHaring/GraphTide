import { PropertyValue } from "./ontology.js";

export type PropertyPatch = {
  properties?: Record<string, PropertyValue>;
  unsetProperties?: string[];
};

export function mergeProperties(
  existing: Record<string, PropertyValue>,
  patch?: PropertyPatch,
): Record<string, PropertyValue> {
  const merged = { ...existing, ...(patch?.properties ?? {}) };

  for (const key of patch?.unsetProperties ?? []) {
    delete merged[key];
  }

  return merged;
}
