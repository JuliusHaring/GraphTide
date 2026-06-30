import { Ontology } from "../../src/graph/ontology.js";

export const marieCurieOntology: Ontology = {
  nodeTypes: [
    {
      id: "person",
      name: "Person",
      properties: {
        name: "string",
        tags: { type: "array", items: "string" },
        meta: { type: "object", properties: { active: "boolean" } },
      },
    },
    {
      id: "company",
      name: "Company",
      properties: { name: "string" },
    },
    {
      id: "accomplishment",
      name: "Accomplishment",
      properties: { name: "string" },
    },
  ],
  edgeTypes: [
    {
      id: "works_at",
      name: "Works At",
      from: "person",
      to: "company",
      properties: { since: "number" },
    },
    {
      id: "achieved",
      name: "Achieved",
      from: "person",
      to: "accomplishment",
      properties: { date: "date" },
    },
  ],
};
