// Child-process worker used by the cross-process concurrency test: one
// process, one addItems() call, then exit. The test spawns several of these
// at once against the same store file.
import { CartStore } from '../../src/cartStore.mjs';

const [, , storePath, customerId, url] = process.argv;
const store = new CartStore(storePath);
await store.addItems(customerId, [{ url, quantity: 1 }], 'worker');
