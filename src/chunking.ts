// Section-aware character chunker (port of the source project's "sections-v1").
// Splits at a paragraph break, else a space, in the second half of the window.
export type Chunk = { ordinal: number; text: string }

export function chunkText(
  raw: string,
  { maxChars, overlapChars }: { maxChars: number; overlapChars: number }
): Chunk[] {
  if (maxChars < 2 || overlapChars < 0 || overlapChars >= maxChars / 2)
    throw new Error("Invalid chunking parameters")
  const text = raw.normalize("NFC").replace(/\r\n?/g, "\n")
  const chunks: Chunk[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length)
    if (end < text.length) {
      const half = start + Math.floor(maxChars / 2)
      const paragraph = text.lastIndexOf("\n\n", end)
      const word = text.lastIndexOf(" ", end)
      if (paragraph > half) end = paragraph
      else if (word > half) end = word
    }
    const content = text.slice(start, end).trim()
    if (content) chunks.push({ ordinal: chunks.length, text: content })
    if (end === text.length) break
    start = Math.max(start + 1, end - overlapChars)
  }
  if (!chunks.length) throw new Error("Empty document")
  return chunks
}
