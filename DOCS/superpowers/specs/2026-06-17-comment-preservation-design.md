# 주석 보존 (Phase 3) — 설계

**날짜:** 2026-06-17
**브랜치:** `feature/ast-ir-redesign`
**선행:** Phase 0–2 + 노드 worklist 16개(raw=0) + 앱 통합(`651e2be`) + ir_* 툴박스(`97db5d7`)
**상위 결정 출처:** `DOCS/superpowers/specs/2026-06-07-blockpy-ast-ir-redesign-design.md` §6 "옵션 3"

## 1. 배경 · 문제

현재 단일 IR 파이프라인은 **AST 수준(의미)** 왕복만 보장한다: `pythonToIR`(Pyodide
`ast.parse`) → IR JSON → `irToPython`(`ast.unparse`). `ast.unparse`는 주석을 버리므로
Python→블록→Python에서 **주석이 사라진다**. Phase 3는 이를 "옵션 3"으로 해결한다 —
**주석은 보존, 포맷은 표준 스타일로 재생성**(바이트 동일은 목표 아님).

핵심 난점: 주석은 ast 기반 IR에 자기 자리가 없고, 블록은 주석을 기본적으로 표시하지
않는다. 그럼에도 주석이 왕복에서 살아남아야 하고(이번 설계에서는) **블록 뷰에서 보이고
편집 가능**해야 한다.

## 2. 목표 · 비목표

**목표**
- 독립줄(leading) 주석과 인라인(trailing) 주석을 **둘 다** 보존.
- 주석을 해당 블록에 **네이티브 코멘트 말풍선**으로 부착 → 블록 뷰에서 읽기/편집.
- Python(주석 포함) → 블록 → Python 왕복에서 주석 유지(편집 안 한 경로는 충실 왕복).
- **의존성 0**: 외부 패키지(parso) 없이 stdlib만 사용.

**비목표**
- 바이트 단위 포맷 보존(빈 줄·정렬·따옴표 스타일은 `ast.unparse` 재생성 허용).
- 빈 줄 보존, 주석만 있는 줄의 위치 정밀 보존.
- docstring 처리(이미 `ast`의 `Expr/Constant`로 표현됨 — 주석이 아님, 범위 외).
- 편집된 주석의 인라인 위치 정밀도(아래 §5 참조 — 의도된 양보).

## 3. 실현가능성 검증 (완료)

설계 확정 전 핵심 메커니즘을 **실제 타겟 런타임**에서 검증했다(live Pyodide):

- **런타임**: Python `3.12.1`.
- **추출**: stdlib `tokenize.generate_tokens`가 `COMMENT` 토큰을 위치(`start=(row,col)`)와
  함께 산출 → 같은 줄 코드 유무로 독립줄/인라인 분류. **parso 불필요** (스펙이 플래그한
  Pyodide 호환 리스크 제거).
- **재주입**: `ast._Unparser`가 3.12에 존재(`hasattr(ast, '_Unparser') == True`). 서브클래스가
  문장 노드 방문 시 leading은 `self.fill('# ...')`(현재 들여쓰기에 맞춰 윗줄), trailing은
  `self.write('  # ...')`로 재주입. 5개 주석(모듈 헤더/import 인라인/함수 본문 leading/
  본문 인라인/호출 인라인)이 **들여쓰기까지 정확히** 제자리에 재생성됨(유일한 차이는 빈
  줄 소실 — 옵션 3 허용).

검증 스크립트는 `tmp/`(gitignored) 스크래치였고 커밋에 포함하지 않는다.

## 4. 아키텍처

### 4.1 IR 스키마 확장
문장(`ast.stmt`) IR 노드에 **선택적** 필드 추가:

```
_comments: { leading: string[], trailing: string|null, after: string[] }
```

- `leading`: 그 문장 위 독립줄 주석들(원문 순서, `# ` 포함 원문 텍스트).
- `trailing`: 그 문장과 같은 줄의 인라인 주석(단일).
- `after`: 그 문장 **뒤** 같은 스코프에 후속 문장이 없을 때 매달린(dangling) 독립줄 주석들
  (본문/파일 끝 주석). 결정적 귀속을 위한 필드(§6).
- 필드가 없거나 비면 주석 없음 — 기존 노드와 하위호환(없으면 무시).
- 표현식 노드에는 붙이지 않는다(문장 단위 귀속).

### 4.2 Python → IR (`pyAstBridge.js`, `pythonToIR` 경로)
1. 기존 `ast.parse` → IR (변경 없음, `_loc=[lineno,col]`는 이미 존재).
2. **추가**: `tokenize`로 `src`에서 주석 목록 수집 `[{line, col, text, standalone}]`.
3. **연관**(Python 측에서 수행, 줄번호 기반, 결정적):
   - 인라인(같은 줄에 코드 있음) → 같은 줄 문장의 `trailing`.
   - 독립줄 → **같은 들여쓰기 스코프**에서 줄번호가 큰 첫 후속 문장의 `leading`에 append.
   - 후속 문장이 없으면(본문/파일 끝 dangling) → 같은 스코프의 직전 문장 `after`에 append.
     이로써 모든 주석이 정확히 한 문장에 귀속(손실 0).
4. `_comments`를 해당 IR 노드에 부착해 직렬화.

추출+연관은 `PY_AST_TO_JSON`에 합쳐 한 번의 `runPython`에서 처리(왕복 race·중복 init 회피).

