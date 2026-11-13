import { render as renderSimpleAlert } from "roamjs-components/components/SimpleAlert";

// ---- module state ----
let wantCollapse = false;
let clearClick = null;
let mounted = { clear: null, collapse: null }; // each: {button, spacer}
let observer = null;
let observedSidebar = null;
let observedHeader = null;
let mountErrorLogged = false;
let lastCleared = null;

const ANCHOR_SELECTOR =
  '#right-sidebar>.flex-h-box>button:not(.clear-sidebar):not(.collapse-all)';

function toWindowConfig(w) {
  if (w['type'] === 'search-query') {
    return { "type": w['type'], "search-query-str": w['search-query-str'] };
  }
  return {
    "type": w['type'],
    "block-uid": w['block-uid'] || w['page-uid'] || w['mentions-uid']
  };
}

function sameWindow(a, b) {
  const ca = toWindowConfig(a);
  const cb = toWindowConfig(b);
  return ca['type'] === cb['type'] &&
    ca['block-uid'] === cb['block-uid'] &&
    ca['search-query-str'] === cb['search-query-str'];
}

async function removeWindow(w) {
  try {
    await window.roamAlphaAPI.ui.rightSidebar.removeWindow({ "window": toWindowConfig(w) });
  } catch (error) {
    console.error('Failed to remove sidebar window:', error);
    throw error; // Re-throw to stop batch operation
  }
}

async function toggleWindowCollapse() {
  let windows = window.roamAlphaAPI.ui.rightSidebar.getWindows();
  const allCollapsed = windows.every(item => item["collapsed?"] === true);

  windows.forEach(w => {
    const windowConfig = toWindowConfig(w);
    if (allCollapsed) {
      window.roamAlphaAPI.ui.rightSidebar.expandWindow({ "window": windowConfig });
    } else {
      window.roamAlphaAPI.ui.rightSidebar.collapseWindow({ "window": windowConfig });
    }
  });
}

async function clearWindows(sidebar) {
  const removed = [];
  try {
    for (let i = 0; i < sidebar.length; i++) {
      await removeWindow(sidebar[i]);
      removed.push({ ...sidebar[i] });
    }
    window.roamAlphaAPI.ui.rightSidebar.close();
  } catch (error) {
    renderSimpleAlert({
      content: `Failed to clear sidebar: ${error.message}`,
      onConfirm: () => {}
    });
  } finally {
    // an empty clear must not overwrite an existing snapshot
    if (removed.length) {
      lastCleared = removed;
    }
  }
}

async function loopWindows(extensionAPI) {
  let sidebar = window.roamAlphaAPI.ui.rightSidebar.getWindows()
                  // only remove unpinned sidebar windows
                  .filter(w => !(w["pinned?"] || w["pinned-to-top?"]));

  if (extensionAPI.settings.get('sidebar-confirm')) {
    renderSimpleAlert({
      content:
        `Do you want to clear ${sidebar.length} blocks from the sidebar?`,
      onConfirm: () => clearWindows(sidebar),
      onCancel: () => {
        // do nothing
      },
    });
  } else {
    await clearWindows(sidebar);
  }
}

async function undoLastClear() {
  const snap = lastCleared;
  lastCleared = null;
  if (!snap?.length) {
    return;
  }

  const rs = window.roamAlphaAPI.ui.rightSidebar;
  await rs.open();

  const sorted = [...snap].sort((a, b) => a['order'] - b['order']);
  for (const w of sorted) {
    try {
      const cfg = toWindowConfig(w);

      // already open: the user's current state wins
      if (rs.getWindows().some(cur => sameWindow(cur, w))) {
        continue;
      }

      // deleted target
      if (w['type'] !== 'search-query') {
        const uid = cfg['block-uid'];
        let found;
        try {
          found = window.roamAlphaAPI.pull('[:db/id]', `[:block/uid "${uid}"]`);
        } catch (e) {
          found = true; // pull failed: attempt the add anyway
        }
        if (found === null || found === undefined) {
          continue;
        }
      }

      await rs.addWindow({
        "window": { ...cfg, "order": Math.min(w['order'], rs.getWindows().length) }
      });
      if (w['collapsed?']) {
        await rs.collapseWindow({ "window": cfg });
      }
    } catch (error) {
      console.error('[Clear Sidebar] Failed to restore sidebar window:', error);
    }
  }
}

// ---- button mounting ----
function buildPair(iconName, className, nameToUse, onClick) {
  const button = document.createElement("button");
  button.className = `bp3-button bp3-minimal bp3-small ${className}`;
  button.tabIndex = 0;
  button.style = "right: 85px;";

  const iconSpan = document.createElement("span");
  iconSpan.className = `bp3-icon bp3-icon-${iconName}`;
  button.appendChild(iconSpan);

  const spacer = document.createElement("div");
  spacer.className = className;
  spacer.id = `${nameToUse}-flex-space`;

  button.addEventListener("click", onClick);
  return { button, spacer };
}

