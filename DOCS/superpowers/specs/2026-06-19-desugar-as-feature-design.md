# 디슈거-as-feature (Phase 4) — 설계

**날짜:** 2026-06-19
**브랜치:** `feature/ast-ir-redesign` (master에 머지된 최신)
**선행:** Phase 0–3 + 노드 worklist 16개(raw=0) + 앱 통합 + ir_* 툴박스 + Phase 3 주석보존 + Phase 5 동적/AI 라이브러리 블록
**상위 결정 출처:** `DOCS/superpowers/specs/2026-06-07-blockpy-ast-ir-redesign-design.md` §"SUGAR 공존"

## 1. 배경 · 문제

단일 IR 파이프라인은 "sugar"(컴프리헨션·삼항·체인비교)를 **전용 SUGAR 블록**으로 보존한다
(`ir_listcomp`/`ir_setcomp`/`ir_dictcomp`/`ir_genexp`/`ir_ifexp`/`ir_compare`). 즉 sugar는
이미 블록으로 표현 가능하다. 그러나 학습/연구 목적상 사용자가 **"이 컴프리헨션이 풀어쓴
루프로는 어떻게 생겼나"**를 보고 싶을 때가 있다. Phase 4는 이를 **옵션 기능**으로 제공한다 —
켜면 sugar를 더 기초적인 등가 형태(루프/조건/불리언)로 재작성해 블록으로 보여준다.

레거시 `src/utils/desugarer.js`(`desugarPythonCode`+`ASTDesugarer`)가 과거 파이프라인에서 이를
했으나, **폐기된 `BlockPyParser` AST**를 쓰고(IR 파이프라인과 부정합) 누락이 많다(set/dict/gen
컴프리헨션 미지원, 단일 `for`절만). 현재 `shouldDesugar` 체크박스와 "Desugared" 프리뷰 패널이
UI에 있으나 **inert**(IR 변환에 영향 없음)다.

핵심 난점: **의미 보존**. 순진한 디슈거는 동작을 바꿀 수 있다 — `a < f() < b`(부작용 있는 중간
피연산자 재평가), `cond and [f(x) for x in xs]`(lazy 컨텍스트에서 컴프리헨션을 무조건 hoist),
generator expression을 list로(lazy→eager 비등가). Phase 4는 **정확성 우선**: 증명 가능하게
등가인 곳에서만 디슈거하고, 그렇지 않으면 SUGAR 블록을 그대로 보존한다.

## 2. 목표 · 비목표

**목표**
- 사용자 토글(`Auto Desugar`)로 sugar를 등가 루프/조건/불리언 블록으로 변환(opt-in).
- **정확성 우선**: 증명 가능 등가 위치에서만 디슈거; 위험하면 SUGAR 보존(잘못된 디슈거 0).
- **기본 OFF**: Convert는 기본적으로 sugar를 보존(현행 IR 동작, "의도된 공존" 철학).
- IR-레벨 단일 패스(`desugarIr`) — 결정적, node 테스트 가능, 추가 Pyodide 왕복 없음.
- 프리뷰 패널을 실제 블록 디슈거(IR-레벨)와 일치하도록 재배선.

**비목표**
- **GeneratorExp 디슈거**(lazy→list 비등가) — 보존.
- **async 컴프리헨션**(`is_async`) 디슈거 — 보존.
- **lazy/조건부/중첩 컨텍스트** 내 sugar 디슈거 — 보존.
- walrus(`:=`)·lambda·f-string 디슈거 — 범위 외.
- **"re-sugar"**(루프→컴프리헨션 역변환) — 영구 비목표. 디슈거는 단방향 오서링.
- 서버 엔드포인트(`/api/desugar`, `/api/ai-normalize`)를 IR-디슈거로 마이그레이션 — 범위 외
  (레거시 `desugarer.js`는 서버용으로 유지, 비파괴).
- 바이트 단위 포맷 보존(디슈거 결과는 `ast.unparse` 표준 포맷).

## 3. 핵심 통찰 — sugar는 이미 블록 표현 가능, 디슈거는 순수 교육용 변환

컴프리헨션·삼항·체인비교는 각각 **이미 단일 IR 블록**으로 표현된다(SUGAR 공존). 따라서 Phase 4
디슈거는 "블록화를 위해 필요"한 게 아니라 **"기초 형태로 풀어 보여주는 교육용 렌즈"**다. 그래서:
- 디슈거는 **opt-in**(기본은 sugar 블록 보존).
- 디슈거는 **단방향**: 디슈거된 루프 블록 → Python은 루프형을 내며 컴프리헨션으로 되돌지 않는다(의도됨).
- 안전하게 디슈거할 수 없는 노드는 **그냥 SUGAR 블록으로 유지**(기능 손실 없음 — 원래도 블록임).

## 4. 아키텍처 (유닛)

### 4.1 `src/utils/irDesugar.js` (신규 — 디슈거 패스)

