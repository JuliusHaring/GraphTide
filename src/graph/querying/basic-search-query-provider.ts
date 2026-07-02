import { BaseQueryProvider } from "./base-query-provider.js";
import { QueryContext, QueryGraph } from "./types.js";
import { edgeSearchItems, nodeSearchItems, topKRelevant } from "./utils.js";

export class BasicSearchQueryProvider extends BaseQueryProvider {
  async buildContext(query: string, graph: QueryGraph): Promise<QueryContext> {
    this.log.debug("Building basic search context");
    const ranked = await topKRelevant(
      this.llmProvider,
      query,
      [...nodeSearchItems(graph.nodes), ...edgeSearchItems(graph.edges)],
      this.topK,
    );
    this.log.debug("Basic search ranked", { results: ranked.length });

    return {
      query,
      materials: ranked.map((item) => item.text),
    };
  }
}
