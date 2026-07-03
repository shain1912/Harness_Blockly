const { test, expect } = require('@playwright/test');
const APP_URL = 'http://localhost:' + (process.env.PORT || '3000') + '/';

// Node-level tests (no browser needed)
require('../src/utils/irToBlockly.js');
require('../src/utils/blocklyToIr.js');
const IR = global.BlockPyIR;

test.describe('comment block mapping (node)', () => {
  test('irToBlockly writes data + comment bubble for a commented stmt', () => {
    const ir = { type: 'Module', type_ignores: [], body: [
      { type: 'Assign',
        targets: [{ type: 'Name', id: 'x' }],
        value: { type: 'Constant', value: 1 },
        _comments: { leading: ['# header'], trailing: '# one', after: [] } },
    ] };
    const ws = IR.irToBlockly(ir);
    const b = ws.blocks.blocks[0];
    expect(JSON.parse(b.data)).toEqual({ leading: ['# header'], trailing: '# one', after: [] });
    expect(b.icons.comment.text).toBe('# header\n# one');
    expect(b.icons.comment.pinned).toBe(false);
  });

  test('irToBlockly leaves uncommented stmts untouched (no data, no icons)', () => {
    const ir = { type: 'Module', type_ignores: [], body: [
      { type: 'Assign', targets: [{ type: 'Name', id: 'x' }], value: { type: 'Constant', value: 1 } },
    ] };
    const b = IR.irToBlockly(ir).blocks.blocks[0];
    expect(b.data).toBeUndefined();
    expect(b.icons).toBeUndefined();
  });

  test('blocklyToIr restores _comments from block.data (full IR round-trip)', () => {
    const original = { type: 'Module', type_ignores: [], body: [
      { type: 'Assign', targets: [{ type: 'Name', id: 'x' }], value: { type: 'Constant', value: 1 },
        _comments: { leading: ['# header'], trailing: '# one', after: [] } },
    ] };
    const ws = IR.irToBlockly(original);
    const back = IR.blocklyToIr(ws);
    expect(back.body[0]._comments).toEqual({ leading: ['# header'], trailing: '# one', after: [] });
  });

  test('a bubble edited to plain text (no #) is normalized to a Python comment', () => {
    const ws = { blocks: { blocks: [
      { type: 'ir_assign', extraState: { n: 1 },
        data: JSON.stringify({ leading: ['# old'], trailing: null, after: [] }),
        icons: { comment: { text: 'remember this', pinned: false, height: 80, width: 160 } },
        inputs: {
          TARGET0: { shadow: { type: 'ir_name', fields: { ID: 'x' } } },
          VALUE: { shadow: { type: 'ir_const', fields: { VALUE: '0' } } } } },
    ] } };
    expect(IR.blocklyToIr(ws).body[0]._comments).toEqual({ leading: ['# remember this'], trailing: null, after: [] });
  });

  test('an already-# bubble line is kept as-is (idempotent normalization)', () => {
    const ws = { blocks: { blocks: [
      { type: 'ir_assign', extraState: { n: 1 },
        data: JSON.stringify({ leading: ['# old'], trailing: null, after: [] }),
        icons: { comment: { text: '# explicit', pinned: false, height: 80, width: 160 } },
        inputs: {
          TARGET0: { shadow: { type: 'ir_name', fields: { ID: 'x' } } },
          VALUE: { shadow: { type: 'ir_const', fields: { VALUE: '0' } } } } },
    ] } };
    expect(IR.blocklyToIr(ws).body[0]._comments).toEqual({ leading: ['# explicit'], trailing: null, after: [] });
  });

  test('a comment on a bare top-level expression block is preserved as an Expr comment', () => {
    const ws = { blocks: { blocks: [
      { type: 'ir_name', fields: { ID: 'x' },
        data: JSON.stringify({ leading: ['# note'], trailing: null, after: [] }),
        icons: { comment: { text: '# note', pinned: false, height: 80, width: 160 } } },
    ] } };
    const ir = IR.blocklyToIr(ws);
    expect(ir.body[0].type).toBe('Expr');
    expect(ir.body[0]._comments).toEqual({ leading: ['# note'], trailing: null, after: [] });
  });

  test('a plain-text bubble on a bare top-level expression block is normalized', () => {
    const ws = { blocks: { blocks: [
      { type: 'ir_name', fields: { ID: 'y' },
        icons: { comment: { text: 'todo', pinned: false, height: 80, width: 160 } } },
    ] } };
    expect(IR.blocklyToIr(ws).body[0]._comments).toEqual({ leading: ['# todo'], trailing: null, after: [] });
  });

  test('deleting the comment bubble (stale data remains) removes the comment, not resurrects it', () => {
    const ws = { blocks: { blocks: [
      { type: 'ir_assign', extraState: { n: 1 },
        data: JSON.stringify({ leading: ['# old'], trailing: null, after: [] }),
        // NO icons.comment -> the user deleted the bubble
        inputs: {
          TARGET0: { shadow: { type: 'ir_name', fields: { ID: 'x' } } },
          VALUE: { shadow: { type: 'ir_const', fields: { VALUE: '0' } } } } },
    ] } };
    expect(IR.blocklyToIr(ws).body[0]._comments).toBeUndefined();
  });

  test('editing the bubble away from stored data is adopted as leading', () => {
    // Simulate a saved workspace where the user changed the comment bubble text.
    const ws = { blocks: { blocks: [
      { type: 'ir_assign', extraState: { n: 1 },
        data: JSON.stringify({ leading: ['# old'], trailing: '# inline', after: [] }),
        icons: { comment: { text: '# edited note', pinned: false, height: 80, width: 160 } },
        inputs: {
          TARGET0: { shadow: { type: 'ir_name', fields: { ID: 'x' } } },
          VALUE: { shadow: { type: 'ir_const', fields: { VALUE: '0' } } } } },
    ] } };
    const ir = IR.blocklyToIr(ws);
    expect(ir.body[0]._comments).toEqual({ leading: ['# edited note'], trailing: null, after: [] });
  });

  test('unedited bubble keeps the stored structured comments verbatim', () => {
    const stored = { leading: ['# keep'], trailing: '# t', after: [] };
    const bubble = ['# keep', '# t'].join('\n');   // == renderComments(stored)
    const ws = { blocks: { blocks: [
      { type: 'ir_assign', extraState: { n: 1 },
        data: JSON.stringify(stored),
        icons: { comment: { text: bubble, pinned: false, height: 80, width: 160 } },
        inputs: {
          TARGET0: { shadow: { type: 'ir_name', fields: { ID: 'x' } } },
          VALUE: { shadow: { type: 'ir_const', fields: { VALUE: '0' } } } } },
    ] } };
    expect(IR.blocklyToIr(ws).body[0]._comments).toEqual(stored);
  });
});