`desugarIr(module) → module'` — IR `Module`을 받아 sugar가 안전 위치에서 풀린 새 `Module`을 반환.
순수·total(throw 없음; 디슈거 불가 노드는 원본 그대로). `window.BlockPyIrDesugar.desugarIr`로 노출
(`main.jsx` side-effect import), Node `module.exports`.

**처리 단위:** 각 문장을 walk → 그 문장 내 sugar 노드를 **eager(안전) 위치**에서 재작성하고,
필요한 temp-var 문장을 **좌→우 평가순서**로 그 문장 **앞에** hoist. 한 문장이 여러 sugar를 가지면
평가 순서대로 hoist. 디슈거로 새로 만든 문장(루프 본문 등)도 재귀적으로 디슈거(중첩 처리).

**안전 위치(eager) 판정 — `isEagerPosition(node, ancestorsToStmt)`:**
sugar 노드에서 그 문장까지의 **부모 체인**에 **lazy 노드가 하나도 없으면** eager(안전). lazy 노드:
- `BoolOp`의 첫 피연산자 이후 항(and/or 단락)
- `IfExp`의 `body`/`orelse`(테스트만 eager)
- 컴프리헨션의 `elt`/`key`/`value`/`ifs`(매 반복 평가)
- `Lambda`의 `body`(지연)

eager 노드(통과): `Call`의 args/func, `List`/`Tuple`/`Set`/`Dict` 요소, `BinOp`/`UnaryOp`/
`Compare`/`Subscript`/`Attribute`/`Starred`의 피연산자, `Assign`/`AugAssign`(value만; target은
대입 대상)/`AnnAssign`(value)/`Return`/`Expr`의 value, `For`/generator의 `iter`.

**재작성 규칙:**

1. **체인 비교** `Compare`(ops 길이 ≥ 2): `BoolOp(And, [Compare(left,op0,c0), Compare(c0,op1,c1), …])`로.
   단, **공유되는 중간 비교항(c0, c1, …, 마지막 직전)이 전부 "pure"**(Name/Constant/pure의
   Attribute)일 때만(재평가해도 부작용·결과 불변 → temp hoist 불필요 → **어느 위치에서나 안전**).
   비-pure 중간항이 하나라도 있으면 **skip**(`ir_compare` 유지). pure expr→expr이라 lazy 위치에서도
   단락 의미가 BoolOp(And)로 동일하게 보존됨.

2. **삼항** `IfExp(test, body, orelse)`: eager 위치일 때만 — `if test: _t = body` `else: _t = orelse`
   (양 분기 모두 대입하므로 init 불필요) 형태의 `If` 문장을 문장 앞에 hoist, 표현식을 `Name('_t')`로
   치환. eager 아니면 skip(`ir_ifexp` 유지).

3. **컴프리헨션**(eager 위치일 때만; async 아님):
   - `ListComp`: `_acc = []` + 중첩 `for`(generators 순서) + 중첩 `if`(각 generator.ifs) + 최내곽
     `_acc.append(elt)` hoist, 표현식을 `Name('_acc')`로.
   - `SetComp`: `_acc = set()` + … + `_acc.add(elt)`.
   - `DictComp`: `_acc = {}` + … + `_acc[key] = value`.
   - 다중 generator → 중첩 루프(바깥=generators[0]). `ifs` → 해당 루프 본문의 중첩 if.
   - `GeneratorExp` → **skip**(lazy; list화 비등가). `is_async` 있으면 → skip.
   eager 아니면 skip(SUGAR 유지).

**temp 변수 명명:** 충돌 회피용 고유 접두어(`_bp_acc_<n>`, `_bp_tern_<n>`, `_bp_cmp_<n>`),
모듈 단위 카운터. (소스에 동명 변수가 있어도 안 겹치게 충분히 특이한 접두어; 완벽한 위생 보장은
범위 외 — 접두어 충돌 가능성은 NIT로 문서화.)

### 4.2 앱 배선 (`src/App.jsx`)

- `syncCodeToBlocks`: `pythonToIR` 결과에 대해 `shouldDesugar`가 true면
  `ir = window.BlockPyIrDesugar.desugarIr(ir)` 적용 후 `irToBlockly`. (스냅샷 복구 분기는 그대로.)
- `shouldDesugar` 초기값을 **`false`로 변경**(현재 `true`).
- 토글(`Auto Desugar` 체크박스) 변경 시 현재 코드로 **재-Convert**(syncCodeToBlocks(code)) →
  블록이 즉시 갱신. (블록 탭이 활성일 때.)

### 4.3 Desugared 프리뷰 패널 (`src/App.jsx`)

- 레거시 `window.BlockPyDesugarer.desugarPythonCode(code)` 호출을 제거하고,
  `pythonToIR(code)` → `desugarIr(ir)` → `irToPython` 결과(디슈거된 Python)를 표시(async).
  실제 블록 디슈거와 **동일 결과**라 프리뷰가 진실을 반영. 원본 vs 디슈거 Python 나란히 + 어떤
  폼이 변환/보존됐는지 노트.

