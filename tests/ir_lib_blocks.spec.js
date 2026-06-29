const { test, expect } = require('@playwright/test');
const APP_URL = 'http://localhost:' + (process.env.PORT || '3000') + '/';

// ── Node-level (no browser) ─────────────────────────────────────────────────
require('../src/utils/libRegistry.js');
const REG = global.BlockPyLibRegistry;
const ABS = require('../src/utils/libraryAbstraction.js');

test.describe('lib registry (node)', () => {
  test.beforeEach(() => REG.clearAll());

  test('registers a valid module.func spec and computes the block type', () => {
    const res = REG.registerLibBlock({ module: 'cv2', func: 'imread', argNames: ['filename'], hasOutput: true });
    expect(res.ok).toBe(true);
    expect(res.type).toBe('lib_cv2_imread');
    expect(REG.getLibSpec('lib_cv2_imread')).toMatchObject({ module: 'cv2', func: 'imread', argNames: ['filename'], hasOutput: true });
  });

  test('statement-form spec gets the _stmt suffix', () => {
    const res = REG.registerLibBlock({ module: 'cv2', func: 'imshow', argNames: ['winname', 'mat'], hasOutput: false });
    expect(res.type).toBe('lib_cv2_imshow_stmt');
  });

  test('rejects an invalid func identifier (oracle static check)', () => {
    const res = REG.registerLibBlock({ module: 'cv2', func: '2bad', argNames: [], hasOutput: true });
    expect(res.ok).toBe(false);
    expect(REG.getLibSpec('lib_cv2_2bad')).toBeUndefined();
  });

  test('rejects duplicate arg names', () => {
    const res = REG.registerLibBlock({ module: 'm', func: 'f', argNames: ['a', 'a'], hasOutput: true });
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('duplicate');
  });

  test('listLibBlocks groups by module', () => {
    REG.registerLibBlock({ module: 'cv2', func: 'imread', argNames: ['f'], hasOutput: true });
    REG.registerLibBlock({ module: 'cv2', func: 'waitKey', argNames: ['d'], hasOutput: true });
    REG.registerLibBlock({ module: 'math', func: 'sqrt', argNames: ['x'], hasOutput: true });
    const groups = REG.listLibBlocks();
    const cv2 = groups.find((g) => g.module === 'cv2');
    expect(cv2.blocks.map((b) => b.type).sort()).toEqual(['lib_cv2_imread', 'lib_cv2_waitKey']);
    expect(cv2.blocks[0]).toHaveProperty('argNames');
  });

  test('re-registering an existing type is idempotent (no Map/visual divergence)', () => {
    const a = REG.registerLibBlock({ module: 'cv2', func: 'imread', argNames: ['filename'], hasOutput: true });
    expect(a.ok).toBe(true);
    const b = REG.registerLibBlock({ module: 'cv2', func: 'imread', argNames: ['p1', 'p2', 'p3'], hasOutput: true });
    expect(b).toEqual({ ok: true, type: 'lib_cv2_imread' });          // no-op success
    expect(REG.getLibSpec('lib_cv2_imread').argNames).toEqual(['filename']);  // first registration wins
  });

  test('rejects a true type collision between two different functions', () => {
    const a = REG.registerLibBlock({ module: 'a_b', func: 'c', argNames: [], hasOutput: true });
    expect(a).toEqual({ ok: true, type: 'lib_a_b_c' });
    const b = REG.registerLibBlock({ module: 'a', func: 'b_c', argNames: [], hasOutput: true });
    expect(b.ok).toBe(false);
    expect(b.reason).toContain('collision');
    expect(REG.getLibSpec('lib_a_b_c').module).toBe('a_b');  // first registration intact
  });
});

// ── lib lower hook (node) ───────────────────────────────────────────────────
require('../src/utils/irToBlockly.js');   // BlockPyIR.renderComments (used by blocklyToIr)
require('../src/utils/blocklyToIr.js');
const IR = global.BlockPyIR;

