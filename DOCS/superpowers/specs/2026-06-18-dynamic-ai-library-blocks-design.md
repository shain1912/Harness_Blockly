# 동적/AI 라이브러리 블록 (Phase 5) — 설계

**날짜:** 2026-06-18
**브랜치:** `feature/ast-ir-redesign` (master에 머지된 최신)
**선행:** Phase 0–2 + 노드 worklist 16개(raw=0) + 앱 통합(`651e2be`) + ir_* 툴박스(`97db5d7`) + Phase 3 주석보존(`1383f99`)
**상위 결정 출처:** `DOCS/superpowers/specs/2026-06-07-blockpy-ast-ir-redesign-design.md` §"3계층 라이브러리 호출"

## 1. 배경 · 문제

단일 IR 파이프라인은 raw=0을 달성했다. 임의 라이브러리 호출(`cv2.imread("x")`,
`pd.read_csv(p)`)은 이미 **Tier-B**(제네릭 `ir_call` + `ir_attribute` 블록)로 무손실
왕복한다. 즉 "미지 라이브러리도 raw 아님"은 충족됐다.

그러나 Tier-B 표현은 **오서링이 불편**하다. `cv2.imread("x")` 하나를 만들려면
`ir_call`(FUNC=`ir_attribute`(VALUE=`ir_name('cv2')`, ATTR='imread'), ARG0=`ir_const('x')`)
처럼 블록 3~4개를 중첩해야 한다. Phase 5는 **Tier-A**를 도입한다 — 라이브러리 함수 하나당
이름붙은 단일 블록(`[cv2.imread (filename)]`)을 제공해 드래그 한 번으로 작성하게 한다.

이 블록들은 **프리셋**(내장 스펙), **인트로스펙션**(Pyodide에서 실제 시그니처 추출),
**AI 생성**(`/api/ai-abstract`) 세 경로로 만들어진다. 구 동적 엔진
(`src/utils/libraryAbstraction.js`)이 이 자산(프리셋·AI 엔드포인트·인트로스펙션)을 이미
갖고 있으나, 폐기된 `Blockly.Python` 제너레이터 경로 + XML 툴박스를 쓰므로 IR 엔진에서는
**작동하지 않는다**(동적 블록을 드래그하면 `blocklyToIr`가 throw). Phase 5는 이를 IR
파이프라인에 다시 꽂는다.

## 2. 목표 · 비목표

**목표**
- 라이브러리 함수당 **단일 호출 블록**(Tier-A)을 프리셋/인트로스펙션/AI로 등록.
- Tier-A 블록 → Python이 **정확히 동일한 라이브러리 호출**로 lower(왕복 무손실).
- 생성된 블록 팔레트(레지스트리)를 **localStorage로 세션 간 영속화**.
- 등록 시 **라운드트립 오라클**로 검증 — 통과 못 하면 등록 거부(Tier-B로 강등).
- 핵심 변환기(`blocklyToIr`) 변경은 **단일 fallback 훅 한 곳**.

**비목표**
- **매크로/다중문장 블록**(한 블록이 N개 문장으로 펼쳐짐) — 후속 슬라이스로 분리.
  "블록 1개 = 문장 1개" 불변식을 깨고 splice 메커니즘이 필요하므로 MVP 제외.
- **Python → Tier-A 역매칭**(영구 비목표). Python `cv2.imread(x)`는 항상 Tier-B 중첩
  블록으로 렌더된다. Tier-A는 **단방향 오서링 전용**. `irToBlockly`는 손대지 않는다.
- 등록 후 arg 이름/시그니처 인라인 편집(재생성으로 대체).
- AI 응답의 매크로형 블록 실제 등록(MVP는 skip + 로그).

## 3. 핵심 통찰 — Tier-A 블록은 Call IR의 "스킨"

Tier-A 블록은 새 IR 노드 타입이 **아니다**. 메타데이터(`{module, func, argNames}`)를 들고
있다가 lower 시 **Tier-B와 동일한 `Call` IR**로 펼쳐진다:

```
블록  lib_cv2_imread (ARG0 입력)
 └─ lower → Call(
              func = Attribute(value=Name(id='cv2'), attr='imread'),
              args = [ <ARG0를 blockToExpr한 결과> ],
              keywords = [])
```

