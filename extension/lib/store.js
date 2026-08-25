// Single-user, per-browser storage for the extension's list — chrome.storage.local
// is scoped to one browser profile, which matches "everyone has their own
// account, everyone runs this on their own computer." There is no sharing
// across people here; each install has its own list.
const STORAGE_KEY = 'daigouCartImport.items';

function keyOf(item) {
  return `${item.url}::${item.variant ?? ''}`;
}

export async function getItems() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] ?? [];
}

async function setItems(items) {
  await chrome.storage.local.set({ [STORAGE_KEY]: items });
}

// Merges freshly parsed sheet rows into the stored list. Re-importing the
// same sheet (or an edited version of it) is safe: an existing link+variant
// keeps its open/pending status and just refreshes quantity/note, instead of
// being re-added as a new pending row.
export async function mergeItems(newItems) {
  const items = await getItems();
  const byKey = new Map(items.map((i) => [keyOf(i), i]));
  let added = 0;
  let updated = 0;

  for (const item of newItems) {
    const key = keyOf(item);
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity = item.quantity;
      existing.note = item.note;
      updated++;
      continue;
    }
    const entry = {
      id: crypto.randomUUID(),
      url: item.url,
      quantity: item.quantity,
      variant: item.variant,
      note: item.note,
      status: 'pending',
      openedAt: null,
    };
    items.push(entry);
    byKey.set(key, entry);
    added++;
  }

  await setItems(items);
  return { added, updated };
}

export async function setItemStatus(id, status) {
  const items = await getItems();
  const item = items.find((i) => i.id === id);
  if (!item) return;
  item.status = status;
  item.openedAt = status === 'opened' ? new Date().toISOString() : null;
  await setItems(items);
}

export async function removeItem(id) {
  const items = await getItems();
  await setItems(items.filter((i) => i.id !== id));
}

export async function clearAll() {
  await chrome.storage.local.remove(STORAGE_KEY);
}
