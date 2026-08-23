import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { withFileLock } from './fileLock.mjs';

// Stand-in for the real cart backend: one JSON file, keyed by customerId.
// Swap this class for a real DB/API client later — addItems()/getCart() is
// the whole surface the importer depends on.
//
// addItems() takes a lockfile before its read-modify-write, so concurrent
// imports racing on the same cart file — same process or two separate CLI
// runs from different people — merge correctly instead of one silently
// clobbering the other. That lock only works within one filesystem: if the
// team runs this from their own laptops against their own copies of the
// file, each person just has a different cart. Point everyone at one shared
// file (one server, or a shared network path) until this moves to a real
// backend with its own concurrency handling.
export class CartStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

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
    if (items.length === 0) return { added: 0, merged: 0 };
    return withFileLock(this.filePath, () => this.#addItemsLocked(customerId, items, sourceSheetUrl));
  }

  async #addItemsLocked(customerId, items, sourceSheetUrl) {
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
