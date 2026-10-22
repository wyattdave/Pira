// TABLES in app-config.js must match the registered Dataverse data sources and their generated schemas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { TABLES } from '../../dist/config/app-config.js';

const ROOT = new URL('../../', import.meta.url);

function findKey(oValue, sKey) {
  if (!oValue || typeof oValue !== 'object') return undefined;
  if (sKey in oValue) return oValue[sKey];
  for (const oChild of Object.values(oValue)) {
    const result = findKey(oChild, sKey);
    if (result !== undefined) return result;
  }
  return undefined;
}

test('every app table is registered in power.config.json with the same entity set', async () => {
  const oConfig = JSON.parse(await readFile(new URL('power.config.json', ROOT), 'utf8'));
  const aSources = Object.values(oConfig.databaseReferences['default.cds'].dataSources);
  Object.values(TABLES).forEach((oTable) => {
    const oSource = aSources.find((oItem) => oItem.logicalName === oTable.logical);
    assert.ok(oSource, `${oTable.logical} is not registered`);
    assert.equal(oSource.entitySetName, oTable.set, `${oTable.logical} entity set`);
  });
});

test('generated schemas confirm entity sets and primary keys', async () => {
  const aFiles = (await readdir(new URL('dist/config/', ROOT))).filter((sFile) => sFile.endsWith('.Schema.json'));
  const aSchemas = await Promise.all(aFiles.map(async (sFile) => JSON.parse(await readFile(new URL(`dist/config/${sFile}`, ROOT), 'utf8'))));
  Object.values(TABLES).forEach((oTable) => {
    const oSchema = aSchemas.find((oItem) => findKey(oItem, 'x-ms-dataverse-entityset') === oTable.set);
    assert.ok(oSchema, `no schema for ${oTable.set}`);
    assert.equal(findKey(oSchema, 'x-ms-dataverse-primary-id'), oTable.key, `${oTable.set} primary key`);
  });
});
