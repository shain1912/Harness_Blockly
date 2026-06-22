# blockpy-gen 사용설명서

파이썬 라이브러리를 [Blockly](https://developers.google.com/blockly) 블록으로 바꿔주는 도구입니다.
모듈 이름만 넣으면 실제 설치된 라이브러리를 **introspect(검사)** 해서 블록 정의 · 툴박스 ·
파이썬 코드 생성기를 만들어 줍니다. **Pyodide도 AI도 쓰지 않고**, 런타임 의존성도 없습니다.

> 영어 개발자용 문서는 [`README.md`](./README.md)를 보세요. 이 문서는 한국어 사용 안내입니다.

---

## 1. 무엇을 해주나

`import cv2` 같은 모듈 이름을 주면:

| 산출물 | 설명 |
|---|---|
| **LibrarySpec (JSON)** | 라이브러리 API를 읽은 결과 — 함수/클래스/메서드, 파라미터, 기본값, 반환 여부 |
| **블록 정의** | 엔트리마다 Blockly 블록 1개 |
| **툴박스 (JSON)** | 카테고리형 툴박스 (함수 카테고리 + 클래스별 카테고리) |
| **코드 생성기** | 함수→`모듈.함수(인자)`, 클래스→`모듈.클래스(인자)`, 메서드→`객체.메서드(인자)` |

핵심: **드롭인.** 라이브러리를 넣으면 블록이 나옵니다.

---

## 2. 설치 / 준비

```bash
# 패키지 (이 저장소에서는 blockpy-gen/ 안에 이미 있음)
npm install blockpy-gen
# 브라우저에서 블록을 그리려면 Blockly가 필요 (peer dependency)
npm install blockly
```

- **파이썬이 PATH에 있어야 합니다.** introspection이 실제 `python`을 실행해 라이브러리를 읽습니다.
- **블록화할 라이브러리가 그 파이썬에 설치돼 있어야 합니다.** (`pip install <패키지>`)

이 저장소 안에서는 설치 없이 바로 쓸 수 있습니다:

```bash
cd blockpy-gen
node bin/blockpy-gen.js <모듈명>
```

---

## 3. 가장 빠른 사용법 — 스킬 한 줄

이 저장소에는 전 과정을 돌리고 **생성된 파이썬이 진짜 유효한지 검증까지** 하는 스킬이 있습니다.

```bash
node .claude/skills/blockify-python-library/scripts/blockify.mjs <모듈...> [--out 디렉토리] [--python 파이썬] [--max 개수]
```

예:

```bash
node .claude/skills/blockify-python-library/scripts/blockify.mjs PIL.Image
node .claude/skills/blockify-python-library/scripts/blockify.mjs numpy requests cv2 --out tmp/lib
```

출력 예시:

```
[PIL.Image] OK
  entries=126  blocks=126  categories=20
  codegen-ok=126/126  syntax-valid=126/126
  wrote PIL.Image.spec.json + PIL.Image.toolbox.json -> tmp/blockify
    e.g. PIL.Image.open(x, 1)
    ...
```

`OK` 이고 두 비율이 모두 `N/N` 이면 정상입니다. 문제가 있으면 `ISSUES`와 함께 깨진 코드 조각을
출력합니다 (그건 코드 생성기 버그이니 `blockpy-gen/src/blocks/codegen.js`를 고쳐야 합니다).

---

## 4. 3가지 진입점

### (A) 라이브 `/blockify` 엔드포인트 — 권장 (실시간 "라이브러리 추가")

앱 옆에 작은 서버를 띄워두고, 브라우저가 필요할 때 스펙을 가져갑니다.

```bash
# 서버 실행 (allowlist로 허용 모듈 지정)
npx blockpy-gen serve --port 7799 --allow PIL.Image,numpy
```

```js
// 브라우저
import { defineBlocks, buildToolbox } from 'blockpy-gen/blocks';
import * as Blockly from 'blockly';
import 'blockly/python';

const spec = await (await fetch('/blockify?module=PIL.Image')).json();
defineBlocks(Blockly, spec);
workspace.updateToolbox(buildToolbox(spec));
```

이미 있는 Express/`node:http` 서버에 미들웨어로 붙일 수도 있습니다:

```js
import { blockifyMiddleware } from 'blockpy-gen/server';
app.use(blockifyMiddleware({ allow: ['PIL.Image'], python: 'python3' }));
```

캐시가 내장돼 있고(`?refresh=1`로 우회), 없는 모듈은 400/403/500으로 응답합니다.

### (B) Node 한 번 호출

```js
import { blockify } from 'blockpy-gen/blockify';
import * as Blockly from 'blockly';

const { spec, types, toolbox } = await blockify(Blockly, 'PIL.Image', { workspace });
// 블록 + 생성기가 Blockly에 등록되고, 툴박스가 워크스페이스에 적용됨
```

### (C) CLI

```bash
blockpy-gen PIL.Image --out pil.blocks.json   # 스펙을 파일로 저장
blockpy-gen numpy --max 50                     # 처음 50개만 JSON으로 출력
blockpy-gen serve --port 7799 --allow numpy    # /blockify 엔드포인트 실행
```

---

## 5. 꼭 알아야 할 두 가지 규칙

### 메서드 = 리시버 모델
메서드 블록은 `객체.메서드(인자)` 형태이고, **객체(리시버)는 별도 `RECV` 입력**입니다.
`모듈.메서드(객체, 인자)`처럼 인자 목록에 섞이지 않습니다. introspection이 `self`/`cls`를
제거하므로, `Counter.bump(by=1)` 블록은 입력이 `RECV`(카운터) + `ARG0`(`by`)이고
`c.bump(5)`를 생성합니다.

### 반환 여부 휴리스틱 (한계 포함)
값 블록(출력 있음)인지 문장 블록인지는 **반환 타입 어노테이션**으로 결정합니다:
- `-> None` → 문장 블록
- 그 외 / 어노테이션 없음 → 값 블록 (반환한다고 가정)

**한계:** 어노테이션만 봅니다. 어노테이션 없이 아무것도 반환하지 않는 함수도 값 블록으로
나오고, callable처럼 노출된 속성도 호출 블록으로 나옵니다. 필요하면 생성된 스펙을 손으로
다듬으세요.

---

## 6. ⚠️ 보안 — introspection은 코드를 실행합니다

모듈을 introspect 하면 그 모듈을 **import** 하고, 이는 모듈의 top-level 코드를 **실행**합니다.
즉 `/blockify`는 코드 실행과 같습니다.

- **항상 `allow` 목록으로 신뢰하는 모듈만 허용하세요.** allowlist가 없으면 서버는 요청받은
  어떤 모듈이든 import 하고 경고를 출력합니다 — 완전히 신뢰하는 로컬 네트워크에서만 허용됩니다.
- 신뢰할 수 없는 클라이언트에게 엔드포인트를 노출하지 마세요.
- 공개 인터넷이 아니라 로컬/사내망 + 자체 인증 뒤에서 돌리세요.

---

## 7. 블록 타입 이름 규칙

타입 이름은 충돌 없이 결정적입니다 (`blockType(module, entry)`):

- 함수 → `lib_<모듈>__<이름>`
- 클래스 → `lib_<모듈>__<이름>__new`
- 메서드 → `lib_<모듈>__<소유클래스>__<이름>__m`

모듈명의 식별자 아닌 문자는 `_`로 합쳐집니다 (`PIL.Image` → `PIL_Image`).

---

## 8. 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| `No module named 'X'` | 그 파이썬에 라이브러리 미설치 → `pip install X`, 또는 `--python`으로 올바른 인터프리터 지정 |
| `ERR_UNSUPPORTED_ESM_URL_SCHEME` (Windows) | 절대경로 동적 import는 `file://` URL 필요 — 스킬 스크립트는 이미 처리됨 |
| `syntax-valid`가 `N/N` 미만 | 코드 생성기 버그 → `blockpy-gen/src/blocks/codegen.js` 수정 + 유닛 테스트 추가 |
| entries가 너무 적음 (예: scipy=2) | 네임스페이스 패키지 — top-level에 함수가 거의 없고 서브모듈 위주. 서브모듈을 직접 지정(`scipy.stats`) |
| 타입 이름 충돌 | 거의 없음. 발생 시 `blockType` 규칙 확인 |

---

## 9. 테스트 / 검증

```bash
cd blockpy-gen
node --test                                  # 포터블 유닛 스위트 (31개, 서드파티 불필요)
node scripts/stress-libraries.mjs            # 실 라이브러리 31개 전수 파이프라인 (라이브러리 설치 필요)
node scripts/stress-syntax.mjs               # 생성 파이썬을 ast.parse로 문법 검증
```

실측: 라이브러리 31개 / 엔트리 4078개 → 블록 4078개, codegen 0 에러, 샘플 코드 문법 100% 유효.
