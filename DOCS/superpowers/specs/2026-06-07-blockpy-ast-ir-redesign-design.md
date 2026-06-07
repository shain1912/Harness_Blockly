# BlockPy 코어 재설계 — CPython AST 기반 IR + 전수 블록화

- 작성일: 2026-06-07
- 상태: 설계(승인 대기)
- 범위: BlockPy 코어(파서·실행·블록화)의 재설계. robot 도메인은 본 문서 범위 밖(후속 재활용 대상).

---

## 1. 중심 주장 (Thesis)

> 기본 Python 문법은 CPython AST 기반 IR로 완전 블록화하여 raw fallback을 제거하고,
> 라이브러리 호출은 AI-assisted abstraction을 통해 **검증된** semantic block으로 승격한다.
> 미승격 호출도 raw가 아니라 일반 call/attribute/subscript 문법 블록으로 표현한다.

이 주장은 두 개의 독립된 축으로 분해되며, 각각의 강도가 다르다.

| 축 | 내용 | 집합 | 주장 강도 |
|---|---|---|---|
| 문법(syntax) 커버리지 | ast 노드를 빠짐없이 블록으로 | 닫힘(유한) | **증명 가능** — raw=0 |
| 의미(semantic) 커버리지 | 호출의 도메인 의미 이해·추상화 | 열림(무한) | best-effort |

- **증명(provable):** 타겟 버전(아래)의 유효한 모든 Python에 대해 문법적 전수성 — raw 블록 0개.

### 1.1 타겟 문법 버전 고정 (전수성의 닫힌 집합)

raw=0은 **막연한 "모든 Python"이 아니라 타겟 런타임의 ast 문법 전체**에 대해 성립한다.

- 타겟 런타임: **Pyodide 0.26.4 → CPython 3.12**.
- 따라서 닫힌 집합 = **CPython 3.12 `ast` 문법**. 이 안의 모든 stmt/expr/helper/pattern 노드는 **예외 없이** 블록(DB/SUGAR/HELPER)을 가진다. 빠지는 노드 = ∅.
- 3.12에 포함되므로 **반드시 커버**: match(3.10), TryStar(3.11), TypeAlias·type_param(3.12), NamedExpr/walrus(3.8).
- 3.12에 **없으므로 범위 밖**: t-string(TemplateStr/Interpolation, 3.14). 이는 "보류한 구멍"이 아니라 언어 버전 밖이다. Pyodide의 `ast.parse`가 SyntaxError로 거부 → §6의 "파싱 불가 = 에러 상태"로 처리(raw 아님). Pyodide가 3.14로 올라가면 자동으로 닫힌 집합에 편입되어 DB 확정 대상이 된다.

**커버리지 ≠ 구현 우선순위.** 어떤 노드를 *나중에 구현*하는 것과 *커버리지에서 빼는* 것은 다르다.
희귀 노드(match, f-string 내부 등)는 빌드 순서상 뒤로 미룰 수 있으나 **커버리지에서는 확정**이며, raw로 떨어지지 않는다.
- **best-effort:** 알려진/학습가능한 API를 AI가 도메인 블록으로 승격.
- **비주장(non-claim):** "임의의 미지 라이브러리도 항상 완벽한 의미 블록"은 주장하지 않는다.
  미승격 시 일반 문법 블록으로 우아하게 강등(graceful degradation)된다.

---

## 2. 동기 — 기존 설계의 흉터

기존 시스템이 "기능을 덧대서" 막으려던 문제들이 곧 재설계가 해결해야 할 목록이다.

| 기존 반창고 | 막으려던 문제 | 재설계 처리 |
|---|---|---|
| 손수 짠 파서(`parser.js` ~6,800줄) | Python 문법 재구현 | **폐기** → CPython `ast` 사용 |
| `/api/ai-normalize` | 파서가 임의 Python 못 받음 | 불필요(ast가 전부 받음) |
| gray/`raw_statement` 블록 | 100% 변환 불가 | **제거** → 3계층 + 전수 체크리스트 |
| 스냅샷 복구 해킹 | 재파싱 시 레이아웃 드리프트 | 단일 IR로 대부분 해소 |
| 필드 이름 짝맞춤 규율 | 양방향 두 경로 불일치 | 단일 IR로 구조적 해소 |
| 두 실행 엔진(Run/Step) 분기 | 동작 불일치 | Step/Pause(`interpreter.js`) **삭제** |

