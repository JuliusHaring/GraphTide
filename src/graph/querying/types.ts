import { Edge, Node } from "../ontology.js";
import { z } from "zod";

export const QueryStrategySchema = z.enum([
  "basic",
  "local",
  "global",
  "drift",
  "bfs",
  "shortest_path",
]);
export type QueryStrategy = z.infer<typeof QueryStrategySchema>;

export const QueryPlanSchema = z.object({
  strategies: z.array(QueryStrategySchema).min(1),
});

export type QueryPlan = z.infer<typeof QueryPlanSchema>;

export type QueryMethod = QueryStrategy | "combined";

export type Community = {
  id: string;
  summary: string;
  nodeIds: string[];
};

export type QueryGraph = {
  nodes: Node[];
  edges: Edge[];
  communities?: Community[];
};

export type QueryContext = {
  query: string;
  materials: string[];
};

export type QueryResult = QueryContext & {
  answer: string;
};
