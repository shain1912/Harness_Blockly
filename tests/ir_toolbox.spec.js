// ir_toolbox — the drag-to-edit toolbox built from ir_* blocks.
//
// Two layers:
//   * node-level (pure JS, no server): buildIrToolbox() produces a well-formed Blockly
//     categoryToolbox; shadow defaults are structurally valid; blocklyToIr reads shadow-only
//     inputs (the toolbox-default round-trip guarantee).
//   * browser-level (live app, PORT-overridable): coverage gate — every standalone ir_* block
//     registered in Blockly.Blocks has exactly one toolbox home (and vice versa); and every
//     toolbox block, instantiated with its defaults, converts to Python without throwing.
const { test, expect } = require('@playwright/test');

const APP_URL = 'http://localhost:' + (process.env.PORT || '3000') + '/';

// ---------------------------------------------------------------------------
// Node-level: toolbox structure (no server, no Blockly)
// ---------------------------------------------------------------------------
const toolboxMod = require('../src/utils/irToolbox.js');
require('../src/utils/irToBlockly.js');
require('../src/utils/blocklyToIr.js');
const IR = global.BlockPyIR;

test.describe('ir_toolbox structure (node)', () => {
  test('buildIrToolbox returns a well-formed categoryToolbox', () => {
    const tb = toolboxMod.buildIrToolbox();
    expect(tb.kind).toBe('categoryToolbox');
    expect(Array.isArray(tb.contents)).toBe(true);
    expect(tb.contents.length).toBeGreaterThan(0);
    for (const cat of tb.contents) {
      expect(cat.kind).toBe('category');
      expect(typeof cat.name).toBe('string');
      expect(cat.name.length).toBeGreaterThan(0);
      expect(typeof cat.colour).toBe('string');
      expect(Array.isArray(cat.contents)).toBe(true);
      expect(cat.contents.length).toBeGreaterThan(0);
      // A category may also carry a flyout button (e.g. Variables' "Create variable…"); only the
      // block entries must be ir_* blocks.
      for (const blk of cat.contents) {
        if (blk.kind === 'button') { expect(typeof blk.text).toBe('string'); continue; }
        expect(blk.kind).toBe('block');
        expect(typeof blk.type).toBe('string');
        expect(blk.type.startsWith('ir_')).toBe(true);
      }
    }
  });

  test('no ir_* type is split across DIFFERENT categories', () => {
    // Same-category variants are allowed (e.g. an `if` and an `if / else` ir_if both in Control
    // flow); a type living in two different categories would be confusing, so that is flagged.
    const tb = toolboxMod.buildIrToolbox();
    const seen = {};
    for (const cat of tb.contents) {
      for (const blk of cat.contents) {
        if (blk.kind !== 'block') continue;   // skip flyout buttons
        if (seen[blk.type] !== undefined) {
          expect(seen[blk.type], `${blk.type} split across ${cat.name} and ${seen[blk.type]}`).toBe(cat.name);
        } else {
          seen[blk.type] = cat.name;
        }
      }
    }
  });

  test('shadow defaults reference ir_* blocks with JSON-valid const fields', () => {
    const tb = toolboxMod.buildIrToolbox();
    const walk = (inputs) => {
      for (const k of Object.keys(inputs || {})) {
        const child = inputs[k].shadow || inputs[k].block;
        expect(child, `input ${k} has neither shadow nor block`).toBeTruthy();
        expect(typeof child.type).toBe('string');
        expect(child.type.startsWith('ir_')).toBe(true);
        if (child.type === 'ir_const') {
          expect(() => JSON.parse(child.fields.VALUE)).not.toThrow();
        }
        if (child.inputs) walk(child.inputs);
      }
    };
    for (const cat of tb.contents) for (const blk of cat.contents) walk(blk.inputs);
  });

  test('blocklyToIr reads a value input provided only as a shadow', () => {
    const ws = { blocks: { blocks: [
      { type: 'ir_assign', extraState: { n: 1 }, inputs: {
        TARGET0: { shadow: { type: 'ir_name', fields: { ID: 'x' } } },
        VALUE: { shadow: { type: 'ir_const', fields: { VALUE: '0' } } },
      } } ] } };
    const ir = IR.blocklyToIr(ws);
    expect(ir.body[0]).toEqual({
      type: 'Assign',
      targets: [{ type: 'Name', id: 'x' }],
      value: { type: 'Constant', value: 0 },
    });
  });

  test('a bare top-level expression block becomes an Expr statement (not an error)', () => {
    // Dragging an output-only block (ir_name) onto the canvas and leaving it disconnected must
    // not throw — Python treats a bare expression line as an Expr statement.
    const ws = { blocks: { blocks: [{ type: 'ir_name', fields: { ID: 'x' } }] } };
    const ir = IR.blocklyToIr(ws);
    expect(ir.body[0]).toEqual({ type: 'Expr', value: { type: 'Name', id: 'x' } });
  });

  test('a bare context-only block (ir_slice / ir_starred) is skipped, not emitted as a statement', () => {
    // Slice/Starred are valid only inside a parent (subscript / call-arg). Dragged out and left
    // disconnected they are incomplete fragments — topToStmt drops them so the module body stays
    // empty rather than unparsing to `:` / `*args`, which Python can't re-parse as a statement.
    // Build each from its REAL toolbox defaults (ir_starred needs its VALUE child to convert at
    // all) so the test tracks exactly what a user drags out of the palette.
    const tb = toolboxMod.buildIrToolbox();
    const byType = {};
    for (const cat of tb.contents) for (const blk of cat.contents) byType[blk.type] = blk;
    for (const type of ['ir_slice', 'ir_starred']) {
      const entry = byType[type];
      expect(entry, `${type} missing from toolbox`).toBeTruthy();
      const blockJson = {
        type,
        ...(entry.extraState ? { extraState: entry.extraState } : {}),
        ...(entry.fields ? { fields: entry.fields } : {}),
        ...(entry.inputs ? { inputs: entry.inputs } : {}),
      };
      const ir = IR.blocklyToIr({ blocks: { blocks: [blockJson] } });
      expect(ir.type).toBe('Module');
      expect(ir.body, `${type} should be skipped, not emitted`).toEqual([]);
    }
  });

  test('blocklyToIr does not mutate the snapshot it is given (shadow defaults are not hardened)', () => {
    // The production caller (BlocklyEditor.regenerate) persists the SAME snapshot object it passes
    // here (blocklySnapshotRef) and reloads it on tab-switch / remount. If blocklyToIr collapsed
    // inp.shadow into inp.block in place, a shadow default would harden into a real block across a
    // recovery cycle. Convert a snapshot whose inputs are shadow-only, then assert it is unchanged.
    const ws = { blocks: { blocks: [
      { type: 'ir_assign', extraState: { n: 1 }, inputs: {
        TARGET0: { shadow: { type: 'ir_name', fields: { ID: 'x' } } },
        VALUE: { shadow: { type: 'ir_const', fields: { VALUE: '0' } } },
      } } ] } };
    const before = JSON.stringify(ws);
    const ir = IR.blocklyToIr(ws);
    expect(ir.body[0].value).toEqual({ type: 'Constant', value: 0 }); // shadow was still read
    expect(JSON.stringify(ws), 'blocklyToIr must not mutate its input snapshot').toBe(before);
  });

  test('a bare ir_starred with no child (Convert-style, no shadow) is skipped, not thrown', () => {
    // A toolbox starred carries a shadow on VALUE, but a Convert-produced one (f(*args)) does not,
    // so a user can disconnect its child and leave VALUE empty. topToStmt must skip it BY TYPE
    // before evaluating it — evaluating would dereference a missing VALUE.block and throw, stalling
    // regenerate for the ENTIRE workspace (the bug the CONTEXT_ONLY contract claims to prevent).
    const ws = { blocks: { blocks: [{ type: 'ir_starred' }] } };
    let ir;
    expect(() => { ir = IR.blocklyToIr(ws); }, 'orphan ir_starred must not throw').not.toThrow();
    expect(ir.type).toBe('Module');
    expect(ir.body, 'orphan ir_starred should be skipped').toEqual([]);
  });

  test('a real block on an input wins over its shadow default', () => {
    const ws = { blocks: { blocks: [
      { type: 'ir_assign', extraState: { n: 1 }, inputs: {
        TARGET0: { shadow: { type: 'ir_name', fields: { ID: 'x' } } },
        VALUE: {
          shadow: { type: 'ir_const', fields: { VALUE: '0' } },
          block: { type: 'ir_const', fields: { VALUE: '99' } },
        },
      } } ] } };
    const ir = IR.blocklyToIr(ws);
    expect(ir.body[0].value).toEqual({ type: 'Constant', value: 99 });
  });
});