요점: 기존 raw 블록은 "불가능"이 아니라 **손수 파서의 열린 커버리지를 메우던 게으른 지름길**이었다.
CPython `ast`는 문법이 닫혀 있어 그 전제가 사라진다.

---

## 3. 확정된 설계 결정

1. **B안 — CPython `ast` 기반 단일 IR.** Pyodide의 `ast.parse()`로 공식 AST를 얻어 JSON IR로 직렬화.
   손수 짠 토크나이저/파서 폐기.
2. **단일 IR.** "ast 노드 타입 + 이름붙은 필드" ↔ "블록 타입 + 이름붙은 입력"의 기계적 1:1 대응.
   양방향(블록↔Python)이 이 한 스키마의 투영이 되어 round-trip이 구조적으로 보장된다.
3. **raw=0 — 전수 블록화.** 닫힌 ast 노드 집합을 전부 열거하고 각 노드에 표현 정책을 부여(§5).
   "처리 못 한 노드 = ∅" → raw fallback 제거.
4. **3계층 라이브러리 표현(§4).** 의미블록(AI 승격) → 문법블록(바닥) → raw(제거).
5. **주석 보존 = "옵션 3".** 주석은 보존하되 포맷은 깔끔하게 재생성 허용.
   parso(CST)로 주석 회수 → 블록 코멘트로 부착, 블록→Python은 `ast.unparse` + 주석 재주입.
6. **SUGAR 공존 = 일급 기능.** 컴프리헨션·삼항·체인비교는 전용 블록 **그리고** 디슈가를 모두 제공.
   교육·연구 목적의 의도된 공존(토글에 숨기지 않고 명시적 lower 동작으로 노출).
7. **동적 블록 엔진 이식.** 인트로스펙션 + `registerBlock`(기존 `libraryAbstraction.js`)을 단일 IR 위로 이식.
8. **파싱 불가 텍스트.** raw가 아니라 **에러 상태**로 처리(마지막 정상 블록 유지).

---

## 4. 라이브러리 호출 3계층 모델

```
robot.move(10)

  Tier A  의미 블록     🤖 [앞으로 이동] (10)            ← AI 추상화 + 인트로스펙션 (열림, best-effort)
            ▲ 승격(round-trip 검증 통과 시에만)
  Tier B  문법 블록     call( attr(robot,"move"), [10] )  ← 닫힌 체크리스트가 보장하는 바닥
  Tier C  raw 문자열    "robot.move(10)"                  ← 제거됨. 불필요
```

- **Tier B가 항상 깔린 바닥.** AI 실패/오프라인이어도 미지 호출은 일반 call/attribute 블록으로 표현된다(raw 아님).
- **Tier A는 보너스 승격.** API를 알면 도메인 블록으로 올린다.
- **승격 불변식:** AI 의미 블록은 반드시 동일 호출로 lower-back 되어야 한다.
  기존 `validateMacroTemplate`(round-trip 오라클)을 유지하여, round-trip을 깨지 않는 승격만 허용. 실패 시 Tier B로 강등.

---

## 5. AST 노드 전수 정책표 (raw=0 증명 체크리스트)

근거: Python 3.14 `ast` 덤프 기준(concrete 노드 110, 의미 있는 표현 대상 ~60).

정책 분류:
- **DB** = 전용 블록(의미를 가진 진짜 블록)
- **SUGAR** = 전용 블록 + 디슈가 패스 둘 다(연구·교육 목적, 의도적 공존)
- **FIELD** = 블록 아님 — 부모 블록의 드롭다운/필드
- **HELPER** = 블록 아님 — 부모 블록의 구조적 일부
- **ROOT/SKIP** = 최상위 컨테이너 또는 deprecated/내부 노드
- **LATE** = 커버리지 확정. **구현 우선순위만 뒤로** (raw로 떨어지지 않음, 빌드 순서상 후반)
- **범위 밖** = 타겟 버전(CPython 3.12)에 존재하지 않는 문법 (커버리지 대상 아님, 에러로 처리)

