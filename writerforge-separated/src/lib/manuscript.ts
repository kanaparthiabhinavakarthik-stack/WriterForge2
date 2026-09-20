export const WORD_CEILING = 55000;

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** Split a manuscript into sections of ~maxWords, never breaking a paragraph. */
export function chunkManuscript(text: string, maxWords = 1400): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current: string[] = [];
  let words = 0;

  for (const paragraph of paragraphs) {
    const w = countWords(paragraph);
    if (words + w > maxWords && current.length > 0) {
      chunks.push(current.join("\n\n"));
      current = [];
      words = 0;
    }
    current.push(paragraph);
    words += w;
  }
  if (current.length) chunks.push(current.join("\n\n"));
  return chunks.filter((c) => c.trim().length > 0);
}

export async function readManuscriptFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+\n/g, "\n");
      pages.push(text);
    }
    return pages.join("\n\n").replace(/[ \t]{2,}/g, " ").trim();
  }
  return (await file.text()).trim();
}
