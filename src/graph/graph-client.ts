import { BaseLLMProvider } from "../llm/base-llm-provider.js";
import { BaseStorageProvider } from "../storage/base-storage-provider.js";
import type { EdgeDirection } from "../storage/base-storage-provider.js";
import {
  BaseQueryProvider,
  BasicSearchQueryProvider,
  BfsSearchQueryProvider,
  CombinedSearchQueryProvider,
  DriftSearchQueryProvider,
  GlobalSearchQueryProvider,
  LocalSearchQueryProvider,
  ShortestPathSearchQueryProvider,
} from "./querying/index.js";
import type {
  QueryMethod,
  QueryOptions,
  QueryResult,
  QueryTuningOptions,
} from "./querying/types.js";
import {
  Edge,
  Graph,
  Node,
  Ontology,
  OntologyRegistry,
  PropertyValue,
  serializeEdgeForEmbedding,
  serializeNodeForEmbedding,
} from "./ontology.js";
import { LLMExtractor } from "./ingestion/llm-extractor.js";
import { TextExtractor } from "./ingestion/text-extractor.js";
import { IngestionOptions, resolveIngestionInput } from "./ingestion/chunking.js";
import { IngestionResult } from "./ingestion/types.js";
import {
  GraphNeighborhood,
  GraphPath,
  edgeSearchItems,
  expandNeighborhoodBfsWithLookup,
  nodeSearchItems,
  shortestPathsWithLookup,
  topKBySimilarity,
} from "./querying/utils.js";
import {
  ListEdgesOptions,
  ListNodesOptions,
  SearchResult,
  SemanticSearchOptions,
  filterEdges,
  filterNodes,
} from "./search.js";
import { mergeProperties } from "./properties.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("GraphClient");

export type GraphClientOptions = {
  storageProvider: BaseStorageProvider;
  llmProvider: BaseLLMProvider;
  ontology: Ontology;
  enableEmbedding?: boolean;
  /** Default query retrieval tuning for all query calls. */
  query?: QueryTuningOptions;
  /** Default ingestion chunking for document and text ingestion. */
  ingestion?: IngestionOptions;
};

export type CreateNodeInput = {
  id: string;
  type: string;
  properties?: Record<string, PropertyValue>;
};

export type UpdateNodeInput = {
  type?: string;
  properties?: Record<string, PropertyValue>;
  /** Property keys to remove before applying updates. */
  unsetProperties?: string[];
  embedding?: number[];
};

export type CreateEdgeInput = {
  id: string;
  type: string;
  from: string;
  to: string;
  properties?: Record<string, PropertyValue>;
};

export type UpdateEdgeInput = {
  type?: string;
  from?: string;
  to?: string;
  properties?: Record<string, PropertyValue>;
  /** Property keys to remove before applying updates. */
  unsetProperties?: string[];
  embedding?: number[];
};

export type UpsertResult<T> = {
  item: T;
  created: boolean;
};

export type NeighborsOptions = {
  direction?: EdgeDirection;
};

export type NeighborsResult = {
  nodeIds: string[];
  edges: Edge[];
};

export type GraphQueryResult = QueryResult & {
  method: QueryMethod;
};

export type {
  IngestionOptions,
  ListEdgesOptions,
  ListNodesOptions,
  QueryOptions,
  SearchResult,
  SemanticSearchOptions,
};

export class GraphClient {
  private readonly storageProvider: BaseStorageProvider;
  private readonly llmProvider: BaseLLMProvider;
  private readonly textExtractor: TextExtractor;
  private readonly llmExtractor: LLMExtractor;
  private readonly ontology: Ontology;
  private readonly ontologyRegistry: OntologyRegistry;
  private readonly enableEmbedding: boolean;
  private readonly defaultQueryTuning: QueryTuningOptions;
  private readonly defaultIngestionOptions: IngestionOptions;