### 문(statement) — 28종
| 노드 | 정책 |
|---|---|
| FunctionDef / AsyncFunctionDef | DB |
| ClassDef | DB |
| Return / Delete / Pass / Break / Continue | DB |
| Assign / AnnAssign | DB |
| AugAssign | DB (연산자 = FIELD) |
| For / AsyncFor / While | DB (else절 포함) |
| If | DB |
| With / AsyncWith | DB (withitem = HELPER) |
| Match | DB (case·패턴 = §패턴) |
| Raise / Assert | DB |
| Try / TryStar | DB (ExceptHandler = HELPER) |
| Import / ImportFrom | DB (alias = HELPER) |
| Global / Nonlocal | DB |
| Expr | 투명 래퍼(내부 식 블록이 문장 자리에) |
| TypeAlias | DB (LATE — 3.12 포함, 드물어 후반 구현) |

### 식(expression) — 29종
| 노드 | 정책 |
|---|---|
| Name / Constant | DB |
| BinOp / UnaryOp / BoolOp | DB (연산자 = FIELD) |
| Compare | DB / 체인은 SUGAR |
| IfExp(삼항) | **SUGAR** |
| ListComp / SetComp / DictComp / GeneratorExp | **SUGAR** |
| Lambda | DB |
| NamedExpr(walrus) | DB |
| Call | DB (keyword/Starred = HELPER) |
| Attribute / Subscript | DB (Slice = HELPER) |
| List / Tuple / Set / Dict | DB |
| Starred | DB |
| Await / Yield / YieldFrom | DB |
| JoinedStr(f-string) | DB (LATE — FormattedValue = HELPER, 가장 까다로움) |
| FormattedValue | HELPER |
| Slice | DB/HELPER |
| TemplateStr / Interpolation | **범위 밖** (3.14 t-string, CPython 3.12 미존재) |

### 보조 노드(HELPER — 부모 블록 일부로 렌더)
`comprehension`, `ExceptHandler`, `arguments`/`arg`, `keyword`, `alias`, `withitem`, `match_case`.

### 패턴(match 전용) — 8종
`MatchValue, MatchSingleton, MatchSequence, MatchMapping, MatchClass, MatchStar, MatchAs, MatchOr` → DB 또는 case 내부 HELPER. **3.12 포함이므로 커버리지 확정(LATE 구현 가능).**

### 블록 아님 — FIELD / SKIP
- **FIELD:** boolop(and/or), operator(+,-,*…), unaryop(not,~,-), cmpop(==,<,in,is…) → 부모 블록 드롭다운.
- **SKIP:** expr_context(Load/Store/Del — 위치로 결정), Suite/AugLoad/AugStore/Param(deprecated),
  Module/Interactive/Expression/FunctionType(루트), TypeIgnore.

**전수성 보장 장치:** 위 표를 단위 데이터로 만들고, "DB/SUGAR/HELPER 대상 ast 노드 전부가 매핑을 가지는가"를
자동 검증하는 커버리지 테스트를 둔다. 이 테스트가 raw=0 회귀를 막는다.

---

## 6. Round-trip 전략 (옵션 3)

- **Python → 블록:** Pyodide `ast.parse()` → IR JSON → 블록. 주석은 parso CST에서 회수해 해당 블록의 코멘트로 부착.
- **블록 → Python:** 블록 → IR → `ast.unparse()`(깔끔한 재포맷) → 블록 코멘트를 주석으로 재주입.
- **보존 강도:** 주석은 보존, 포맷은 표준 스타일로 재생성(옵션 3). 바이트 단위 동일은 목표 아님.
- **파싱 불가 텍스트:** raw 블록 없이 에러 상태로 처리, 마지막 정상 블록 유지.
- **양방향 루프 가드:** 재진입 가드(`isSyncingFromCodeRef` 계열) 유지.

---

## 7. 단계별 계획

