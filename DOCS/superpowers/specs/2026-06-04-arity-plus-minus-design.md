# 설계: MakeCode식 +/- 인자 버튼 (2026-06-04)

## 배경 / 문제

가변 인자 블록(`print(a,b,...)`, `func(...)`, `obj.method(...)`, 리스트/튜플/셋/딕트 리터럴)은
이미 `itemCount_` + `saveExtraState`/`loadExtraState` 인프라로 칸 수를 직렬화하지만,
**사용자가 블록에서 직접 칸을 추가/제거할 UI가 없다**(itemCount_는 Python→블록 변환 시에만 설정).
MakeCode/Scratch3처럼 블록에 인라인 `⊖`/`⊕` 버튼을 달아 칸을 늘리고 줄이게 한다.
(참조: image copy 6 — `리스트에 0 1 ⊖ ⊕ 저장`.)

## 목표

값-입력 가변 인자 블록에 인라인 +/- 버튼 추가. 클릭으로 칸 추가/제거, 기존 자식 블록 연결
보존, 직렬화·코드생성 자동 반영.

비목표: `method_def`의 PARAMS(텍스트 필드형) — 별도 작업. 블록 시각 테마(Scratch3/zelos
렌더러) 전환 — 별도 서브프로젝트.

## 대상 블록

| 블록 | 입력 네이밍 | 종류 | min |
|---|---|---|---|
| `print_multi` | ARG0..n | statement | 1 |
| `func_call` | ARG0..n | expression | 0 |
| `func_call_stmt` | ARG0..n | statement | 0 |
| `method_call` | ARG0..n | expression | 0 |
| `tuple_create` | ADD0..n | expression | 0 |
| `set_create` | ADD0..n | expression | 0 |
| `dict_create` | KEY0/VAL0..n | expression | 0 |
| `lists_create_with` (Blockly 빌트인) | ADD0..n | expression | 0 |

전부 `itemCount_` + 직렬화 보유. 마지막 입력이 더미(TAIL/CLOSE/close)라 버튼을 거기 붙인다.
`lists_create_with`는 빌트인이라 `updateShape_`를 래핑(빌트인 mutator의 itemCount_/ADDn 스킴 동일).

## 접근법 (채택: A — 재사용 래퍼)

**A. `enableArity(blockDef, min)` 래퍼.** 기존 `updateShape_`를 감싸 호출 후 버튼만 덧붙임.
각 블록 updateShape_ 본문 무수정. 블록당 1줄 호출.

기각:
- **B. 블록별 개별 +/- 코드** — 중복·불일치.
- **C. Blockly 네이티브 기어 mutator만 사용** — MakeCode 룩 아님, 사용자가 원한 인라인 +/- 아님.

## 상세 설계

### 1. `enableArity(def, min)` (parser.js, 동적 블록 정의들 뒤)

```js
function enableArity(def, min) {
  const orig = def.updateShape_;
  def.arityMin_ = min;
  def.updateShape_ = function () {
    orig.call(this);
    appendArityButtons(this);
  };
  def.changeArity_ = function (delta) {
    const next = (this.itemCount_ || 0) + delta;
    if (next < (this.arityMin_ || 0)) return;
    const group = (Blockly.Events && Blockly.Events.getGroup()) || false;
    if (Blockly.Events) Blockly.Events.setGroup(true);
    // 1. 자식 연결 스냅샷(입력 이름 기준)
    const saved = {};
    for (const input of this.inputList) {
      if (input.connection && input.connection.targetConnection) {
        saved[input.name] = input.connection.targetConnection;
      }
    }
    // 2. itemCount_ 변경 + 재빌드
    this.itemCount_ = next;
    this.updateShape_();
    // 3. 같은 이름 입력에 연결 복원(제거된 슬롯의 자식은 분리됨)
    for (const name in saved) {
      const input = this.getInput(name);
      if (input && input.connection && !input.connection.targetConnection) {
        try { input.connection.connect(saved[name]); } catch (e) {}
      }
    }
    if (this.rendered) this.render();
    if (Blockly.Events) Blockly.Events.setGroup(group);
  };
}
```

정의 직후 호출:
```js
enableArity(Blockly.Blocks['print_multi'], 1);
enableArity(Blockly.Blocks['func_call'], 0);
enableArity(Blockly.Blocks['func_call_stmt'], 0);
enableArity(Blockly.Blocks['method_call'], 0);
enableArity(Blockly.Blocks['tuple_create'], 0);
enableArity(Blockly.Blocks['set_create'], 0);
enableArity(Blockly.Blocks['dict_create'], 0);
enableArity(Blockly.Blocks['lists_create_with'], 0);
```
(`lists_create_with`는 Blockly 코어 로드 이후 시점에 호출 — 파일 최하단 블록 정의 영역에서
실행되므로 `Blockly.Blocks['lists_create_with']`가 이미 존재. 미존재 시 가드.)