function pairHealthy(pair, header) {
  return !!pair &&
    pair.button.isConnected && pair.spacer.isConnected &&
    pair.button.parentElement === header && pair.spacer.parentElement === header;
}

function destroyButton(name) {
  // remove all parts of the button
  document.querySelectorAll(name).forEach(tog => {
    tog.remove();
  });
}

function removePair(kind, selector) {
  const pair = mounted[kind];
  if (pair) {
    pair.button.remove();
    pair.spacer.remove();
  }
  destroyButton(selector);
  mounted[kind] = null;
}

function ensureKind(kind, selector, header, anchor, wanted, make) {
  if (!wanted) {
    if (mounted[kind] || document.querySelector(selector)) {
      removePair(kind, selector);
    }
    return;
  }
  if (pairHealthy(mounted[kind], header)) {
    return;
  }
  removePair(kind, selector);
  const pair = make();
  const before = kind === 'clear' && pairHealthy(mounted.collapse, header)
    ? mounted.collapse.button
    : anchor;
  before.insertAdjacentElement("beforeBegin", pair.button);
  before.insertAdjacentElement("beforeBegin", pair.spacer);
  mounted[kind] = pair;
}

function bindObserver(sidebar, header) {
  if (!observer || (sidebar === observedSidebar && header === observedHeader)) {
    return;
  }
  observer.disconnect();
  observedSidebar = sidebar;
  observedHeader = header;
  if (header) {
    observer.observe(header, { childList: true });
  }
  if (sidebar) {
    observer.observe(sidebar, { childList: true });
    if (sidebar.parentElement) {
      observer.observe(sidebar.parentElement, { childList: true });
    }
  }
}

function ensureMounted() {
  const anchor = document.querySelector(ANCHOR_SELECTOR);
  const sidebar = document.getElementById('right-sidebar');
  const header = anchor ? anchor.parentElement : null;

  if (anchor) {
    // collapse first so the clear pair can be placed in front of it
    ensureKind('collapse', '.collapse-all', header, anchor, wantCollapse,
      () => buildPair('collapse-all', 'collapse-all', 'collapseAll', toggleWindowCollapse));
    ensureKind('clear', '.clear-sidebar', header, anchor, true,
      () => buildPair('delete', 'clear-sidebar', 'clearSidebar', (e) => clearClick && clearClick(e)));
  } else if (!mountErrorLogged) {
    mountErrorLogged = true;
    console.error('[Clear Sidebar] Cannot find sidebar button mount point');
  }

  bindObserver(sidebar, header);
}

async function onload({ extensionAPI }) {
  if (!extensionAPI.settings.get('sidebar-confirm')) {
    await extensionAPI.settings.set('sidebar-confirm', false);
  }
  if (!extensionAPI.settings.get('sidebar-collapse')) {
    await extensionAPI.settings.set('sidebar-collapse', false);
  }
  wantCollapse = !!extensionAPI.settings.get('sidebar-collapse');
  clearClick = () => loopWindows(extensionAPI);
  mountErrorLogged = false;

  const panelConfig = {
    tabTitle: "Clear Sidebar",
    settings: [
      {
        id: "sidebar-confirm",
        name: "Confirm Dialog",
        description: "Will show a confirm dialog before the sidebar is cleared",
        action: {
          type: "switch",
          onChange: (evt) => { }
        }
      },
      {
        id: "sidebar-collapse",
        name: "Collapse Blocks",
        description: "Adds a button to the sidebar to collapse all open blocks",
        action: {
          type: "switch",
          onChange: (evt) => {
            wantCollapse = evt['target']['checked'];
            ensureMounted();
          }
        }
      }
    ]
  };

  extensionAPI.settings.panel.create(panelConfig);

  extensionAPI.ui.commandPalette.addCommand({
    label: 'Clear Sidebar',
    callback: () => loopWindows(extensionAPI),
    "disable-hotkey": false,
  })

  extensionAPI.ui.commandPalette.addCommand({
    label: 'Clear Sidebar: Toggle Collapse All',
    callback: () => toggleWindowCollapse(),
    "disable-hotkey": false,
  })

  extensionAPI.ui.commandPalette.addCommand({
    label: 'Clear Sidebar: Undo Last Clear',
    callback: () => undoLastClear(),
    "disable-hotkey": false,
  })

  observer = new MutationObserver(ensureMounted);
  ensureMounted();
  console.log("load clear sidebar plugin")
}

function onunload() {
  // disconnect first, otherwise the observer re-mounts what we remove below
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  removePair('clear', '.clear-sidebar');
  removePair('collapse', '.collapse-all');
  wantCollapse = false;
  clearClick = null;
  observedSidebar = null;
  observedHeader = null;
  mountErrorLogged = false;
  lastCleared = null;
  console.log("unload clear sidebar plugin");
}

export default {
  onload,
  onunload
};
