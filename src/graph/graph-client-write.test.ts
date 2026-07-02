import { describe, expect, it } from "vitest";
import { z } from "zod";
import { GraphClient } from "./graph-client.js";
import { Ontology } from "./ontology.js";
import { BaseLLMProvider } from "../llm/base-llm-provider.js";
import { MemoryStorageProvider } from "../storage/memory-storage-provider.js";

const ontology: Ontology = {
  nodeTypes: [
    { id: "person", name: "Person", properties: { name: "string" } },
    { id: "company", name: "Company", properties: { name: "string" } },
  ],
  edgeTypes: [
    {
      id: "works_at",
      name: "Works At",
      from: "person",
      to: "company",
      properties: { since: "number", title: "string" },
    },
  ],
};

class StubLLMProvider extends BaseLLMProvider {
  constructor() {
    super({ apiKey: "test", model: "test" });
  }

  generate<T extends z.ZodType>(): Promise<z.infer<T>> {
    return Promise.resolve({} as z.infer<T>);
  }

  protected embedUncached(): Promise<number[][]> {
    return Promise.resolve([]);
  }
}

function createClient(): GraphClient {
  return new GraphClient({
    storageProvider: new MemoryStorageProvider(),
    llmProvider: new StubLLMProvider(),
    ontology,
  });
}

describe("GraphClient write semantics", () => {
  it("createNode rejects duplicates", async () => {
    const client = createClient();
    await client.createNode({ id: "alice", type: "person", properties: { name: "Alice" } });

    await expect(
      client.createNode({ id: "alice", type: "person", properties: { name: "Alice II" } }),
    ).rejects.toThrow('Node with id "alice" already exists');
  });

  it("upsertNode creates and merges properties", async () => {
    const client = createClient();

    const created = await client.upsertNode({
      id: "alice",
      type: "person",
      properties: { name: "Alice" },
    });
    expect(created.created).toBe(true);
    expect(created.item.properties?.name).toBe("Alice");

    const updated = await client.upsertNode({
      id: "alice",
      type: "person",
      properties: { name: "Alice Smith" },
    });
    expect(updated.created).toBe(false);
    expect(updated.item.properties).toEqual({ name: "Alice Smith" });
  });

  it("upsertEdge creates and merges properties", async () => {
    const client = createClient();
    await client.createNode({ id: "alice", type: "person", properties: { name: "Alice" } });
    await client.createNode({ id: "acme", type: "company", properties: { name: "Acme" } });

    const created = await client.upsertEdge({
      id: "e1",
      type: "works_at",
      from: "alice",
      to: "acme",
      properties: { since: 2020, title: "Engineer" },
    });
    expect(created.created).toBe(true);

    const updated = await client.upsertEdge({
      id: "e1",
      type: "works_at",
      from: "alice",
      to: "acme",
      properties: { title: "CTO" },
    });
    expect(updated.created).toBe(false);
    expect(updated.item.properties).toEqual({ since: 2020, title: "CTO" });
  });

  it("updateNode patches existing nodes and rejects missing ids", async () => {
    const client = createClient();
    await client.createNode({ id: "alice", type: "person", properties: { name: "Alice" } });

    const node = await client.updateNode("alice", { properties: { name: "Alice Smith" } });
    expect(node.properties?.name).toBe("Alice Smith");

    await expect(client.updateNode("missing", { properties: { name: "Nobody" } })).rejects.toThrow(
      'Node with id "missing" not found',
    );
  });

  it("exposes tryGet and has helpers", async () => {
    const client = createClient();
    expect(await client.hasNode("alice")).toBe(false);
    expect(await client.tryGetNode("alice")).toBeUndefined();

    await client.createNode({ id: "alice", type: "person", properties: { name: "Alice" } });

    expect(await client.hasNode("alice")).toBe(true);
    expect(await client.tryGetNode("alice")).toMatchObject({ id: "alice" });
  });
});
