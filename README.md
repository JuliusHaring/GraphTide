# GraphTide

Graph intelligence library for ingesting documents, building typed knowledge graphs, and querying them with LLMs.

## Install

```bash
npm install graphtide
```

Requires Node.js 18+.

## Quick start

```ts
import { GraphClient, GeminiLLMProvider, SqliteStorageProvider, type Ontology } from "graphtide";

const ontology: Ontology = {
  nodeTypes: [
    { id: "person", name: "Person", properties: { name: "string" } },
    { id: "company", name: "Company", properties: { name: "string" } },
  ],
  edgeTypes: [{ id: "works_at", name: "Works At", from: "person", to: "company" }],
};

const client = new GraphClient({
  storageProvider: new SqliteStorageProvider(".data/graph.db"),
  llmProvider: new GeminiLLMProvider({
    apiKey: process.env.GOOGLE_API_KEY!,
    model: "gemini-3.1-flash-lite",
    embeddingModel: "gemini-embedding-001",
  }),
  ontology,
  enableEmbedding: true,
});

await client.ingestFromPath("./document.pdf");
await client.ingestFromText("Alice works at Acme Corp.");

const result = await client.query("Who works at Acme Corp?");
console.log(result.answer);
console.log(result.materials);
```

## API overview

`GraphClient` is the main entry point.

| Method                                     | Description                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `ingestFromPath(path, options?)`           | Extract entities from a file; optional `chunkSize` / `chunker`                                                           |
| `ingestFromFile(file, options?)`           | Same as above, for `File` objects (e.g. in browsers)                                                                     |
| `ingestFromFileURL(url, options?)`         | Download a document from a URL (PDF, DOCX, etc.) and ingest it                                                           |
| `ingestFromWebsiteURL(url, options?)`      | Fetch an HTML page and ingest its text content                                                                           |
| `ingestFromText(text, options?)`           | Extract entities from raw text or pre-chunked strings                                                                    |
| `createNode` / `updateNode` / `deleteNode` | Strict create, partial update (`properties`, `unsetProperties`), and delete for nodes (also deletes incident edges)      |
| `upsertNode` / `upsertEdge`                | Create or merge properties when the id already exists; returns `{ item, created }`                                       |
| `createEdge` / `updateEdge` / `deleteEdge` | Strict create, update existing, and delete for edges                                                                     |
| `getNode` / `getEdge`                      | Read by id (throws if missing)                                                                                           |
| `hasNode` / `hasEdge`                      | Check existence by id                                                                                                    |
| `getNeighbourhood(seeds, options?)`        | BFS expansion from seed node(s); default `maxHops` 1; optional `direction`, `topK`                                       |
| `getShortestPaths(from, to, limit?)`       | Up to `limit` shortest simple paths between two nodes, ordered by hop count                                              |
| `query(question, options?)`                | Natural-language query; returns `{ query, answer, materials, method }`. Options: `{ method?, topK?, seedK?, maxHops? }`. |

### Storage providers

- `PostgresStorageProvider` — persistent PostgreSQL database
- `SqliteStorageProvider` — persistent local SQLite database
- `MemoryStorageProvider` — in-memory store for tests and ephemeral use

Storage is fully pluggable: implement your own backend by extending `BaseStorageProvider`, similar to how you can extend `BaseLLMProvider` for custom LLMs.

### LLM providers

- `OpenAILLMProvider` — OpenAI chat + embeddings
- `GeminiLLMProvider` — Google Gemini chat + embeddings

LLM integration is also pluggable via `BaseLLMProvider`.

### Path finding

Find ranked paths between two nodes directly:

```ts
import { type GraphPath } from "graphtide";

const paths: GraphPath[] = await client.getShortestPaths("alice", "acme", 3);
```

A `GraphPath` is a plain list alternating **node, edge, node, …**, always ending on a node:

```ts
[
  { id: "alice", type: "person", properties: { name: "Alice" } },
  { id: "e1", type: "works_at", from: "alice", to: "acme", properties: { since: 2020 } },
  { id: "acme", type: "company", properties: { name: "Acme" } },
];
```

Use `isGraphPathEdge(step)` to tell nodes from edges, or the helpers `graphPathNodes(path)`, `graphPathEdges(path)`, `graphPathNodeIds(path)`.

`paths[0]` is the shortest; ties and longer paths follow. The `shortest_path` query method uses the same logic internally (up to `topK` paths per seed pair).

```ts
import { graphPathNodeIds } from "graphtide";

for (const path of paths) {
  console.log(graphPathNodeIds(path).join(" -> "));
}
```

### Neighborhood expansion

Expand outward from one or more seed nodes with BFS. Defaults to 1 hop (direct neighbours):

