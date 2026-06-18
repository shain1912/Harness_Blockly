const { test, expect } = require('@playwright/test');
const APP_URL = 'http://localhost:' + (process.env.PORT || '3000') + '/';

// ── Node-level (no browser) ─────────────────────────────────────────────────
require('../src/utils/libRegistry.js');
const REG = global.BlockPyLibRegistry;

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
});