- **Phase 0 — 철거:** `interpreter.js` 삭제, App.jsx의 Step/Pause·디버그 상태 제거. sprite/cv2는 데모로 유지하되 코어와 분리.
- **Phase 1 — 새 코어 IR:** Pyodide `ast` → IR JSON 브리지, 손수 파서 폐기, 단일 IR 스키마 정의.
- **Phase 2 — 전수 블록 집합:** §5 정책표 구현, ast 문법에서 블록을 기계적으로 생성, 커버리지 테스트.
- **Phase 3 — 주석 보존:** parso 회수 + `ast.unparse` 재주입, 파싱 불가 = 에러 처리.
- **Phase 4 — 디슈가 일급화:** SUGAR 노드의 sugar↔desugared를 명시적 관찰 기능으로.
- **Phase 5 — 동적 블록 엔진 이식:** 인트로스펙션 + `registerBlock` + Tier A/B 승격·강등 로직.
- **Phase 6 — 검증:** 블록→Python→블록 / Python→블록→Python round-trip, 전수 커버리지, 주석 보존 테스트.

---

## 8. 위험 / 비주장

- **의미 추상화는 전수성 주장 아님.** Tier A는 best-effort, 미승격은 Tier B로 강등(설계상 정상).
- **f-string/match 등 long tail은 구현 노가다.** 비용 높음 → **구현은 LATE(후반)이지만 커버리지는 확정**(raw 아님). t-string은 타겟 3.12 범위 밖이라 대상 아님.
- **parso의 Pyodide 호환** 확인 필요(순수 Python이라 가능성 높음). 불가 시 대안 검토.
- **승격 블록의 round-trip 불변식**을 깨면 데이터 손실 → 검증 오라클 필수.

---

## 9. 테스트 전략

- round-trip 속성 테스트(양방향, 예제 코퍼스 + 랜덤 생성).
- ast 노드 전수 커버리지 테스트(raw=0 회귀 방지).
- 주석 보존 테스트(옵션 3 의미: 주석 보존 + 안 건드린 의미 불변).
- SUGAR 공존 테스트(전용 블록 ↔ 디슈가 형태 등가성).
- Tier A↔B 승격/강등 및 승격 불변식 테스트.

---

## 10. 구현 워크플로우 — Claude ↔ Codex 적대적 루프

구현은 **Claude(구현) ↔ Codex(적대적 리뷰)** 루프로 진행한다.

- **구동:** `/loop` 반자동(self-paced). 한 틱 = 노드 패밀리 1개 슬라이스.
- **리뷰어:** Codex CLI 0.137.0 (`codex exec review`), 인증 완료. Claude가 세션 Bash에서 직접 호출.
- **고정 리뷰 지침:** `scripts/codex-review-prompt.md` (spec 불변식 7종 주입).

### 한 틱의 절차
1. worklist에서 다음 슬라이스를 꺼낸다(빌드 순서: 흔한 노드 → 희귀 노드).
2. **TDD로 구현 + 자가검증.** 테스트·round-trip을 통과시키기 전에는 Codex로 넘기지 않는다.
3. **Codex 리뷰:** `codex exec review --uncommitted "$(cat scripts/codex-review-prompt.md)"`.
4. **피드백 수령(receiving-code-review 규율):** 각 지적을 기술적으로 검증 — 타당하면 수정, 부당하면 근거로 기각, 이견이 크면 사용자에게 에스컬레이션. 맹목적 동의 금지.
5. **게이트:** Codex blocking 0 → 커밋 → 포인터 전진. worklist 소진 시 종료.

### 역할 분담
| 주체 | 역할 |
|---|---|
| Claude | 구현, 자가검증(TDD·round-trip), 피드백 검증·반영 |
| Codex | 적대적 리뷰 — spec 위반·raw=0 구멍·round-trip 손실·IR 불일치 적발 |
| 사용자 | 이견 충돌 시 최종 결정, 슬라이스 완료 확인 |

### 전제
- 본 spec 커밋 완료.
- `writing-plans`가 **노드 패밀리 빌드 순서 worklist + 슬라이스별 완료기준(DoD)** 을 산출. `/loop`는 이 worklist를 소비한다.
- raw=0 커버리지 테스트와 round-trip 테스트가 토대(Codex 판단의 근거)이므로 이른 Phase에 구축.
