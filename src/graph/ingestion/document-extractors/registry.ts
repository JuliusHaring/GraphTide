import { DocExtractor } from "./doc.js";
import { DocxExtractor } from "./docx.js";
import { ExcelExtractor } from "./excel.js";
import { PdfExtractor } from "./pdf.js";
import { PlainTextExtractor } from "./plain-text.js";
import { DocumentBuffer, DocumentTextExtractor } from "./types.js";
import { createLogger } from "../../../utils/logger.js";

const log = createLogger("DocumentExtractorRegistry");

const defaultExtractors: DocumentTextExtractor[] = [
  new PlainTextExtractor(),
  new PdfExtractor(),
  new DocExtractor(),
  new DocxExtractor(),
  new ExcelExtractor(),
];

export class DocumentExtractorRegistry {
  private readonly extractorsByMimeType = new Map<string, DocumentTextExtractor>();

  constructor(extractors: DocumentTextExtractor[] = defaultExtractors) {
    for (const extractor of extractors) {
      for (const mimeType of extractor.mimeTypes) {
        this.extractorsByMimeType.set(mimeType, extractor);
      }
    }
  }

  supportedMimeTypes(): string[] {
    return [...this.extractorsByMimeType.keys()];
  }

  async extractText(mimeType: string, data: DocumentBuffer): Promise<string> {
    log.debug("Extracting document text", { mimeType, bytes: data.length });
    const extractor = this.extractorsByMimeType.get(mimeType);
    if (!extractor) {
      throw new Error(
        `Unsupported mime type "${mimeType}". Supported types: ${this.supportedMimeTypes().join(", ")}`,
      );
    }

    const text = await extractor.extract(data);
    if (!text) {
      throw new Error(`No text could be extracted from document with mime type "${mimeType}"`);
    }

    log.debug("Document text extracted", { mimeType, characters: text.length });
    return text;
  }
}

export const defaultDocumentExtractorRegistry = new DocumentExtractorRegistry();
