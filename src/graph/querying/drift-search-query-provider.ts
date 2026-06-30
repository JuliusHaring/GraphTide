import { BaseQueryProvider } from "./base-query-provider.js";
import { LocalSearchQueryProvider } from "./local-search-query-provider.js";
import { QueryContext, QueryGraph } from "./types.js";
import { expandNeighborhood, formatCommunity, nodeSearchItems, topKBySimilarity } from "./utils.js";

export class DriftSearchQueryProvider extends BaseQueryProvider {
  private readonly localSearch = new LocalSearchQueryProvider(this.options);

  async buildContext(query: string, graph: QueryGraph): Promise<QueryContext> {
    this.log.debug("Building drift search context");
    const localContext = await this.localSearch.buildContext(query, graph);
    const communities = await this.ensureCommunities(graph);
    if (communities.length === 0) {
      return localContext;
    }

    const [queryEmbedding] = await this.llmProvider.embed([query]);
    const seeds = topKBySimilarity(
      this.llmProvider,
      queryEmbedding,
      nodeSearchItems(graph.nodes),
      this.seedK,
    );
    const seedIds = new Set(seeds.map((seed) => seed.id));
    const neighborhood = expandNeighborhood(seedIds, graph.edges);
    const relevantCommunities = communities.filter((community) =>
      community.nodeIds.some((nodeId) => neighborhood.nodeIds.has(nodeId)),
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