### 4.4 레거시 `desugarer.js` / 서버

- `src/utils/desugarer.js`, `/api/desugar`, `/api/ai-normalize`는 **그대로 유지**(서버용; 비파괴).
  블록 파이프라인·프리뷰만 IR-디슈거 사용. (두 구현 공존은 의도 — 서버는 텍스트 휴리스틱/AI, 클라는
  IR 정확-디슈거.)

## 5. 데이터 흐름

- **Convert (desugar ON):** code → `pythonToIR` → `desugarIr`(안전 sugar만 루프/조건/불리언으로,
  나머지 보존) → `irToBlockly` → 블록(디슈거된 건 루프/if 블록, 보존된 건 SUGAR 블록).
- **Convert (desugar OFF, 기본):** code → `pythonToIR` → `irToBlockly`(전부 SUGAR 보존 — 현행).
- **단방향:** 디슈거 블록 → Python = 루프형(컴프리헨션 아님). 의도된 변환.

## 6. 에러 처리

- `desugarIr`는 total: 안전 디슈거 불가 노드는 원본 sugar 노드 그대로 반환(throw 없음).
- 예기치 못한 구조 → 해당 노드 unchanged 반환(방어적). 전체 패스가 throw하지 않음.
- 토글 재-Convert 실패는 기존 `syncCodeToBlocks` try/catch가 흡수.

## 7. 테스트 (Playwright, `PORT=3100`)

- **node(서버 불필요):** `desugarIr` 단위 —
  - 각 안전 재작성의 IR shape: ListComp→For/Assign/append IR, SetComp→add, DictComp→subscript-assign,
    IfExp→If+temp, 다중 generator→중첩 For, ifs→중첩 If, 체인 비교(pure)→BoolOp(And).
  - skip(보존) 케이스: GeneratorExp 유지, async comp 유지, lazy 위치(`x = c and [.. for ..]`) 유지,
    중첩 위치(`f([.. for ..])`는 eager라 디슈거; `[.. if [..for..] else ..]` 류 lazy는 보존),
    비-pure 중간항 체인 비교(`a < f() < b`) 유지.
  - 디슈거된 IR → `irToPython`(Pyodide 필요 → browser) 또는 IR 비교(node).
- **browser:** 토글 ON → Convert `squares = [i*i for i in range(5)]` → 블록이 for+append(ir_listcomp
  아님); 재생성 Python이 루프형. **의미 등가:** 원본 Python과 디슈거 Python을 Pyodide로 각각 실행해
  결과 동일 확인(핵심 정확성 검증). 토글 OFF → `ir_listcomp` 블록. 프리뷰 패널이 IR-디슈거 결과 표시.

## 8. 슬라이스 (구현 순서)

1. `irDesugar.js` 골격 + `isEagerPosition`(부모 체인 lazy 판정) + 체인 비교(pure)→BoolOp +
   삼항→if/else hoist + node 테스트.
2. `irDesugar.js` 컴프리헨션(list/set/dict, 다중 generator/ifs) → accumulator 루프 + GeneratorExp/
   async/lazy/중첩 skip + node 테스트.
3. App 배선: `shouldDesugar` 기본 OFF + `syncCodeToBlocks` 디슈거 스텝 + 토글 재-Convert +
   browser 테스트(토글 ON/OFF, **Pyodide 의미 등가 실행 비교**).
4. Desugared 프리뷰 패널 IR-디슈거 재배선 + browser 테스트.

각 슬라이스: Claude 구현(TDD) → Codex 적대 리뷰(`scripts/codex-review-prompt.md`) → blocking 0 → 커밋.

## 9. 불변식 (Codex 게이트가 점검)

1. **의미 등가(핵심).** 디슈거된 형태가 원본 sugar와 **의미적으로 등가**인가? 안전 위치 판정이
   lazy/부작용/lazy-iter를 올바로 배제하는가? 비등가 디슈거를 내보내면 BLOCKING. (등가 보장 못 하는
   노드는 보존해야 함 — 보존은 OK.)
2. **보존 안전망.** 디슈거 불가 sugar가 손실 없이 SUGAR 블록으로 유지되는가(throw·드롭 없음)?
3. **단일 IR 정합성.** `desugarIr`가 내는 For/If/Assign/Call/BoolOp 등 IR 노드가 기존 핸들러와 동일
   스키마인가?
4. **단방향.** 디슈거는 오서링 전용; "re-sugar" 시도 없음(범위 외이며 시도하면 안 됨).
5. **raw=0 불변.** 새 IR 노드 추가 없음(기존 For/If/Assign/BoolOp/Call 재사용) — PENDING 0 유지.
6. **기본 OFF.** desugar OFF에서는 현행 SUGAR-보존 동작 그대로(회귀 없음).