  constructor(private readonly options: GraphClientOptions) {
    this.storageProvider = options.storageProvider;
    this.llmProvider = options.llmProvider;
    this.ontology = options.ontology;
    this.enableEmbedding = options.enableEmbedding ?? false;
    this.defaultQueryTuning = options.query ?? {};
    this.defaultIngestionOptions = options.ingestion ?? {};
    this.ontologyRegistry = OntologyRegistry.parse(options.ontology);
    this.textExtractor = new TextExtractor(options.llmProvider, options.ontology);
    this.llmExtractor = new LLMExtractor(options.llmProvider);
    log.info("Initialized", { enableEmbedding: this.enableEmbedding });
  }

  async ingestFromPath(path: string, options?: IngestionOptions): Promise<IngestionResult> {
    const resolved = this.resolveIngestionOptions(options);
    log.info("Ingesting from path", { path, chunkSize: resolved.chunkSize });
    const result = await this.textExtractor.extractFromPath(path, resolved);
    await this.save(result);
    log.info("Ingestion complete", { nodes: result.nodes.length, edges: result.edges.length });
    return result;
  }

  async ingestFromFile(file: File, options?: IngestionOptions): Promise<IngestionResult> {
    const resolved = this.resolveIngestionOptions(options);
    log.info("Ingesting from file", { name: file.name, chunkSize: resolved.chunkSize });
    const result = await this.textExtractor.extractFromFile(file, resolved);
    await this.save(result);
    log.info("Ingestion complete", { nodes: result.nodes.length, edges: result.edges.length });
    return result;
  }

  async ingestFromText(
    text: string | string[],
    options?: IngestionOptions,
  ): Promise<IngestionResult> {
    const resolved = this.resolveIngestionOptions(options);
    const chunks = resolveIngestionInput(text, resolved);
    log.info("Ingesting from text", { chunks: chunks.length, chunkSize: resolved.chunkSize });
    const result = await this.llmExtractor.extract(chunks, this.ontology);
    await this.save(result);
    log.info("Ingestion complete", { nodes: result.nodes.length, edges: result.edges.length });
    return result;
  }

  getNode(id: string): Promise<Node> {
    return this.storageProvider.getNode(id);
  }

  getEdge(id: string): Promise<Edge> {
    return this.storageProvider.getEdge(id);
  }

  tryGetNode(id: string): Promise<Node | undefined> {
    return this.tryGetNodeInternal(id);
  }

  tryGetEdge(id: string): Promise<Edge | undefined> {
    return this.tryGetEdgeInternal(id);
  }

  async hasNode(id: string): Promise<boolean> {
    return (await this.tryGetNodeInternal(id)) !== undefined;
  }

  async hasEdge(id: string): Promise<boolean> {
    return (await this.tryGetEdgeInternal(id)) !== undefined;
  }

  getNodes(ids: string[]): Promise<Node[]> {
    return this.storageProvider.getNodes(ids);
  }

  getEdges(ids: string[]): Promise<Edge[]> {
    return this.storageProvider.getEdges(ids);
  }

  async listNodes(options?: ListNodesOptions): Promise<Node[]> {
    const nodes = await this.storageProvider.listNodes();
    return filterNodes(nodes, options);
  }

  async listEdges(options?: ListEdgesOptions): Promise<Edge[]> {
    const edges = await this.storageProvider.listEdges();
    return filterEdges(edges, options);
  }

  async searchNodes(query: string, options?: SemanticSearchOptions): Promise<SearchResult<Node>[]> {
    log.info("Searching nodes", { query, topK: options?.topK });
    const nodes = filterNodes(await this.storageProvider.listNodes(), { type: options?.type });
    const [queryEmbedding] = await this.llmProvider.embed([query]);
    const ranked = topKBySimilarity(
      this.llmProvider,
      queryEmbedding,
      nodeSearchItems(nodes),
      options?.topK ?? 5,
    );
    const nodesById = new Map(nodes.map((node) => [node.id, node]));

    return ranked.flatMap((result) => {
      const node = nodesById.get(result.id);
      return node ? [{ item: node, score: result.score }] : [];
    });
  }

