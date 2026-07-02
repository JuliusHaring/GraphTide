import { z } from "zod";

export type PrimitivePropertyType = "string" | "number" | "boolean" | "date";

export type PropertySchema =
  | PrimitivePropertyType
  | {
      type: PrimitivePropertyType;
      required?: boolean;
      optional?: boolean;
    }
  | {
      type: "array";
      items: PropertySchema;
      required?: boolean;
      optional?: boolean;
    }
  | {
      type: "object";
      properties: Record<string, PropertySchema>;
      required?: boolean;
      optional?: boolean;
    };

/** @deprecated Use {@link PropertySchema} instead. */
export type PropertyType = PropertySchema;

type NormalizedPropertySchema = {
  core: PropertyCore;
  required: boolean;
};

type PropertyCore =
  | { kind: "primitive"; primitive: PrimitivePropertyType }
  | { kind: "array"; items: NormalizedPropertySchema }
  | { kind: "object"; properties: Record<string, NormalizedPropertySchema> };

export const DateValueSchema = z.union([
  z.date(),
  z.iso.date().transform((value) => parseIsoDateToUtc(value)),
  z.iso.datetime().transform((value) => new Date(value)),
  z
    .number()
    .int()
    .min(1000)
    .max(9999)
    .transform((year) => new Date(Date.UTC(year, 0, 1))),
  z
    .string()
    .regex(/^\d{4}$/)
    .transform((year) => new Date(Date.UTC(Number(year), 0, 1))),
]);

function parseIsoDateToUtc(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function resolveRequiredFlag(
  required: boolean | undefined,
  optional: boolean | undefined,
  path: (string | number)[],
): { required: boolean; issues: z.ZodIssue[] } {
  if (required === true && optional === true) {
    return {
      required: true,
      issues: [
        {
          code: "custom",
          message: `Property cannot be both required and optional`,
          path,
        },
      ],
    };
  }

  if (optional === true || required === false) {
    return { required: false, issues: [] };
  }

  return { required: true, issues: [] };
}

function normalizePropertySchema(
  raw: unknown,
  path: (string | number)[] = [],
): { schema: NormalizedPropertySchema; issues: z.ZodIssue[] } {
  if (raw === "string" || raw === "number" || raw === "boolean" || raw === "date") {
    return {
      schema: {
        core: { kind: "primitive", primitive: raw },
        required: true,
      },
      issues: [],
    };
  }

  if (typeof raw !== "object" || raw === null || !("type" in raw)) {
    return {
      schema: {
        core: { kind: "primitive", primitive: "string" },
        required: true,
      },
      issues: [
        {
          code: "custom",
          message: "Invalid property schema",
          path,
        },
      ],
    };
  }

  const value = raw as {
    type: string;
    required?: boolean;
    optional?: boolean;
    items?: unknown;
    properties?: Record<string, unknown>;
  };
  const { required, issues: requiredIssues } = resolveRequiredFlag(
    value.required,
    value.optional,
    path,
  );

  if (value.type === "array") {
    const { schema: items, issues: itemIssues } = normalizePropertySchema(value.items, [
      ...path,
      "items",
    ]);

    return {
      schema: {
        core: { kind: "array", items },
        required,
      },
      issues: [...requiredIssues, ...itemIssues],
    };
  }

  if (value.type === "object") {
    const properties: Record<string, NormalizedPropertySchema> = {};
    const issues = [...requiredIssues];

    for (const [key, propertySchema] of Object.entries(value.properties ?? {})) {
      const normalized = normalizePropertySchema(propertySchema, [...path, "properties", key]);
      properties[key] = normalized.schema;
      issues.push(...normalized.issues);
    }

    return {
      schema: {
        core: { kind: "object", properties },
        required,
      },
      issues,
    };
  }

  if (
    value.type === "string" ||
    value.type === "number" ||
    value.type === "boolean" ||
    value.type === "date"
  ) {
    return {
      schema: {
        core: { kind: "primitive", primitive: value.type },
        required,
      },
      issues: requiredIssues,
    };
  }

  return {
    schema: {
      core: { kind: "primitive", primitive: "string" },
      required: true,
    },
    issues: [
      ...requiredIssues,
      {
        code: "custom",
        message: `Unknown property type "${value.type}"`,
        path: [...path, "type"],
      },
    ],
  };
}

const PropertySchemaInput: z.ZodType<PropertySchema> = z.lazy(() =>
  z.union([
    z.literal("string"),
    z.literal("number"),
    z.literal("boolean"),
    z.literal("date"),
    z.object({
      type: z.union([
        z.literal("string"),
        z.literal("number"),
        z.literal("boolean"),
        z.literal("date"),
      ]),
      required: z.boolean().optional(),
      optional: z.boolean().optional(),
    }),
    z.object({
      type: z.literal("array"),
      items: PropertySchemaInput,
      required: z.boolean().optional(),
      optional: z.boolean().optional(),
    }),
    z.object({
      type: z.literal("object"),
      properties: z.record(z.string(), PropertySchemaInput),
      required: z.boolean().optional(),
      optional: z.boolean().optional(),
    }),
  ]),
);

function normalizePropertyMap(
  properties: Record<string, PropertySchema>,
  pathPrefix: (string | number)[],
): { properties: Record<string, NormalizedPropertySchema>; issues: z.ZodIssue[] } {
  const normalized: Record<string, NormalizedPropertySchema> = {};
  const issues: z.ZodIssue[] = [];

  for (const [key, propertySchema] of Object.entries(properties)) {
    const result = normalizePropertySchema(propertySchema, [...pathPrefix, key]);
    normalized[key] = result.schema;
    issues.push(...result.issues);
  }

  return { properties: normalized, issues };
}

export const PropertyValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.date(),
  z.array(z.unknown()),
  z.record(z.string(), z.unknown()),
  z.null(),
]);

