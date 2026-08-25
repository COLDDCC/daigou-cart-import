// Clicking the toolbar icon opens the panel as its own small window instead
// of a dropdown popup, so it stays open while you work through the list —
// a dropdown popup closes the instant it loses focus (e.g. when you click
// into a newly opened tab), which made batch-processing a list painful:
// you'd have to reopen the extension for every single click.
const PANEL_URL = chrome.runtime.getURL('panel.html');
let panelWindowId = null;

chrome.action.onClicked.addListener(async () => {
  if (panelWindowId !== null) {
    try {
      await chrome.windows.update(panelWindowId, { focused: true });
      return;
    } catch {
      // The window was closed by the user (or otherwise); fall through and
      // open a fresh one below.
      panelWindowId = null;
    }
  }

  const win = await chrome.windows.create({
    url: PANEL_URL,
    type: 'popup',
    width: 460,
    height: 680,
  });
  panelWindowId = win.id;
});

chrome.windows.onRemoved.addListener((closedId) => {
  if (closedId === panelWindowId) panelWindowId = null;
});
