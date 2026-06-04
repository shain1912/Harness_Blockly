# zelos (Scratch3) Renderer + Light Theme Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch the Blockly workspace to the `zelos` (Scratch3/MakeCode) renderer with a bright light theme so all blocks get the rounded, vivid Scratch3 look.

**Architecture:** Change the `Blockly.inject` config in `BlocklyEditor.jsx` from `renderer: 'geras'` to `'zelos'`, replace the dark `cyber_dark` theme with a light `scratch_light` theme (light component colors + vivid Scratch3 category colors), flip the grid color to dark-faint, and change the `#blockly-div` CSS background from dark to light. Renderer/theme are pure presentation — no parser/generator/serialization impact.

**Tech Stack:** React (`src/components/BlocklyEditor.jsx`), CSS (`src/index.css`), CDN Blockly (`zelos` renderer is bundled in `blockly_compressed.js`), Playwright e2e.

---

## File Structure

- `src/components/BlocklyEditor.jsx` — the `useEffect` that injects Blockly: theme factory `getBlocklyTheme()` (lines ~16-37), `renderer` (line ~46), `grid.colour` (line ~50).
- `src/index.css` — `#blockly-div` background (line ~584).
- `tests/zelos_renderer.spec.js` — new renderer-lock regression.

---

### Task 1: Switch to zelos renderer + light theme + light grid/background

**Files:**
- Modify: `src/components/BlocklyEditor.jsx` — `getBlocklyTheme()`, `renderer`, `grid.colour`
- Modify: `src/index.css` — `#blockly-div` background
- Test: `tests/zelos_renderer.spec.js` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/zelos_renderer.spec.js`:

```js
// Renderer-lock regression: the Blockly workspace must use the zelos (Scratch3/MakeCode)
// renderer. Guards against an accidental revert to geras.
const { test, expect } = require('@playwright/test');

const APP_URL = 'http://localhost:3000';

