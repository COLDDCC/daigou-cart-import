import { toCsvExportUrl } from './lib/sheetUrl.js';
import { parseCsv } from './lib/csv.js';
import { normalizeRow } from './lib/normalize.js';
import { getItems, mergeItems, setItemStatus, removeItem, clearAll } from './lib/store.js';

const sheetUrlInput = document.getElementById('sheet-url');
const importLinkBtn = document.getElementById('import-link');
const importFileBtn = document.getElementById('import-file');
const fileInput = document.getElementById('csv-file');
const statusEl = document.getElementById('status');
const warningsEl = document.getElementById('warnings');
const listEl = document.getElementById('item-list');
const openNextBtn = document.getElementById('open-next');
const openAllBtn = document.getElementById('open-all');
const clearBtn = document.getElementById('clear-all');
const batchSizeInput = document.getElementById('batch-size');

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

function renderWarnings(warnings) {
  warningsEl.innerHTML = '';
  warningsEl.hidden = warnings.length === 0;
  for (const w of warnings) {
    const li = document.createElement('li');
    li.textContent = w;
    warningsEl.appendChild(li);
  }
}

function rowsToItems(rows) {
  const items = [];
  const warnings = [];
  rows.forEach((row, idx) => {
    // row 1 is the header, so the first data row is spreadsheet row 2.
    const { item, warnings: rowWarnings } = normalizeRow(row, idx + 2);
    warnings.push(...rowWarnings);
    if (item) items.push(item);
  });
  return { items, warnings };
}

async function importCsvText(csvText) {
  const rows = parseCsv(csvText);
  const { items, warnings } = rowsToItems(rows);
  const { added, updated } = await mergeItems(items);
  const skipped = rows.length - items.length;

  if (rows.length > 0 && items.length === 0) {
    setStatus(
      `这份表格的 ${rows.length} 行全部被跳过了，很可能是表头列名对不上（下面列了每一行具体原因）。` +
        '需要"商品链接"这一列，中英文列名都行，见下方仓库 README 里的对照表。',
      true,
    );
  } else {
    setStatus(`导入完成：新增 ${added} 条，更新 ${updated} 条，跳过 ${skipped} 行`, false);
  }
  renderWarnings(warnings);
  await renderList();
}

importLinkBtn.addEventListener('click', async () => {
  const rawUrl = sheetUrlInput.value.trim();
  if (!rawUrl) {
    setStatus('请先粘贴表格链接', true);
    return;
  }
  setStatus('正在拉取表格…');
  try {
    const csvUrl = toCsvExportUrl(rawUrl);
    const res = await fetch(csvUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await importCsvText(await res.text());
  } catch (err) {
    setStatus(`拉取表格失败：${err.message}。请确认表格已设为"知道链接的任何人可查看"`, true);
  }
});

importFileBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file) return;
  setStatus('正在解析文件…');
  try {
    await importCsvText(await file.text());
  } catch (err) {
    setStatus(`解析文件失败：${err.message}`, true);
  }
});

function itemLabel(item) {
  const parts = [item.url];
  if (item.quantity > 1) parts.push(`x${item.quantity}`);
  if (item.variant) parts.push(item.variant);
  return parts.join(' · ');
}

async function openItem(item) {
  // active:false keeps focus on the popup so it doesn't auto-close and lose
  // the rest of the batch, and doesn't touch the target page in any way
  // beyond loading it — same as a human opening a link in a background tab.
  await chrome.tabs.create({ url: item.url, active: false });
  await setItemStatus(item.id, 'opened');
}

async function renderList() {
  const items = await getItems();
  listEl.innerHTML = '';

  const pendingCount = items.filter((i) => i.status === 'pending').length;
  openNextBtn.disabled = pendingCount === 0;
  openAllBtn.disabled = pendingCount === 0;
  const disabledReason = items.length === 0 ? '还没有导入任何商品' : '没有待处理的商品了（都已打开或删除）';
  openNextBtn.title = pendingCount === 0 ? disabledReason : '';
  openAllBtn.title = pendingCount === 0 ? disabledReason : '';

  if (items.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-hint';
    empty.textContent = '还没有导入任何商品：先在上面粘贴表格链接点"拉取"，或者上传一个 CSV 文件。';
    listEl.appendChild(empty);
    return;
  }

  for (const item of items) {
    const li = document.createElement('li');
    li.className = item.status === 'opened' ? 'opened' : 'pending';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = item.status === 'opened';
    checkbox.title = '手动标记是否已处理';
    checkbox.addEventListener('change', async () => {
      await setItemStatus(item.id, checkbox.checked ? 'opened' : 'pending');
      await renderList();
    });

    const info = document.createElement('span');
    info.className = 'item-info';
    info.title = item.url;
    info.textContent = itemLabel(item);

    const openBtn = document.createElement('button');
    openBtn.textContent = '打开';
    openBtn.addEventListener('click', async () => {
      await openItem(item);
      await renderList();
    });

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '删除';
    removeBtn.addEventListener('click', async () => {
      await removeItem(item.id);
      await renderList();
    });

    li.append(checkbox, info, openBtn, removeBtn);

    if (item.note) {
      const note = document.createElement('div');
      note.className = 'item-note';
      note.textContent = item.note;
      li.appendChild(note);
    }

    listEl.appendChild(li);
  }
}

async function openBatch(all) {
  const items = await getItems();
  const pending = items.filter((i) => i.status === 'pending');
  const batchSize = all ? pending.length : Math.max(1, parseInt(batchSizeInput.value, 10) || 5);
  const toOpen = pending.slice(0, batchSize);

  for (const item of toOpen) {
    await openItem(item);
  }
  setStatus(`已在后台打开 ${toOpen.length} 个标签页，剩余待处理 ${pending.length - toOpen.length} 个`);
  await renderList();
}

openNextBtn.addEventListener('click', () => openBatch(false));
openAllBtn.addEventListener('click', () => openBatch(true));

clearBtn.addEventListener('click', async () => {
  if (!confirm('确定清空整个清单吗？此操作不可撤销。')) return;
  await clearAll();
  setStatus('已清空');
  await renderList();
});

renderList();
