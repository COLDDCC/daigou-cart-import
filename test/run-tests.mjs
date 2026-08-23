import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { parseCsv } from '../src/csv.mjs';
import { toCsvExportUrl } from '../src/sheetUrl.mjs';
import { normalizeRow } from '../src/normalize.mjs';
import { importCsvText } from '../src/importSheet.mjs';
import { CartStore } from '../src/cartStore.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let passed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`ok - ${name}`);
    })
    .catch((err) => {
      console.error(`FAIL - ${name}`);
      console.error(err);
      process.exitCode = 1;
    });
}

await test('parseCsv handles quoted commas and header mapping', () => {
  const rows = parseCsv('a,b\n1,"x,y"\n');
  assert.deepEqual(rows, [{ a: '1', b: 'x,y' }]);
});

await test('toCsvExportUrl converts a Google Sheets edit link', () => {
  const url = toCsvExportUrl('https://docs.google.com/spreadsheets/d/ABC123/edit#gid=456');
  assert.equal(url, 'https://docs.google.com/spreadsheets/d/ABC123/export?format=csv&gid=456');
});

await test('toCsvExportUrl passes through a non-Google link unchanged', () => {
  const url = toCsvExportUrl('https://example.com/sheet.csv');
  assert.equal(url, 'https://example.com/sheet.csv');
});

await test('normalizeRow rejects a missing or invalid url', () => {
  const missing = normalizeRow({ 数量: '1' }, 5);
  assert.equal(missing.item, null);
  assert.match(missing.warnings[0], /缺少商品链接/);

  const invalid = normalizeRow({ 商品链接: 'not-a-url' }, 6);
  assert.equal(invalid.item, null);
  assert.match(invalid.warnings[0], /链接格式不合法/);
});

await test('normalizeRow defaults a missing/invalid quantity to 1', () => {
  const { item, warnings } = normalizeRow({ 商品链接: 'https://a.com/x', 数量: 'abc' }, 7);
  assert.equal(item.quantity, 1);
  assert.match(warnings[0], /数量.*无效/);
});

await test('importCsvText: end-to-end fixture import, dedupe, and merge', async () => {
  const csvText = await readFile(path.join(__dirname, 'fixtures/sample-sheet.csv'), 'utf8');
  const storePath = path.join(os.tmpdir(), `cart-automation-test-${Date.now()}.json`);

  const first = await importCsvText({
    csvText,
    customerId: 'customer-1',
    storePath,
    sourceSheetUrl: 'https://example.com/sheet',
  });

  // 6 data rows: 2 invalid (bad url, missing url) are skipped, the
  // "1001 again" row merges into the first 1001 row rather than adding a line.
  assert.equal(first.skipped, 2);
  assert.equal(first.added, 3);
  assert.equal(first.merged, 1);

  const cart = await new CartStore(storePath).getCart('customer-1');
  assert.equal(cart.length, 3);
  const item1001 = cart.find((i) => i.url === 'https://item.example.com/a1001');
  assert.equal(item1001.quantity, 3); // 2 from row 1, 1 from the duplicate row
  const item1002 = cart.find((i) => i.url === 'https://item.example.com/a1002');
  assert.equal(item1002.quantity, 1); // blank quantity defaulted to 1

  // Re-importing the same sheet again should merge into existing lines, not duplicate them.
  const second = await importCsvText({
    csvText,
    customerId: 'customer-1',
    storePath,
    sourceSheetUrl: 'https://example.com/sheet',
  });
  assert.equal(second.added, 0);
  const cartAfterReimport = await new CartStore(storePath).getCart('customer-1');
  assert.equal(cartAfterReimport.length, 3);

  await rm(storePath, { force: true });
});

await test('CartStore keeps other customers untouched when one customer is written', async () => {
  const storePath = path.join(os.tmpdir(), `cart-automation-test-${Date.now()}-multi.json`);
  const store = new CartStore(storePath);

  await store.addItems('customer-a', [{ url: 'https://a.com/1', quantity: 1 }], 'sheet-a');
  await store.addItems('customer-b', [{ url: 'https://b.com/1', quantity: 1 }], 'sheet-b');

  assert.equal((await store.getCart('customer-a')).length, 1);
  assert.equal((await store.getCart('customer-b')).length, 1);

  await rm(storePath, { force: true });
});

await test('CartStore.addItems serializes concurrent calls on the same instance (no lost updates)', async () => {
  const storePath = path.join(os.tmpdir(), `cart-automation-test-${Date.now()}-concurrent.json`);
  const store = new CartStore(storePath);

  // Fire off many concurrent adds for the same customer+url without awaiting
  // between them — a naive read-modify-write would lose all but one.
  await Promise.all(
    Array.from({ length: 20 }, () =>
      store.addItems('customer-1', [{ url: 'https://a.com/1', quantity: 1 }], 'sheet'),
    ),
  );

  const cart = await store.getCart('customer-1');
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 20);

  await rm(storePath, { force: true });
});

await test('CartStore.addItems is a no-op (no file write) when every row was invalid', async () => {
  const storePath = path.join(os.tmpdir(), `cart-automation-test-${Date.now()}-empty.json`);
  const store = new CartStore(storePath);

  const result = await store.addItems('customer-1', [], 'sheet');
  assert.deepEqual(result, { added: 0, merged: 0 });

  await assert.rejects(() => readFile(storePath, 'utf8'), { code: 'ENOENT' });
});

console.log(`\n${passed} test(s) passed`);
if (process.exitCode) {
  console.error('Some tests failed.');
}