```ts
import { type GraphNeighborhood } from "graphtide";

const direct = await client.getNeighbourhood("alice");
const wider: GraphNeighborhood = await client.getNeighbourhood("alice", {
  maxHops: 2,
  topK: 5,
});

console.log(wider.nodeIds); // seeds plus closest nodes, capped at topK
console.log(wider.edges); // edges between included nodes
```

The `bfs` query method uses the same BFS logic internally (`maxHops` + `topK` from query options).

### Query methods

`client.query(question, options?)` returns a `GraphQueryResult`:

```ts
const result = await client.query("Who works at Acme Corp?", { method: "bfs" });

result.query; // original question
result.answer; // LLM-generated answer
result.materials; // graph snippets fed to the LLM
result.method; // method that was used
```

Pass `method` to pick a strategy, or omit it to use `combined` (the default). Tuning options (`topK`, `seedK`, `maxHops`) apply to methods that need them.

| Method          | What it does                                                                                          | Best for                                        |
| --------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `combined`      | LLM picks one or more strategies below, gathers materials from each, then synthesizes a single answer | General questions (default)                     |
| `basic`         | Ranks nodes and edges by relevance to the question; returns the top matches                           | “Find entities related to X”                    |
| `local`         | Picks seed nodes by relevance, then expands one hop along edges                                       | Questions about direct relationships            |
| `global`        | Clusters the graph into communities, ranks community summaries by relevance                           | Broad/thematic questions across the whole graph |
| `drift`         | Local 1-hop neighborhood plus community summaries that overlap that neighborhood                      | Connecting local facts to wider context         |
| `bfs`           | Seed nodes by relevance, then multi-hop BFS expansion (`maxHops`, `topK`)                             | “What is connected to X within N hops?”         |
| `shortest_path` | Seed nodes by relevance, then shortest paths between seed pairs (falls back to 1-hop if no paths)     | “How are A and B related?”                      |

Relevance ranking uses **stored embeddings** when nodes/edges have them (only the query text is embedded). When no embeddings are stored, ranking falls back to **text term matching** with no embedding API calls.

```ts
// Pick a specific method
await client.query("How are Alice and Acme connected?", { method: "shortest_path", seedK: 4 });

// Combined routing (default)
await client.query("What themes appear across the document?");
```

### Query tuning

Set defaults on the client, or override per call:

```ts
const client = new GraphClient({
  // ...
  query: { topK: 10, seedK: 5, maxHops: 3 },
});

await client.query("Who works at Acme Corp?", { method: "bfs", topK: 3, maxHops: 1 });
```

- `topK` — max ranked nodes/edges or BFS neighborhood size
- `seedK` — max seed nodes selected by similarity for expansion strategies
- `maxHops` — hop limit for BFS neighborhood expansion

### Ingestion chunking

Large documents are split before LLM extraction. Configure defaults on the client or override per ingest call:

```ts
import { DEFAULT_INGESTION_CHUNK_SIZE, GraphClient } from "graphtide";

const client = new GraphClient({
  // ...
  ingestion: { chunkSize: DEFAULT_INGESTION_CHUNK_SIZE },
});

await client.ingestFromPath("./large-document.pdf");
await client.ingestFromPath("./other.pdf", { chunkSize: 8_000 });
await client.ingestFromText(longText, { chunker: (text) => text.split("\n---\n") });
```

- `chunkSize` — max characters per chunk (paragraph-aware splitting)
- `chunker` — custom chunker function; takes precedence over `chunkSize`
- Pre-chunked `string[]` inputs are respected, but each entry can be split further when chunking is enabled

### Ontology

Define node and edge types with typed properties. Use the `Ontology` type or validate at runtime with `OntologySchema`.

## Development

### Conventional commits

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for semantic versioning and changelog generation.

```
feat: add getBfsNeighborhood to GraphClient
fix: handle empty seed lists in BFS expansion
feat!: rename QueryMethod "bfs" to "breadth_first"
```

Install git hooks (repo contributors only):

- **pre-commit** — `npm run fl` via [pre-commit](https://www.npmjs.com/package/pre-commit)
- **commit-msg** — conventional commit lint via commitlint

```bash
npm run setup-hooks
```

Lint the latest commit manually:

```bash
npm run commitlint
```

### Releases

Releases use [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version):

| Script                    | Description                                                      |
| ------------------------- | ---------------------------------------------------------------- |
| `npm run test:unit`       | Run unit tests                                                   |
| `npm run changelog`       | Preview the next version and changelog (dry run)                 |
| `npm run release:initial` | First release: v0.1.0, changelog, tag, and npm publish           |
| `npm run release`         | Bump semver from commits since last tag, changelog, tag, publish |
| `npm run release:patch`   | Force a patch release and publish                                |
| `npm run release:minor`   | Force a minor release and publish                                |
| `npm run release:major`   | Force a major release and publish                                |

## License

MIT