### 2. `appendArityButtons(block)`

```js
const MINUS_SVG = 'data:image/svg+xml;base64,...';  // 흰 원 + 회색 −, 18x18
const PLUS_SVG  = 'data:image/svg+xml;base64,...';  // 흰 원 + 회색 +, 18x18

function appendArityButtons(block) {
  if (!block.inputList || block.inputList.length === 0) return;
  const last = block.inputList[block.inputList.length - 1];
  const min = block.arityMin_ || 0;
  if ((block.itemCount_ || 0) > min && Blockly.FieldImage) {
    last.appendField(new Blockly.FieldImage(MINUS_SVG, 18, 18, '-', function () {
      const b = this.getSourceBlock && this.getSourceBlock();
      if (b) b.changeArity_(-1);
    }), 'MINUS');
  }
  if (Blockly.FieldImage) {
    last.appendField(new Blockly.FieldImage(PLUS_SVG, 18, 18, '+', function () {
      const b = this.getSourceBlock && this.getSourceBlock();
      if (b) b.changeArity_(1);
    }), 'PLUS');
  }
}
```
- 매 `updateShape_`마다 입력이 재생성되므로 버튼도 새로 붙어 중복 없음.
- ⊖는 `itemCount_ > min`일 때만 추가(최소치에선 숨김).
- SVG는 18x18 인라인 data-URI(흰 배경 원 + 굵은 −/+). MakeCode 룩.

### 3. 직렬화 / 코드생성

`itemCount_`는 기존 `saveExtraState`/`loadExtraState`로 저장·복원, Python 생성기가 루프 →
**추가 작업 없음**. +/- 변경이 워크스페이스 change 이벤트를 발생시켜 블록→코드 동기화가 자동
재생성. 직렬화 시 FieldImage(MINUS/PLUS)는 값이 없는 장식 필드라 라운드트립에 영향 없음.

### 4. 엣지 케이스

| 케이스 | 처리 |
|---|---|
| min에서 ⊖ | 버튼 미표시(`appendArityButtons` 가드) + `changeArity_`도 min 미만 무시(이중 안전) |
| ⊖로 자식 있는 슬롯 제거 | 자식은 워크스페이스로 분리(bumped) — MakeCode 동일 |
| 로드 시 updateShape_ | 연결 아직 없음 → 버튼만 붙고 무해 |
| `Blockly.FieldImage` 부재(이론상) | 가드로 버튼 미추가, 블록은 정상 |
| `lists_create_with` 빌트인 미존재 | 가드(`if (Blockly.Blocks['lists_create_with'])`) |

### 5. 테스트 (tests/arity_buttons.spec.js)

버튼 onClick은 `changeArity_`만 호출 → 픽셀 클릭 대신 **`block.changeArity_(±1)` 직접 호출**로
검증(견고). 브라우저(Playwright)에서 워크스페이스에 블록을 직렬화 로드 후:

1. **칸 증가**: `func_call` itemCount 1 → `changeArity_(1)` → ARG1 입력 존재 + 생성 Python 인자 2개.
2. **칸 감소**: itemCount 2 → `changeArity_(-1)` → ARG1 제거 + 인자 1개.
3. **min 가드**: `func_call` itemCount 0에서 `changeArity_(-1)` → 변화 없음(0 유지).
4. **연결 보존**: ARG0에 자식(text 블록) 연결 → `changeArity_(1)` → ARG0 자식 여전히 연결.
5. **직렬화 지속**: `changeArity_(1)` 후 save→load → itemCount 유지.
6. **print_multi min=1**: itemCount 1에서 `changeArity_(-1)` 무시.

무회귀: 기존 라운드트립 스위트(random/realistic/method_def/gallery) — 블록 정의 래핑이
변환·생성기 텍스트에 영향 없음 확인.

## 영향 파일

- `src/utils/parser.js` — `enableArity`/`appendArityButtons` 헬퍼 + SVG 상수 2개 + 블록당
  `enableArity(...)` 호출 8줄. 기존 updateShape_/생성기/parser 변환 무수정.
- `tests/arity_buttons.spec.js` — 신규 회귀.
