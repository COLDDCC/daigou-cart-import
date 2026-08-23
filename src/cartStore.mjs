import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

// Stand-in for the real cart backend: one JSON file, keyed by customerId.
// Swap this class for a real DB/API client later — addItems()/getCart() is
// the whole surface the importer depends on.
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

  async #save(data) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }

  // Adds items to a customer's cart. Re-importing the same link+variant for
  // the same customer merges quantity instead of creating a duplicate line,
  // so submitting the same sheet twice (or an updated version of it) is safe.
  async addItems(customerId, items, sourceSheetUrl) {
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
