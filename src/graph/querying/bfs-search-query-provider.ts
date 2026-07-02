import { BaseQueryProvider } from "./base-query-provider.js";
import { QueryContext, QueryGraph } from "./types.js";
import {
  expandNeighborhoodBfs,
  formatEdge,
  formatNode,
  nodeSearchItems,
  topKRelevant,
} from "./utils.js";

export class BfsSearchQueryProvider extends BaseQueryProvider {
  async buildContext(query: string, graph: QueryGraph): Promise<QueryContext> {
    this.log.debug("Building BFS search context", { maxHops: this.maxHops });
    const seeds = await topKRelevant(
      this.llmProvider,
      query,
      nodeSearchItems(graph.nodes),
      this.seedK,
    );
    const seedIds = new Set(seeds.map((seed) => seed.id));
    const neighborhood = expandNeighborhoodBfs(seedIds, graph.edges, this.maxHops, this.topK);
    this.log.debug("BFS neighborhood expanded", {
      seeds: seedIds.size,
      maxHops: this.maxHops,
      nodes: neighborhood.nodeIds.length,
      edges: neighborhood.edges.length,
    });

    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const materials: string[] = [];

    for (const nodeId of neighborhood.nodeIds) {
      const node = nodesById.get(nodeId);
      if (node) {
        materials.push(formatNode(node));
      }
    }
    for (const edge of neighborhood.edges) {
      materials.push(formatEdge(edge));
    }

    return { query, materials };
  }
}
