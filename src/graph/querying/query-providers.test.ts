import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BaseLLMProvider } from "../../llm/base-llm-provider.js";
import { Message } from "../../llm/types.js";
import { BaseStorageProvider } from "../../storage/base-storage-provider.js";
import { Edge, Node } from "../ontology.js";
import { BfsSearchQueryProvider } from "./bfs-search-query-provider.js";
import { ShortestPathSearchQueryProvider } from "./shortest-path-search-query-provider.js";
import { QueryGraph } from "./types.js";
import { expandNeighborhood } from "./utils.js";

const nodes: Node[] = [
  { id: "aaron", type: "person", properties: { name: "Aaron" }, embedding: [1, 0, 0] },
  { id: "nadab", type: "person", properties: { name: "Nadab" }, embedding: [0, 0, 1] },
  { id: "leviticus", type: "book", properties: { name: "Leviticus" }, embedding: [0, 1, 0] },
];

const edges: Edge[] = [
  { id: "e1", type: "parent_of", from: "aaron", to: "nadab", properties: {} },
  { id: "e2", type: "appears_in", from: "nadab", to: "leviticus", properties: {} },
];

const graph: QueryGraph = { nodes, edges };

class MockLLMProvider extends BaseLLMProvider {
  constructor(
    private readonly queryEmbedding: number[],
    private readonly nodeCatalog: Node[] = nodes,
    private readonly answer = "mocked answer",
  ) {
    super({ apiKey: "test", model: "test" });
  }

  generate(messages: Message[]): Promise<string>;
  generate<T extends z.ZodType>(
    messages: Message[],
    selfHealAttempts: number | undefined,
    schema: T,
  ): Promise<z.infer<T>>;
  generate<T extends z.ZodType>(
    _messages: Message[],
    _selfHealAttempts?: number,
    schema?: T,
  ): Promise<string | z.infer<T>> {
    if (schema) {
      return Promise.resolve({} as z.infer<T>);
    }
    return Promise.resolve(this.answer);
  }

  protected embedUncached(texts: string[]): Promise<number[][]> {
    if (texts.length === 1 && !texts[0].startsWith("Node ")) {
      return Promise.resolve([this.queryEmbedding]);
    }

    return Promise.resolve(
      texts.map((text) => {
        const node = this.nodeCatalog.find((candidate) => text.includes(`Node ${candidate.id}`));
        return node?.embedding ?? [0, 0, 0];
      }),
    );
  }
}

class UnusedStorageProvider extends BaseStorageProvider {
  getNode(): Promise<Node> {
    throw new Error("unused");
  }

  getNodes(): Promise<Node[]> {
    throw new Error("unused");
  }

  listNodes(): Promise<Node[]> {
    throw new Error("unused");
  }

  createNode(): Promise<void> {
    throw new Error("unused");
  }

  updateNode(): Promise<void> {
    throw new Error("unused");
  }

  upsertNode(): Promise<void> {
    throw new Error("unused");
  }

  deleteNode(): Promise<void> {
    throw new Error("unused");
  }

  getEdge(): Promise<Edge> {
    throw new Error("unused");
  }

  getEdges(): Promise<Edge[]> {
    throw new Error("unused");
  }

  listEdges(): Promise<Edge[]> {
    throw new Error("unused");
  }

  createEdge(): Promise<void> {
    throw new Error("unused");
  }

  updateEdge(): Promise<void> {
    throw new Error("unused");
  }

  upsertEdge(): Promise<void> {
    throw new Error("unused");
  }

  deleteEdge(): Promise<void> {
    throw new Error("unused");
  }
}

const storageProvider = new UnusedStorageProvider();

describe("BfsSearchQueryProvider", () => {
  it("includes 2-hop nodes that 1-hop expansion misses", async () => {
    const provider = new BfsSearchQueryProvider({
      llmProvider: new MockLLMProvider([1, 0, 0]),
      storageProvider,
      seedK: 1,
      maxHops: 2,
    });

    const context = await provider.buildContext("Which books mention Aaron's sons?", graph);
    const materials = context.materials.join("\n");

    expect(materials).toContain("Nadab");
    expect(materials).toContain("Leviticus");
    expect(materials).toContain("appears_in");
  });

  it("stops expanding beyond maxHops", async () => {
    const provider = new BfsSearchQueryProvider({
      llmProvider: new MockLLMProvider([1, 0, 0]),
      storageProvider,
      seedK: 1,
      maxHops: 1,
    });

    const context = await provider.buildContext("Which books mention Aaron's sons?", graph);
    const oneHop = expandNeighborhood(new Set(["aaron"]), edges);

    expect(oneHop.nodeIds.includes("leviticus")).toBe(false);
    expect(context.materials.join("\n")).not.toContain("Leviticus");
  });

  it("returns materials and answer from query", async () => {
    const provider = new BfsSearchQueryProvider({
      llmProvider: new MockLLMProvider([1, 0, 0], nodes, "Aaron is connected to Leviticus."),
      storageProvider,
      seedK: 1,
      maxHops: 2,
    });

    const result = await provider.query("Which books mention Aaron's sons?", graph);

    expect(result.query).toBe("Which books mention Aaron's sons?");
    expect(result.materials.length).toBeGreaterThan(0);
    expect(result.materials.join("\n")).toContain("Leviticus");
    expect(result.answer).toBe("Aaron is connected to Leviticus.");
  });
});

describe("ShortestPathSearchQueryProvider", () => {
  it("includes an explicit path between seeded entities", async () => {
    const provider = new ShortestPathSearchQueryProvider({
      llmProvider: new MockLLMProvider([0.5, 0.5, 0]),
      storageProvider,
      seedK: 2,
    });

    const context = await provider.buildContext(
      "How is Aaron connected to Leviticus through his son Nadab?",
      graph,
    );
    const materials = context.materials.join("\n");

    expect(materials).toContain("Path (2 hops)");
    expect(materials).toContain("parent_of");
    expect(materials).toContain("appears_in");
    expect(materials).toContain("Nadab");
    expect(materials).toContain("Leviticus");
  });

  it("falls back to a 1-hop neighborhood when no path exists", async () => {
    const disconnectedGraph: QueryGraph = {
      nodes: [
        { id: "alpha", type: "person", properties: { name: "Alpha" }, embedding: [1, 0, 0] },
        { id: "beta", type: "person", properties: { name: "Beta" }, embedding: [0, 1, 0] },
      ],
      edges: [],
    };

    const provider = new ShortestPathSearchQueryProvider({
      llmProvider: new MockLLMProvider([0.5, 0.5, 0], disconnectedGraph.nodes),
      storageProvider,
      seedK: 2,
    });

    const context = await provider.buildContext(
      "How is Aaron connected to Leviticus through his son Nadab?",
      disconnectedGraph,
    );

    expect(context.materials.join("\n")).toContain("Alpha");
    expect(context.materials.join("\n")).toContain("Beta");
    expect(context.materials.join("\n")).not.toContain("Path (");
  });
});
