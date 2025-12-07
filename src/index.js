import { render as renderSimpleAlert } from "roamjs-components/components/SimpleAlert";

async function removeWindow(w) {
  let windowConfig = {
    "type": w['type']
  };

  if (w['type'] === 'search-query') {
    windowConfig['search-query-str'] = w['search-query-str'];
  } else {
    windowConfig['block-uid'] = w['block-uid'] || w['page-uid'] || w['mentions-uid'];
  }

  try {
    await window.roamAlphaAPI.ui.rightSidebar.removeWindow({ "window": windowConfig });
  } catch (error) {
    console.error('Failed to remove sidebar window:', error);
    throw error; // Re-throw to stop batch operation
  }
}

async function toggleWindowCollapse() {
  let windows = window.roamAlphaAPI.ui.rightSidebar.getWindows();
  const allCollapsed = windows.every(item => item["collapsed?"] === true);
  
  windows.forEach(w => {
    let windowConfig = {
      "type": w['type']
    };

    if (w['type'] === 'search-query') {
      windowConfig['search-query-str'] = w['search-query-str'];
    } else {
      windowConfig['block-uid'] = w['block-uid'] || w['page-uid'] || w['mentions-uid'];
    }

    if (allCollapsed) {
      window.roamAlphaAPI.ui.rightSidebar.expandWindow({ "window": windowConfig });
    } else {
      window.roamAlphaAPI.ui.rightSidebar.collapseWindow({ "window": windowConfig });
    }
  });
}

async function loopWindows(extensionAPI) {
  let sidebar = window.roamAlphaAPI.ui.rightSidebar.getWindows()
                  // only remove unpinned sidebar windows
                  .filter(w => !(w["pinned?"] || w["pinned-to-top?"]));

  if (extensionAPI.settings.get('sidebar-confirm')) {
    renderSimpleAlert({
      content:
        `Do you want to clear ${sidebar.length} blocks from the sidebar?`,
      onConfirm: async () => {
        try {
          for (let i = 0; i < sidebar.length; i++) {
            await removeWindow(sidebar[i]);
          }
          window.roamAlphaAPI.ui.rightSidebar.close();
        } catch (error) {
          renderSimpleAlert({
            content: `Failed to clear sidebar: ${error.message}`,
            onConfirm: () => {}
          });
        }
      },
      onCancel: () => {
        // do nothing
      },
    });
  } else {
    try {
      for (let i = 0; i < sidebar.length; i++) {
        await removeWindow(sidebar[i]);
      }
      window.roamAlphaAPI.ui.rightSidebar.close();
    } catch (error) {
      renderSimpleAlert({
        content: `Failed to clear sidebar: ${error.message}`,
        onConfirm: () => {}
      });
    }
  }
}

// Generic button creator with error handling
function createSidebarButton(iconName, className, onClick, nameToUse) {
  const checkForButton = document.getElementById(`${nameToUse}-flex-space`);
  if (checkForButton) {
    return; // Button already exists
  }

  const roamSidebarButton = document.body.querySelector("#right-sidebar>.flex-h-box>button");
  if (!roamSidebarButton) {
    console.error('[Clear Sidebar] Cannot find sidebar button mount point');
    return;
  }

  // Create button
  const mainButton = document.createElement("button");
  mainButton.className = `bp3-button bp3-minimal bp3-small ${className}`;
  mainButton.tabIndex = 0;
  mainButton.style = "right: 85px;";

  const iconSpan = document.createElement("span");
  iconSpan.className = `bp3-icon bp3-icon-${iconName}`;
  mainButton.appendChild(iconSpan);

  // Create flex spacer
  const flexDiv = document.createElement("div");
  flexDiv.className = className;
  flexDiv.id = `${nameToUse}-flex-space`;

  // Insert into DOM
  roamSidebarButton.insertAdjacentElement("beforeBegin", mainButton);
  roamSidebarButton.insertAdjacentElement("beforeBegin", flexDiv);

  // Attach event listener
  mainButton.addEventListener("click", onClick);
}

function createButton(extensionAPI) {
  createSidebarButton(
    'delete',
    'clear-sidebar',
    () => loopWindows(extensionAPI),
    'clearSidebar'
  );
}

function createCollapseButton() {
  createSidebarButton(
    'collapse-all',
    'collapse-all',
    toggleWindowCollapse,
    'collapseAll'
  );
}

function destroyButton(name) {
  // remove all parts of the button
  const toggles = document.querySelectorAll(name);
  // console.log(toggles)
  toggles.forEach(tog => {
    tog.remove();
  });
}


async function onload({ extensionAPI }) {
  if (!extensionAPI.settings.get('sidebar-confirm')) {
    await extensionAPI.settings.set('sidebar-confirm', false);
  }
  if (!extensionAPI.settings.get('sidebar-collapse')) {
    await extensionAPI.settings.set('sidebar-collapse', false);
  } else{
    createCollapseButton()
  }
  
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
            if (evt['target']['checked']) {
              createCollapseButton()
          } else{
            destroyButton('.collapse-all')
          }
          }
        }
      }
    ]
  };

  extensionAPI.settings.panel.create(panelConfig);

  extensionAPI.ui.commandPalette.addCommand({
    label: 'Clear Sidebar',
    callback: () => {
      loopWindows(extensionAPI);
    },
    "disable-hotkey": false,
  })

  extensionAPI.ui.commandPalette.addCommand({
    label: 'Clear Sidebar: Toggle Collapse All',
    callback: () => {
      toggleWindowCollapse();
    },
    "disable-hotkey": false,
  })

  createButton(extensionAPI)
  console.log("load clear sidebar plugin")
}

function onunload() {
  destroyButton('.clear-sidebar')
  destroyButton('.collapse-all')
  console.log("unload clear sidebar plugin");
}

export default {
  onload,
  onunload
};
