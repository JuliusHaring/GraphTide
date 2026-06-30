import type { GraphClient } from "../../src/graph/graph-client.js";
import { marieCurieEdges, marieCurieNodes } from "../fixtures/graph-seed.js";

export async function seedMarieCurieGraph(client: GraphClient): Promise<void> {
  for (const node of marieCurieNodes) {
    await client.createNode(node);
  }
  for (const edge of marieCurieEdges) {
    await client.createEdge(edge);
  }
}