이 IR은 사용자가 Tier-B 블록으로 손수 만든 `cv2.imread(x)`의 IR과 **글자 그대로 같다**.
따라서:
- **왕복 무손실이 공짜**다 — lower 결과가 이미 검증된 Tier-B 경로를 탄다.
- **역방향 핸들러가 불필요**하다 — Python→블록은 그냥 Tier-B를 낸다(decay, 의도된 동작).
- **강등이 자명**하다 — Tier-A는 Call 위의 얇은 스킨이므로, 스킨을 못 만들면(=오라클
  실패) 사용자는 그대로 Tier-B 블록을 쓰면 된다.

`module`이 비어 있으면(예: 빌트인/from-import된 이름) `func`는 `Name(id=func)`로 lower한다.

## 4. 아키텍처 (유닛)

### 4.1 `src/utils/libRegistry.js` (신규 — 단일 진실원본)

동적 블록 레지스트리. 다른 모든 유닛(lower 훅·툴박스·영속화·UI)이 이걸 참조한다.

**spec 형태**
```
{ module: string|'',   // 'cv2', '' (빌트인/직접 이름)
  func: string,        // 'imread'
  argNames: string[],  // ['filename']  (라벨 + ARG<i> 입력 수)
  hasOutput: boolean,  // true=expr 블록, false=문장(bare-call) 블록
  colour: string,      // '#06b6d4'
  title: string }      // 'cv2.imread' (블록 라벨)
```

**API**
- `registerLibBlock(spec) → { ok, type, reason? }`
  - 오라클(§4.3) 통과 시: 블록타입 `lib_<module>_<func>[_stmt]` 산출, `Blockly.Blocks[type]`
    정의(더미 라벨 + `argNames`마다 `appendValueInput('ARG'+i)` + output/statement shape;
    기존 `libraryAbstraction.registerBlock`의 **블록정의 로직만 재사용, 레거시
    `Blockly.Python` 제너레이터는 정의하지 않음**), 인메모리 `Map<type, spec>`에 저장.
  - 실패 시 `{ ok:false, reason }` 반환, 등록 안 함(강등).
  - 이미 등록된 타입은 idempotent(덮어쓰기 또는 no-op + 플래그).
- `getLibSpec(type) → spec | undefined` — `blocklyToIr` fallback이 사용.
- `listLibBlocks() → [{ module, blocks:[{type, title, hasOutput, ...}] }]` — 모듈별 그룹.
- `removeLibBlock(type)` / `removeLibrary(module)` — 레지스트리 + (재)영속화.
- `persist()` — 전체 spec 배열을 localStorage에 저장.
- `hydrate()` — localStorage에서 읽어 **각 spec을 재등록**(리로드 후 `Blockly.Blocks`
  정의 복원). 손상 데이터는 catch→리셋.
- `clearAll()` — 디버그/테스트용.

`window.BlockPyLibRegistry`로 노출(`main.jsx` side-effect import). Node에서도
`module.exports`(테스트용). Blockly 미존재 환경(순수 node 테스트)에서는 블록정의 단계만
가드하고 Map/오라클/spec 로직은 동작하도록 분리.

### 4.2 IR lower 훅 (`src/utils/blocklyToIr.js` — 한 곳)

`blockToExpr`와 `blockToStmt`가 **정적 핸들러 미스 시 throw 직전**에 fallback:

```js
function lowerLibBlock(b) {                         // 신규 헬퍼
  const reg = (typeof window !== 'undefined' ? window : global).BlockPyLibRegistry;
  const spec = reg && reg.getLibSpec(b.type);
  if (!spec) return null;                            // 진짜 미지 타입 → 호출자가 throw
  const args = spec.argNames.map((_, i) => blockToExpr(b.inputs['ARG' + i].block));
  const func = spec.module
    ? { type: 'Attribute', value: { type: 'Name', id: spec.module }, attr: spec.func }
    : { type: 'Name', id: spec.func };
  return { type: 'Call', func, args, keywords: [] };
}
```

세 진입점이 lib 블록을 일관되게 처리한다(어떤 식별 경로로 들어오든 결과는 같다):

- **`blockToExpr(b)`** (lib 블록이 다른 표현식의 입력일 때, 예 ARG/VALUE 슬롯):
  `const lib = lowerLibBlock(b); if (lib) return lib;` 후 기존 throw. → **bare `Call`** 반환.
