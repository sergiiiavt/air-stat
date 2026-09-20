import assert from 'node:assert/strict';
import { D1_BIND_BATCH_SIZE, chunkValues } from '../worker/query-utils.mjs';

const incidentIds = Array.from({ length: 546 }, (_, index) => index + 1);
const chunks = chunkValues(incidentIds);

assert.ok(chunks.length > 1, 'Long ranges must be split across multiple D1 queries');
assert.ok(
  chunks.every((chunk) => chunk.length <= D1_BIND_BATCH_SIZE),
  'No source query may exceed the configured D1 bind batch size',
);
assert.deepEqual(
  chunks.flat(),
  incidentIds,
  'Batching must preserve every incident id in its original order',
);

assert.deepEqual(chunkValues([]), [], 'Empty input should not produce queries');
assert.throws(() => chunkValues([1], 0), /positive integer/);

console.log(
  `Query batching validation passed: ${incidentIds.length} ids -> ${chunks.length} queries, max ${D1_BIND_BATCH_SIZE} binds each`,
);
