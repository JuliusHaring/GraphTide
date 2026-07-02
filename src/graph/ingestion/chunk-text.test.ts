import { describe, expect, it } from "vitest";
import { chunkText } from "./chunk-text.js";
import { resolveIngestionInput, resolveTextChunks } from "./chunking.js";

describe("chunkText", () => {
  it("splits long text on paragraph boundaries when possible", () => {
    const text = "Paragraph one.\n\nParagraph two with more content.";
    const chunks = chunkText(text, 20);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("\n\n")).toContain("Paragraph one.");
    expect(chunks.join("\n\n")).toContain("Paragraph two");
  });

  it("returns a single chunk when text fits", () => {
    expect(chunkText("short text", 100)).toEqual(["short text"]);
  });
});

describe("resolveIngestionInput", () => {
  it("chunks a single string when chunkSize is set", () => {
    const chunks = resolveIngestionInput("a".repeat(25), { chunkSize: 10 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toHaveLength(25);
  });

  it("uses a custom chunker when provided", () => {
    const chunks = resolveIngestionInput("one|two|three", {
      chunker: (text) => text.split("|"),
    });
    expect(chunks).toEqual(["one", "two", "three"]);
  });

  it("re-chunks each entry in a string array", () => {
    const chunks = resolveIngestionInput(["aaaa", "bbbbbbbb"], { chunkSize: 4 });
    expect(chunks).toEqual(["aaaa", "bbbb", "bbbb"]);
  });
});

describe("resolveTextChunks", () => {
  it("returns the original text when chunking is disabled", () => {
    expect(resolveTextChunks("hello", {})).toEqual(["hello"]);
    expect(resolveTextChunks("hello", { chunkSize: 0 })).toEqual(["hello"]);
  });
});
