#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { toCsvExportUrl } from './sheetUrl.mjs';
import { parseCsv } from './csv.mjs';
import { normalizeRow } from './normalize.mjs';
import { CartStore } from './cartStore.mjs';

export async function importCsvText({ csvText, customerId, storePath, sourceSheetUrl }) {
  const rows = parseCsv(csvText);
  const items = [];
  const warnings = [];

  rows.forEach((row, idx) => {
    // idx 0 is spreadsheet row 2 (row 1 is the header).
    const { item, warnings: rowWarnings } = normalizeRow(row, idx + 2);
    warnings.push(...rowWarnings);
    if (item) items.push(item);
  });

  const store = new CartStore(storePath);
  const { added, merged } = await store.addItems(customerId, items, sourceSheetUrl);

  return { added, merged, skipped: rows.length - items.length, warnings };
}

export async function importSheet({ sheetUrl, customerId, storePath }) {
  const csvUrl = toCsvExportUrl(sheetUrl);
  const res = await fetch(csvUrl);
  if (!res.ok) {
    throw new Error(
      `拉取表格失败：HTTP ${res.status}。请确认表格分享设置为「知道链接的任何人可查看」`,
    );
  }
  const csvText = await res.text();
  return importCsvText({ csvText, customerId, storePath, sourceSheetUrl: sheetUrl });
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sheet') args.sheet = argv[++i];
    else if (argv[i] === '--customer') args.customer = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.sheet || !args.customer) {
    console.error('用法: node src/importSheet.mjs --sheet <表格链接> --customer <客户ID> [--out <cart数据文件路径>]');
    process.exitCode = 1;
    return;
  }

  const storePath = args.out ?? path.join(process.cwd(), 'data', 'carts.json');
  try {
    const result = await importSheet({ sheetUrl: args.sheet, customerId: args.customer, storePath });
    console.log(`导入完成：新增 ${result.added} 件，合并数量 ${result.merged} 件，跳过 ${result.skipped} 行`);
    result.warnings.forEach((w) => console.warn('⚠', w));
  } catch (err) {
    console.error('导入失败:', err.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
