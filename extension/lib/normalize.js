// Customers won't all use the same column names, so accept a few common
// spellings per field (Chinese and English) instead of forcing an exact template.
const HEADER_ALIASES = {
  url: ['商品链接', '链接', 'url', 'link', '商品url', 'product link'],
  quantity: ['数量', 'qty', 'quantity', '件数'],
  variant: ['规格', 'sku', 'variant', '颜色尺码', 'options'],
  note: ['备注', 'note', 'remark', '说明'],
};

function findValue(rowObj, aliases) {
  for (const key of Object.keys(rowObj)) {
    const norm = key.trim().toLowerCase();
    if (aliases.some((a) => a.toLowerCase() === norm)) return rowObj[key];
  }
  return undefined;
}

// rowNumber is the spreadsheet row number (accounting for the header row),
// used only to make warnings point back at a row the customer can find.
export function normalizeRow(rowObj, rowNumber) {
  const rawUrl = findValue(rowObj, HEADER_ALIASES.url);
  if (!rawUrl) {
    return { item: null, warnings: [`第 ${rowNumber} 行：缺少商品链接，已跳过`] };
  }

  let url;
  try {
    url = new URL(rawUrl.trim()).toString();
  } catch {
    return { item: null, warnings: [`第 ${rowNumber} 行：链接格式不合法（${rawUrl}），已跳过`] };
  }

  const warnings = [];
  const rawQuantity = findValue(rowObj, HEADER_ALIASES.quantity);
  let quantity = parseInt(rawQuantity, 10);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    if (rawQuantity) warnings.push(`第 ${rowNumber} 行：数量“${rawQuantity}”无效，已按 1 处理`);
    quantity = 1;
  }

  const variant = (findValue(rowObj, HEADER_ALIASES.variant) || '').trim() || undefined;
  const note = (findValue(rowObj, HEADER_ALIASES.note) || '').trim() || undefined;

  return { item: { url, quantity, variant, note }, warnings };
}