  async searchEdges(query: string, options?: SemanticSearchOptions): Promise<SearchResult<Edge>[]> {
    log.info("Searching edges", { query, topK: options?.topK });
    const edges = filterEdges(await this.storageProvider.listEdges(), { type: options?.type });
    const [queryEmbedding] = await this.llmProvider.embed([query]);
    const ranked = topKBySimilarity(
      this.llmProvider,
      queryEmbedding,
      edgeSearchItems(edges),
      options?.topK ?? 5,
    );
    const edgesById = new Map(edges.map((edge) => [edge.id, edge]));

    return ranked.flatMap((result) => {
      const edge = edgesById.get(result.id);
      return edge ? [{ item: edge, score: result.score }] : [];
    });
  }

  async getGraph(options?: { nodes?: ListNodesOptions; edges?: ListEdgesOptions }): Promise<Graph> {
    const [nodes, edges] = await Promise.all([
      this.listNodes(options?.nodes),
      this.listEdges(options?.edges),
    ]);
    return { nodes, edges };
  }

  async createNode(input: CreateNodeInput): Promise<Node> {
    log.info("Creating node", { id: input.id, type: input.type });
    const node = await this.prepareNode(input);
    await this.storageProvider.createNode(node);
    return node;
  }

  async upsertNode(input: CreateNodeInput): Promise<UpsertResult<Node>> {
    log.info("Upserting node", { id: input.id, type: input.type });
    const existing = await this.tryGetNodeInternal(input.id);
    const node = await this.prepareNode(input, existing);
    await this.storageProvider.upsertNode(node);
    log.debug("Upserted node", { id: input.id, created: !existing });
    return { item: node, created: !existing };
  }

  async updateNode(id: string, input: UpdateNodeInput): Promise<Node> {
    log.info("Updating node", { id });
    const existing = await this.storageProvider.getNode(id);
    const node = await this.finalizeNode(
      this.ontologyRegistry.parseNode({
        id,
        type: input.type ?? existing.type,
        properties: mergeProperties(existing.properties ?? {}, input),
        ...(input.embedding ? { embedding: input.embedding } : {}),
      }),
      existing,
    );
    await this.storageProvider.updateNode(node);
    return node;
  }

  async createEdge(input: CreateEdgeInput): Promise<Edge> {
    log.info("Creating edge", { id: input.id, type: input.type, from: input.from, to: input.to });
    const edge = await this.prepareEdge(input);
    await this.storageProvider.createEdge(edge);
    return edge;
  }

  async upsertEdge(input: CreateEdgeInput): Promise<UpsertResult<Edge>> {
    log.info("Upserting edge", { id: input.id, type: input.type, from: input.from, to: input.to });
    const existing = await this.tryGetEdgeInternal(input.id);
    const edge = await this.prepareEdge(input, existing);
    await this.storageProvider.upsertEdge(edge);
    log.debug("Upserted edge", { id: input.id, created: !existing });
    return { item: edge, created: !existing };
  }

  async updateEdge(id: string, input: UpdateEdgeInput): Promise<Edge> {
    log.info("Updating edge", { id });
    const existing = await this.storageProvider.getEdge(id);
    const from = input.from ?? existing.from;
    const to = input.to ?? existing.to;
    const edge = await this.finalizeEdge(
      this.ontologyRegistry.parseEdge(
        {
          id,
          type: input.type ?? existing.type,
          from,
          to,
          properties: mergeProperties(existing.properties ?? {}, input),
          ...(input.embedding ? { embedding: input.embedding } : {}),
        },
        await this.loadNodesById([from, to]),
      ),
      existing,
    );
    await this.storageProvider.updateEdge(edge);
    return edge;
  }