test.describe('comment extraction (browser)', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(220000);
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.__pyodide && window.BlockPyAstBridge && window.BlockPyIR,
      null, { timeout: 180000 });
  });

  test('pythonToIR attaches leading/trailing/after comments to stmt nodes', async ({ page }) => {
    const ir = await page.evaluate(async () => {
      const py = await window.BlockPyAstBridge.getPyodide();
      const src = [
        '# header',
        'import os  # std',
        'def f():',
        '    # body',
        '    x = 1  # one',
        '    # tail',
        'y = 2',
      ].join('\n');
      return window.BlockPyAstBridge.pythonToIR(py, src);
    });
    const imp = ir.body[0];                 // Import
    const fn = ir.body[1];                   // FunctionDef
    const y = ir.body[2];                    // Assign y = 2
    expect(imp._comments.leading).toEqual(['# header']);
    expect(imp._comments.trailing).toBe('# std');
    const xStmt = fn.body[0];                // x = 1
    expect(xStmt._comments.leading).toEqual(['# body']);
    expect(xStmt._comments.trailing).toBe('# one');
    expect(xStmt._comments.after).toEqual(['# tail']);   // dangling at end of body
    expect(y._comments).toBeUndefined();     // no comment on y
  });

  test('a comment-only module round-trips (no statement to anchor to)', async ({ page }) => {
    const out = await page.evaluate(async () => {
      const py = await window.BlockPyAstBridge.getPyodide();
      const src = ['# just a note', '# second line'].join('\n');
      const ir = await window.BlockPyAstBridge.pythonToIR(py, src);
      const code = await window.BlockPyAstBridge.irToPython(py, ir);
      return { module: ir._comments, code };
    });
    expect(out.module).toEqual({ leading: ['# just a note', '# second line'] });
    expect(out.code).toBe('# just a note\n# second line');
  });

  test('trailing comment on a continuation line is preserved', async ({ page }) => {
    const out = await page.evaluate(async () => {
      const py = await window.BlockPyAstBridge.getPyodide();
      const src = 'x = (1 +\n     2)  # keep';
      const ir = await window.BlockPyAstBridge.pythonToIR(py, src);
      const code = await window.BlockPyAstBridge.irToPython(py, ir);
      return code;
    });
    expect(out).toContain('# keep');   // Option 3: reformatted, but the comment survives
  });

  test('irToPython re-injects comments; python->IR->python round-trips them', async ({ page }) => {
    const out = await page.evaluate(async () => {
      const py = await window.BlockPyAstBridge.getPyodide();
      const src = [
        '# header',
        'import os  # std',
        '',
        'def f():',
        '    # body',
        '    x = 1  # one',
        '    return x',
        'y = 2  # last',
      ].join('\n');
      const ir = await window.BlockPyAstBridge.pythonToIR(py, src);
      const code = await window.BlockPyAstBridge.irToPython(py, ir);
      return code;
    });
    // Option 3: blank lines may vanish, but every comment must survive at its position.
    expect(out).toContain('# header');
    expect(out).toContain('import os  # std');
    expect(out).toContain('    # body');           // indented inside the function body
    expect(out).toContain('    x = 1  # one');
    expect(out).toContain('y = 2  # last');
  });

  test('multiple inline comments in one multi-line statement are all preserved', async ({ page }) => {
    const code = await page.evaluate(async () => {
      const py = await window.BlockPyAstBridge.getPyodide();
      const ir = await window.BlockPyAstBridge.pythonToIR(py, 'x = [\n  1,  # a\n  2,  # b\n]');
      return window.BlockPyAstBridge.irToPython(py, ir);
    });
    expect(code).toContain('# a');
    expect(code).toContain('# b');
  });

  test('no comment is dropped across a diverse text round-trip (completeness)', async ({ page }) => {
    const cases = [
      'x = [\n  1,  # a\n  2,  # b\n]',
      '@deco  # dec\ndef f():\n    pass',
      'result = foo(\n    a,  # first\n    b,  # second\n)',
      '# only a comment',
      'x = 1  # inline\n# trailing block\n',
    ];
    const results = await page.evaluate(async (cs) => {
      const py = await window.BlockPyAstBridge.getPyodide();
      const out = [];
      for (const src of cs) {
        const ir = await window.BlockPyAstBridge.pythonToIR(py, src);
        const code = await window.BlockPyAstBridge.irToPython(py, ir);
        out.push({ src, code, comments: (src.match(/#[^\n]*/g) || []).map((s) => s.trim()) });
      }
      return out;
    }, cases);
    for (const r of results) {
      for (const c of r.comments) {
        expect(r.code, `lost "${c}" for:\n${r.src}\n-> got:\n${r.code}`).toContain(c);
      }
    }
  });

  test('full python -> blocks -> python preserves comments', async ({ page }) => {
    const out = await page.evaluate(async () => {
      const py = await window.BlockPyAstBridge.getPyodide();
      const src = ['# header', 'x = 1  # one', 'def f():', '    return x  # r'].join('\n');
      const ir = await window.BlockPyAstBridge.pythonToIR(py, src);
      const ws = window.BlockPyIR.irToBlockly(ir);
      const back = window.BlockPyIR.blocklyToIr(ws);
      return window.BlockPyAstBridge.irToPython(py, back);
    });
    expect(out).toContain('# header');
    expect(out).toContain('x = 1  # one');
    expect(out).toContain('    return x  # r');
  });

  test('re-injection loses no comment across compound/elif/docstring/nested forms', async ({ page }) => {
    const cases = [
      'if x:\n    a = 1\nelif y:  # keep\n    b = 2',
      'if x:  # head\n    a = 1\nelse:  # otherwise\n    b = 2',
      'if a:\n    p = 1\nelif b:  # one\n    q = 2\nelif c:  # two\n    r = 3\nelse:  # last\n    s = 4',
      '# before doc\n"""module doc"""  # after doc\nx = 1',
      'def f():\n    """fn doc"""  # d\n    return 1',
      'class C:\n    """cls doc"""  # c\n    x = 1',
      'for i in r:  # loop\n    pass',
      'while c:  # w\n    body()',
      'with open(f) as h:  # ctx\n    read(h)',
      'def g(a, b):  # sig\n    return a + b',
      'try:  # t\n    risky()\nexcept E:  # e\n    pass\nfinally:  # f\n    cleanup()',
      'for i in r:\n    use(i)\n    # dangling in loop\nafter()',
    ];
    const results = await page.evaluate(async (cs) => {
      const py = await window.BlockPyAstBridge.getPyodide();
      const out = [];
      for (const src of cs) {
        const ir = await window.BlockPyAstBridge.pythonToIR(py, src);
        const code = await window.BlockPyAstBridge.irToPython(py, ir);
        out.push({ src, code, comments: (src.match(/#[^\n]*/g) || []).map((s) => s.trim()) });
      }
      return out;
    }, cases);
    for (const r of results) {
      for (const c of r.comments) {
        expect(r.code, `LOST "${c}" for input:\n${r.src}\n--> output:\n${r.code}`).toContain(c);
      }
    }
  });

  test('a commented bare top-level call round-trips its comment', async ({ page }) => {
    const out = await page.evaluate(async () => {
      const py = await window.BlockPyAstBridge.getPyodide();
      const Blockly = window.Blockly;
      const ws = window.__blocklyWorkspace;
      ws.clear();
      // a bare ir_call dropped from the toolbox (NOT wrapped in ir_exprstmt), with a comment bubble.
      // Use the FULL variable descriptor {id,name}: a bare string is looked up as a variable ID, and
      // when the workspace carries startup variables (main.py/demo conversion) the failed lookup
      // falls back to an existing variable ("i") instead of creating "greet" — nondeterministic.
      Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [
        { type: 'ir_call', extraState: { nargs: 0, kw: [] },
          inputs: { FUNC: { shadow: { type: 'ir_name', fields: { ID: { id: 'greet-var', name: 'greet', type: '' } } } } },
          icons: { comment: { text: 'call it', pinned: false, height: 80, width: 160 } } },
      ] } }, ws);
      const saved = Blockly.serialization.workspaces.save(ws);
      const back = window.BlockPyIR.blocklyToIr(saved);
      ws.clear();
      return window.BlockPyAstBridge.irToPython(py, back);
    });
    expect(out).toContain('# call it');
    expect(out).toContain('greet()');
  });

  test('a bubble edited to plain text round-trips as a comment, not code', async ({ page }) => {
    const out = await page.evaluate(async () => {
      const py = await window.BlockPyAstBridge.getPyodide();
      const Blockly = window.Blockly;
      const ws = window.__blocklyWorkspace;
      ws.clear();
      const ir = await window.BlockPyAstBridge.pythonToIR(py, '# old\nx = 1');
      Blockly.serialization.workspaces.load(window.BlockPyIR.irToBlockly(ir), ws);
      const b = ws.getTopBlocks(false)[0];
      b.setCommentText('remember this');     // user types plain text, no '#'
      const saved = Blockly.serialization.workspaces.save(ws);
      const back = window.BlockPyIR.blocklyToIr(saved);
      ws.clear();
      return window.BlockPyAstBridge.irToPython(py, back);
    });
    expect(out).toContain('# remember this');
    expect(out).not.toMatch(/^remember this$/m);  // must NOT appear as a bare code line
  });

  const CORPUS = [
    '# only a module comment\nx = 1',
    'x = 1  # inline only',
    'def f():\n    # nested leading\n    return 1',
    'if a:\n    b = 1  # then\nelse:\n    c = 2  # else',
    'for i in items:\n    # loop body\n    use(i)\n# after the loop\ndone()',
    'class C:\n    # class body\n    x = 1  # field',
    'try:\n    risky()  # may fail\nexcept E:\n    pass  # swallow',
  ];

  test('comment corpus survives python -> blocks -> python', async ({ page }) => {
    const results = await page.evaluate(async (corpus) => {
      const py = await window.BlockPyAstBridge.getPyodide();
      const commentsOf = (s) => (s.match(/#[^\n]*/g) || []).map((c) => c.trim()).sort();
      const out = [];
      for (const src of corpus) {
        const ir = await window.BlockPyAstBridge.pythonToIR(py, src);
        const back = window.BlockPyIR.blocklyToIr(window.BlockPyIR.irToBlockly(ir));
        const code = await window.BlockPyAstBridge.irToPython(py, back);
        out.push({ src, code, inComments: commentsOf(src), outComments: commentsOf(code) });
      }
      return out;
    }, CORPUS);
    for (const r of results) {
      // Option 3: every comment is preserved (multiset, order-independent).
      expect(r.outComments, `comments lost for:\n${r.src}\n-> got:\n${r.code}`).toEqual(r.inComments);
    }
  });

  test('a deleted comment does not resurrect on round-trip', async ({ page }) => {
    const out = await page.evaluate(async () => {
      const py = await window.BlockPyAstBridge.getPyodide();
      const Blockly = window.Blockly;
      const ws = window.__blocklyWorkspace;
      ws.clear();
      const ir = await window.BlockPyAstBridge.pythonToIR(py, '# old\nx = 1');
      Blockly.serialization.workspaces.load(window.BlockPyIR.irToBlockly(ir), ws);
      const b = ws.getTopBlocks(false)[0];
      b.setCommentText(null);   // delete the comment bubble
      const saved = Blockly.serialization.workspaces.save(ws);
      const back = window.BlockPyIR.blocklyToIr(saved);
      ws.clear();
      return window.BlockPyAstBridge.irToPython(py, back);
    });
    expect(out).not.toContain('# old');
    expect(out).toContain('x = 1');
  });

  test('a comment edited in the live workspace survives regeneration', async ({ page }) => {
    const out = await page.evaluate(async () => {
      const py = await window.BlockPyAstBridge.getPyodide();
      const Blockly = window.Blockly;
      const ws = window.__blocklyWorkspace;
      ws.clear();
      const ir = await window.BlockPyAstBridge.pythonToIR(py, '# old\nx = 1');
      Blockly.serialization.workspaces.load(window.BlockPyIR.irToBlockly(ir), ws);
      const b = ws.getTopBlocks(false)[0];
      b.setCommentText('# new note');          // user edits the bubble
      b.data = b.data;                          // data still holds old structured comment
      const saved = Blockly.serialization.workspaces.save(ws);
      const back = window.BlockPyIR.blocklyToIr(saved);
      ws.clear();
      return window.BlockPyAstBridge.irToPython(py, back);
    });
    expect(out).toContain('# new note');
    expect(out).not.toContain('# old');
  });
});
