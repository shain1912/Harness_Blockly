# 설계: `method_def` 연결형 함수/메서드 정의 블록 (2026-06-04)

## 배경 / 문제

회색 블록 감사 결과(`DOCS/superpowers/2026-06-04-random-test-report.md`) 남은 45개 raw 블록 중
가장 큰 부류가 **중첩 def / 클래스 메서드 18개**다.

근본 원인: `procedures_defnoreturn` / `procedures_defreturn`은 Blockly **hat 블록**으로
previous/next 연결이 없다. 따라서 `class_def`의 `BODY` statement 스택이나 다른 함수 본문
안에 꽂을 수 없다(`MissingConnection` 로드 실패). 그래서 현재는 메서드/중첩 def를 통짜
`raw_statement`(회색)로 덤프한다.

- `convertClassBodyToBlock` (parser.js:3267) — FunctionDef → `raw_statement`
- `convertStatementListToBlock` (parser.js:3294) — 중첩 FunctionDef/ClassDef → `raw_statement`

## 목표

중첩/클래스 메서드 def를 **진짜 연결형 블록**으로 변환해 회색 18 → 0. 텍스트 라운드트립은
바이트 동일하게 유지(회귀 0).

비목표: top-level 일반 함수 def(그대로 `procedures_def*` 유지), `async def`(파서 미지원,
범위 외), 파라미터를 개별 sub-블록으로 모델링(큰 작업, 미채택).

## 접근법 (채택: A)

**A. 새 연결형 `method_def` 블록 + 중첩 def 라우팅 수정.** 블록 1개 + 라우팅 변경으로
임의 깊이 중첩(함수 속 함수, 클래스 속 메서드)을 모두 해결. 파라미터는 평평한 텍스트 필드.

기각:
- **B. `procedures_*` 뮤테이터 재사용 + non-hat 변종** — 뮤테이터 기계 대량, 기존 테스트
  위험, 이득 미미.
- **C. desugar로 클래스/메서드 평탄화** — 의미 파괴·비무손실. 거부.

> desugar는 이 부류에 불필요하다. desugar는 후속 라운드(lambda → 명명 def, comprehension
> iterable)에서 사용한다. "새 블록 + desugar"는 회색 블록 캠페인 전체 전략이며 이번 건은
> 새 블록 쪽이다.

## 상세 설계

### 1. 새 블록 `method_def` (parser.js, `class_def` 블록 근처)

```
type: "method_def"
fields:
  DECORATORS  (Blockly.FieldMultilineInput || FieldTextInput, 기본 "" → 비면 미표시)
  NAME        (FieldTextInput, 예: "__init__")
  PARAMS      (FieldTextInput, 예: "self, name, x=5")   // 평평한 텍스트, 무손실
inputs:
  BODY        (appendStatementInput, setCheck(null))
connections:
  setPreviousStatement(true, null)
  setNextStatement(true, null)                          // 핵심: 스택에 꽂힘
colour: "#8b5cf6" 계열(class_def와 동일/근접)
```

헤더 표시: `def [NAME] ( [PARAMS] ) :`, 그 아래 `do [BODY]`. DECORATORS 비어있지 않으면
헤더 위 줄에 표시.

### 2. 생성기 `Blockly.Python['method_def']`

```
const deco = (block.getFieldValue('DECORATORS') || '').trim();
const decoLines = deco ? deco.split('\n').map(d => d.trim()).join('\n') + '\n' : '';
const name = block.getFieldValue('NAME');
const params = block.getFieldValue('PARAMS') || '';
const body = Blockly.Python.statementToCode(block, 'BODY') || '    pass\n';
return `${decoLines}def ${name}(${params}):\n${body}`;
```

`Blockly.Python.forBlock['method_def']` 별칭 등록(cv2_* 패턴).
들여쓰기는 Blockly `statementToCode`가 처리(생성기는 4-space). 부모 컨텍스트(클래스/함수)에서
재귀적으로 다시 들여쓰기됨 — 기존 class_def 생성기와 동일 메커니즘.

### 3. 파서 라우팅 (Python → Block, astToBlockly)

공통 헬퍼 신설:
```
function functionDefToMethodBlock(stmt) {
  const block = {
    type: "method_def",
    id: makeBlockId(),
    fields: {
      NAME: stmt.name,
      PARAMS: (stmt.params || []).join(', ')
    },
    inputs: {}
  };
  if (stmt.decorators && stmt.decorators.length) {
    block.fields.DECORATORS = stmt.decorators.map(d => '@' + astToPython(d)).join('\n');
  }
  const bodyBlock = convertStatementListToBlock(stmt.body);
  if (bodyBlock) block.inputs.BODY = { block: bodyBlock };
  return block;
}
```

- `convertClassBodyToBlock`: FunctionDef → `functionDefToMethodBlock(stmt)` (raw_statement 폐기).
  非-FunctionDef는 그대로 `convertStatementToBlock`.
- `convertStatementListToBlock`: 중첩 FunctionDef → `functionDefToMethodBlock(stmt)`,
  중첩 ClassDef → 정식 `astToBlockly` ClassDef 경로(`class_def`, 이미 연결 가능).
  나머지 분기는 변경 없음.

`stmt.params`는 이미 문자열 배열(`"self"`, `"x=5"`, `"*args"`, `"n: int"`,
`"min_detection_confidence=0.5"`)이므로 join만으로 무손실.

### 4. 라운드트립 보장

- Block→Python 텍스트가 기존 `raw_statement`(=`astToPython(stmt)`)와 바이트 동일 →
  `tests/random_roundtrip.spec.js`(주석 무시 텍스트 비교) 무회귀.
- 편집 경로(Block→Text→Block)도 PARAMS 텍스트를 파서가 재파싱하므로 안전.

### 5. 엣지 케이스

| 케이스 | 처리 |
|---|---|
| 빈 본문 / `pass`만 | BODY 비면 생성기가 `    pass` 보강 |
| `async def` | 파서 미지원 → 기존 raw 유지(범위 외) |
| 데코레이터(`@property`, `@staticmethod`, `@app.route(...)`) | DECORATORS 필드로 보존 |
| top-level 일반 def | 그대로 `procedures_def*`(블래스트 반경 최소화) |
| 메서드 본문의 또 중첩된 def | `convertStatementListToBlock` 재귀로 또 `method_def` |

### 6. 테스트

- 기존 73 spec 무회귀(`npm test` 또는 해당 spec 그룹).
- 신규 검증: Dog 클래스(`__init__`/`bark`) + mediapipe Hands류 케이스에서 메서드가
  `raw_statement`가 아닌 `method_def`로 변환되고, 회색 블록 카운트가 줄어드는지.
- 회색 블록 18(중첩 def/메서드분) → 0 목표. 좌측 "회색 블록 (N)" 탭으로 육안 확인.

## 영향 파일

- `src/utils/parser.js` — 블록 정의·생성기 추가, `convertClassBodyToBlock` /
  `convertStatementListToBlock` 라우팅 수정, `functionDefToMethodBlock` 헬퍼.
- `tests/` — 신규 회귀 스펙(클래스 메서드 method_def 변환 + 회색 카운트).
- `index.html` 툴박스 — `method_def`는 중첩 전용이라 토박스 노출 불필요(검토).