test.describe('lib lower hook (node)', () => {
  test.beforeEach(() => REG.clearAll());

  test('output-form lib block lowers to module.func Call IR (as a bare Expr at top level)', () => {
    REG.registerLibBlock({ module: 'cv2', func: 'imread', argNames: ['filename'], hasOutput: true });
    const ws = { blocks: { blocks: [
      { type: 'lib_cv2_imread', inputs: { ARG0: { shadow: { type: 'ir_const', fields: { VALUE: '"x"' } } } } },
    ] } };
    const ir = IR.blocklyToIr(ws);
    expect(ir.body).toHaveLength(1);
    expect(ir.body[0]).toMatchObject({
      type: 'Expr',
      value: {
        type: 'Call',
        func: { type: 'Attribute', attr: 'imread', value: { type: 'Name', id: 'cv2' } },
        args: [{ type: 'Constant', value: 'x' }],
        keywords: [],
      },
    });
  });

  test('statement-form lib block lowers to a bare-call Expr', () => {
    REG.registerLibBlock({ module: 'cv2', func: 'imshow', argNames: ['winname', 'mat'], hasOutput: false });
    const ws = { blocks: { blocks: [
      { type: 'lib_cv2_imshow_stmt', inputs: {
        ARG0: { shadow: { type: 'ir_const', fields: { VALUE: '"win"' } } },
        ARG1: { shadow: { type: 'ir_name', fields: { ID: 'img' } } } } },
    ] } };
    const ir = IR.blocklyToIr(ws);
    expect(ir.body[0]).toMatchObject({ type: 'Expr', value: { type: 'Call', func: { attr: 'imshow' } } });
    expect(ir.body[0].value.args).toHaveLength(2);
  });

  test('bare-func (no module) lib block lowers to Name-call', () => {
    REG.registerLibBlock({ module: '', func: 'helper', argNames: ['x'], hasOutput: true });
    const ws = { blocks: { blocks: [
      { type: 'lib__helper', inputs: { ARG0: { shadow: { type: 'ir_name', fields: { ID: 'v' } } } } },
    ] } };
    const ir = IR.blocklyToIr(ws);
    expect(ir.body[0].value.func).toMatchObject({ type: 'Name', id: 'helper' });
  });

  test('lib block as an ARG of a real ir_call lowers to a bare Call (no Expr wrap)', () => {
    REG.registerLibBlock({ module: 'cv2', func: 'imread', argNames: ['filename'], hasOutput: true });
    const ws = { blocks: { blocks: [
      { type: 'ir_call', extraState: { nargs: 1, kw: [] }, inputs: {
        FUNC: { shadow: { type: 'ir_name', fields: { ID: 'print' } } },
        ARG0: { block: { type: 'lib_cv2_imread', inputs: { ARG0: { shadow: { type: 'ir_const', fields: { VALUE: '"x"' } } } } } } } },
    ] } };
    const ir = IR.blocklyToIr(ws);
    expect(ir.body[0].value.args[0]).toMatchObject({ type: 'Call', func: { attr: 'imread' } });
  });

  test('a truly unknown block type still throws (no silent swallow)', () => {
    const ws = { blocks: { blocks: [{ type: 'totally_unknown_block' }] } };
    expect(() => IR.blocklyToIr(ws)).toThrow(/no stmt handler for totally_unknown_block/);
  });
});

// ── lib spec-from-descriptor (node) ─────────────────────────────────────────
test.describe('lib spec-from-descriptor (node)', () => {
  test.beforeEach(() => REG.clearAll());

  test('derives module+func from a method/alias title (plt.plot, df.describe)', () => {
    expect(REG.specFromDescriptor({ func: 'plot', args: ['x', 'y'], hasOutput: false, title: 'plt.plot' }, 'matplotlib'))
      .toMatchObject({ module: 'plt', func: 'plot', argNames: ['x', 'y'] });
    expect(REG.specFromDescriptor({ func: 'describe', args: ['df'], hasOutput: true, title: 'df.describe' }, 'pandas'))
      .toMatchObject({ module: 'df', func: 'describe' });
  });

  test('module-prefix title still works (cv2.imread)', () => {
    expect(REG.specFromDescriptor({ func: 'imread', args: ['filename'], hasOutput: true, title: 'cv2.imread' }, 'cv2'))
      .toMatchObject({ module: 'cv2', func: 'imread' });
  });

  test('falls back to libName when the title has no dot', () => {
    expect(REG.specFromDescriptor({ func: 'sqrt', args: ['x'], hasOutput: true, title: '' }, 'math'))
      .toMatchObject({ module: 'math', func: 'sqrt' });
  });

  test('a method/alias preset lowers to the call shown in its title, not libName.func', () => {
    const spec = REG.specFromDescriptor({ func: 'plot', args: ['x', 'y'], hasOutput: false, title: 'plt.plot' }, 'matplotlib');
    const r = REG.registerLibBlock(spec);
    expect(r.ok).toBe(true);
    const ws = { blocks: { blocks: [ { type: r.type, inputs: {
      ARG0: { shadow: { type: 'ir_name', fields: { ID: 'x' } } },
      ARG1: { shadow: { type: 'ir_name', fields: { ID: 'y' } } } } } ] } };
    const ir = IR.blocklyToIr(ws);
    expect(ir.body[0].value.func).toMatchObject({ type: 'Attribute', attr: 'plot', value: { type: 'Name', id: 'plt' } });
  });

  test('demotes a multi-dot receiver title instead of mis-lowering (matplotlib.pyplot.plot)', () => {
    const spec = REG.specFromDescriptor({ func: 'plot', args: ['x'], hasOutput: false, title: 'matplotlib.pyplot.plot' }, 'matplotlib');
    expect(spec.module).toBe('matplotlib.pyplot');   // derived from title, NOT libName
    const r = REG.registerLibBlock(spec);
    expect(r.ok).toBe(false);                          // staticCheck rejects the dotted module -> demote
    expect(REG.getLibSpec('lib_matplotlib.pyplot_plot')).toBeUndefined();
  });

  test('pandas df.describe preset lowers to df.describe() with no redundant receiver arg', () => {
    const preset = ABS.AI_PRESETS.pandas.blocks.find((b) => b.title === 'df.describe');
    expect(preset.args).toEqual([]);                                  // preset data is coherent
    const spec = REG.specFromDescriptor(preset, 'pandas');
    expect(spec).toMatchObject({ module: 'df', func: 'describe', argNames: [] });
    const r = REG.registerLibBlock(spec);
    expect(r.ok).toBe(true);
    const ir = IR.blocklyToIr({ blocks: { blocks: [{ type: r.type }] } });   // no ARG inputs
    expect(ir.body[0].value).toMatchObject({
      type: 'Call',
      func: { type: 'Attribute', attr: 'describe', value: { type: 'Name', id: 'df' } },
      args: [],
    });
  });
});

