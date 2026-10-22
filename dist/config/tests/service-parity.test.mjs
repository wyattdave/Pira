// The local mock must expose exactly the same API as the Dataverse service so UI behaviour tested on the mock is representative.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const EXPORT_PATTERN = /^export\s+(?:async\s+)?(?:function|const|let)\s+([A-Za-z0-9_]+)/gm;

async function exportedNames(sRelativePath) {
  const sSource = await readFile(new URL(sRelativePath, import.meta.url), 'utf8');
  return [...sSource.matchAll(EXPORT_PATTERN)].map((aMatch) => aMatch[1]).sort();
}

test('mock data service mirrors every data-service export', async () => {
  const aReal = await exportedNames('../../dist/js/data-service.js');
  const aMock = await exportedNames('../dev/mock-data-service.js');
  assert.deepEqual(aMock.filter((sName) => aReal.includes(sName)), aReal, 'mock is missing exports');
  assert.deepEqual(aMock.filter((sName) => !aReal.includes(sName)), [], 'mock has extra exports');
});
