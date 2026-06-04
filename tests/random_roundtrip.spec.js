// Permanent regression from the multi-agent random test (2026-06-04). 24 snippets written
// by 6 BlockPy-unaware personas (student, data, algo, text, math, OpenCV). Each must PARSE
// and round-trip losslessly (Python -> AST -> Python), ignoring comments (Blockly blocks
// don't model arbitrary comments — an inherent, documented loss).
//
// These guard the parser gaps the random test surfaced and fixed: multi-line docstrings,
// nested tuple for-targets, adjacent string literals, list/typed arithmetic, etc.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const P = require('../src/utils/parser.js');

const DIR = path.join(__dirname, 'fixtures', 'random');
const stripComments = (s) => s.split('\n').map((l) => { const i = l.indexOf('#'); return i >= 0 ? l.slice(0, i) : l; }).join('\n');
const norm = (s) => stripComments(s).replace(/\s+/g, '').trim();

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.py')).sort();

test.describe('random persona corpus parses & round-trips (comments ignored)', () => {
  for (const f of files) {
    test(`${f}`, () => {
      const code = fs.readFileSync(path.join(DIR, f), 'utf8');
      const ast = new P.Parser(new P.Tokenizer(code).tokenize()).parse(); // throws on parse failure
      const out = P.astToPython(ast);
      expect(norm(out)).toBe(norm(code));
    });
  }
});
