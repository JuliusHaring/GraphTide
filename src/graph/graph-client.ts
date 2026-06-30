import { BaseLLMProvider } from "../llm/base-llm-provider.js";
import { BaseStorageProvider } from "../storage/base-storage-provider.js";
import {
  BaseQueryProvider,
  BasicSearchQueryProvider,
  CombinedSearchQueryProvider,
  DriftSearchQueryProvider,
  GlobalSearchQueryProvider,
  LocalSearchQueryProvider,
  QueryMethod,
} from "./querying/index.js";
import {
  Edge,
  Node,
  Ontology,
  OntologyRegistry,
  PropertyValue,
  serializeEdgeForEmbedding,
  serializeNodeForEmbedding,
} from "./ontology.js";
import { LLMExtractor } from "./ingestion/llm-extractor.js";
import { TextExtractor } from "./ingestion/text-extractor.js";
import { IngestionResult } from "./ingestion/types.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("GraphClient");

export type GraphClientOptions = {
  storageProvider: BaseStorageProvider;
  llmProvider: BaseLLMProvider;
  ontology: Ontology;
  enableEmbedding?: boolean;
};

export type CreateNodeInput = {
  id: string;
  type: string;
  properties: Record<string, PropertyValue>;
};

export type EditNodeInput = {
  type?: string;
  properties?: Record<string, PropertyValue>;
  embedding?: number[];
};

export type CreateEdgeInput = {
  id: string;
  type: string;
  from: string;
  to: string;
  properties: Record<string, PropertyValue>;
};

export type EditEdgeInput = {
  type?: string;
  from?: string;
  to?: string;
  properties?: Record<string, PropertyValue>;
  embedding?: number[];
};

export class GraphClient {
  private readonly storageProvider: BaseStorageProvider;
  private readonly llmProvider: BaseLLMProvider;
  private readonly textExtractor: TextExtractor;
  private readonly llmExtractor: LLMExtractor;
  private readonly ontology: Ontology;
  private readonly ontologyRegistry: OntologyRegistry;
  private readonly enableEmbedding: boolean;

  constructor(private readonly options: GraphClientOptions) {
    this.storageProvider = options.storageProvider;
    this.llmProvider = options.llmProvider;
    this.ontology = options.ontology;
    this.enableEmbedding = options.enableEmbedding ?? false;
    this.ontologyRegistry = OntologyRegistry.parse(options.ontology);
    this.textExtractor = new TextExtractor(options.llmProvider, options.ontology);
    this.llmExtractor = new LLMExtractor(options.llmProvider);
    log.info("Initialized", { enableEmbedding: this.enableEmbedding });
  }

  async ingestFromPath(path: string): Promise<IngestionResult> {
    log.info("Ingesting from path", { path });
    const result = await this.textExtractor.extractFromPath(path);
    await this.save(result);
    log.info("Ingestion complete", { nodes: result.nodes.length, edges: result.edges.length });
    return result;
  }

  async ingestFromFile(file: File): Promise<IngestionResult> {
    log.info("Ingesting from file", { name: file.name });
    const result = await this.textExtractor.extractFromFile(file);
    await this.save(result);
    log.info("Ingestion complete", { nodes: result.nodes.length, edges: result.edges.length });
    return result;
  }

  async ingestFromText(text: string | string[]): Promise<IngestionResult> {
    log.info("Ingesting from text", { chunks: Array.isArray(text) ? text.length : 1 });
    const result = await this.llmExtractor.extract(text, this.ontology);
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

  async createNode(input: CreateNodeInput): Promise<Node> {
    log.info("Creating node", { id: input.id, type: input.type });
    const node = await this.finalizeNode(this.ontologyRegistry.parseNode(input));
    await this.storageProvider.createNode(node);
    return node;
  }

  async editNode(id: string, input: EditNodeInput): Promise<Node> {
    log.info("Editing node", { id });
    const existing = await this.storageProvider.getNode(id);
    const node = await this.finalizeNode(
      this.ontologyRegistry.parseNode({
        id,
        type: input.type ?? existing.type,
        properties: { ...existing.properties, ...input.properties },
        ...(input.embedding ? { embedding: input.embedding } : {}),
      }),
      existing,
    );
    await this.storageProvider.updateNode(node);
    return node;
  }

  async createEdge(input: CreateEdgeInput): Promise<Edge> {
    log.info("Creating edge", { id: input.id, type: input.type, from: input.from, to: input.to });
    const edge = await this.finalizeEdge(
      this.ontologyRegistry.parseEdge(input, await this.loadNodesById([input.from, input.to])),
    );
    await this.storageProvider.createEdge(edge);
    return edge;
  }

  async editEdge(id: string, input: EditEdgeInput): Promise<Edge> {
    log.info("Editing edge", { id });
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
          properties: { ...existing.properties, ...input.properties },
          ...(input.embedding ? { embedding: input.embedding } : {}),
        },
        await this.loadNodesById([from, to]),
      ),
      existing,
    );
    await this.storageProvider.updateEdge(edge);
    return edge;
  }

  deleteNode(id: string): Promise<void> {
    log.info("Deleting node", { id });
    return this.storageProvider.deleteNode(id);
  }

  deleteEdge(id: string): Promise<void> {
    log.info("Deleting edge", { id });
    return this.storageProvider.deleteEdge(id);
  }

  async query(input: string, method: QueryMethod = "combined"): Promise<string> {
    log.info("Querying graph", { method });
    const answer = await this.getQueryProvider(method).query(input);
    log.debug("Query complete", { method });
    return answer;
  }

  private queryProviders: Partial<Record<QueryMethod, BaseQueryProvider>> = {};

  private getQueryProvider(method: QueryMethod): BaseQueryProvider {
    const cached = this.queryProviders[method];
    if (cached) {
      return cached;
    }

    log.debug("Creating query provider", { method });
    const options = {
      llmProvider: this.llmProvider,
      storageProvider: this.storageProvider,
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
        case "combined":
          return new CombinedSearchQueryProvider(options);
      }
    })();

    this.queryProviders[method] = provider;
    return provider;
  }

  private async save(result: IngestionResult): Promise<void> {
    const existingNodes = await Promise.all(result.nodes.map((node) => this.tryGetNode(node.id)));
    const existingEdges = await Promise.all(result.edges.map((edge) => this.tryGetEdge(edge.id)));

    const nodes = await this.applyNodeEmbeddings(result.nodes, existingNodes);
    const edges = await this.applyEdgeEmbeddings(result.edges, existingEdges);

    for (const node of nodes) {
      await this.storageProvider.upsertNode(node);
    }
    for (const edge of edges) {
      await this.storageProvider.upsertEdge(edge);
    }
  }

  private async tryGetNode(id: string): Promise<Node | undefined> {
    try {
      return await this.storageProvider.getNode(id);
    } catch {
      return undefined;
    }
  }

  private async tryGetEdge(id: string): Promise<Edge | undefined> {
    try {
      return await this.storageProvider.getEdge(id);
    } catch {
      return undefined;
    }
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
