import { describe, expect, it } from "vitest";
import { Node, OntologyRegistry } from "./ontology.js";

const sampleOntology = {
  nodeTypes: [
    {
      id: "person",
      name: "Person",
      properties: {
        name: "string",
        tags: { type: "array", items: "string" },
        meta: {
          type: "object",
          properties: { active: "boolean" },
        },
      },
    },
    {
      id: "company",
      name: "Company",
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
  ],
};

describe("OntologyRegistry", () => {
  const registry = OntologyRegistry.parse(sampleOntology);

  it("rejects duplicate node type ids", () => {
    expect(() =>
      OntologyRegistry.parse({
        nodeTypes: [
          { id: "person", name: "Person", properties: {} },
          { id: "person", name: "Person 2", properties: {} },
        ],
        edgeTypes: [],
      }),
    ).toThrow();
  });

  it("rejects edge types referencing unknown node types", () => {
    expect(() =>
      OntologyRegistry.parse({
        nodeTypes: [{ id: "person", name: "Person", properties: {} }],
        edgeTypes: [
          {
            id: "works_at",
            name: "Works At",
            from: "person",
            to: "missing",
            properties: {},
          },
        ],
      }),
    ).toThrow();
  });

  it("validates a node against its type", () => {
    const node = registry.parseNode({
      id: "1",
      type: "person",
      properties: {
        name: "Alice",
        tags: ["engineer"],
        meta: { active: true },
      },
    });

    expect(node.properties.name).toBe("Alice");
  });

  it("defaults missing node properties to an empty object when type has none", () => {
    const emptyRegistry = OntologyRegistry.parse({
      nodeTypes: [{ id: "marker", name: "Marker" }],
      edgeTypes: [],
    });

    const node = emptyRegistry.parseNode({
      id: "1",
      type: "marker",
    });

    expect(node.properties).toEqual({});
  });

  it("still requires declared properties when the properties field is omitted", () => {
    expect(() =>
      registry.parseNode({
        id: "1",
        type: "company",
      }),
    ).toThrow(/Missing required property/);
  });

  it("rejects unknown node type", () => {
    expect(() =>
      registry.parseNode({
        id: "1",
        type: "unknown",
        properties: {},
      }),
    ).toThrow(/Unknown node type/);
  });

  it("rejects unknown and missing properties", () => {
    expect(() =>
      registry.parseNode({
        id: "1",
        type: "person",
        properties: { name: "Alice", extra: true },
      }),
    ).toThrow();

    expect(() =>
      registry.parseNode({
        id: "1",
        type: "person",
        properties: { tags: [], meta: { active: true } },
      }),
    ).toThrow(/Missing required property/);
  });

  it("validates edge endpoints against node types", () => {
    const nodes = new Map<string, Node>([
      [
        "p1",
        {
          id: "p1",
          type: "person",
          properties: { name: "Alice", tags: [], meta: { active: true } },
        },
      ],
      ["c1", { id: "c1", type: "company", properties: { name: "Acme" } }],
    ]);

    const edge = registry.parseEdge(
      {
        id: "e1",
        type: "works_at",
        from: "p1",
        to: "c1",
        properties: { since: 2020 },
      },
      nodes,
    );

    expect(edge.properties.since).toBe(2020);
  });

  it("defaults missing edge properties to an empty object when type has none", () => {
    const relatedRegistry = OntologyRegistry.parse({
      nodeTypes: [
        { id: "person", name: "Person", properties: { name: "string" } },
        { id: "company", name: "Company", properties: { name: "string" } },
      ],
      edgeTypes: [{ id: "related_to", name: "Related To", from: "person", to: "company" }],
    });

    const nodes = new Map<string, Node>([
      ["p1", { id: "p1", type: "person", properties: { name: "Alice" } }],
      ["c1", { id: "c1", type: "company", properties: { name: "Acme" } }],
    ]);

    const edge = relatedRegistry.parseEdge(
      {
        id: "e1",
        type: "related_to",
        from: "p1",
        to: "c1",
      },
      nodes,
    );

    expect(edge.properties).toEqual({});
  });

  it("rejects mismatched edge endpoints", () => {
    const nodes = new Map<string, Node>([
      ["c1", { id: "c1", type: "company", properties: { name: "Acme" } }],
      ["c2", { id: "c2", type: "company", properties: { name: "Other" } }],
    ]);

    expect(() =>
      registry.parseEdge(
        {
          id: "e1",
          type: "works_at",
          from: "c1",
          to: "c2",
          properties: { since: 2020 },
        },
        nodes,
      ),
    ).toThrow(/Source node type/);
  });

  it("coerces date properties to Date objects", () => {
    const registry = OntologyRegistry.parse({
      nodeTypes: [{ id: "person", name: "Person", properties: { born: "date" } }],
      edgeTypes: [
        {
          id: "achieved",
          name: "Achieved",
          from: "person",
          to: "person",
          properties: { date: "date" },
        },
      ],
    });

    const node = registry.parseNode({
      id: "1",
      type: "person",
      properties: { born: "1867-11-07" },
    });

    expect(node.properties.born).toEqual(new Date(Date.UTC(1867, 10, 7)));

    const nodes = new Map([[node.id, node]]);
    const edge = registry.parseEdge(
      {
        id: "e1",
        type: "achieved",
        from: "1",
        to: "1",
        properties: { date: "1911" },
      },
      nodes,
    );

    expect(edge.properties.date).toEqual(new Date(Date.UTC(1911, 0, 1)));

    const edgeFromNumber = registry.parseEdge(
      {
        id: "e2",
        type: "achieved",
        from: "1",
        to: "1",
        properties: { date: 1903 },
      },
      nodes,
    );

    expect(edgeFromNumber.properties.date).toEqual(new Date(Date.UTC(1903, 0, 1)));

    expect(() =>
      registry.parseNode({
        id: "2",
        type: "person",
        properties: { born: "not-a-date" },
      }),
    ).toThrow();
  });

  it("allows optional properties to be omitted", () => {
    const optionalRegistry = OntologyRegistry.parse({
      nodeTypes: [
        {
          id: "person",
          name: "Person",
          properties: {
            name: "string",
            nickname: { type: "string", optional: true },
            tags: { type: "array", items: "string", required: false },
          },
        },
      ],
      edgeTypes: [
        {
          id: "works_at",
          name: "Works At",
          from: "person",
          to: "person",
          properties: {
            since: "number",
            title: { type: "string", optional: true },
          },
        },
      ],
    });

    const node = optionalRegistry.parseNode({
      id: "1",
      type: "person",
      properties: { name: "Alice" },
    });

    expect(node.properties).toEqual({ name: "Alice" });

    const nodes = new Map([[node.id, node]]);
    const edge = optionalRegistry.parseEdge(
      {
        id: "e1",
        type: "works_at",
        from: "1",
        to: "1",
        properties: { since: 2020 },
      },
      nodes,
    );

    expect(edge.properties).toEqual({ since: 2020 });
  });

  it("still validates optional properties when provided", () => {
    const optionalRegistry = OntologyRegistry.parse({
      nodeTypes: [
        {
          id: "person",
          name: "Person",
          properties: {
            name: "string",
            nickname: { type: "string", optional: true },
          },
        },
      ],
      edgeTypes: [],
    });

    const node = optionalRegistry.parseNode({
      id: "1",
      type: "person",
      properties: { name: "Alice", nickname: "Al" },
    });

    expect(node.properties.nickname).toBe("Al");

    expect(() =>
      optionalRegistry.parseNode({
        id: "2",
        type: "person",
        properties: { name: "Bob", nickname: 42 },
      }),
    ).toThrow(/Invalid value for property/);
  });

  it("supports optional nested object properties", () => {
    const optionalRegistry = OntologyRegistry.parse({
      nodeTypes: [
        {
          id: "person",
          name: "Person",
          properties: {
            name: "string",
            meta: {
              type: "object",
              optional: true,
              properties: {
                active: "boolean",
                note: { type: "string", optional: true },
              },
            },
          },
        },
      ],
      edgeTypes: [],
    });

    const withoutMeta = optionalRegistry.parseNode({
      id: "1",
      type: "person",
      properties: { name: "Alice" },
    });
    expect(withoutMeta.properties).toEqual({ name: "Alice" });

    const withMeta = optionalRegistry.parseNode({
      id: "2",
      type: "person",
      properties: { name: "Bob", meta: { active: true } },
    });
    expect(withMeta.properties.meta).toEqual({ active: true });
  });

  it("rejects property schemas that are both required and optional", () => {
    expect(() =>
      OntologyRegistry.parse({
        nodeTypes: [
          {
            id: "person",
            name: "Person",
            properties: {
              name: { type: "string", required: true, optional: true },
            },
          },
        ],
        edgeTypes: [],
      }),
    ).toThrow(/both required and optional/);
  });

  it("validates a full graph", () => {
    const graph = registry.parseGraph({
      nodes: [
        {
          id: "p1",
          type: "person",
          properties: { name: "Alice", tags: [], meta: { active: true } },
        },
        { id: "c1", type: "company", properties: { name: "Acme" } },
      ],
      edges: [
        {
          id: "e1",
          type: "works_at",
          from: "p1",
          to: "c1",
          properties: { since: 2020 },
        },
      ],
    });

    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
  });
});
