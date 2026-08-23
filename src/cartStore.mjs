import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

// Stand-in for the real cart backend: one JSON file, keyed by customerId.
// Swap this class for a real DB/API client later — addItems()/getCart() is
// the whole surface the importer depends on.
//
// Known limitation: writes are only serialized *within one process* (see
// #writeQueue below). Two separate CLI runs (or server processes) writing to
// the same file at the same instant can still race and lose an update, since
// each reads the file before either writes it back. Fine for one person
// running imports one at a time; if this ever gets a webhook/server front
// end that can trigger concurrent imports, either queue calls through one
// process or move to a real datastore with transactions before that ships.
export class CartStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.#writeQueue = Promise.resolve();
  }

  #writeQueue;

  async #load() {
    try {
      return JSON.parse(await readFile(this.filePath, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return {};
      throw err;
    }
  }

  // Write to a temp file and rename over the target so a crash or a
  // concurrent read never sees a half-written file.
  async #save(data) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    await rename(tmpPath, this.filePath);
  }

  // Adds items to a customer's cart. Re-importing the same link+variant for
  // the same customer merges quantity instead of creating a duplicate line,
  // so submitting the same sheet twice (or an updated version of it) is safe.
  async addItems(customerId, items, sourceSheetUrl) {
    // Chain onto the queue so concurrent addItems() calls on the same
    // in-process instance don't read-modify-write over one another.
    const result = this.#writeQueue.then(() =>
      this.#addItemsUnlocked(customerId, items, sourceSheetUrl),
    );
    this.#writeQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async #addItemsUnlocked(customerId, items, sourceSheetUrl) {
    if (items.length === 0) return { added: 0, merged: 0 };

    const data = await this.#load();
    const cart = data[customerId] ?? [];
    const keyOf = (i) => `${i.url}::${i.variant ?? ''}`;
    const byKey = new Map(cart.map((i) => [keyOf(i), i]));

    let added = 0;
    let merged = 0;
    for (const item of items) {
      const key = keyOf(item);
      const existing = byKey.get(key);
      if (existing) {
        existing.quantity += item.quantity;
        merged++;
        continue;
      }
      const entry = {
        id: randomUUID(),
        customerId,
        url: item.url,
        quantity: item.quantity,
        variant: item.variant,
        note: item.note,
        sourceSheetUrl,
        importedAt: new Date().toISOString(),
        status: 'pending',
      };
      cart.push(entry);
      byKey.set(key, entry);
      added++;
    }

    data[customerId] = cart;
    await this.#save(data);
    return { added, merged };
  }

  async getCart(customerId) {
    const data = await this.#load();
    return data[customerId] ?? [];
  }
}
