import { BaseLLMProvider } from "../../llm/base-llm-provider.js";
import { Edge, Node } from "../ontology.js";

export type ScoredItem = {
  id: string;
  text: string;
  score: number;
};

export function formatNode(node: Node): string {
  return `Node ${node.id} (${node.type}): ${JSON.stringify(node.properties)}`;
}

export function formatEdge(edge: Edge): string {
  return `Edge ${edge.id} (${edge.type}): ${edge.from} -> ${edge.to}, ${JSON.stringify(edge.properties)}`;
}

export function formatCommunity(id: string, summary: string): string {
  return `Community ${id}: ${summary}`;
}

export function topKBySimilarity(
  llmProvider: BaseLLMProvider,
  queryEmbedding: number[],
  items: Array<{ id: string; embedding?: number[]; text: string }>,
  topK: number,
): ScoredItem[] {
  return items
    .filter((item) => item.embedding && item.embedding.length > 0)
    .map((item) => ({
      id: item.id,
      text: item.text,
      score: llmProvider.computeSimilarity(queryEmbedding, item.embedding!, "cosine"),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}

export function topKByTextMatch(
  query: string,
  items: Array<{ id: string; text: string }>,
  topK: number,
): ScoredItem[] {
  const terms = query
    .toLowerCase()
    .split(/\W+/)
    .filter((term) => term.length > 1);

  const scored = items.map((item) => {
    const haystack = item.text.toLowerCase();
    const matches = terms.filter((term) => haystack.includes(term)).length;
    const score = terms.length > 0 ? matches / terms.length : 0;
    return { id: item.id, text: item.text, score };
  });

  scored.sort((left, right) => right.score - left.score);

  if (scored.every((item) => item.score === 0)) {
    return scored.slice(0, topK);
  }

  return scored.filter((item) => item.score > 0).slice(0, topK);
}

export function itemsHaveEmbeddings(items: Array<{ embedding?: number[] }>): boolean {
  return items.some((item) => item.embedding && item.embedding.length > 0);
}

export async function topKRelevant(
  llmProvider: BaseLLMProvider,
  query: string,
  items: Array<{ id: string; embedding?: number[]; text: string }>,
  topK: number,
): Promise<ScoredItem[]> {
  if (itemsHaveEmbeddings(items)) {
    const [queryEmbedding] = await llmProvider.embed([query]);
    return topKBySimilarity(llmProvider, queryEmbedding, items, topK);
  }

  return topKByTextMatch(query, items, topK);
}

export function expandNeighborhood(seedIds: Set<string>, edges: Edge[]): GraphNeighborhood {
  return expandNeighborhoodBfs(seedIds, edges, 1);
}

export type GraphNeighborhood = {
  nodeIds: string[];
  edges: Edge[];
};

export function expandNeighborhoodBfs(
  seedIds: Set<string> | Iterable<string>,
  edges: Edge[],
  maxHops: number,
  topK?: number,
): GraphNeighborhood {
  const seeds = new Set(seedIds);
  if (maxHops <= 0 || seeds.size === 0) {
    const nodeIds = topK === undefined ? [...seeds] : [...seeds].slice(0, topK);
    return { nodeIds, edges: [] };
  }

  const nodeIdSet = new Set(seeds);
  const order: string[] = [...seeds];
  const neighborhoodEdges = new Map<string, Edge>();
  const visited = new Set(seeds);
  const queue: Array<{ id: string; depth: number }> = [...seeds].map((id) => ({ id, depth: 0 }));

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (depth >= maxHops) {
      continue;
    }

    for (const edge of edges) {
      if (edge.from !== id && edge.to !== id) {
        continue;
      }

      neighborhoodEdges.set(edge.id, edge);
      const neighbor = edge.from === id ? edge.to : edge.from;

      for (const nodeId of [edge.from, edge.to]) {
        if (!nodeIdSet.has(nodeId) && (topK === undefined || order.length < topK)) {
          nodeIdSet.add(nodeId);
          order.push(nodeId);
        }
      }

      if (!visited.has(neighbor)) {
        if (topK !== undefined && order.length >= topK) {
          continue;
        }
        visited.add(neighbor);
        queue.push({ id: neighbor, depth: depth + 1 });
      }
    }

    if (topK !== undefined && order.length >= topK) {
      break;
    }
  }

  const nodeIds = topK === undefined ? [...nodeIdSet] : order.slice(0, topK);
  const included = new Set(nodeIds);
  const filteredEdges = [...neighborhoodEdges.values()].filter(
    (edge) => included.has(edge.from) && included.has(edge.to),
  );

  return { nodeIds, edges: filteredEdges };
}

export type EdgeLookup = (nodeId: string) => Edge[] | Promise<Edge[]>;

export async function expandNeighborhoodBfsWithLookup(
  seedIds: Set<string> | Iterable<string>,
  getEdgesForNode: EdgeLookup,
  maxHops: number,
  topK?: number,
): Promise<GraphNeighborhood> {
  const seeds = new Set(seedIds);
  if (maxHops <= 0 || seeds.size === 0) {
    const nodeIds = topK === undefined ? [...seeds] : [...seeds].slice(0, topK);
    return { nodeIds, edges: [] };
  }

  const nodeIdSet = new Set(seeds);
  const order: string[] = [...seeds];
  const neighborhoodEdges = new Map<string, Edge>();
  const visited = new Set(seeds);
  const queue: Array<{ id: string; depth: number }> = [...seeds].map((id) => ({ id, depth: 0 }));

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (depth >= maxHops) {
      continue;
    }

    const edges = await getEdgesForNode(id);
    for (const edge of edges) {
      neighborhoodEdges.set(edge.id, edge);
      const neighbor = edge.from === id ? edge.to : edge.from;

      for (const nodeId of [edge.from, edge.to]) {
        if (!nodeIdSet.has(nodeId) && (topK === undefined || order.length < topK)) {
          nodeIdSet.add(nodeId);
          order.push(nodeId);
        }
      }

      if (!visited.has(neighbor)) {
        if (topK !== undefined && order.length >= topK) {
          continue;
        }
        visited.add(neighbor);
        queue.push({ id: neighbor, depth: depth + 1 });
      }
    }

    if (topK !== undefined && order.length >= topK) {
      break;
    }
  }

  const nodeIds = topK === undefined ? [...nodeIdSet] : order.slice(0, topK);
  const included = new Set(nodeIds);
  const filteredEdges = [...neighborhoodEdges.values()].filter(
    (edge) => included.has(edge.from) && included.has(edge.to),
  );

  return { nodeIds, edges: filteredEdges };
}

export type GraphPath = {
  nodeIds: string[];
  edges: Edge[];
};

export function shortestPaths(
  startId: string,
  endId: string,
  edges: Edge[],
  limit: number,
): GraphPath[] {
  if (limit <= 0) {
    return [];
  }

  if (startId === endId) {
    return [{ nodeIds: [startId], edges: [] }];
  }

  const results: GraphPath[] = [];
  let frontier: GraphPath[] = [{ nodeIds: [startId], edges: [] }];

  while (frontier.length > 0 && results.length < limit) {
    const nextFrontier: GraphPath[] = [];

    for (const path of frontier) {
      const currentId = path.nodeIds[path.nodeIds.length - 1];

      if (currentId === endId) {
        results.push(path);
        if (results.length >= limit) {
          return results;
        }
        continue;
      }

      const visited = new Set(path.nodeIds);

      for (const edge of edges) {
        if (edge.from !== currentId && edge.to !== currentId) {
          continue;
        }

        const neighbor = edge.from === currentId ? edge.to : edge.from;
        if (visited.has(neighbor)) {
          continue;
        }

        nextFrontier.push({
          nodeIds: [...path.nodeIds, neighbor],
          edges: [...path.edges, edge],
        });
      }
    }

    frontier = nextFrontier;
  }

  return results;
}

export async function shortestPathsWithLookup(
  startId: string,
  endId: string,
  getEdgesForNode: EdgeLookup,
  limit: number,
): Promise<GraphPath[]> {
  if (limit <= 0) {
    return [];
  }

  if (startId === endId) {
    return [{ nodeIds: [startId], edges: [] }];
  }

  const results: GraphPath[] = [];
  let frontier: GraphPath[] = [{ nodeIds: [startId], edges: [] }];

  while (frontier.length > 0 && results.length < limit) {
    const nextFrontier: GraphPath[] = [];

    for (const path of frontier) {
      const currentId = path.nodeIds[path.nodeIds.length - 1];

      if (currentId === endId) {
        results.push(path);
        if (results.length >= limit) {
          return results;
        }
        continue;
      }

      const visited = new Set(path.nodeIds);
      const edges = await getEdgesForNode(currentId);

      for (const edge of edges) {
        if (edge.from !== currentId && edge.to !== currentId) {
          continue;
        }

        const neighbor = edge.from === currentId ? edge.to : edge.from;
        if (visited.has(neighbor)) {
          continue;
        }

        nextFrontier.push({
          nodeIds: [...path.nodeIds, neighbor],
          edges: [...path.edges, edge],
        });
      }
    }

    frontier = nextFrontier;
  }

  return results;
}

export function shortestPath(startId: string, endId: string, edges: Edge[]): GraphPath | undefined {
  return shortestPaths(startId, endId, edges, 1)[0];
}

export function formatPathDescription(nodesById: Map<string, Node>, path: GraphPath): string {
  const segments: string[] = [];

  for (let index = 0; index < path.edges.length; index++) {
    const node = nodesById.get(path.nodeIds[index]);
    if (node) {
      segments.push(formatNode(node));
    }
    segments.push(formatEdge(path.edges[index]));
  }

  const lastNode = nodesById.get(path.nodeIds[path.nodeIds.length - 1]);
  if (lastNode) {
    segments.push(formatNode(lastNode));
  }

  const hops = Math.max(0, path.nodeIds.length - 1);
  return `Path (${hops} hop${hops === 1 ? "" : "s"}): ${segments.join(" then ")}`;
}

export function nodeSearchItems(nodes: Node[]) {
  return nodes.map((node) => ({
    id: node.id,
    embedding: node.embedding,
    text: formatNode(node),
  }));
}

export function edgeSearchItems(edges: Edge[]) {
  return edges.map((edge) => ({
    id: edge.id,
    embedding: edge.embedding,
    text: formatEdge(edge),
  }));
}

export function buildGraphSignature(nodes: Node[], edges: Edge[]): string {
  const nodeIds = nodes
    .map((node) => node.id)
    .sort()
    .join(",");
  const edgeIds = edges
    .map((edge) => edge.id)
    .sort()
    .join(",");
  return `${nodeIds}|${edgeIds}`;
}

export function detectCommunities(
  nodes: Node[],
  edges: Edge[],
): Array<{ id: string; nodeIds: string[] }> {
  const parent = new Map<string, string>();

  for (const node of nodes) {
    parent.set(node.id, node.id);
  }

  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) {
      root = parent.get(root)!;
    }

    let current = id;
    while (current !== root) {
      const next = parent.get(current)!;
      parent.set(current, root);
      current = next;
    }

    return root;
  };

  const union = (left: string, right: string): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parent.set(leftRoot, rightRoot);
    }
  };

  for (const edge of edges) {
    if (parent.has(edge.from) && parent.has(edge.to)) {
      union(edge.from, edge.to);
    }
  }

  const groups = new Map<string, string[]>();
  for (const node of nodes) {
    const root = find(node.id);
    const group = groups.get(root) ?? [];
    group.push(node.id);
    groups.set(root, group);
  }

  return [...groups.values()].map((nodeIds, index) => ({
    id: `community-${index + 1}`,
    nodeIds,
  }));
}