// ── lib toolbox + drag (browser) ────────────────────────────────────────────
test.describe('lib toolbox + drag (browser)', () => {
  test('registered lib block: live updateToolbox + real Blockly load/save round-trips to Python', async ({ page }) => {
    test.setTimeout(300000);   // Pyodide cold-load exceeds the 60s global timeout
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.__blocklyWorkspace && window.BlockPyIR && window.BlockPyAstBridge
        && window.BlockPyLibRegistry && window.BlockPyBuildIrToolbox && window.Blockly,
      null, { timeout: 180000 });

    const out = await page.evaluate(async () => {
      const reg = window.BlockPyLibRegistry;
      reg.clearAll();
      reg.registerLibBlock({ module: 'cv2', func: 'imread', argNames: ['filename'], hasOutput: true, colour: '#06b6d4', title: 'cv2.imread' });

      // (1) rebuilt toolbox carries a per-library 'cv2' category with the block + ARG0 shadow
      const tb = window.BlockPyBuildIrToolbox();
      const lib = tb.contents.find((c) => c.name === 'cv2');
      const entry = lib && lib.contents.find((b) => b.type === 'lib_cv2_imread');

      // (2) the LIVE workspace accepts the rebuilt toolbox (exercises the revived App effect path)
      let updateThrew = false;
      try { window.__blocklyWorkspace.updateToolbox(window.BlockPyBuildIrToolbox()); }
      catch (e) { updateThrew = true; }

      // (3) REAL Blockly load -> save -> blocklyToIr -> irToPython (not a plain-object shortcut)
      const ws = window.__blocklyWorkspace;
      ws.clear();
      window.Blockly.serialization.workspaces.load({ blocks: { blocks: [
        { type: 'lib_cv2_imread', inputs: { ARG0: { shadow: { type: 'ir_const', fields: { VALUE: '"x"' } } } } },
      ] } }, ws);
      const saved = window.Blockly.serialization.workspaces.save(ws);
      const ir = window.BlockPyIR.blocklyToIr(saved);
      const py = await window.BlockPyAstBridge.getPyodide();
      const code = (await window.BlockPyAstBridge.irToPython(py, ir)).trim();
      ws.clear();
      reg.clearAll();
      return { hasLibCat: !!lib, hasEntry: !!entry, hasArgShadow: !!(entry && entry.inputs && entry.inputs.ARG0), updateThrew, code };
    });

    expect(out.hasLibCat).toBe(true);
    expect(out.hasEntry).toBe(true);
    expect(out.hasArgShadow).toBe(true);
    expect(out.updateThrew).toBe(false);
    expect(out.code).toBe("cv2.imread('x')");
  });
});

