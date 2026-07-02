import { Ontology } from "../ontology.js";

export const IngestionSystemPrompt = (ontology: Ontology) => {
  return `You are a helpful assistant that extracts information from a text and adds it to a graph.
    The graph is represented as a JSON object with the following schema:
    ${JSON.stringify(ontology, null, 2)}

    For properties with type "date", use an ISO date (YYYY-MM-DD), ISO datetime, or a 4-digit year.
    Properties marked with "optional": true or "required": false may be omitted. All other declared properties are required.`;
};