export type PropertyValue = z.infer<typeof PropertyValueSchema>;

export type NodeType = {
  id: string;
  name: string;
  properties: Record<string, NormalizedPropertySchema>;
};

export type EdgeType = {
  id: string;
  name: string;
  from: string;
  to: string;
  properties: Record<string, NormalizedPropertySchema>;
};

export const NodeTypeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    properties: z.record(z.string(), PropertySchemaInput).optional().default({}),
  })
  .transform((nodeType) => {
    const { properties, issues } = normalizePropertyMap(nodeType.properties, ["properties"]);
    if (issues.length > 0) {
      throw new z.ZodError(issues);
    }
    return {
      id: nodeType.id,
      name: nodeType.name,
      properties,
    };
  });

export const EdgeTypeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    from: z.string(),
    to: z.string(),
    properties: z.record(z.string(), PropertySchemaInput).optional().default({}),
  })
  .transform((edgeType) => {
    const { properties, issues } = normalizePropertyMap(edgeType.properties, ["properties"]);
    if (issues.length > 0) {
      throw new z.ZodError(issues);
    }
    return {
      id: edgeType.id,
      name: edgeType.name,
      from: edgeType.from,
      to: edgeType.to,
      properties,
    };
  });

export const OntologySchema = z
  .object({
    nodeTypes: z.array(NodeTypeSchema),
    edgeTypes: z.array(EdgeTypeSchema),
  })
  .superRefine((data, ctx) => {
    const nodeTypeIds = new Set<string>();

    data.nodeTypes.forEach((nodeType, index) => {
      if (nodeTypeIds.has(nodeType.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate node type id "${nodeType.id}"`,
          path: ["nodeTypes", index, "id"],
        });
      }
      nodeTypeIds.add(nodeType.id);
    });

    const edgeTypeIds = new Set<string>();

    data.edgeTypes.forEach((edgeType, index) => {
      if (edgeTypeIds.has(edgeType.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate edge type id "${edgeType.id}"`,
          path: ["edgeTypes", index, "id"],
        });
      }
      edgeTypeIds.add(edgeType.id);

      if (!nodeTypeIds.has(edgeType.from)) {
        ctx.addIssue({
          code: "custom",
          message: `Unknown node type "${edgeType.from}" referenced as edge source`,
          path: ["edgeTypes", index, "from"],
        });
      }

      if (!nodeTypeIds.has(edgeType.to)) {
        ctx.addIssue({
          code: "custom",
          message: `Unknown node type "${edgeType.to}" referenced as edge target`,
          path: ["edgeTypes", index, "to"],
        });
      }
    });
  });

