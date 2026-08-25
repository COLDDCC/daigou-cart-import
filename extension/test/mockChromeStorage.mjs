// Minimal stand-in for chrome.storage.local so lib/store.js can be tested
// with plain Node instead of a real browser.
export function installMockChromeStorage() {
  let data = {};
  globalThis.chrome = {
    storage: {
      local: {
        async get(key) {
          if (typeof key === 'string') return { [key]: data[key] };
          return { ...data };
        },
        async set(obj) {
          Object.assign(data, obj);
        },
        async remove(key) {
          delete data[key];
        },
      },
    },
  };
  return {
    reset: () => {
      data = {};
    },
  };
}
