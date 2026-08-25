import assert from 'node:assert/strict';
import { installMockChromeStorage } from './mockChromeStorage.mjs';
import { parseCsv } from '../lib/csv.js';
import { toCsvExportUrl } from '../lib/sheetUrl.js';
import { normalizeRow } from '../lib/normalize.js';

const { reset } = installMockChromeStorage();
const { getItems, mergeItems, setItemStatus, removeItem, clearAll } = await import('../lib/store.js');

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

await test('parseCsv / toCsvExportUrl / normalizeRow behave the same as the CLI copies', () => {
  assert.deepEqual(parseCsv('a,b\n1,"x,y"\n'), [{ a: '1', b: 'x,y' }]);
  assert.equal(
    toCsvExportUrl('https://docs.google.com/spreadsheets/d/ABC123/edit#gid=456'),
    'https://docs.google.com/spreadsheets/d/ABC123/export?format=csv&gid=456',
  );
  const { item } = normalizeRow({ 商品链接: 'https://a.com/x', 数量: '2' }, 2);
  assert.equal(item.quantity, 2);
});

await test('mergeItems adds new pending items and reports counts', async () => {
  reset();
  const { added, updated } = await mergeItems([
    { url: 'https://a.com/1', quantity: 1 },
    { url: 'https://a.com/2', quantity: 2, variant: 'red' },
  ]);
  assert.equal(added, 2);
  assert.equal(updated, 0);

  const items = await getItems();
  assert.equal(items.length, 2);
  assert.ok(items.every((i) => i.status === 'pending'));
});

await test('mergeItems re-importing the same link updates it in place, keeping status', async () => {
  reset();
  await mergeItems([{ url: 'https://a.com/1', quantity: 1 }]);
  const [first] = await getItems();
  await setItemStatus(first.id, 'opened');

  const { added, updated } = await mergeItems([
    { url: 'https://a.com/1', quantity: 3, note: '客户改了数量' },
  ]);
  assert.equal(added, 0);
  assert.equal(updated, 1);

  const items = await getItems();
  assert.equal(items.length, 1);
  assert.equal(items[0].id, first.id); // same entry, not a new one
  assert.equal(items[0].quantity, 3); // refreshed
  assert.equal(items[0].status, 'opened'); // preserved, not reset to pending
});

await test('setItemStatus toggles status and openedAt', async () => {
  reset();
  await mergeItems([{ url: 'https://a.com/1', quantity: 1 }]);
  const [item] = await getItems();

  await setItemStatus(item.id, 'opened');
  let [updated] = await getItems();
  assert.equal(updated.status, 'opened');
  assert.ok(updated.openedAt);

  await setItemStatus(item.id, 'pending');
  [updated] = await getItems();
  assert.equal(updated.status, 'pending');
  assert.equal(updated.openedAt, null);
});

await test('removeItem and clearAll', async () => {
  reset();
  await mergeItems([
    { url: 'https://a.com/1', quantity: 1 },
    { url: 'https://a.com/2', quantity: 1 },
  ]);
  const [first] = await getItems();
  await removeItem(first.id);
  assert.equal((await getItems()).length, 1);

  await clearAll();
  assert.equal((await getItems()).length, 0);
});

console.log(`\n${passed} test(s) passed`);
if (process.exitCode) {
  console.error('Some tests failed.');
}