- **`blockToStmt(b)`** (lib 블록이 본문 안 문장 위치일 때 — 보통 문장형 hasOutput=false,
  예 `cv2.imshow(...)`): lib 블록이면 `lowerLibBlock`으로 Call을 얻어 `{type:'Expr', value:
  <Call>}`로 감싼다. 주석은 기존 `readBlockComments(b)`로 부착(레지스트리와 무관하게 동작).
- **`topToStmt(b)`** (lib 블록이 top-level 단독일 때 — 출력형/문장형 **둘 다**): 정적
  `BLOCK_TO_STMT`/`BLOCK_TO_EXPR` 미스 시 레지스트리를 확인해 lib 블록이면 `lowerLibBlock`
  → `{type:'Expr', value: <Call>}`로 감싸고 `readBlockComments`로 주석 부착. (출력형 lib
  블록을 한 줄에 그냥 놓은 경우 `cv2.imread('x')` 같은 bare 표현식 문장이 된다.)

요약: **표현식 위치 → bare `Call`, 문장 위치(blockToStmt/topToStmt) → `Expr(Call)`.**

- **`irToBlockly.js`는 변경 없음**(단방향).

기존 `CONTEXT_ONLY_BLOCKS` skip, `normInputs`, 주석 부착 로직은 그대로 유지.

### 4.3 라운드트립 오라클 (등록 시 검증)

값비싼 생성/배치 전에 spec이 유효한 호출로 떨어지는지 1회 확인. 2단계:

1. **정적 검사(동기, Pyodide 불필요)**: `module`(있다면)·`func`가 유효 Python 식별자,
   `argNames`가 전부 유효 식별자이고 중복 없음. 위반 시 즉시 거부.
2. **파싱 검사(Pyodide 1회, 선택적·비동기)**: `module.func(a0, a1, …)` 문자열을
   `pythonToIR`로 파싱 → 단일 `Expr(Call)`이고 `func`/arity가 일치하는지 확인. 프리셋은
   known-good이므로 정적 검사만으로 통과(파싱 검사 skip 가능); AI/인트로스펙션 산출
   spec은 파싱 검사까지.

오라클은 `libRegistry`에 두되 Pyodide 의존부는 주입(테스트에서 mock 가능). 거부 사유는
호출자에게 반환되어 LibraryManager가 "강등됨" 사유로 표시.

> 설계 메모: 구 `libraryAbstraction.validateMacroTemplate`/`planSynthesis`의 오라클 정신을
> 이어받되, 매크로 템플릿이 아니라 **단일 호출 shape**에 맞춘 경량 버전이다.

### 4.4 툴박스 (`src/utils/irToolbox.js` + `BlocklyEditor.jsx` + `App.jsx`)

- `buildIrToolbox()`가 기존 16개 카테고리 끝에 **"Library" 카테고리**를 선택적으로 추가
  (레지스트리 `listLibBlocks()`에서 생성; 모듈별 그룹; 필수 value 입력엔 shadow 기본값을
  넣어 드래그 즉시 valid Python). 레지스트리가 비면 카테고리 생략.
- `rebuildToolbox(ws)` = `ws.updateToolbox(buildIrToolbox())`. 레지스트리 변경 후 호출.
- `App.jsx`의 **inert 동적-라이브러리 effect 부활**: 죽은 `getElementById('toolbox')` XML
  경로 대신, `installedBlocks` 변경 시 `workspaceRef.current.updateToolbox(buildIrToolbox())`
  호출. Blockly는 JSON `categoryToolbox`를 받아 diff·재렌더.
- `BlocklyEditor`는 inject 시 이미 `window.BlockPyIrToolbox` 사용 — 변경 최소.

### 4.5 파이프라인 (`App.jsx` + `LibraryManager.jsx` — 기존 UI 재배선)

LibraryManager UI(프리셋 드롭다운, 커스텀 코드, "Generate with AI", pip install, 등록블록
리스트)는 이미 존재. `App.jsx`의 `onAbstract(libName, customCode, purpose)`를 재배선:

- **프리셋**: `BlockPyAbstraction.AI_PRESETS[lib]` → 각 블록 `registerLibBlock`.
- **인트로스펙션**: `engine.introspectModule(lib, pyodide)` → facts.functions → 각각 호출
  spec으로 `registerLibBlock`(라이브러리 import 가능해야 함 — 필요시 micropip 안내).
- **AI**: `POST /api/ai-abstract {libName, facts, purpose}` → blocks → 각각
  `registerLibBlock`(매크로형 응답은 skip + 로그).
