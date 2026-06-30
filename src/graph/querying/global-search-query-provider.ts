import { BaseQueryProvider } from "./base-query-provider.js";
import { QueryContext, QueryGraph } from "./types.js";
import { formatCommunity, topKBySimilarity } from "./utils.js";

export class GlobalSearchQueryProvider extends BaseQueryProvider {
  async buildContext(query: string, graph: QueryGraph): Promise<QueryContext> {
    this.log.debug("Building global search context");
    const communities = await this.ensureCommunities(graph);
    if (communities.length === 0) {
      return { query, materials: [] };
    }

    const [queryEmbedding] = await this.llmProvider.embed([query]);
    const summaries = communities.map((community) => community.summary);
    const summaryEmbeddings = await this.llmProvider.embed(summaries);
    const ranked = topKBySimilarity(
      this.llmProvider,
      queryEmbedding,
      communities.map((community, index) => ({
        id: community.id,
        embedding: summaryEmbeddings[index],
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