  async deleteNode(id: string): Promise<void> {
    log.info("Deleting node", { id });
    await this.storageProvider.deleteNode(id);
  }

  deleteEdge(id: string): Promise<void> {
    log.info("Deleting edge", { id });
    return this.storageProvider.deleteEdge(id);
  }

  async getNeighbors(nodeId: string, options?: NeighborsOptions): Promise<NeighborsResult> {
    const direction = options?.direction ?? "both";
    log.info("Getting neighbors", { nodeId, direction });
    const edges = await this.storageProvider.listEdgesForNode(nodeId, direction);
    const nodeIds = [
      ...new Set(edges.map((edge) => (edge.from === nodeId ? edge.to : edge.from))),
    ];
    return { nodeIds, edges };
  }

  async getShortestPaths(from: string, to: string, limit = 1): Promise<GraphPath[]> {
    log.info("Finding shortest paths", { from, to, limit });
    return shortestPathsWithLookup(from, to, (nodeId) => this.storageProvider.listEdgesForNode(nodeId), limit);
  }

  async getBfsNeighborhood(
    seeds: string | string[],
    options?: { maxHops?: number; topK?: number },
  ): Promise<GraphNeighborhood> {
    const seedIds = new Set(Array.isArray(seeds) ? seeds : [seeds]);
    const maxHops = options?.maxHops ?? 2;
    log.info("Expanding BFS neighborhood", {
      seeds: seedIds.size,
      maxHops,
      topK: options?.topK,
    });
    return expandNeighborhoodBfsWithLookup(
      seedIds,
      (nodeId) => this.storageProvider.listEdgesForNode(nodeId),
      maxHops,
      options?.topK,
    );
  }

  async query(input: string, options: QueryOptions = {}): Promise<GraphQueryResult> {
    const resolved = {
      method: options.method ?? "combined",
      topK: options.topK ?? this.defaultQueryTuning.topK,
      seedK: options.seedK ?? this.defaultQueryTuning.seedK,
      maxHops: options.maxHops ?? this.defaultQueryTuning.maxHops,
    };

    log.info("Querying graph", {
      method: resolved.method,
      topK: resolved.topK,
      seedK: resolved.seedK,
      maxHops: resolved.maxHops,
    });
    const result = await this.getQueryProvider(resolved.method!, resolved).query(input);
    log.debug("Query complete", { method: resolved.method, materials: result.materials.length });
    return { ...result, method: resolved.method! };
  }

  private queryProviderCache = new Map<string, BaseQueryProvider>();

  private getQueryProvider(method: QueryMethod, tuning: QueryTuningOptions): BaseQueryProvider {
    const key = `${method}:${tuning.topK ?? ""}:${tuning.seedK ?? ""}:${tuning.maxHops ?? ""}`;
    const cached = this.queryProviderCache.get(key);
    if (cached) {
      return cached;
    }

    log.debug("Creating query provider", { method, ...tuning });
    const options = {
      llmProvider: this.llmProvider,
      storageProvider: this.storageProvider,
      ...tuning,
    };

    const provider = (() => {
      switch (method) {
        case "basic":
          return new BasicSearchQueryProvider(options);
        case "local":
          return new LocalSearchQueryProvider(options);
        case "global":
          return new GlobalSearchQueryProvider(options);
        case "drift":
          return new DriftSearchQueryProvider(options);
        case "bfs":
          return new BfsSearchQueryProvider(options);
        case "shortest_path":
          return new ShortestPathSearchQueryProvider(options);
        case "combined":
          return new CombinedSearchQueryProvider(options);
      }
    })();

    this.queryProviderCache.set(key, provider);
    return provider;
  }

  private resolveIngestionOptions(options?: IngestionOptions): IngestionOptions {
    return {
      ...this.defaultIngestionOptions,
      ...options,
      chunker: options?.chunker ?? this.defaultIngestionOptions.chunker,
    };
  }

