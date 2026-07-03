/* curateHeuristic.js — DETERMINISTIC, no-AI curation over a blockpy-gen LibrarySpec.
 *
 * The offline desktop is the flagship, but Curate's quality lived entirely in the one ONLINE step
 * (/api/abstract-library -> MiniMax). Without a key it fell back to the raw flood. This module
 * produces the SAME response shape as that endpoint — { success, level, selected:[{ref,label,group,
 * tier}], macros, thoughts } — from the LibrarySpec alone, so Curate works fully offline.
 *
 * Every signal is STRUCTURAL / introspective (kind, arity, docstring, name shape) or a keyword
 * overlap with the USER'S OWN purpose text — never a hardcoded per-library name table (the hard
 * project constraint). The generic English action-verb list below is a naming heuristic (how public
 * APIs are conventionally named), not a per-library table: it is the same for numpy, serial, cv2.
 *
 * Pure (no Blockly/Pyodide/Node deps) — attaches window.BlockPyCurateHeuristic; also module.exports.
 */

// Generic action verbs used to (a) reward verb-y public names and (b) bucket entries into a small,
// stable functional taxonomy. NOT library-specific — conventional English API verbs.
const VERB_BUCKETS = [
  { group: '입력·읽기', verbs: ['read', 'get', 'recv', 'receive', 'load', 'fetch', 'list', 'find', 'scan', 'poll', 'input', 'parse', 'decode'] },
  { group: '출력·쓰기', verbs: ['write', 'set', 'send', 'save', 'put', 'post', 'draw', 'show', 'print', 'plot', 'display', 'emit', 'dump', 'encode'] },
  { group: '연결·제어', verbs: ['open', 'close', 'connect', 'disconnect', 'start', 'stop', 'run', 'wait', 'move', 'turn', 'reset', 'clear', 'flush', 'begin', 'end', 'seek', 'wrap', 'fill'] },
];
const ALL_VERBS = VERB_BUCKETS.flatMap((b) => b.verbs);

const LEVEL_CAP = { beginner: 8, intermediate: 16, advanced: 34 };

function tok(s) { return String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); }

// Match a name against a verb list: exact, snake-prefix (open_port), or camel/lower prefix (openPort).
function startsVerb(lname, verbs) {
  return verbs.some((v) => lname === v || lname.startsWith(v + '_') || (lname.startsWith(v) && lname.length <= v.length + 8));
}

function requiredArity(e) {
  return (e.params || []).filter((p) => (p.kind === 'positional' || p.kind === 'keyword') && !p.hasDefault).length;
}

function bucketOf(e) {
  if (e.kind === 'constant' || e.kind === 'property') return '값·설정';
  const lname = String(e.name || '').toLowerCase();
  for (const b of VERB_BUCKETS) if (startsVerb(lname, b.verbs)) return b.group;
  return e.kind === 'class' ? '객체·생성' : '기타';
}

// A short friendly label from the real name — snake/camel -> spaced words, ≤3 words. Display-only
// (the block face still shows the real module.func); this is the curation record's label.
function friendlyLabel(name) {
  const words = String(name || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')   // camelCase -> camel Case
    .split(/[_\s]+/).filter(Boolean);
  return words.slice(0, 3).join(' ') || String(name || '');
}

function scoreEntry(e, purposeWords) {
  let s = 0;
  const name = String(e.name || '');
  const lname = name.toLowerCase();
  // kind: constructors + module functions are the headline API; methods next; values least.
  s += (e.kind === 'class') ? 4 : (e.kind === 'function') ? 3 : (e.kind === 'method') ? 2 : 1;
  // arity: fewer REQUIRED args = friendlier to drag-and-run (Myers: required params hurt beginners).
  s += Math.max(0, 3 - requiredArity(e));
  // naming: a conventional action verb reads as intended public API.
  if (startsVerb(lname, ALL_VERBS)) s += 3;
  // documented = intended surface.
  if ((e.doc || '').trim()) s += 2;
  // short names read easier.
  if (name.length <= 12) s += 1;
  // safety: private-ish should already be filtered upstream.
  if (lname.startsWith('_')) s -= 6;
  // relevance to the USER's purpose words (deterministic — from their text, not a table).
  if (purposeWords.length) {
    const hay = new Set([...tok(name), ...tok(e.doc)]);
    s += purposeWords.filter((w) => hay.has(w)).length * 4;
  }
  return s;
}

function normLevel(x) {
  const s = String(x || '').toLowerCase();
  if (s === '초' || s.startsWith('beg') || s.startsWith('element')) return 'beginner';
  if (s === '고' || s.startsWith('adv') || s.startsWith('high')) return 'advanced';
  return 'intermediate';
}

function refOf(moduleDotted, e) {
  if (e.qualName) return e.qualName;
  if (e.kind === 'method') return `${moduleDotted}.${e.owner}.${e.name}`;
  return `${moduleDotted}.${e.name}`;
}

// Curate deterministically. Returns the SAME shape as /api/abstract-library so the frontend flow
// (preview -> confirm -> ★ tab) is identical whether the picks came from the LLM or this heuristic.
function curate(librarySpec, opts = {}) {
  const module = (librarySpec && librarySpec.module) || '';
  const entries = (librarySpec && librarySpec.entries) || [];
  const lvl = normLevel(opts.level);
  const cap = LEVEL_CAP[lvl];
  const purposeWords = tok(opts.purpose).filter((w) => w.length >= 3);

  // Only CALLABLE entries: a curation is a view over call blocks, and curationToRegistrySpecs (both
  // the AI and this path) resolves refs through entryToSpec, which represents only calls — constants
  // and properties don't become curated blocks (they remain in the full library tab). Scoring them
  // would just tier picks that silently vanish at Confirm.
  const ranked = entries
    .filter((e) => e && (e.kind === 'function' || e.kind === 'class' || e.kind === 'method'))
    .map((e) => ({ e, s: scoreEntry(e, purposeWords) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || String(a.e.name).localeCompare(String(b.e.name)));

  const ceil = Math.min(cap * 3, 40);
  const kept = ranked.slice(0, ceil);
  const selected = kept.map(({ e }, idx) => ({
    ref: refOf(module, e),
    label: friendlyLabel(e.name),
    group: bucketOf(e),
    tier: idx < cap ? 'core' : 'more',
  }));

  const thoughts = [
    `AI 없이 휴리스틱으로 "${module}"에서 ${selected.length}개 선별 (${lvl}).`,
    '점수 기준: 인자 적음 + 동사형 이름 + 문서 있음 + 목적어 일치. 매크로는 AI 큐레이트에서 제공됩니다.',
  ];
  // Macros are intentionally NOT synthesized here: a deterministic multi-step composition can't
  // safely infer call ordering/args from names alone, and a wrong-arity macro would emit broken
  // Python. The AI path (arity-verified) owns macros; the heuristic gives a solid tiered primitive set.
  return { success: true, module, level: lvl, selected, macros: [], thoughts, heuristic: true };
}

const api = (typeof window !== 'undefined' ? window : global);
api.BlockPyCurateHeuristic = { curate, scoreEntry, bucketOf, friendlyLabel, normLevel };
if (typeof module !== 'undefined') module.exports = api.BlockPyCurateHeuristic;