- 등록 후: `persist()` + `rebuildToolbox()` + `installedBlocks` state 갱신.
- 키 없음(503): 서버는 facts/purpose 없으면 프리셋 폴백 반환 → UI는 503 시 프리셋
  경로로 폴백하고 토스트.

### 4.6 영속화 (localStorage)

- 키 `blockpy.libRegistry.v1` → spec 배열(버전드 키로 forward-compat).
- `persist()`는 변경 후, `hydrate()`는 앱 init 시(툴박스 빌드 **전**) 호출.
- 손상 시 catch→리셋→로그.

## 5. 데이터 흐름

- **등록**: UI → `onAbstract` → (프리셋/인트로/AI) → spec[] → 오라클 → `registerLibBlock`
  (`Blockly.Blocks` 정의 + Map) → `persist` → `rebuildToolbox`.
- **오서링**: lib 블록 드래그 → 블록→코드 리스너 → `blocklyToIr`(정적 미스 →
  `lowerLibBlock` → Call IR) → `irToPython` → Python 텍스트. ✅ Tier-B와 동일.
- **리로드**: `hydrate()` → 전부 재등록 → `rebuildToolbox` → 팔레트 복원.
- **decay**: Python 편집/Convert → `pythonToIR` → `irToBlockly` → Tier-B 중첩 블록
  (의도된 단방향 동작).

## 6. 에러 처리

- spec 없는 진짜 미지 타입 → throw(기존 동작 유지).
- 오라클 실패 → 등록 거부, LibraryManager에 사유 표시(강등).
- AI 503/500 → 프리셋 폴백 + 토스트.
- localStorage 손상 → catch, 레지스트리 리셋, 로그.
- 워크스페이스 내 lib 블록의 ARG 입력 비었음(사용자가 shadow 삭제) → `blockToExpr`가
  해당 ARG에서 throw → 기존 동작(regen 일시정지, 채우면 복구)과 일치.

## 7. 테스트 (Playwright, `PORT=3100`)

- **node(서버 불필요)**: 레지스트리 register/persist/hydrate 라운드트립; `lowerLibBlock`이
  module-func / bare-func 양쪽에 올바른 Call IR 생성; 오라클이 invalid spec(`func='2bad'`,
  중복 argName) 거부.
- **browser**: 등록된 lib 블록 드래그 → Python 출력이 정확히 `cv2.imread('x')`;
  왕복(lib 블록 → Python → Convert → Tier-B 블록 → Python) 안정; 리로드 영속(localStorage
  생존, 팔레트 재구축); 문장형 lib 블록(`imshow`) → bare-call Expr; lib 블록 위 주석 생존;
  오라클 거부된 bogus spec은 팔레트에 없음.

## 8. 슬라이스 (구현 순서)

1. `libRegistry.js`(register/define/Map/persist/hydrate) + 오라클 + node 테스트.
2. `blocklyToIr` lower 훅(`lowerLibBlock` in `blockToExpr`/`blockToStmt`/`topToStmt`) +
   node 테스트.
3. 툴박스: Library 카테고리 + `rebuildToolbox` + `BlocklyEditor`/`App` 배선(inert effect
   부활) + browser 테스트.
4. 파이프라인: 프리셋 + 인트로스펙션 + AI(`/api/ai-abstract`) in `App`/`LibraryManager` +
   503 폴백 + browser 테스트.
5. 영속화 e2e browser 테스트 + Codex 게이트.

각 슬라이스: Claude 구현(TDD) → Codex 적대 리뷰(`scripts/codex-review-prompt.md`) →
blocking 0 → 커밋. 확립된 워크플로우와 동일.

## 9. 불변식 (Codex 게이트가 점검)

1. **왕복 무손실**: lib 블록 → Python → 블록에서 의미 보존(Tier-A는 Tier-B로 decay 허용,
   호출 의미는 동일).
2. **단일 IR 정합성**: `lowerLibBlock`이 내는 Call IR이 `ir_call`/`ir_attribute`가 내는 것과
   동일 스키마(field 이름 일치).
3. **Tier-A 승격 불변식**: lib 블록은 **정확히 동일한 호출**로 lower되거나, 아니면 등록
   거부(Tier-B 강등). 부정확한 lower는 BLOCKING.
4. **raw=0 불변**: Phase 5는 새 노드를 추가하지 않음(Call 재사용) — PENDING 0 유지.
5. **주석 보존**: lib 블록도 `readBlockComments`로 주석 왕복(Phase 3 불변식 유지).