  private async save(result: IngestionResult): Promise<void> {
    const existingNodes = await Promise.all(
      result.nodes.map((node) => this.tryGetNodeInternal(node.id)),
    );
    const existingEdges = await Promise.all(
      result.edges.map((edge) => this.tryGetEdgeInternal(edge.id)),
    );

    const nodes = await this.applyNodeEmbeddings(result.nodes, existingNodes);
    const edges = await this.applyEdgeEmbeddings(result.edges, existingEdges);

    for (const node of nodes) {
      await this.storageProvider.upsertNode(node);
    }
    for (const edge of edges) {
      await this.storageProvider.upsertEdge(edge);
    }
  }

  private async tryGetNodeInternal(id: string): Promise<Node | undefined> {
    try {
      return await this.storageProvider.getNode(id);
    } catch {
      return undefined;
    }
  }

  private async tryGetEdgeInternal(id: string): Promise<Edge | undefined> {
    try {
      return await this.storageProvider.getEdge(id);
    } catch {
      return undefined;
    }
  }

  private async prepareNode(input: CreateNodeInput, existing?: Node): Promise<Node> {
    return this.finalizeNode(
      this.ontologyRegistry.parseNode({
        id: input.id,
        type: input.type,
        properties: existing
          ? { ...(existing.properties ?? {}), ...(input.properties ?? {}) }
          : (input.properties ?? {}),
      }),
      existing,
    );
  }

  private async prepareEdge(input: CreateEdgeInput, existing?: Edge): Promise<Edge> {
    return this.finalizeEdge(
      this.ontologyRegistry.parseEdge(
        {
          id: input.id,
          type: input.type,
          from: input.from,
          to: input.to,
          properties: existing
            ? { ...(existing.properties ?? {}), ...(input.properties ?? {}) }
            : (input.properties ?? {}),
        },
        await this.loadNodesById([input.from, input.to]),
      ),
      existing,
    );
  }

  private async finalizeNode(node: Node, existing?: Node): Promise<Node> {
    const [finalized] = await this.applyNodeEmbeddings([node], [existing]);
    return finalized;
  }

  private async finalizeEdge(edge: Edge, existing?: Edge): Promise<Edge> {
    const [finalized] = await this.applyEdgeEmbeddings([edge], [existing]);
    return finalized;
  }

  private async applyNodeEmbeddings(
    nodes: Node[],
    existing: (Node | undefined)[],
  ): Promise<Node[]> {
    return this.applyEmbeddings(nodes, existing, serializeNodeForEmbedding);
  }

  private async applyEdgeEmbeddings(
    edges: Edge[],
    existing: (Edge | undefined)[],
  ): Promise<Edge[]> {
    return this.applyEmbeddings(edges, existing, serializeEdgeForEmbedding);
  }

  private async applyEmbeddings<T extends Node | Edge>(
    items: T[],
    existing: (T | undefined)[],
    serialize: (item: T) => string,
  ): Promise<T[]> {
    const output = [...items];
    const pending: { index: number; text: string }[] = [];

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const previous = existing[index];

      if (item.embedding) {
        continue;
      }

      if (!this.enableEmbedding) {
        if (previous?.embedding) {
          output[index] = { ...item, embedding: previous.embedding };
        }
        continue;
      }

      pending.push({ index, text: serialize(item) });
    }

    if (pending.length === 0) {
      return output;
    }

    const embeddings = await this.llmProvider.embed(pending.map((entry) => entry.text));
    log.debug("Generated embeddings", { count: pending.length });
    for (let index = 0; index < pending.length; index++) {
      const { index: itemIndex } = pending[index];
      output[itemIndex] = { ...output[itemIndex], embedding: embeddings[index] };
    }

    return output;
  }

  private async loadNodesById(ids: string[]): Promise<Map<string, Node>> {
    const nodes = await this.storageProvider.getNodes(ids);
    return new Map(nodes.map((node) => [node.id, node]));
  }
}
