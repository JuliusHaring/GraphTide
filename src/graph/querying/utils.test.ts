import { describe, expect, it, vi } from "vitest";
import { BaseLLMProvider } from "../../llm/base-llm-provider.js";
import { Message } from "../../llm/types.js";
import { Edge, Node } from "../ontology.js";
import {
  expandNeighborhood,
  expandNeighborhoodBfs,
  formatPathDescription,
  graphPathNodeIds,
  shortestPath,
  shortestPaths,
  topKByTextMatch,
  topKRelevant,
} from "./utils.js";

const edges: Edge[] = [
  { id: "e1", type: "parent_of", from: "aaron", to: "nadab", properties: {} },
  { id: "e2", type: "appears_in", from: "nadab", to: "leviticus", properties: {} },
  { id: "e3", type: "appears_in", from: "aaron", to: "exodus", properties: {} },
  { id: "e4", type: "teaches", from: "moses", to: "commandments", properties: {} },
  { id: "e5", type: "member_of", from: "moses", to: "israelites", properties: {} },
];

function testNode(id: string, name: string): Node {
  return { id, type: "person", properties: { name } };
}

const nodesById = new Map<string, Node>([
  ["aaron", testNode("aaron", "Aaron")],
  ["nadab", testNode("nadab", "Nadab")],
  ["leviticus", testNode("leviticus", "Leviticus")],
  ["exodus", testNode("exodus", "Exodus")],
  ["moses", testNode("moses", "Moses")],
  ["commandments", testNode("commandments", "Commandments")],
  ["israelites", testNode("israelites", "Israelites")],
  ["a", testNode("a", "A")],
  ["b", testNode("b", "B")],
  ["c", testNode("c", "C")],
  ["d", testNode("d", "D")],
]);

describe("topKByTextMatch", () => {
  it("ranks items by query term overlap without embeddings", () => {
    const ranked = topKByTextMatch(
      "Aaron sons",
      [
        { id: "aaron", text: 'Node aaron (person): {"name":"Aaron"}' },
        { id: "leviticus", text: 'Node leviticus (book): {"name":"Leviticus"}' },
        { id: "nadab", text: 'Node nadab (person): {"name":"Nadab"}' },
      ],
      2,
    );

    expect(ranked).toHaveLength(1);
    expect(ranked[0].id).toBe("aaron");
  });
});

describe("topKRelevant", () => {
  class EmbeddingMock extends BaseLLMProvider {
    protected embedUncached(texts: string[]): Promise<number[][]> {
      return Promise.resolve(texts.map(() => [1, 0, 0]));
    }

    generate(_messages: Message[]): Promise<string> {
      return Promise.resolve("");
    }
  }

  it("uses text match when items have no supplied embeddings", async () => {
    const llm = new EmbeddingMock({ apiKey: "test", model: "test" });
    const embedSpy = vi.spyOn(llm, "embed");

    const ranked = await topKRelevant(
      llm,
      "Aaron",
      [{ id: "aaron", text: 'Node aaron (person): {"name":"Aaron"}' }],
      1,
    );

    expect(embedSpy).not.toHaveBeenCalled();
    expect(ranked[0].id).toBe("aaron");
  });

  it("embeds the query when items have supplied embeddings", async () => {
    const llm = new EmbeddingMock({ apiKey: "test", model: "test" });
    const embedSpy = vi.spyOn(llm, "embed");

    await topKRelevant(
      llm,
      "Aaron",
      [
        {
          id: "aaron",
          embedding: [1, 0, 0],
          text: 'Node aaron (person): {"name":"Aaron"}',
        },
      ],
      1,
    );

    expect(embedSpy).toHaveBeenCalledOnce();
  });
});

describe("expandNeighborhoodBfs", () => {
  it("matches 1-hop expansion when maxHops is 1", () => {
    const seeds = new Set(["aaron"]);
    expect(expandNeighborhoodBfs(seeds, edges, 1)).toEqual(expandNeighborhood(seeds, edges));
  });

  it("reaches 2-hop nodes when maxHops is 2", () => {
    const neighborhood = expandNeighborhoodBfs(new Set(["aaron"]), edges, 2);

    expect(new Set(neighborhood.nodeIds)).toEqual(
      new Set(["aaron", "nadab", "exodus", "leviticus"]),
    );
    expect(neighborhood.edges.map((edge) => edge.id).sort()).toEqual(["e1", "e2", "e3"]);
  });

  it("does not expand beyond maxHops", () => {
    const neighborhood = expandNeighborhoodBfs(new Set(["moses"]), edges, 1);

    expect(new Set(neighborhood.nodeIds)).toEqual(new Set(["moses", "commandments", "israelites"]));
    expect(neighborhood.edges.map((edge) => edge.id).sort()).toEqual(["e4", "e5"]);
  });

  it("limits nodes to topK in BFS discovery order", () => {
    const neighborhood = expandNeighborhoodBfs(new Set(["aaron"]), edges, 2, 2);

    expect(neighborhood.nodeIds).toHaveLength(2);
    expect(neighborhood.nodeIds[0]).toBe("aaron");
    expect(new Set(neighborhood.nodeIds).size).toBe(2);
  });
});

describe("shortestPath", () => {
  it("finds a multi-hop path", () => {
    const path = shortestPath("aaron", "leviticus", edges, nodesById)!;

    expect(graphPathNodeIds(path)).toEqual(["aaron", "nadab", "leviticus"]);
    expect(path[1]).toEqual(edges[0]);
    expect(path[3]).toEqual(edges[1]);
  });

  it("returns a single-node path for identical endpoints", () => {
    const path = shortestPath("moses", "moses", edges, nodesById)!;

    expect(path).toEqual([nodesById.get("moses")]);
  });

  it("returns undefined when no path exists", () => {
    expect(shortestPath("leviticus", "israelites", edges, nodesById)).toBeUndefined();
  });
});

describe("shortestPaths", () => {
  const diamondEdges: Edge[] = [
    { id: "e1", type: "link", from: "a", to: "b", properties: {} },
    { id: "e2", type: "link", from: "a", to: "c", properties: {} },
    { id: "e3", type: "link", from: "b", to: "d", properties: {} },
    { id: "e4", type: "link", from: "c", to: "d", properties: {} },
    { id: "e5", type: "link", from: "b", to: "c", properties: {} },
  ];

  it("returns multiple equally short paths before longer ones", () => {
    const paths = shortestPaths("a", "d", diamondEdges, 3, nodesById);

    expect(paths).toHaveLength(3);
    expect(graphPathNodeIds(paths[0])).toEqual(["a", "b", "d"]);
    expect(graphPathNodeIds(paths[1])).toEqual(["a", "c", "d"]);
    expect(graphPathNodeIds(paths[2])).toEqual(["a", "b", "c", "d"]);
  });

  it("respects the limit", () => {
    expect(shortestPaths("a", "d", diamondEdges, 1, nodesById)).toHaveLength(1);
    expect(shortestPaths("a", "d", diamondEdges, 0, nodesById)).toEqual([]);
  });

  it("returns an empty array when no path exists", () => {
    expect(shortestPaths("leviticus", "israelites", edges, 3, nodesById)).toEqual([]);
  });
});

describe("formatPathDescription", () => {
  it("describes each hop in the path", () => {
    const path = shortestPath("aaron", "leviticus", edges, nodesById)!;
    const description = formatPathDescription(path);

    expect(description).toContain("Aaron");
    expect(description).toContain("Nadab");
    expect(description).toContain("Leviticus");
    expect(description).toContain("parent_of");
    expect(description).toContain("appears_in");
  });
});
