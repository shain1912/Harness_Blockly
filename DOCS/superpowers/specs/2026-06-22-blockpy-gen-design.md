# blockpy-gen — Python library → Blockly blocks (standalone package)

**날짜:** 2026-06-22
**상태:** 설계 (브레인스토밍 승인 — 사용자 결정 반영)
**관계:** BlockPy 앱에서 검증된 IR/라이브러리 블록 패턴을 **추출·일반화**한 독립 패키지. 앱 자체는 변경 안 함.

## 1. 목적

파이썬 모듈 이름 하나를 넣으면 그 라이브러리 API에 대한 **Blockly 블록 정의 + 툴박스 + 블록당 Python 코드 생성기**를 만들어 준다. 손수 블록을 짜지 않고도 임의의 Python SDK를 위한 블록코딩 플랫폼을 세울 수 있게 한다. **Pyodide·AI·IR 불필요.**

## 2. 사용자 결정 (브레인스토밍)

- **배포 형태:** 독립 npm 패키지(`blockpy-gen/`, 이 레포 안의 자체 `package.json`, 추후 publish). 앱은 미마이그레이션.
- **언어/타입:** 검증된 JS 유지(ESM) + JSDoc→생성 `.d.ts`. TS 재작성 안 함.
- **입력:** **모듈 이름 → Node에서 실제 Python(`inspect`) introspection** → JSON spec → 순수 블록 생성기. **Pyodide 안 씀.**
- **(a) 코드 생성 포함:** 드래그한 블록이 실행 가능한 `mod.func(...)` / `recv.method(...)` Python을 낸다.
- **(b) 클래스·메서드 포함:** 모듈 함수 + 클래스(생성자) + 인스턴스 메서드 전부. **메서드는 리시버 입력 모델**(Phase A 교훈).

## 3. 비목표 (YAGNI)

Pyodide, IR/desugar, 일반 Python↔블록 변환, 역변환(Python→블록), AI 추상화. 전부 범위 밖. 오직 **라이브러리 → 블록(+코드생성)**.

## 4. 아키텍처 — 런타임으로 나뉜 두 티어

```
blockpy-gen/
  package.json         exports: "./introspect" (Node 전용), "./blocks" (브라우저 안전), "." -> blocks
  src/
    spec.js            LibrarySpec 스키마 상수 + 검증(validateSpec) — 순수
    introspect/
      introspect.js    introspectModule(name, opts) -> LibrarySpec  (Node: child_process로 python)
      _inspect.py      임베드되는 introspection 스크립트(파이썬 stdlib inspect)
    blocks/
      define.js        defineBlocks(Blockly, spec, opts) -> {types[]}  (순수, Blockly 주입)
      toolbox.js       buildToolbox(spec, opts) -> categoryToolbox JSON  (순수)
      codegen.js       블록당 Python 생성기 등록(define.js가 사용)  (순수)
      naming.js        blockType(spec, entry) 결정적·충돌안전 이름  (순수)
  bin/blockpy-gen.js   CLI: blockpy-gen <module> [--out f] [--python p] [--max N] [--include-private]
  test/
```

- **introspect 티어(Node, Python 필요):** `child_process.spawn(python, ['-c', _INSPECT])`로 모듈을 import + `inspect`로 API 추출 → JSON. 이 티어만 Python에 의존하며 **빌드/CLI 타임**에만 돈다.
- **blocks 티어(순수, 브라우저 안전):** spec JSON을 받아 Blockly 블록 정의·툴박스·코드생성기 생성. **소비자가 Blockly 인스턴스 주입**(전역 `window.Blockly` 가정 안 함). Python 의존 0.

## 5. LibrarySpec — 두 티어 사이의 JSON 계약

```jsonc
{
  "module": "PIL.Image",                // import 경로(점 포함 가능)
  "version": "12.2.0",                  // 선택(introspection이 채움)
  "entries": [
    { "kind": "function", "name": "open", "qualName": "PIL.Image.open",
      "params": [{ "name": "fp", "kind": "positional", "hasDefault": false },
                 { "name": "mode", "kind": "keyword", "hasDefault": true }],
      "doc": "Opens and identifies the given image file.", "returns": true },
    { "kind": "class", "name": "Image", "qualName": "PIL.Image.Image",
      "params": [ /* __init__ 매개변수 */ ], "doc": "...", "returns": true },
    { "kind": "method", "owner": "Image", "name": "save", "qualName": "PIL.Image.Image.save",
      "params": [{ "name": "fp", "kind": "positional", "hasDefault": false },
                 { "name": "format", "kind": "keyword", "hasDefault": true }],
      "doc": "Saves this image under the given filename.", "returns": false }
  ]
}
```

- `kind`: `function` | `class`(생성자) | `method`(인스턴스).
- `params`: `inspect.signature` 기반. `kind`=`positional|keyword|vararg|kwarg`. `self`/`cls` 제외.
- `returns`: 값 반환 여부 → 블록 output vs statement 결정(휴리스틱: function/class=true, method는 반환주석/관례로 추정, 불확실하면 true).
- **메서드는 `self`를 params에 넣지 않는다** — 리시버는 별도 입력(§7). (Phase A에서 self를 인자로 섞어 깨진 걸 정면 차단.)

