import { BaseLLMProvider } from "../../llm/base-llm-provider.js";
import { BaseStorageProvider } from "../../storage/base-storage-provider.js";
import { createLogger, Logger } from "../../utils/logger.js";
import { buildCommunitySummaryMessages, buildQueryAnswerMessages } from "./prompts.js";
import { Community, QueryContext, QueryGraph, QueryResult } from "./types.js";
import { buildGraphSignature, detectCommunities, formatEdge, formatNode } from "./utils.js";

export type QueryProviderOptions = {
  llmProvider: BaseLLMProvider;
  storageProvider: BaseStorageProvider;
  topK?: number;
  seedK?: number;
  /** Hop limit for BFS neighborhood expansion. */
  maxHops?: number;
};

const DEFAULT_TOP_K = 5;
const DEFAULT_SEED_K = 3;
const DEFAULT_MAX_HOPS = 2;

export abstract class BaseQueryProvider {
  protected readonly llmProvider: BaseLLMProvider;
  protected readonly storageProvider: BaseStorageProvider;
  protected readonly topK: number;
  protected readonly seedK: number;
  protected readonly maxHops: number;
  protected readonly log: Logger;
  private communitiesCache?: Community[];
  private graphSignature?: string;

  constructor(protected readonly options: QueryProviderOptions) {
    this.llmProvider = options.llmProvider;
    this.storageProvider = options.storageProvider;
    this.topK = options.topK ?? DEFAULT_TOP_K;
    this.seedK = options.seedK ?? DEFAULT_SEED_K;
    this.maxHops = options.maxHops ?? DEFAULT_MAX_HOPS;
    this.log = createLogger(this.constructor.name);
  }

  abstract buildContext(query: string, graph: QueryGraph): Promise<QueryContext>;

  async loadGraph(): Promise<QueryGraph> {
    this.log.debug("Loading graph");
    const [nodes, edges] = await Promise.all([
      this.storageProvider.listNodes(),
      this.storageProvider.listEdges(),
    ]);

    const graph = { nodes, edges };
    const communities = await this.resolveCommunities(graph);
    this.log.debug("Graph loaded", {
      nodes: nodes.length,
      edges: edges.length,
      communities: communities.length,
    });
    return { ...graph, communities };
  }

  async query(query: string, graph?: QueryGraph): Promise<QueryResult> {
    this.log.info("Running query", { query });
    const context = await this.buildContext(query, graph ?? (await this.loadGraph()));
    this.log.debug("Context built", { materials: context.materials.length });
    const answer = await this.answerFromContext(context);
    return { ...context, answer };
  }

  protected async answerFromContext(context: QueryContext): Promise<string> {
    return this.answer(context);
  }

  protected async ensureCommunities(graph: QueryGraph): Promise<Community[]> {
    if (graph.communities && graph.communities.length > 0) {
      return graph.communities;
    }

    const communities = await this.resolveCommunities(graph);
    graph.communities = communities;
    return communities;
  }

  protected async resolveCommunities(
    graph: Pick<QueryGraph, "nodes" | "edges">,
  ): Promise<Community[]> {
    const signature = buildGraphSignature(graph.nodes, graph.edges);
    if (this.communitiesCache && this.graphSignature === signature) {
      this.log.debug("Using cached communities", { count: this.communitiesCache.length });
      return this.communitiesCache;
    }

    const clusters = detectCommunities(graph.nodes, graph.edges);
    this.log.info("Detecting communities", { clusters: clusters.length });
    const communities = await Promise.all(
      clusters.map(async (cluster) => ({
        id: cluster.id,
        nodeIds: cluster.nodeIds,
        summary: await this.summarizeCommunity(cluster.nodeIds, graph),
      })),
    );

    this.communitiesCache = communities;
    this.graphSignature = signature;
    this.log.info("Communities ready", { count: communities.length });
    return communities;
  }

  private async summarizeCommunity(
    nodeIds: string[],
    graph: Pick<QueryGraph, "nodes" | "edges">,
  ): Promise<string> {
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const nodeIdSet = new Set(nodeIds);
    const materials = [
      ...nodeIds
        .map((nodeId) => nodesById.get(nodeId))
        .filter((node) => node !== undefined)
        .map((node) => formatNode(node)),
      ...graph.edges
        .filter((edge) => nodeIdSet.has(edge.from) || nodeIdSet.has(edge.to))
        .map((edge) => formatEdge(edge)),
    ];

    return this.llmProvider.generate(buildCommunitySummaryMessages(materials.join("\n")));
  }

  protected async answer(context: QueryContext): Promise<string> {
    const materials = context.materials.join("\n\n");
    return this.llmProvider.generate(buildQueryAnswerMessages(context.query, materials));
  }
}
