/**
 * Vector Utilities — JS Cosine Similarity
 *
 * Desktop fallback for pgvector's <=> operator.
 * Used by ragService and memoryEmbedder when running on SQLite.
 *
 * Performance note: O(n) per query. Fine for desktop scale (<100k chunks).
 * For large-scale use, consider sqlite-vss extension.
 */

/**
 * Compute cosine similarity between two vectors.
 * Returns value between -1 and 1, where 1 = identical direction.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;

  return dot / denom;
}

export interface VectorDoc {
  id: number;
  embedding: string | null; // JSON-stringified number[]
}

/**
 * Find top-K most similar documents by cosine similarity.
 * Parses JSON-stringified embeddings from SQLite TEXT columns.
 */
export function findSimilar<T extends VectorDoc>(
  queryEmbedding: number[],
  docs: T[],
  topK = 5
): Array<T & { similarity: number }> {
  const scored = docs
    .filter((d) => d.embedding)
    .map((d) => {
      const docEmbedding: number[] = JSON.parse(d.embedding!);
      const similarity = cosineSimilarity(queryEmbedding, docEmbedding);
      return { ...d, similarity };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  return scored;
}
