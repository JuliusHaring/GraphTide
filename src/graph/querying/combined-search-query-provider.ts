import { BaseQueryProvider, QueryProviderOptions } from "./base-query-provider.js";
import { BasicSearchQueryProvider } from "./basic-search-query-provider.js";
import { DriftSearchQueryProvider } from "./drift-search-query-provider.js";
import { GlobalSearchQueryProvider } from "./global-search-query-provider.js";
import { LocalSearchQueryProvider } from "./local-search-query-provider.js";
import { buildCombinedAnswerMessages, buildQueryRouterMessages } from "./prompts.js";
import { QueryContext, QueryGraph, QueryPlanSchema, QueryStrategy } from "./types.js";

export class CombinedSearchQueryProvider extends BaseQueryProvider {
  private readonly providers: Record<QueryStrategy, BaseQueryProvider>;

  constructor(options: QueryProviderOptions) {
    super(options);
    this.providers = {
      basic: new BasicSearchQueryProvider(options),
      local: new LocalSearchQueryProvider(options),
      global: new GlobalSearchQueryProvider(options),
      drift: new DriftSearchQueryProvider(options),
    };
  }

  async buildContext(query: string, graph: QueryGraph): Promise<QueryContext> {
    const strategies = await this.selectStrategies(query);
    this.log.info("Selected strategies", { strategies });
    const materials = await this.collectMaterials(query, graph, strategies);
    this.log.debug("Collected materials", {
      strategies: strategies.length,
      materials: materials.length,
    });

    return {
      query,
      materials,
    };
  }

  async query(query: string, graph?: QueryGraph): Promise<string> {
    this.log.info("Running combined query", { query });
    const context = await this.buildContext(query, graph ?? (await this.loadGraph()));
    this.log.debug("Synthesizing combined answer");
    return this.llmProvider.generate(buildCombinedAnswerMessages(context.query, context.materials));
  }

  private async selectStrategies(query: string): Promise<QueryStrategy[]> {
    const plan = await this.llmProvider.generate(
      buildQueryRouterMessages(query),
      undefined,
      QueryPlanSchema,
    );

    return [...new Set(plan.strategies)];
  }

  private async collectMaterials(
    query: string,
    graph: QueryGraph,
    strategies: QueryStrategy[],
  ): Promise<string[]> {
    const contexts = await Promise.all(
      strategies.map((strategy) => this.providers[strategy].buildContext(query, graph)),
    );

    return [...new Set(contexts.flatMap((context) => context.materials))];
  }
}
