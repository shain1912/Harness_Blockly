// [Phase 1] Oracle-gated synthesis core. planSynthesis runs each candidate block spec
// through the lossless round-trip oracle (validateMacroTemplate): passers are queued for
// registration, failures get one optional repair attempt, and still-failing specs are
// dropped. This is the Thesis-B mechanism, tested deterministically (no AI / no Blockly).
const { test, expect } = require('@playwright/test');
const A = require('../src/utils/libraryAbstraction.js');
const P = require('../src/utils/parser.js');

const VALID = {
  type: 'macro_demo_ok', name: 'OK', slots: [{ id: 'n', label: 'N', type: 'number', default: 1 }],
  pythonTemplate: 'x = {n} + 1',
};
// pythonTemplate the core parser cannot represent losslessly (match/case is an ❌ gap),
// standing in for an LLM hallucination that must be rejected by the oracle.
const BAD = {
  type: 'macro_demo_bad', name: 'Bad', slots: [{ id: 'v', label: 'V', type: 'value', default: 'x' }],
  pythonTemplate: 'match {v}:\n    case 1:\n        pass',
};

test.describe('planSynthesis — oracle-gated categorization', () => {
  test('valid spec is accepted, invalid spec is rejected', () => {
    const plan = A.planSynthesis([VALID, BAD], P);
    expect(plan.toRegister.map(s => s.type)).toEqual(['macro_demo_ok']);
    expect(plan.rejected.map(r => r.type)).toEqual(['macro_demo_bad']);
    expect(plan.repaired).toEqual([]);
    expect(plan.rejected[0].error).toBeTruthy();
  });

  test('a repair callback recovers a fixable spec', () => {
    const broken = {
      type: 'macro_demo_fix', name: 'Fix', slots: [{ id: 'v', label: 'V', type: 'value', default: 'x' }],
      pythonTemplate: 'match {v}:\n    case 1:\n        pass',
    };
    const repair = (spec) => ({ ...spec, pythonTemplate: 'if {v} == 1:\n    pass' });
    const plan = A.planSynthesis([broken], P, repair);
    expect(plan.rejected).toEqual([]);
    expect(plan.repaired.map(s => s.type)).toEqual(['macro_demo_fix']);
    expect(plan.toRegister.map(s => s.type)).toEqual(['macro_demo_fix']);
    expect(plan.toRegister[0].pythonTemplate).toContain('if');
  });
});
