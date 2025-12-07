# Undo Clear Feature - Implementation Guide

**⚠️ STATUS: UNTESTED - This feature has been implemented but not yet tested in a live Roam graph**

## Latest Updates

### Toast Notification Implementation (Latest)
Instead of requiring users to find the undo command in the command palette, the undo button now appears automatically in a toast notification:

- **When you clear the sidebar:** A success toast appears at the top of the screen for 5 seconds
- **Toast message:** "Cleared N window(s) from sidebar"
- **Undo button:** Directly in the toast - click to immediately restore
- **Auto-dismisses:** After 5 seconds (or when clicked)
- **Better UX:** Undo is only visible when needed and available

### Changes from Previous Version
- ❌ Removed "Clear Sidebar: Undo Clear" from command palette
- ✅ Added Blueprint.js Toaster integration
- ✅ Toast appears automatically after clearing
- ✅ Undo button embedded in toast notification
- ✅ Success toast when undo completes

---

## What Was Added

### 1. Toaster Instance (Lines 7-16)
```javascript
let toaster = null;
function getToaster() {
  if (!toaster && window.Blueprint?.Core?.Toaster) {
    toaster = window.Blueprint.Core.Toaster.create({
      position: window.Blueprint.Core.Position.TOP,
      maxToasts: 3,
    });
  }
  return toaster;
}
```
Creates a Blueprint.js Toaster instance for showing notifications.

### 2. State Management (Line 4)
```javascript
let lastClearedWindows = null;
```
Stores the last cleared windows for undo capability.

### 3. Clear with Toast Notification (Lines 60-93)
```javascript
async function clearSidebar(sidebar) {
  // Clear all windows
  // ...

  // Show toast with undo button
  const toast = getToaster();
  if (toast) {
    toast.show({
      message: `Cleared ${count} window(s) from sidebar`,
      intent: window.Blueprint.Core.Intent.SUCCESS,
      icon: "tick",
      timeout: 5000,
      action: {
        onClick: () => undoClear(),
        text: "Undo",
      },
    });
  }
}
```

### 4. Undo Function with Toast Feedback (Lines 95-143)
```javascript
async function undoClear() {
  // Restore each window using addWindow API
  // ...

  // Show success toast
  const toast = getToaster();
  if (toast) {
    toast.show({
      message: `Restored ${count} window(s) to sidebar`,
      intent: window.Blueprint.Core.Intent.SUCCESS,
      icon: "undo",
      timeout: 3000,
    });
  }

  // Clear undo history
  lastClearedWindows = null;
}
```

### 5. Cleanup on Unload
Clears undo state when extension unloads.

---

## How It Works

### User Flow (with Toast Notification):
1. User has 5 pages open in sidebar
2. User clicks "Clear Sidebar" or uses hotkey
3. **Extension saves the 5 windows to memory**
4. Sidebar clears
5. **Toast appears at top:** "Cleared 5 windows from sidebar" with "Undo" button
6. User clicks "Undo" button in the toast (has 5 seconds)
7. **All 5 pages restore to the sidebar**
8. Success toast: "Restored 5 windows to sidebar"

### Features:
- ✅ Remembers last clear operation
- ✅ Works with all window types (outline, mentions, search-query)
- ✅ Handles search-query windows correctly (uses `search-query-str`)
- ✅ Shows helpful messages ("Nothing to undo" if no recent clear)
- ✅ Proper error handling with user feedback
- ✅ Clears undo history after successful restore
- ✅ Toast notification with embedded undo button
- ✅ 5-second window to undo (configurable via timeout parameter)
- ✅ Clean UI - undo only visible when available and needed

### Limitations:
- Only remembers the **most recent** clear (not full history)
- 5-second window to click undo (toast auto-dismisses)
- Undo state cleared when:
  - You undo successfully
  - You clear the sidebar again
  - Extension is unloaded/reloaded
  - Roam is closed
- Requires Blueprint.js Toaster API (fallback: silent fail if unavailable)

---

## Testing Checklist

**⚠️ NONE OF THESE HAVE BEEN TESTED YET**

Test these scenarios:
- [ ] Clear sidebar with multiple windows → Toast appears with "Undo" button
- [ ] Click "Undo" in toast → All windows restore correctly
- [ ] Wait 5+ seconds after clearing → Toast dismisses, undo unavailable
- [ ] Clear sidebar → Clear again → Only second clear is undoable
- [ ] Clear sidebar with search-query windows → Undo → Search queries restore correctly
- [ ] Verify toast appears at top of screen (not blocking content)
- [ ] Verify toast styling matches Roam's design
- [ ] Test on different screen sizes
- [ ] Verify Blueprint.js Toaster is available (check console for errors)