test.describe('Blockly uses the zelos (Scratch3) renderer', () => {
  test('workspace renderer option is zelos', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => !!window.__blocklyWorkspace, null, { timeout: 15000 });
    const info = await page.evaluate(() => {
      const ws = window.__blocklyWorkspace;
      return {
        optRenderer: ws.options && ws.options.renderer,
        rendererClass: ws.getRenderer ? ws.getRenderer().getClassName() : '',
      };
    });
    expect(info.optRenderer).toBe('zelos');
    // zelos renderer's root CSS class is "zelos-renderer"
    expect(info.rendererClass).toContain('zelos');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/zelos_renderer.spec.js`
Expected: FAIL — `optRenderer` is `'geras'`, not `'zelos'`.

- [ ] **Step 3: Replace the theme factory** in `src/components/BlocklyEditor.jsx`

Find this block (lines ~16-37):

```jsx
    // Defined Dark/Cyber Theme for Blockly
    const getBlocklyTheme = () => {
      return window.Blockly.Theme.defineTheme('cyber_dark', {
        'base': window.Blockly.Themes.Classic,
        'componentStyles': {
          'workspaceBackgroundColour': '#0c0f1b',
          'toolboxBackgroundColour': '#0e1220',
          'toolboxTextColour': '#94a3b8',
          'flyoutBackgroundColour': '#0e1220',
          'flyoutTextColour': '#94a3b8',
          'scrollbarColour': '#64748b',
          'scrollbarOpacity': 0.4
        },
        'blockStyles': {
          'logic_blocks': { 'colourPrimary': '#5b80a5' },
          'loop_blocks': { 'colourPrimary': '#5ba55b' },
          'math_blocks': { 'colourPrimary': '#5b67a5' },
          'text_blocks': { 'colourPrimary': '#5ba5a5' },
          'list_blocks': { 'colourPrimary': '#745ba5' },
          'variable_blocks': { 'colourPrimary': '#a55b80' }
        }
      });
    };
```

Replace it with:

```jsx
    // Scratch3/MakeCode-style light theme for the zelos renderer.
    const getBlocklyTheme = () => {
      const base = window.Blockly.Themes.Zelos || window.Blockly.Themes.Classic;
      return window.Blockly.Theme.defineTheme('scratch_light', {
        'base': base,
        'componentStyles': {
          'workspaceBackgroundColour': '#f8fafc',
          'toolboxBackgroundColour': '#ffffff',
          'toolboxForegroundColour': '#334155',
          'flyoutBackgroundColour': '#f1f5f9',
          'flyoutForegroundColour': '#334155',
          'flyoutOpacity': 1,
          'scrollbarColour': '#cbd5e1',
          'scrollbarOpacity': 0.6,
          'insertionMarkerColour': '#334155',
          'insertionMarkerOpacity': 0.3,
          'cursorColour': '#334155'
        },
        'blockStyles': {
          'logic_blocks': { 'colourPrimary': '#4C97FF' },
          'loop_blocks': { 'colourPrimary': '#FFAB19' },
          'math_blocks': { 'colourPrimary': '#59C059' },
          'text_blocks': { 'colourPrimary': '#5CB1D6' },
          'list_blocks': { 'colourPrimary': '#9966FF' },
          'variable_blocks': { 'colourPrimary': '#FF8C1A' },
          'procedure_blocks': { 'colourPrimary': '#FF6680' }
        }
      });
    };
```

- [ ] **Step 4: Switch the renderer** in `src/components/BlocklyEditor.jsx`

Find (line ~46):

```jsx
      renderer: 'geras',
```

Replace with:

```jsx
      renderer: 'zelos',
```

- [ ] **Step 5: Flip the grid colour** in `src/components/BlocklyEditor.jsx`

Find (lines ~47-52):

```jsx
      grid: {
        spacing: 20,
        length: 3,
        colour: 'rgba(255, 255, 255, 0.05)',
        snap: true
      },
```

Replace the `colour` line so the block becomes:

```jsx
      grid: {
        spacing: 20,
        length: 3,
        colour: 'rgba(0, 0, 0, 0.06)',
        snap: true
      },
```

- [ ] **Step 6: Change the `#blockly-div` background** in `src/index.css`

Find (lines ~580-586):

```css
#blockly-div {
  width: 100%;
  height: 100%;
  flex-grow: 1;
  background: #0c0f1b !important;
  min-height: 250px;
}
```

Replace the `background` line so it becomes:

```css
#blockly-div {
  width: 100%;
  height: 100%;
  flex-grow: 1;
  background: #f8fafc !important;
  min-height: 250px;
}
```

(Leave `.light-theme #blockly-div { background: #f1f5f9 !important; }` unchanged.)

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx playwright test tests/zelos_renderer.spec.js`
Expected: PASS — `optRenderer` is `'zelos'` and `rendererClass` contains `'zelos'`.

- [ ] **Step 8: Commit**

```bash
git add src/components/BlocklyEditor.jsx src/index.css tests/zelos_renderer.spec.js
git commit -m "feat: switch Blockly to zelos (Scratch3) renderer + light theme"
```
(Append trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`)

---

### Task 2: No-regression verification + visual screenshot

**Files:**
- Test: `tests/zelos_renderer.spec.js` (append a screenshot-capture test)

- [ ] **Step 1: Append a screenshot test** to `tests/zelos_renderer.spec.js` (inside the existing `test.describe`)

```js
  test('blocks still render and regenerate code under zelos (visual capture)', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto(APP_URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__blocklyWorkspace, null, { timeout: 15000 });
    // The app auto-loads a demo on mount; wait for it to render as blocks.
    await page.waitForFunction(() => window.__blocklyWorkspace.getAllBlocks(false).length > 0, null, { timeout: 15000 });
    await page.locator('#tab-btn-blockly').click().catch(() => {});
    await page.waitForTimeout(500);
    const info = await page.evaluate(() => {
      const ws = window.__blocklyWorkspace;
      let code = '';
      try { code = window.Blockly.Python.workspaceToCode(ws) || ''; } catch (_) {}
      return { count: ws.getAllBlocks(false).length, codeLen: code.trim().length };
    });
    expect(info.count).toBeGreaterThan(0);
    expect(info.codeLen).toBeGreaterThan(0);
    await page.screenshot({ path: 'test-results/zelos-look.png', fullPage: false });
  });
```

- [ ] **Step 2: Run the zelos spec (logic + screenshot)**

Run: `npx playwright test tests/zelos_renderer.spec.js`
Expected: PASS — renderer is zelos, demo blocks render (count > 0), code regenerates (codeLen > 0). A screenshot is written to `test-results/zelos-look.png`.

- [ ] **Step 3: Run the full no-regression suite**

Run: `npx playwright test tests/random_roundtrip.spec.js tests/realistic_roundtrip.spec.js tests/method_def.spec.js tests/arity_buttons.spec.js tests/examples_gallery_blocks.spec.js tests/zelos_renderer.spec.js`
Expected: PASS — random 24, realistic 33, method_def 5, arity 7, gallery 20, zelos 2 = 91 passed. The renderer/theme switch is pure presentation; conversion/serialization/round-trips are unaffected.

If `examples_gallery_blocks` regresses, the likely cause is zelos failing to render a specific custom block shape — report the failing example id (DONE_WITH_CONCERNS) rather than reverting the whole renderer.

- [ ] **Step 4: Commit**

```bash
git add tests/zelos_renderer.spec.js
git commit -m "test: zelos renderer no-regression + visual capture"
```
(Append trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`)

---

## Self-Review Notes

- **Spec coverage:** renderer geras→zelos (Task 1 Step 4) ✓, light theme `scratch_light` with componentStyles + vivid blockStyles (Task 1 Step 3) ✓, `Themes.Zelos || Classic` fallback guard (Task 1 Step 3) ✓, grid colour dark-faint (Task 1 Step 5) ✓, `#blockly-div` light bg (Task 1 Step 6) ✓, renderer-lock test (Task 1) ✓, no-regression across suites (Task 2 Step 3) ✓, visual screenshot (Task 2 Step 1) ✓.
- **No placeholders:** all colors, file edits, and commands concrete; full before/after code blocks shown.
- **Consistency:** workspace bg `#f8fafc` in the theme matches the `#blockly-div` `#f8fafc` background; theme name `scratch_light` and renderer `'zelos'` used consistently across tasks and the renderer-lock assertion (`ws.options.renderer === 'zelos'`).
- **Risk note:** `ws.getRenderer().getClassName()` returns the zelos renderer's CSS class (contains `zelos`); if a CDN version returns an unexpected string, `ws.options.renderer === 'zelos'` is the primary assertion and is authoritative.
