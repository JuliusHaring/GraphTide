import { Edge, Node, PropertyValue } from "./ontology.js";

export type ListFilterOptions = {
  type?: string | string[];
  where?: Record<string, PropertyValue>;
  /** Case-insensitive text match on id, type, and property values. */
  search?: string;
  limit?: number;
  offset?: number;
};

export type ListNodesOptions = ListFilterOptions;

export type ListEdgesOptions = ListFilterOptions & {
  from?: string | string[];
  to?: string | string[];
  /** Edges incident to any of these node ids. */
  nodeId?: string | string[];
};

export type SemanticSearchOptions = {
  topK?: number;
  type?: string | string[];
};

export type SearchResult<T> = {
  item: T;
  score: number;
};

function matchesType(type: string, filter?: string | string[]): boolean {
  if (!filter) {
    return true;
  }
  const types = Array.isArray(filter) ? filter : [filter];
  return types.includes(type);
}

function matchesIds(id: string, filter?: string | string[]): boolean {
  if (!filter) {
    return true;
  }
  const ids = Array.isArray(filter) ? filter : [filter];
  return ids.includes(id);
}

function propertyValueEquals(left: PropertyValue, right: PropertyValue): boolean {
  if (left === right) {
    return true;
  }
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }
  if (
    typeof left === "object" &&
    left !== null &&
    typeof right === "object" &&
    right !== null
  ) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return false;
}

function matchesWhere(
  properties: Record<string, PropertyValue>,
  where?: Record<string, PropertyValue>,
): boolean {
  if (!where) {
    return true;
  }

  return Object.entries(where).every(
    ([key, value]) => key in properties && propertyValueEquals(properties[key], value),
  );
}

function searchableText(
  id: string,
  type: string,
  properties: Record<string, PropertyValue>,
): string {
  const parts = [id, type];

  for (const value of Object.values(properties)) {
    if (value === null) {
      continue;
    }
    if (value instanceof Date) {
      parts.push(value.toISOString());
    } else if (typeof value === "object") {
      parts.push(JSON.stringify(value));
    } else {
      parts.push(String(value));
    }
  }

  return parts.join(" ").toLowerCase();
}

function matchesSearch(
  id: string,
  type: string,
  properties: Record<string, PropertyValue>,
  search?: string,
): boolean {
  if (!search) {
    return true;
  }

  return searchableText(id, type, properties).includes(search.toLowerCase());
}

function matchesNodeId(edge: Edge, nodeId?: string | string[]): boolean {
  if (!nodeId) {
    return true;
  }

  const ids = Array.isArray(nodeId) ? nodeId : [nodeId];
  return ids.some((id) => edge.from === id || edge.to === id);
}

function applyPagination<T>(items: T[], limit?: number, offset?: number): T[] {
  let result = items;
  if (offset) {
    result = result.slice(offset);
  }
  if (limit !== undefined) {
    result = result.slice(0, limit);
  }
  return result;
}

export function filterNodes(nodes: Node[], options: ListNodesOptions = {}): Node[] {
  const filtered = nodes.filter(
    (node) =>
      matchesType(node.type, options.type) &&
      matchesWhere(node.properties ?? {}, options.where) &&
      matchesSearch(node.id, node.type, node.properties ?? {}, options.search),
  );

  return applyPagination(filtered, options.limit, options.offset);
}

export function filterEdges(edges: Edge[], options: ListEdgesOptions = {}): Edge[] {
  const filtered = edges.filter(
    (edge) =>
      matchesType(edge.type, options.type) &&
      matchesIds(edge.from, options.from) &&
      matchesIds(edge.to, options.to) &&
      matchesNodeId(edge, options.nodeId) &&
      matchesWhere(edge.properties ?? {}, options.where) &&
      matchesSearch(
        `${edge.id} ${edge.from} ${edge.to}`,
        edge.type,
        edge.properties ?? {},
        options.search,
      ),
  );

  return applyPagination(filtered, options.limit, options.offset);
}
