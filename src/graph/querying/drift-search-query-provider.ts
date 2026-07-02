import { BaseQueryProvider } from "./base-query-provider.js";
import { LocalSearchQueryProvider } from "./local-search-query-provider.js";
import { QueryContext, QueryGraph } from "./types.js";
import { expandNeighborhood, formatCommunity, nodeSearchItems, topKRelevant } from "./utils.js";

export class DriftSearchQueryProvider extends BaseQueryProvider {
  private readonly localSearch = new LocalSearchQueryProvider(this.options);

  async buildContext(query: string, graph: QueryGraph): Promise<QueryContext> {
    this.log.debug("Building drift search context");
    const localContext = await this.localSearch.buildContext(query, graph);
    const communities = await this.ensureCommunities(graph);
    if (communities.length === 0) {
      return localContext;
    }

    const seeds = await topKRelevant(
      this.llmProvider,
      query,
      nodeSearchItems(graph.nodes),
      this.seedK,
    );
    const seedIds = new Set(seeds.map((seed) => seed.id));
    const neighborhood = expandNeighborhood(seedIds, graph.edges);
    const neighborhoodIds = new Set(neighborhood.nodeIds);
    const relevantCommunities = communities.filter((community) =>
      community.nodeIds.some((nodeId) => neighborhoodIds.has(nodeId)),
    );

    const communityMaterials = relevantCommunities.map((community) =>
      formatCommunity(community.id, community.summary),
    );
    this.log.debug("Drift context ready", {
      communities: communityMaterials.length,
      localMaterials: localContext.materials.length,
    });

    return {
      query,
      materials: [...communityMaterials, ...localContext.materials],
    };
  }
}