export type Ontology = z.infer<typeof OntologySchema>;

export const NodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  properties: z.record(z.string(), PropertyValueSchema).optional().default({}),
  embedding: z.array(z.number()).optional(),
});

export type Node = z.infer<typeof NodeSchema>;

export const EdgeSchema = z.object({
  id: z.string(),
  type: z.string(),
  from: z.string(),
  to: z.string(),
  properties: z.record(z.string(), PropertyValueSchema).optional().default({}),
  embedding: z.array(z.number()).optional(),
});

export type Edge = z.infer<typeof EdgeSchema>;

export const GraphSchema = z.object({
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});

export type Graph = z.infer<typeof GraphSchema>;

export function serializeNodeForEmbedding(node: Pick<Node, "type" | "properties">): string {
  return JSON.stringify({ type: node.type, properties: node.properties });
}

export function serializeEdgeForEmbedding(
  edge: Pick<Edge, "type" | "from" | "to" | "properties">,
): string {
  return JSON.stringify({
    type: edge.type,
    from: edge.from,
    to: edge.to,
    properties: edge.properties,
  });
}

function createPrimitiveValueValidator(primitive: PrimitivePropertyType): z.ZodType {
  if (primitive === "string") {
    return z.string().nullable();
  }
  if (primitive === "number") {
    return z.number().nullable();
  }
  if (primitive === "boolean") {
    return z.boolean().nullable();
  }

  return DateValueSchema.nullable();
}

export function createPropertyValueValidator(propertySchema: NormalizedPropertySchema): z.ZodType {
  if (propertySchema.core.kind === "primitive") {
    return createPrimitiveValueValidator(propertySchema.core.primitive);
  }

  if (propertySchema.core.kind === "array") {
    return z.array(createPropertyValueValidator(propertySchema.core.items)).nullable();
  }

  const shape = Object.fromEntries(
    Object.entries(propertySchema.core.properties).map(([key, childSchema]) => {
      const validator = createPropertyValueValidator(childSchema);
      return [key, childSchema.required ? validator : validator.optional()];
    }),
  );

  return z.object(shape).nullable();
}

function normalizeInstanceProperties(
  properties: Record<string, unknown>,
  propertySchemas: Record<string, NormalizedPropertySchema>,
  pathPrefix: (string | number)[],
): { properties: Record<string, PropertyValue>; issues: z.ZodIssue[] } {
  const issues: z.ZodIssue[] = [];
  const normalized: Record<string, PropertyValue> = {};

  for (const key of Object.keys(properties)) {
    if (!(key in propertySchemas)) {
      issues.push({
        code: "custom",
        message: `Unknown property "${key}"`,
        path: [...pathPrefix, "properties", key],
      });
    }
  }

  for (const [key, propertySchema] of Object.entries(propertySchemas)) {
    if (!(key in properties)) {
      if (propertySchema.required) {
        issues.push({
          code: "custom",
          message: `Missing required property "${key}"`,
          path: [...pathPrefix, "properties"],
        });
      }
      continue;
    }

    const result = createPropertyValueValidator(propertySchema).safeParse(properties[key]);
    if (!result.success) {
      issues.push({
        code: "custom",
        message: `Invalid value for property "${key}"`,
        path: [...pathPrefix, "properties", key],
      });
      continue;
    }

    if (result.data !== undefined) {
      normalized[key] = result.data as PropertyValue;
    }
  }

  return { properties: normalized, issues };
}

export class OntologyRegistry {
  private readonly nodeTypesById: Map<string, NodeType>;
  private readonly edgeTypesById: Map<string, EdgeType>;

