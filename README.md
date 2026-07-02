# graphint

Graph intelligence library for ingesting documents, building typed knowledge graphs, and querying them with LLMs.

## Install

```bash
npm install graphint
```

Requires Node.js 18+.

## Quick start

```ts
import { GraphClient, GeminiLLMProvider, SqliteStorageProvider, type Ontology } from "graphint";

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
| `ingestFromPath(path)`                     | Extract entities from a file (PDF, DOCX, XLSX, plain text, …)                                                            |
| `ingestFromFile(file)`                     | Same as above, for `File` objects (e.g. in browsers)                                                                     |
| `ingestFromText(text)`                     | Extract entities from raw text                                                                                           |
| `createNode` / `updateNode` / `deleteNode` | Strict create (fails on duplicate), update existing (fails if missing), and delete for nodes                             |
| `upsertNode` / `upsertEdge`                | Create or merge properties when the id already exists; returns `{ item, created }`                                       |
| `createEdge` / `updateEdge` / `deleteEdge` | Strict create, update existing, and delete for edges                                                                     |
| `getNode` / `getEdge`                      | Read by id (throws if missing)                                                                                           |
| `tryGetNode` / `tryGetEdge`                | Read by id, returns `undefined` if missing                                                                               |
| `hasNode` / `hasEdge`                      | Check existence by id                                                                                                    |
| `getShortestPaths(from, to, limit?)`       | Up to `limit` shortest simple paths between two nodes, ordered by hop count                                              |
| `getBfsNeighborhood(seeds, options?)`      | BFS expansion from seed node(s); `maxHops` (default 2) and optional `topK` node cap                                      |
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
import { type GraphPath } from "graphint";

const paths: GraphPath[] = await client.getShortestPaths("alice", "acme", 3);
// paths[0] is shortest; ties and longer paths follow
for (const path of paths) {
  console.log(path.nodeIds.join(" -> "));
}
```

Each `GraphPath` has `nodeIds` and `edges`. The `shortest_path` query method uses the same logic internally (up to `topK` paths per seed pair).

### Neighborhood expansion

Expand outward from one or more seed nodes with BFS:

```ts
import { type GraphNeighborhood } from "graphint";

const neighborhood: GraphNeighborhood = await client.getBfsNeighborhood("alice", {
  maxHops: 2,
  topK: 5,
});

console.log(neighborhood.nodeIds); // closest nodes first, capped at topK
console.log(neighborhood.edges); // edges between included nodes
```

The `bfs` query method uses the same logic internally (`maxHops` + `topK` from query options).

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

Install the commit-msg hook (validates messages on `git commit`):

```bash
task hooks:install
```

Lint the latest commit manually:

```bash
task commitlint
```

### Releases

Releases use [Task](https://taskfile.dev/) and [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version):

| Task                 | Description                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `task test`          | Run unit tests                                                                             |
| `task changelog`     | Preview the next version and changelog (dry run)                                           |
| `task release`       | Run tests, bump semver from commits, update `CHANGELOG.md`, commit, tag, and `npm publish` |
| `task release:patch` | Force a patch release and publish                                                          |
| `task release:minor` | Force a minor release and publish                                                          |
| `task release:major` | Force a major release and publish                                                          |
| `task release:first` | First release only (no version bump) and publish                                           |

Typical flow:

```bash
task hooks:install
# ... merge conventional commits to main ...
task changelog    # preview
task release      # version bump + CHANGELOG + tag + npm publish
git push --follow-tags
```

## License

MIT
