import { BaseQueryProvider } from "./base-query-provider.js";
import { QueryContext, QueryGraph } from "./types.js";
import {
  expandNeighborhood,
  formatEdge,
  formatNode,
  formatPathDescription,
  nodeSearchItems,
  shortestPaths,
  topKRelevant,
} from "./utils.js";

export class ShortestPathSearchQueryProvider extends BaseQueryProvider {
  async buildContext(query: string, graph: QueryGraph): Promise<QueryContext> {
    this.log.debug("Building shortest-path search context");
    const seeds = await topKRelevant(
      this.llmProvider,
      query,
      nodeSearchItems(graph.nodes),
      this.seedK,
    );
    const seedIds = seeds.map((seed) => seed.id);
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const materials: string[] = [];
    const collectedNodeIds = new Set<string>();
    const collectedEdges = new Map<string, (typeof graph.edges)[number]>();

    for (let left = 0; left < seedIds.length; left++) {
      for (let right = left + 1; right < seedIds.length; right++) {
        const paths = shortestPaths(seedIds[left], seedIds[right], graph.edges, this.topK);
        for (const path of paths) {
          materials.push(formatPathDescription(nodesById, path));
          for (const nodeId of path.nodeIds) {
            collectedNodeIds.add(nodeId);
          }
          for (const edge of path.edges) {
            collectedEdges.set(edge.id, edge);
          }
        }
      }
    }

    if (materials.length === 0) {
      this.log.debug("No shortest paths between seeds — falling back to 1-hop neighborhood");
      const neighborhood = expandNeighborhood(new Set(seedIds), graph.edges);
      for (const nodeId of neighborhood.nodeIds) {
        collectedNodeIds.add(nodeId);
      }
      for (const edge of neighborhood.edges) {
        collectedEdges.set(edge.id, edge);
      }
    }

    const nodeMaterials = [...collectedNodeIds]
      .map((nodeId) => nodesById.get(nodeId))
      .filter((node) => node !== undefined)
      .map((node) => formatNode(node));

    return {
      query,
      materials: [
        ...materials,
        ...nodeMaterials,
        ...[...collectedEdges.values()].map((edge) => formatEdge(edge)),
      ],
    };
  }
}