`validateSpec(spec)`는 순수 검증(식별자 유효성·중복·kind 유효성). blocks 티어 진입 시 호출.

## 6. introspect 티어

`introspectModule(name, { python='python', maxEntries=200, includePrivate=false }) -> LibrarySpec`
- `spawn`으로 `_inspect.py` 실행, stdin/argv로 모듈명 전달, stdout으로 JSON.
- 추출: 모듈의 public 함수 + 클래스(+`__init__` 매개변수) + 각 클래스의 public 메서드. private(`_`)·non-callable 제외. `inspect.signature` 실패하는 멤버는 **건너뛰고 경고**(부분 실패 허용).
- 상한 `maxEntries`(거대한 API 폭주 방지) — 초과 시 자른 개수를 로그.
- 에러: python 없음/모듈 import 실패 → 명확한 에러 throw(메시지에 원인).
- **CLI** `bin/blockpy-gen.js`: `blockpy-gen PIL.Image --out pil.blocks.json` → spec를 파일/stdout으로.

## 7. blocks 티어 (순수)

`defineBlocks(Blockly, spec, { colour } ) -> { types: string[] }` — 각 entry마다:
- **function** `mod.func`: 값입력 = params(필수는 항상, 선택은 비우면 생략). output(returns) 또는 statement.
  - 코드: `module.func(<args>)`. 선택 인자가 비면 호출에서 생략 → Python 기본값 적용. keyword-only 인자는 `name=<expr>`.
- **class** `mod.Class`(생성자): function과 동일, 코드 `module.Class(<args>)`, output=true(인스턴스).
- **method** `recv.method` — **리시버 모델(핵심, Phase A 교훈):**
  - 입력: 맨 앞 **RECEIVER 값입력**(객체) + params(self 제외) 값입력.
  - 코드: `<receiver>.method(<args>)`. 리시버는 사용자가 꽂는 객체(예: `Image.open(...)` 결과). **self를 인자로 섞지 않음.**
- 블록 타입명: `naming.blockType` = `lib_<sanitize(module)>_<name>[_m|_c]`(결정적·충돌안전). 충돌 시 거부(앱 libRegistry의 비-injective 교훈 반영).
- 코드 생성기는 `Blockly.Python.forBlock[type]`(주입된 Blockly의 Python 생성기 사용). 소비자가 `Blockly.Python` 로드 책임.

`buildToolbox(spec, opts) -> categoryToolbox JSON` — 모듈 함수 카테고리 + 클래스별 카테고리(생성자 + 메서드). `ws.updateToolbox(...)`에 바로 사용.

## 8. 데이터 흐름

```
빌드:   blockpy-gen PIL.Image --out pil.blocks.json        (python subprocess, 1회)
런타임: import { defineBlocks, buildToolbox } from 'blockpy-gen/blocks'
        defineBlocks(Blockly, spec); ws.updateToolbox(buildToolbox(spec))
        -> 사용자가 블록 드래그 -> Blockly.Python.workspaceToCode(ws) -> 라이브러리 쓰는 Python
```

## 9. 패키징·타입

`package.json`: `"type":"module"`, `exports` 맵으로 `./introspect`(Node), `./blocks`(브라우저 안전, child_process 미import), `.`→blocks. JSDoc → `tsc --allowJs --declaration --emitDeclarationOnly`로 `dist/**.d.ts`. 추후 `npm publish`.

## 10. 테스트

- **introspect(Node, 실제 python):** 작은 픽스처 모듈(test/fixtures/sample.py: 함수 1 + 클래스 1 + 메서드 1) → spec 단언. 표준 라이브러리(textwrap 등)도 스모크.
- **blocks(순수, 가짜/실제 Blockly 주입):** spec → defineBlocks → 블록 정의(입력 개수·output/stmt) 단언 + 코드 생성기 출력 단언:
  - function → `mod.func(a, b)`
  - class → `mod.Class(a)`
  - **method → `recv.method(a)`**(리시버 입력 분리, self 미혼입) — Phase A 회귀 가드.
  - 선택 인자 생략, keyword-only `name=expr`.
- **toolbox:** 모든 등록 블록이 정확히 한 카테고리에 들어가는지.

## 11. 에러 처리

- introspect: python-not-found / import 실패 / 시그니처 추출 실패(멤버 skip+경고) / maxEntries 초과(로그). 전체 throw는 치명적 입력에서만.
- blocks: 잘못된 spec → `validateSpec`가 명확한 에러. 중복 타입 → 거부+경고. `Blockly.Python` 부재 → 경고(정의는 됨).

## 12. 불변식

1. **순수/Pyodide분리:** `./blocks`는 child_process·python·pyodide 0 import(브라우저 번들 가능). `./introspect`만 Node.
2. **메서드 정확성:** 메서드 코드는 `recv.method(args)` — self 미혼입, 리시버는 별도 입력(Phase A 버그 영구 차단).
3. **결정적 이름·충돌안전:** 같은 spec → 같은 블록 타입; 충돌은 silent 오매핑 대신 거부.
4. **앱 비침습:** BlockPy 앱 코드 변경 0(독립 패키지).