---

## Technical Details

### API Usage

**Blueprint.js Toaster Setup:**
```javascript
// Create toaster instance (singleton)
let toaster = null;
function getToaster() {
  if (!toaster && window.Blueprint?.Core?.Toaster) {
    toaster = window.Blueprint.Core.Toaster.create({
      position: window.Blueprint.Core.Position.TOP,
      maxToasts: 3,
    });
  }
  return toaster;
}
```

**Showing Toast with Undo Button:**
```javascript
const toast = getToaster();
if (toast) {
  toast.show({
    message: `Cleared ${count} window(s) from sidebar`,
    intent: window.Blueprint.Core.Intent.SUCCESS,
    icon: "tick",
    timeout: 5000, // 5 seconds
    action: {
      onClick: () => undoClear(),
      text: "Undo",
    },
  });
}
```

**Saving Window State:**
```javascript
// Get all unpinned windows
let sidebar = window.roamAlphaAPI.ui.rightSidebar.getWindows()
  .filter(w => !(w["pinned?"] || w["pinned-to-top?"]));

// Save for undo
lastClearedWindows = sidebar;
```

**Restoring Windows:**
```javascript
// Build window config based on type
let windowConfig = {
  "type": w['type']
};

if (w['type'] === 'search-query') {
  windowConfig['search-query-str'] = w['search-query-str'];
} else {
  windowConfig['block-uid'] = w['block-uid'] || w['page-uid'] || w['mentions-uid'];
}

// Restore window
await window.roamAlphaAPI.ui.rightSidebar.addWindow({ "window": windowConfig });
```

### Error Handling

The undo feature includes comprehensive error handling:

1. **Blueprint.js Toaster unavailable:**
   - Silent fail (checks `window.Blueprint?.Core?.Toaster` before use)
   - Operation completes successfully, just no toast shown

2. **No windows to restore:**
   - Shows alert: "Nothing to undo - no sidebar windows were recently cleared"

3. **API failure during restore:**
   - Logs error to console
   - Shows alert: "Failed to restore sidebar: [error message]"
   - Does not clear undo state (can retry manually via command palette if added back)

4. **Successful clear:**
   - Shows toast: "Cleared N window(s) from sidebar" with Undo button
   - 5-second timeout

5. **Successful restore:**
   - Shows toast: "Restored N window(s) to sidebar"
   - 3-second timeout
   - Clears undo state (prevents double-restore)

---

## Future Enhancement Ideas

1. **Persistent Undo** - Save undo state to `extensionAPI.settings` to survive page reloads
2. **Multiple Undo Levels** - Keep history of last 3-5 clear operations
3. **Undo Toggle Setting** - Allow users to disable undo feature entirely
4. **Configurable Timeout** - Setting to adjust toast timeout (3-10 seconds)
5. **Restore with Filters** - Also restore sidebar window filters using `setSidebarWindowFilters()`
6. **Keyboard Shortcut** - Add back command palette option for keyboard-only users
7. **Toast Positioning** - Setting to choose toast position (top, bottom, top-right)

---

## Implementation Notes

- Uses Blueprint.js Toaster API (bundled with Roam, version 3.50.4)
- Uses Roam's official `addWindow()` API (verified in docs)
- Maintains window order from original clear
- Respects pinned windows (never saves pinned windows to undo state)
- Memory-efficient (only stores window metadata, not content)
- Compatible with all existing Clear Sidebar features
- Graceful degradation if Blueprint.js Toaster is unavailable

---

## Known Issues / Potential Problems

**⚠️ UNTESTED - These are anticipated issues that need verification:**

1. **Blueprint.js API Availability:**
   - Assumed `window.Blueprint.Core.Toaster` exists based on bundled version
   - Needs testing to confirm API is accessible
   - May need fallback if Roam's Blueprint version differs

2. **Toast Styling:**
   - Default Blueprint theme may not match Roam's design
   - May need custom CSS to match Roam's aesthetics

3. **Toast Positioning:**
   - Top position might overlap with Roam's UI elements
   - May need adjustment based on actual appearance

4. **Mobile Support:**
   - Toast may not be mobile-friendly
   - Button might be too small on touch devices

5. **Timing Issues:**
   - 5 seconds might be too short for some users
   - Should consider making this configurable
