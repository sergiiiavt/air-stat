export const D1_BIND_BATCH_SIZE = 80;

export function chunkValues(values, size = D1_BIND_BATCH_SIZE) {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error('Chunk size must be a positive integer');
  }

  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
