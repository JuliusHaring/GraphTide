import { BaseQueryProvider } from "./base-query-provider.js";
import { QueryContext, QueryGraph } from "./types.js";
import {
  expandNeighborhood,
  formatEdge,
  formatNode,
  formatPathDescription,
  graphPathEdges,
  graphPathNodes,
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
    const collectedNodes = new Map<string, (typeof graph.nodes)[number]>();
    const collectedEdges = new Map<string, (typeof graph.edges)[number]>();

    for (let left = 0; left < seedIds.length; left++) {
      for (let right = left + 1; right < seedIds.length; right++) {
        const paths = shortestPaths(
          seedIds[left],
          seedIds[right],
          graph.edges,
          this.topK,
          nodesById,
        );
        for (const path of paths) {
          materials.push(formatPathDescription(path));
          for (const node of graphPathNodes(path)) {
            collectedNodes.set(node.id, node);
          }
          for (const edge of graphPathEdges(path)) {
            collectedEdges.set(edge.id, edge);
          }
        }
      }
    }

    if (materials.length === 0) {
      this.log.debug("No shortest paths between seeds — falling back to 1-hop neighborhood");
      const neighborhood = expandNeighborhood(new Set(seedIds), graph.edges);
      for (const nodeId of neighborhood.nodeIds) {
        const node = nodesById.get(nodeId);
        if (node) {
          collectedNodes.set(node.id, node);
        }
      }
      for (const edge of neighborhood.edges) {
        collectedEdges.set(edge.id, edge);
      }
    }

    const nodeMaterials = [...collectedNodes.values()].map((node) => formatNode(node));

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
