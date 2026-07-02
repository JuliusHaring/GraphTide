export function chunkText(text: string, maxChars: number): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    const trimmed = current.trim();
    if (trimmed) {
      chunks.push(trimmed);
    }
    current = "";
  };

  for (const paragraph of paragraphs) {
    let trimmed = paragraph.trim();
    if (!trimmed) {
      continue;
    }

    while (trimmed.length > maxChars) {
      pushCurrent();
      chunks.push(trimmed.slice(0, maxChars).trim());
      trimmed = trimmed.slice(maxChars).trim();
    }

    const separator = current ? "\n\n" : "";
    if (current.length + separator.length + trimmed.length > maxChars && current.length > 0) {
      pushCurrent();
      current = trimmed;
      continue;
    }

    current += separator + trimmed;
  }

  pushCurrent();

  if (chunks.length === 0 && text.trim()) {
    for (let offset = 0; offset < text.length; offset += maxChars) {
      chunks.push(text.slice(offset, offset + maxChars).trim());
    }
  }

  return chunks;
}