### 4.3 IR → Blockly (`irToBlockly.js`)
문장 블록 생성 시 `_comments`가 있으면:
- **네이티브 말풍선**: 사람이 읽는 텍스트(leading 줄들 + 있으면 인라인 표시)를
  `block.setCommentText(...)` 로 설정 → 블록 뷰에서 보이고 편집 가능.
- **구조적 보관**: `block.data = JSON.stringify(_comments)` (Blockly가 `"data"`로 직렬화하는
  per-block 불투명 문자열) → 출력의 **진실 원본**(leading/trailing 구분 유지).

### 4.4 Blockly → IR (`blocklyToIr.js`)
문장 블록 변환 시:
- `block.data`(직렬화 스냅샷의 `data` 키)에서 `_comments` 복원 → IR 노드에 부착.
- **편집 감지**: 블록의 현재 말풍선 텍스트가 `data`의 `_comments`를 렌더링한 결과와 다르면
  사용자가 편집한 것으로 간주 → 말풍선 텍스트(줄 단위)를 `leading`으로 채택하고 `trailing`/
  `after`는 비움(§5).
- 기존 `normInputs`/deep-clone 규칙(ir_toolbox 설계)과 동일하게 입력 스냅샷 비변형 유지.

### 4.5 IR → Python (`pyAstBridge.js`, `irToPython` 경로)
- `_from_ir`가 ast 노드 재구성 시 `_comments`를 노드 속성(`_leading`, `_trailing`, `_after`)으로 stash.
- `ast.unparse` 대신 **`_CommentUnparser(ast._Unparser)`** 사용: `traverse(node)`에서 `node`가
  `ast.stmt`면 방문 전 `_leading`을 `fill()`로, 방문 후 `_trailing`을 `write('  '+...)`로,
  이어 `_after`를 `fill()`로(직전 문장 뒤 독립줄) 출력.

## 5. 편집 모델 (옵션 3 철학)
- **편집 안 한 경로**: `block.data` 기반으로 leading+inline 완전 충실 왕복.
- **말풍선 편집 시**: 편집된 텍스트를 그 블록의 `leading` 주석으로 단순화(저장된 `trailing`은
  비움). 편집된 주석의 인라인 위치 정밀도는 양보 — "포맷 재생성 허용"(옵션 3)과 일관.
- 블록 삭제 = 말풍선·`data` 동반 삭제(네이티브 동작) → 주석도 자연히 사라짐.

## 6. 엣지 케이스
- 빈 줄, 코드 없는 줄 위치 → 비보존(포맷 재생성).
- 파일 끝/본문 끝 dangling 독립줄 주석 → §4.2 규칙대로 직전 문장 `after`로 결정적 귀속
  (손실 없음). 슬라이스 ④에서 중첩 본문 경계 코퍼스로 회귀 고정.
- 파싱 불가 텍스트 → 기존대로 에러 상태 + 마지막 정상 블록 유지(주석 로직 진입 안 함).
- 재진입 가드(`isSyncingFromCodeRef`) 및 스냅샷 복구 경로 유지 — 스냅샷은 블록 `data`를
  포함하므로 복구 시 주석도 함께 복원.
- `block.data`가 이미 다른 용도로 쓰이는 블록이 있는지 확인(현재 ir_* 블록은 미사용 가정 —
  구현 1번째 슬라이스에서 grep 확인).

## 7. 테스트 전략
- **node** (`tests/`): tokenize 추출+분류 단위; 연관 규칙(독립줄→다음 문장, 인라인→같은 줄);
  `_CommentUnparser` 재주입(들여쓰기·중첩 본문 포함); `block.data` 왕복 라운드.
- **browser** (`PORT=3100`): 주석 포함 Python 코퍼스 → 블록 → Python 주석 보존 property
  (주석 멀티셋 + 위치류 보존); 말풍선 표시/편집 후 재생성 확인.
- 기존 59+ IR 테스트 무회귀(`_comments` 없는 노드는 영향 없음).

## 8. 슬라이스 (writing-plans에서 상세화)
1. **추출 + 연관 + 재주입** (`pyAstBridge.js` 텍스트 왕복, 블록 미경유): Python→IR이
   `_comments` 부착, IR→Python이 `_CommentUnparser`로 재주입. node 단위 테스트.
2. **블록 왕복** (`irToBlockly`/`blocklyToIr`): 네이티브 말풍선 + `block.data` 보관·복원.
   browser 라운드트립.
3. **편집 동기화**: 말풍선 편집 → leading 반영(§5).
4. **엣지 + 코퍼스**: dangling/중첩/엣지 케이스 확정 + 회귀 코퍼스.

각 슬라이스: TDD(실패 테스트 먼저) → Claude→Codex 적대 리뷰 루프 → Codex blocking 0 → 커밋.

## 9. 리스크
- `ast._Unparser`는 비공개 API. 단 타겟이 핀고정 Pyodide 3.12이고(검증 완료), 프로젝트가
  이미 3.12 ast 내부(`_fields`, ExceptHandler.type 등)에 의존하므로 일관된 위험 수위.
- 주석↔문장 연관의 모호성(중첩 본문 경계, dangling) → 코퍼스로 고정, 애매하면 보수적으로
  가장 가까운 문장에 귀속(주석 손실보다 위치 약간 어긋남을 선호).

## 10. 범위 밖
Phase 4 디슈가-as-feature, Phase 5 동적/AI 라이브러리 블록, 빈 줄/포맷 바이트 보존,
docstring 변환.