// ── lib persistence (browser) ───────────────────────────────────────────────
test.describe('lib persistence (browser)', () => {
  test('registered library survives a reload (localStorage + hydrate + toolbox)', async ({ page }) => {
    test.setTimeout(300000);
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.__blocklyWorkspace && window.BlockPyLibRegistry && window.BlockPyBuildIrToolbox,
      null, { timeout: 180000 });

    // register + persist a NON-preloaded synthetic library (cv2 is always preloaded on mount,
    // so using it would make this test pass even if persistence were broken — false positive).
    await page.evaluate(() => {
      const reg = window.BlockPyLibRegistry;
      reg.clearAll();
      try { window.localStorage.removeItem('blockpy.libRegistry.v1'); } catch (_) {}
      reg.registerLibBlock({ module: 'mylib', func: 'thing', argNames: ['a'], hasOutput: true, colour: '#888', title: 'mylib.thing' });
      reg.persist();
    });

    // reload — hydrate() must re-register and the per-library 'mylib' category must reappear
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.__blocklyWorkspace && window.BlockPyLibRegistry && window.BlockPyBuildIrToolbox,
      null, { timeout: 180000 });
    await page.waitForFunction(
      () => !!window.BlockPyLibRegistry.getLibSpec('lib_mylib_thing'), null, { timeout: 30000 });

    const out = await page.evaluate(() => {
      const tb = window.BlockPyBuildIrToolbox();
      const lib = tb.contents.find((c) => c.name === 'mylib');
      return { restored: !!window.BlockPyLibRegistry.getLibSpec('lib_mylib_thing'),
               inToolbox: !!(lib && lib.contents.find((b) => b.type === 'lib_mylib_thing')) };
    });
    expect(out.restored).toBe(true);
    expect(out.inToolbox).toBe(true);

    // cleanup so the persisted entry doesn't leak into later runs
    await page.evaluate(() => { window.BlockPyLibRegistry.clearAll(); try { window.localStorage.removeItem('blockpy.libRegistry.v1'); } catch (_) {} });
  });

  test('built-in cv2 palette is registered through the registry on load (cv2 category populated)', async ({ page }) => {
    test.setTimeout(300000);
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.__blocklyWorkspace && window.BlockPyLibRegistry && window.BlockPyBuildIrToolbox,
      null, { timeout: 180000 });
    const out = await page.evaluate(() => {
      const reg = window.BlockPyLibRegistry;
      const tb = window.BlockPyBuildIrToolbox();
      const lib = tb.contents.find((c) => c.name === 'cv2');
      return {
        imreadRegistered: !!reg.getLibSpec('lib_cv2_imread'),
        inToolbox: !!(lib && lib.contents.find((b) => b.type === 'lib_cv2_imread')),
      };
    });
    expect(out.imreadRegistered).toBe(true);
    expect(out.inToolbox).toBe(true);
  });

  test('built-in (preloaded) specs are not persisted to localStorage; user specs are', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.BlockPyLibRegistry, null, { timeout: 60000 });
    const out = await page.evaluate(() => {
      const reg = window.BlockPyLibRegistry;
      reg.clearAll();
      try { window.localStorage.removeItem('blockpy.libRegistry.v1'); } catch (_) {}
      reg.registerLibBlock({ module: 'cv2', func: 'imread', argNames: ['filename'], hasOutput: true, title: 'cv2.imread', builtin: true });
      reg.registerLibBlock({ module: 'mylib', func: 'thing', argNames: ['a'], hasOutput: true, title: 'mylib.thing' });
      reg.persist();
      const stored = JSON.parse(window.localStorage.getItem('blockpy.libRegistry.v1') || '[]');
      const types = stored.map((s) => `lib_${s.module}_${s.func}${s.hasOutput ? '' : '_stmt'}`);
      reg.clearAll();
      try { window.localStorage.removeItem('blockpy.libRegistry.v1'); } catch (_) {}
      return { count: stored.length, types };
    });
    expect(out.count).toBe(1);                              // only the user lib persisted
    expect(out.types).toContain('lib_mylib_thing');
    expect(out.types).not.toContain('lib_cv2_imread');      // built-in filtered out of persistence
  });

  test('a comment on a lib block survives the round-trip', async ({ page }) => {
    test.setTimeout(300000);
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.BlockPyIR && window.BlockPyAstBridge && window.BlockPyLibRegistry, null, { timeout: 180000 });
    const code = await page.evaluate(async () => {
      const reg = window.BlockPyLibRegistry;
      reg.clearAll();
      try { window.localStorage.removeItem('blockpy.libRegistry.v1'); } catch (_) {}
      reg.registerLibBlock({ module: 'cv2', func: 'imshow', argNames: ['winname', 'mat'], hasOutput: false, title: 'cv2.imshow' });
      const ws = { blocks: { blocks: [
        { type: 'lib_cv2_imshow_stmt',
          data: JSON.stringify({ leading: ['# show it'], trailing: null, after: [] }),
          icons: { comment: { text: '# show it', pinned: false, height: 80, width: 160 } },
          inputs: {
            ARG0: { shadow: { type: 'ir_const', fields: { VALUE: '"win"' } } },
            ARG1: { shadow: { type: 'ir_name', fields: { ID: 'img' } } } } },
      ] } };
      const ir = window.BlockPyIR.blocklyToIr(ws);
      const py = await window.BlockPyAstBridge.getPyodide();
      const result = (await window.BlockPyAstBridge.irToPython(py, ir)).trim();
      reg.clearAll();
      try { window.localStorage.removeItem('blockpy.libRegistry.v1'); } catch (_) {}
      return result;
    });
    expect(code).toContain('# show it');
    expect(code).toContain("cv2.imshow('win', img)");
  });
});
