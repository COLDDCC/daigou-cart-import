// Minimal RFC4180-style CSV parser (handles quoted fields containing commas,
// newlines, and escaped quotes) so notes/links with commas in them survive.
// Returns the raw grid (array of arrays) -- no assumption about which row is
// the header, since real-world exports often have a title/note row (or a
// few) above the actual header row. Use findHeaderRowIndex() + rowsToObjects()
// to turn this into header-keyed objects.
export function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      pushField();
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      pushField();
      pushRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }
  // Drop a trailing blank line produced by a trailing newline in the file.
  if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
    rows.pop();
  }

  return rows;
}

// Turns a raw grid into header-keyed objects, treating rows[headerRowIndex]
// as the header and everything after it as data.
export function rowsToObjects(rows, headerRowIndex = 0) {
  const header = rows[headerRowIndex];
  if (!header) return [];

  return rows
    .slice(headerRowIndex + 1)
    .filter((r) => !(r.length === 1 && r[0] === ''))
    .map((r) => {
      const obj = {};
      header.forEach((h, idx) => {
        obj[h.trim()] = (r[idx] ?? '').trim();
      });
      return obj;
    });
}

// Convenience wrapper for callers that know the header is row 0 (e.g. the
// CLI, and existing tests) -- unchanged behavior from before this file
// learned to look past a leading note row.
export function parseCsv(text) {
  return rowsToObjects(parseCsvRows(text), 0);
}
