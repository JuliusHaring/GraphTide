import { describe, expect, it } from "vitest";
import { Edge, Node } from "../ontology.js";
import {
  expandNeighborhoodBfsWithLookup,
  graphPathNodeIds,
  shortestPathsWithLookup,
} from "./utils.js";

const edges: Edge[] = [
  { id: "e1", type: "parent_of", from: "aaron", to: "nadab", properties: {} },
  { id: "e2", type: "appears_in", from: "nadab", to: "leviticus", properties: {} },
  { id: "e3", type: "appears_in", from: "aaron", to: "exodus", properties: {} },
];

const nodesById = new Map<string, Node>([
  ["aaron", { id: "aaron", type: "person", properties: { name: "Aaron" } }],
  ["nadab", { id: "nadab", type: "person", properties: { name: "Nadab" } }],
  ["leviticus", { id: "leviticus", type: "book", properties: { name: "Leviticus" } }],
  ["exodus", { id: "exodus", type: "book", properties: { name: "Exodus" } }],
]);

function edgeLookup(allEdges: Edge[]) {
  return (nodeId: string) => allEdges.filter((edge) => edge.from === nodeId || edge.to === nodeId);
}

describe("traversal with edge lookup", () => {
  it("expands neighborhoods without scanning the full edge list each hop", async () => {
    const neighborhood = await expandNeighborhoodBfsWithLookup(
      new Set(["aaron"]),
      edgeLookup(edges),
      2,
    );

    expect(new Set(neighborhood.nodeIds)).toEqual(
      new Set(["aaron", "nadab", "exodus", "leviticus"]),
    );
  });

  it("finds shortest paths with edge lookup", async () => {
    const paths = await shortestPathsWithLookup(
      "aaron",
      "leviticus",
      edgeLookup(edges),
      1,
      async (nodeIds) => new Map(nodeIds.map((id) => [id, nodesById.get(id)!])),
    );

    expect(graphPathNodeIds(paths[0])).toEqual(["aaron", "nadab", "leviticus"]);
    expect(paths[0][1]).toEqual(edges[0]);
    expect(paths[0][3]).toEqual(edges[1]);
  });
});
