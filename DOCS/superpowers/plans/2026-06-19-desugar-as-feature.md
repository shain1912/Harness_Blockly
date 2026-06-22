# 디슈거-as-feature (Phase 4) — 구현 플랜

**설계:** `DOCS/superpowers/specs/2026-06-19-desugar-as-feature-design.md`
**브랜치:** `feature/ast-ir-redesign`
**워크플로우(프로젝트 합의):** Claude TDD 구현 → Codex 적대 리뷰(`scripts/codex-review-prompt.md`) → blocking 0 → 커밋. 슬라이스당 1틱.

## 핵심 구현 결정 (설계 + 코드 조사로 확정)

1. **eager-position을 "top-down eager-slot 하강"으로 구현** (설계 §4.1의 ancestor-chain 검사와 등가, 더 단순).
   `desugarExpr(node, hoist)`는 eager 컨텍스트에서만 호출되고, 비-sugar 노드를 만나면 **eager 자식 슬롯만** 재귀.
   lazy 슬롯(BoolOp.values[1+], Compare.comparators[1+], IfExp.body/orelse, Lambda/Await/Yield/comprehension 내부)은
   건드리지 않음 → 그 안의 sugar는 보존. lazy 슬롯에 한 번 들어가면 그 하위는 전부 보존.
2. **statement entry(eager) 필드 = 설계 §4.1 명시 목록만**: `Expr.value`, `Assign.value`, `AugAssign.value`,
   `AnnAssign.value`, `Return.value`, `For.iter`, `AsyncFor.iter`. `If.test`/`While.test`/`With`/`Assert`/`Raise`/
   `Match.subject`는 **제외(보존)** — While.test는 반복재평가라 hoist 비등가, 나머지는 보수적 보존(손실 없음).
3. **재귀 구조**: `desugarStmt(stmt) → [stmt...]`. (a) eager expr 필드를 `desugarExpr`로 처리(temp를 `hoist`에 수집),
   (b) 자식 suite(body/orelse/finalbody/handlers/cases)를 `desugarStmt`로 재귀, (c) `hoist` 문장들도 `desugarStmt`로
   재귀(루프 본문/분기에 들어간 sugar를 올바른 scope에서 다시 디슈거). → `[...desugaredHoist, rewrittenStmt]`.
   IfExp의 body/orelse는 분기 안 `Assign.value`(eager)로 들어가므로 lazy성이 자연 보존됨.
4. **순수 변환(in-place 변형 없음)**: 모든 변환은 새 노드 반환, 변경 없으면 동일 노드 반환. shared subtree를 mutate
   안 함(blocklyToIr의 deep-clone 해저드 회피). 체인비교의 중간항은 두 pair에 들어가므로 그 자리만 JSON clone.
5. **체인비교는 위치 무관 안전**: 공유 중간항(comparators[:-1]) 전부 pure(Name/Constant/pure의 Attribute)일 때만
   `BoolOp(And, [Compare…])`. pure→pure라 lazy 위치에서도 단락 의미 동일. 비-pure 중간항 1개라도 있으면 보존.
6. **컴프리헨션 루프변수 누수 = 문서화된 한계(NIT, 설계 §4.1 "완벽한 위생 보장은 범위 외")**. 레거시 desugarer도
   동일하게 누수(타깃명 그대로 사용). 의미 등가는 **결과값** 기준; incidental 루프변수 바인딩 누수는 NIT.
   타깃명을 그대로 써서 교육적 가독성 유지. (alpha-rename/함수래핑은 비목표.)
7. **삼항 init 불필요**: 양 분기 모두 `_t` 대입 → `_t = None` 프리셋 불필요(레거시는 했음; 개선).
8. **방어적 total**: `desugarIr`는 top-level + per-top-statement try/catch로 예외 시 해당 문장 원본 보존. 전체 throw 없음.

## 슬라이스

### Slice 1 — `irDesugar.js` 골격 + 체인비교 + 삼항 (node TDD)
- `src/utils/irDesugar.js`: `desugarIr`/`desugarStmt`/`desugarExpr`/`recurseEagerChildren`/`recurseSuites`,
  `isPure`, fresh-name 카운터. `window.BlockPyIrDesugar` + `module.exports`. `main.jsx` side-effect import 추가.
