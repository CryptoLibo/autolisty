export function estimatePromptTokens(text: string) {
  const utf8Bytes = Buffer.byteLength(text, "utf8")
  const lexicalPieces = text.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu)?.length || 0
  // A conservative GPT-like planning estimate; provider usage remains authoritative.
  return Math.max(Math.ceil(utf8Bytes / 3), Math.ceil(lexicalPieces * 1.4))
}
