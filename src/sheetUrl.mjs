// Turns a normal "share link" a customer pastes (Google Sheets edit/view URL,
// or a direct CSV link) into a URL that returns raw CSV text.
export function toCsvExportUrl(rawUrl) {
  const url = new URL(rawUrl);

  if (url.hostname !== 'docs.google.com') {
    // Not Google Sheets — assume it already points at CSV (e.g. Tencent Docs
    // export link, a raw .csv file) and use it as-is.
    return rawUrl;
  }

  const match = url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) return rawUrl;

  const sheetId = match[1];
  const gidFromQuery = url.searchParams.get('gid');
  const gidFromHash = (url.hash.match(/gid=(\d+)/) || [])[1];
  const gid = gidFromQuery ?? gidFromHash ?? '0';

  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}
