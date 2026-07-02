import { BaseQueryProvider } from "./base-query-provider.js";
import { QueryContext, QueryGraph } from "./types.js";
import { formatCommunity, topKRelevant } from "./utils.js";

export class GlobalSearchQueryProvider extends BaseQueryProvider {
  async buildContext(query: string, graph: QueryGraph): Promise<QueryContext> {
    this.log.debug("Building global search context");
    const communities = await this.ensureCommunities(graph);
    if (communities.length === 0) {
      return { query, materials: [] };
    }

    const ranked = await topKRelevant(
      this.llmProvider,
      query,
      communities.map((community) => ({
        id: community.id,
        text: formatCommunity(community.id, community.summary),
      })),
      this.topK,
    );
    this.log.debug("Global search ranked", { results: ranked.length });

    return {
      query,
      materials: ranked.map((item) => item.text),
    };
  }
}