- 체인비교(pure middle)→BoolOp(And); 비-pure middle/단일op 보존. 삼항(eager)→If hoist + temp; lazy 보존.
- `tests/ir_desugar.spec.js`(pure-node): IR shape 단언 + 보존(skip) 케이스.
- **게이트**: node 테스트 green → Codex blocking 0 → 커밋.

### Slice 2 — 컴프리헨션 (node TDD)
- ListComp→`_acc=[]`+중첩For+중첩If+`append`; SetComp→`set()`+`add`; DictComp→`{}`+`_acc[key]=value`.
- 다중 generator→중첩 For(바깥=generators[0]); ifs→해당 루프 본문 중첩 If. GeneratorExp/async/lazy/비-eager 보존.
- 중첩 컴프리헨션(elt 내부)·좌→우 hoist 순서·For.iter 내 컴프리헨션 테스트.
- **게이트**: node 테스트 green → Codex blocking 0 → 커밋.

### Slice 3 — App 배선 (browser)
- `shouldDesugar` 기본 **false**. `syncCodeToBlocks`: `pythonToIR` 후 shouldDesugar면 `desugarIr` 적용 → `irToBlockly`.
- 토글 변경 시 **스냅샷 무효화 후** 현재 code 재-Convert(스냅샷 복구가 옛 설정 블록을 복원하는 것 차단).
- `tests/ir_desugar_app.spec.js`: 토글 ON `squares=[i*i for i in range(5)]`→for+append 블록·루프형 Python 재생성;
  토글 OFF→`ir_listcomp`. **Pyodide 의미 등가**: 원본/디슈거 Python 실행 결과 동일.
- **게이트**: browser 테스트 green → Codex blocking 0 → 커밋.

### Slice 4 — Desugared 프리뷰 패널 (browser)
- 레거시 `BlockPyDesugarer.desugarPythonCode` 제거 → `pythonToIR`→`desugarIr`→`irToPython`(async) 표시.
- 원본 vs 디슈거 Python 나란히. browser 테스트.
- **게이트**: browser 테스트 green → Codex blocking 0 → 커밋.

## 불변식 (설계 §9, Codex 게이트)
의미 등가 / 보존 안전망 / 단일 IR 정합성 / 단방향 / raw=0 불변(새 IR 노드 없음) / 기본 OFF 회귀 없음.

## 검증 + Codex 게이트 결과 (슬라이스 1+2)

- node: `tests/ir_desugar.spec.js` 41개 green (변환/보존/재귀/순서/lazy-field/클래스바디/블록정합성).
- Pyodide 의미등가: `tests/ir_desugar_semantics.spec.js` 17 케이스 green — 원본 vs 디슈거 **값+부작용 순서** 동일
  (적대 케이스 dict key/value 순서, `f()+[comp]` 좌→우, `c.x+=[comp]` 타깃순서, AnnAssign value-first, **클래스바디 NameError 패리티** 포함).
- 적대 검증 워크플로 + Codex 2회로 실버그 발견·수정:
  - DictComp `acc[key]=value` value-before-key 역전 → key를 temp로 hoist.
  - hoist가 좌측 side-effect 재배치(`f()+[comp]`, `c.x+=[comp]`) → `st.impure`(좌→우) + AugAssign 타깃 비-Name.
  - **클래스바디 컴프리헨션 스코프(Codex P1)** → `inClassBody` 추적, 클래스바디 직속 hoisting 디슈거(comp/삼항) 보존.

### 정확성 바: **Pragmatic (clean + broad)** — 2026-06-22 설계오너 결정
Codex가 추가로 찾은 2건은 **병리적 입력**에서만 비등가 → NIT로 수용(엄격 수정 대신 깔끔한 교육 출력 유지):
- **체인비교 중간항 재읽기**: `a<b<c`→`a<b and b<c`(중간항 복제). 정상 Python에선 등가. 단 prior 비교의
  **오버로드 연산자**가 중간항 바인딩을 바꾸면 비등가. (impure 중간항 `a<f()<b`는 여전히 보존—이중호출 방지.)
- **순수 피연산자 좌측 hoist**: 컴프리헨션의 iterable이 같은 문장의 다른(순수) 피연산자를 rebind하면 재읽기 발산
  (`z=a+[x for x in g()]` where g() does `global a`). side-effect 피연산자(`f()+[comp]`, attr/subscript AugAssign 타깃)는 보존.
이 2건은 `irDesugar.js` 헤더에 `[Codex P1, accepted]`로 명시. 정상 교육 코드에서는 발생 불가.
