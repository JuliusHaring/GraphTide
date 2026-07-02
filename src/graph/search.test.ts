import { describe, expect, it } from "vitest";
import { Edge, Node } from "./ontology.js";
import { filterEdges, filterNodes } from "./search.js";

const nodes: Node[] = [
  { id: "alice", type: "person", properties: { name: "Alice" } },
  { id: "bob", type: "person", properties: { name: "Bob" } },
  { id: "acme", type: "company", properties: { name: "Acme Corp" } },
];

const edges: Edge[] = [
  { id: "e1", type: "works_at", from: "alice", to: "acme", properties: { since: 2020 } },
  { id: "e2", type: "works_at", from: "bob", to: "acme", properties: { since: 2021 } },
];

describe("filterNodes", () => {
  it("filters by type", () => {
    expect(filterNodes(nodes, { type: "person" }).map((node) => node.id)).toEqual([
      "alice",
      "bob",
    ]);
  });

  it("filters by exact property match", () => {
    expect(filterNodes(nodes, { where: { name: "Alice" } }).map((node) => node.id)).toEqual([
      "alice",
    ]);
  });

  it("filters by text search", () => {
    expect(filterNodes(nodes, { search: "acme" }).map((node) => node.id)).toEqual(["acme"]);
  });

  it("applies limit and offset", () => {
    expect(filterNodes(nodes, { type: "person", limit: 1, offset: 1 }).map((node) => node.id)).toEqual(
      ["bob"],
    );
  });
});

describe("filterEdges", () => {
  it("filters by endpoint nodes", () => {
    expect(filterEdges(edges, { from: "alice" }).map((edge) => edge.id)).toEqual(["e1"]);
    expect(filterEdges(edges, { nodeId: "acme" }).map((edge) => edge.id)).toEqual(["e1", "e2"]);
  });

  it("filters by property and text search", () => {
    expect(filterEdges(edges, { where: { since: 2021 } }).map((edge) => edge.id)).toEqual(["e2"]);
    expect(filterEdges(edges, { search: "alice" }).map((edge) => edge.id)).toEqual(["e1"]);
  });
});