// ---------------------------------------------------------------------------
// Browser-level: live coverage + per-block conversion
// ---------------------------------------------------------------------------
test.describe('ir_toolbox in app (browser)', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(220000);
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.__pyodide && window.__blocklyWorkspace && window.BlockPyIR
        && window.BlockPyAstBridge && window.BlockPyIrToolbox,
      null, { timeout: 180000 });
  });

  test('every standalone ir_* block has exactly one toolbox home (and vice versa)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const EXCLUDE = ['ir_formattedvalue']; // HELPER-only: valid only inside ir_joinedstr
      const registered = Object.keys(window.Blockly.Blocks).filter((t) => t.startsWith('ir_'));
      const inToolbox = [];
      window.BlockPyIrToolbox.contents.forEach((c) => c.contents.forEach((b) => { if (b.kind === 'block') inToolbox.push(b.type); }));
      const expected = registered.filter((t) => EXCLUDE.indexOf(t) < 0);
      return {
        missing: expected.filter((t) => inToolbox.indexOf(t) < 0),
        unknown: inToolbox.filter((t) => registered.indexOf(t) < 0),
        excludedButPresent: EXCLUDE.filter((t) => inToolbox.indexOf(t) >= 0),
        // An EXCLUDE entry must name a real registered block — otherwise the escape hatch could
        // silently drop a typo'd / renamed block from the coverage requirement.
        excludedNotRegistered: EXCLUDE.filter((t) => registered.indexOf(t) < 0),
      };
    });
    expect(result.missing, `registered ir_* blocks with no toolbox category: ${result.missing.join(', ')}`).toEqual([]);
    expect(result.unknown, `toolbox blocks not registered in Blockly.Blocks: ${result.unknown.join(', ')}`).toEqual([]);
    expect(result.excludedButPresent, `HELPER blocks must not be in the toolbox: ${result.excludedButPresent.join(', ')}`).toEqual([]);
    expect(result.excludedNotRegistered, `EXCLUDE names an unregistered block: ${result.excludedNotRegistered.join(', ')}`).toEqual([]);
  });

  test('every toolbox block, dropped on the canvas, round-trips block -> IR -> Python -> reparse', async ({ page }) => {
    const results = await page.evaluate(async () => {
      const py = await window.BlockPyAstBridge.getPyodide();
      const ws = window.__blocklyWorkspace;
      const Blockly = window.Blockly;
      // Slice/Starred are valid only inside a parent (subscript / call-arg). A disconnected one
      // on the canvas is an incomplete fragment: blocklyToIr's topToStmt SKIPS it (rather than
      // emitting `:` / `*args`, which can't be re-parsed as a statement), so the module body is
      // empty — no throw. For them we assert body.length === 0 and skip the Python text check.
      const CONTEXT_ONLY = ['ir_slice', 'ir_starred'];
      const entries = [];
      window.BlockPyIrToolbox.contents.forEach((c) => c.contents.forEach((b) => { if (b.kind === 'block') entries.push(b); }));
      const out = [];
      for (const entry of entries) {
        ws.clear();
        const blockJson = { type: entry.type };
        if (entry.extraState) blockJson.extraState = entry.extraState;
        if (entry.fields) blockJson.fields = entry.fields;
        if (entry.inputs) blockJson.inputs = entry.inputs;
        try {
          Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [blockJson] } }, ws);
          const saved = Blockly.serialization.workspaces.save(ws);
          // Exercise the SAME path the editor's change listener uses — no special-casing.
          const ir = window.BlockPyIR.blocklyToIr(saved);
          if (CONTEXT_ONLY.indexOf(entry.type) >= 0) {
            const okIr = !!ir && ir.type === 'Module' && ir.body.length === 0;
            out.push({ type: entry.type, ok: okIr, bodyLen: ir && ir.body.length });
          } else {
            const okIr = !!ir && ir.type === 'Module' && ir.body.length === 1;
            const code = await window.BlockPyAstBridge.irToPython(py, ir);
            // Round-trip gate (not just no-throw): the emitted Python must parse back into IR.
            // A default that unparses to non-empty-but-unparseable text (the weak-oracle gap)
            // fails here. CONTEXT_ONLY blocks are exempt (they intentionally emit no statement).
            let reparseOk = false;
            try { reparseOk = !!(await window.BlockPyAstBridge.pythonToIR(py, code)); }
            catch (e) { out.push({ type: entry.type, ok: false, code, reparseErr: String(e && e.message || e).split('\n')[0] }); continue; }
            out.push({ type: entry.type, ok: okIr && typeof code === 'string' && code.length > 0 && reparseOk, code });
          }
        } catch (err) {
          out.push({ type: entry.type, ok: false, error: String(err && err.message || err) });
        }
      }
      ws.clear();
      return out;
    });
    const failed = results.filter((r) => !r.ok);
    expect(failed, `blocks that failed to convert:\n${JSON.stringify(failed, null, 2)}`).toEqual([]);
  });
});
