// Real-world exported sheets often carry a title/note row (or a few) above
// the actual header row -- e.g. a single freeform note like "汇率：0.044 ..."
// in column A with everything else on that row blank, followed by the real
// "名称,图片,商品链接,..." header on the next row. Blindly treating row 0 as
// the header then reads every column from the wrong row and nothing parses.
//
// Heuristic: a real header row for a multi-column table has more than one
// non-empty cell; a leading note/title row typically has just one (its own
// text) with the rest empty. This doesn't need to know any column names, so
// it works regardless of what the sheet's actual headers are called.
export function findHeaderRowIndex(rows, { minNonEmptyCells = 2, maxScanRows = 10 } = {}) {
  const scanLimit = Math.min(rows.length, maxScanRows);
  for (let i = 0; i < scanLimit; i++) {
    const nonEmptyCount = rows[i].filter((cell) => cell.trim() !== '').length;
    if (nonEmptyCount >= minNonEmptyCells) return i;
  }
  return 0;
}
