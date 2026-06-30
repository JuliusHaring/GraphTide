import type { CreateEdgeInput, CreateNodeInput } from "../../src/graph/graph-client.js";

export const marieCurieNodes: CreateNodeInput[] = [
  {
    id: "marie-curie",
    type: "person",
    properties: {
      name: "Marie Curie",
      tags: ["scientist", "nobel-laureate"],
      meta: { active: false },
    },
  },
  {
    id: "pierre-curie",
    type: "person",
    properties: {
      name: "Pierre Curie",
      tags: ["scientist", "nobel-laureate"],
      meta: { active: false },
    },
  },
  {
    id: "irene-joliot-curie",
    type: "person",
    properties: {
      name: "Irène Joliot-Curie",
      tags: ["scientist", "nobel-laureate"],
      meta: { active: false },
    },
  },
  {
    id: "university-of-paris",
    type: "company",
    properties: { name: "University of Paris" },
  },
  {
    id: "curie-institute",
    type: "company",
    properties: { name: "Curie Institute" },
  },
  {
    id: "nobel-physics-1903",
    type: "accomplishment",
    properties: { name: "Nobel Prize in Physics (1903)" },
  },
  {
    id: "nobel-chemistry-1911",
    type: "accomplishment",
    properties: { name: "Nobel Prize in Chemistry (1911)" },
  },
  {
    id: "discovery-polonium",
    type: "accomplishment",
    properties: { name: "Discovery of polonium" },
  },
  {
    id: "discovery-radium",
    type: "accomplishment",
    properties: { name: "Discovery of radium" },
  },
  {
    id: "radioactivity-research",
    type: "accomplishment",
    properties: { name: "Research on radioactivity" },
  },
];

export const marieCurieEdges: CreateEdgeInput[] = [
  {
    id: "marie-works-university",
    type: "works_at",
    from: "marie-curie",
    to: "university-of-paris",
    properties: { since: 1895 },
  },
  {
    id: "pierre-works-university",
    type: "works_at",
    from: "pierre-curie",
    to: "university-of-paris",
    properties: { since: 1895 },
  },
  {
    id: "marie-works-institute",
    type: "works_at",
    from: "marie-curie",
    to: "curie-institute",
    properties: { since: 1918 },
  },
  {
    id: "irene-works-institute",
    type: "works_at",
    from: "irene-joliot-curie",
    to: "curie-institute",
    properties: { since: 1920 },
  },
  {
    id: "marie-achieved-physics-nobel",
    type: "achieved",
    from: "marie-curie",
    to: "nobel-physics-1903",
    properties: { date: "1903-12-10" },
  },
  {
    id: "pierre-achieved-physics-nobel",
    type: "achieved",
    from: "pierre-curie",
    to: "nobel-physics-1903",
    properties: { date: "1903-12-10" },
  },
  {
    id: "marie-achieved-chemistry-nobel",
    type: "achieved",
    from: "marie-curie",
    to: "nobel-chemistry-1911",
    properties: { date: "1911-12-10" },
  },
  {
    id: "marie-achieved-polonium",
    type: "achieved",
    from: "marie-curie",
    to: "discovery-polonium",
    properties: { date: "1898-07-01" },
  },
  {
    id: "pierre-achieved-polonium",
    type: "achieved",
    from: "pierre-curie",
    to: "discovery-polonium",
    properties: { date: "1898-07-01" },
  },
  {
    id: "marie-achieved-radium",
    type: "achieved",
    from: "marie-curie",
    to: "discovery-radium",
    properties: { date: "1898-12-26" },
  },
  {
    id: "pierre-achieved-radium",
    type: "achieved",
    from: "pierre-curie",
    to: "discovery-radium",
    properties: { date: "1898-12-26" },
  },
  {
    id: "marie-achieved-radioactivity",
    type: "achieved",
    from: "marie-curie",
    to: "radioactivity-research",
    properties: { date: "1903-01-01" },
  },
  {
    id: "pierre-achieved-radioactivity",
    type: "achieved",
    from: "pierre-curie",
    to: "radioactivity-research",
    properties: { date: "1903-01-01" },
  },
];
