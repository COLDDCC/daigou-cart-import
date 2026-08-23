import { open, unlink, stat, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

// A cross-process, cross-instance exclusive lock backed by a lockfile, using
// exclusive create ('wx' — fails if the file already exists) as the atomic
// primitive. Works across separate `node` processes on the same machine
// (e.g. two people each running the import CLI at once), not just within
// one process.
//
// If a process dies while holding the lock, the lockfile would otherwise
// block everyone forever — staleMs bounds that: a lock older than staleMs is
// assumed abandoned and stolen.
export async function withFileLock(targetPath, fn, { staleMs = 30_000, retryMs = 50, timeoutMs = 10_000 } = {}) {
  const lockPath = `${targetPath}.lock`;
  await mkdir(dirname(targetPath), { recursive: true });

  const start = Date.now();
  for (;;) {
    try {
      const handle = await open(lockPath, 'wx');
      await handle.close();
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;

      try {
        const info = await stat(lockPath);
        if (Date.now() - info.mtimeMs > staleMs) {
          await unlink(lockPath).catch(() => {});
          continue; // retry immediately, don't count this toward the timeout
        }
      } catch {
        continue; // lockfile vanished between EEXIST and stat — retry
      }

      if (Date.now() - start > timeoutMs) {
        throw new Error(`获取文件锁超时（${lockPath}）：可能有其它进程卡住了，${staleMs}ms 后锁会自动失效`);
      }
      await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
  }

  try {
    return await fn();
  } finally {
    await unlink(lockPath).catch(() => {});
  }
}