  constructor(readonly ontology: Ontology) {
    this.nodeTypesById = new Map(ontology.nodeTypes.map((nodeType) => [nodeType.id, nodeType]));
    this.edgeTypesById = new Map(ontology.edgeTypes.map((edgeType) => [edgeType.id, edgeType]));
  }

  static parse(raw: unknown): OntologyRegistry {
    return new OntologyRegistry(OntologySchema.parse(raw));
  }

  getNodeType(id: string): NodeType | undefined {
    return this.nodeTypesById.get(id);
  }

  getEdgeType(id: string): EdgeType | undefined {
    return this.edgeTypesById.get(id);
  }

  parseNode(raw: unknown): Node {
    const node = NodeSchema.parse(raw);
    const nodeType = this.nodeTypesById.get(node.type);

    if (!nodeType) {
      throw new z.ZodError([
        {
          code: "custom",
          message: `Unknown node type "${node.type}"`,
          path: ["type"],
        },
      ]);
    }

    const { properties, issues } = normalizeInstanceProperties(
      node.properties,
      nodeType.properties,
      [],
    );

    if (issues.length > 0) {
      throw new z.ZodError(issues);
    }

    return { ...node, properties };
  }

  parseEdge(raw: unknown, nodesById?: ReadonlyMap<string, Node>): Edge {
    const edge = EdgeSchema.parse(raw);
    const edgeType = this.edgeTypesById.get(edge.type);

    if (!edgeType) {
      throw new z.ZodError([
        {
          code: "custom",
          message: `Unknown edge type "${edge.type}"`,
          path: ["type"],
        },
      ]);
    }

    const { properties, issues } = normalizeInstanceProperties(
      edge.properties,
      edgeType.properties,
      [],
    );

    if (nodesById) {
      const fromNode = nodesById.get(edge.from);
      const toNode = nodesById.get(edge.to);

      if (!fromNode) {
        issues.push({
          code: "custom",
          message: `Source node "${edge.from}" not found`,
          path: ["from"],
        });
      } else if (fromNode.type !== edgeType.from) {
        issues.push({
          code: "custom",
          message: `Source node type "${fromNode.type}" does not match edge type source "${edgeType.from}"`,
          path: ["from"],
        });
      }

      if (!toNode) {
        issues.push({
          code: "custom",
          message: `Target node "${edge.to}" not found`,
          path: ["to"],
        });
      } else if (toNode.type !== edgeType.to) {
        issues.push({
          code: "custom",
          message: `Target node type "${toNode.type}" does not match edge type target "${edgeType.to}"`,
          path: ["to"],
        });
      }
    }

    if (issues.length > 0) {
      throw new z.ZodError(issues);
    }

    return { ...edge, properties };
  }

  parseGraph(raw: unknown): Graph {
    const graph = GraphSchema.parse(raw);
    const issues: z.ZodIssue[] = [];

    const nodeIds = new Set<string>();
    graph.nodes.forEach((node, index) => {
      if (nodeIds.has(node.id)) {
        issues.push({
          code: "custom",
          message: `Duplicate node id "${node.id}"`,
          path: ["nodes", index, "id"],
        });
      }
      nodeIds.add(node.id);
    });

    const edgeIds = new Set<string>();
    graph.edges.forEach((edge, index) => {
      if (edgeIds.has(edge.id)) {
        issues.push({
          code: "custom",
          message: `Duplicate edge id "${edge.id}"`,
          path: ["edges", index, "id"],
        });
      }
      edgeIds.add(edge.id);
    });

    if (issues.length > 0) {
      throw new z.ZodError(issues);
    }

    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const validatedNodes = graph.nodes.map((node) => this.parseNode(node));
    const validatedEdges = graph.edges.map((edge) => this.parseEdge(edge, nodesById));

    return {
      nodes: validatedNodes,
      edges: validatedEdges,
    };
  }
}

/** @deprecated Use {@link PropertySchemaInput} instead. */
export const PropertyTypeSchema = PropertySchemaInput;
