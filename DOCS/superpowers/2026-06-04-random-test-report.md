# 랜덤 파이썬 테스트 검증 보고서 (2026-06-04)

BlockPy의 Python ↔ Blockly 무손실 변환과 실행 정확성을 4개 페르소나 × 24개 랜덤 스니펫으로 검증한 결과입니다. 각 스니펫은 (1) 파싱/무손실 변환(convert)과 (2) 백엔드 실행(execute) 두 축으로 평가되었습니다.

## 1. 요약 통계

| 지표 | 값 | 비율 |
|---|---|---|
| 전체 스니펫 수 | 24 | 100% |
| 파싱 성공 (parses=true) | 15 / 24 | 62.5% |
| 무손실 변환 (roundTrip=true) | 15 / 24 | 62.5% |
| rawLump 있는 스니펫 (rawLumps>0) | 10 / 24 | 41.7% |
| 실행 성공 (ran=true) | 24 / 24 | 100% |
| 정답 출력 (correct=true) | 24 / 24 | 100% |

핵심 관찰:
- **실행 엔진(Pyodide)은 100% 정확** — 모든 스니펫이 exit 0, 기대 출력과 정확히 일치. 파이썬 자체 실행에는 결함이 없습니다.
- **변환(parser.js) 품질이 병목** — 9개(37.5%)가 아예 파싱 실패, 추가로 10개가 통짜(raw) 변환 발생.
- roundTrip은 파싱이 성공한 모든 케이스에서 true입니다. 즉 raw 블록이 원문 텍스트를 보존하므로 텍스트 복원은 무손실이나, 블록 구조화 품질(편집성/시각화)은 떨어집니다.
- 파싱 실패의 압도적 원인은 **멀티라인 삼중따옴표 문자열(docstring)**과 **고급 for-언패킹/인접 문자열 연결**입니다.

## 2. 페르소나별 요약

| 페르소나 | 개수 | parses | roundTrip | rawLumps>0 | ran | correct |
|---|---|---|---|---|---|---|
| 초보 파이썬 학생 | 4 | 4/4 | 4/4 | 0/4 | 4/4 | 4/4 |
| 데이터 분석가 | 4 | 2/4 | 2/4 | 2/4 | 4/4 | 4/4 |
| 알고리즘 덕후 | 4 | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 |
| 문자열 처리 개발자 | 4 | 1/4 | 1/4 | 1/4 | 4/4 | 4/4 |
| 수학/과학 계산 | 4 | 4/4 | 4/4 | 3/4 | 4/4 | 4/4 |
| OpenCV 엔지니어 | 4 | 0/4 | 0/4 | 0/4* | 4/4 | 4/4 |

\* OpenCV의 rawLumps=0은 "깨끗함"이 아니라 파싱 실패로 측정 불가(변환 미수행)를 의미합니다.

페르소나별 특징:
- **초보 학생**: 완벽. 모든 구문이 1급 블록으로 매핑(리스트, for/while, if-elif-else, len/round/range, 다중 인자 print). 회귀 테스트 기준선으로 적합.
- **데이터 분석가**: 절반 파싱 실패(중첩 튜플 언패킹, 인접 문자열 연결). 통과한 것도 `statistics.X`/Counter/docstring이 통짜.
- **알고리즘 덕후**: 전부 파싱 성공이나 4/4 모두 rawLump 발생(docstring, 슬라이스, 클래스/메서드 정의, comprehension iterable).
- **문자열 처리 개발자**: 3/4 파싱 실패 — 전부 멀티라인 삼중따옴표 문자열이 첫 차단점.
- **수학/과학**: 파싱은 전부 성공이나 `math.*` 모듈 함수 호출이 대량 통짜(math_0은 8개).
- **OpenCV**: 4/4 전부 파싱 실패 — 모두 파일 최상단 모듈 docstring에서 막힘.

## 3. 전체 스니펫 표

| id | persona | parses | roundTrip | rawLumps | ran | correct |
|---|---|---|---|---|---|---|
| student_0 | 초보 학생 | ✅ | ✅ | 0 | ✅ | ✅ |
| student_1 | 초보 학생 | ✅ | ✅ | 0 | ✅ | ✅ |
| student_2 | 초보 학생 | ✅ | ✅ | 0 | ✅ | ✅ |
| student_3 | 초보 학생 | ✅ | ✅ | 0 | ✅ | ✅ |
| data_0 | 데이터 분석가 | ❌ | ❌ | 0 | ✅ | ✅ |
| data_1 | 데이터 분석가 | ✅ | ✅ | 7 | ✅ | ✅ |
| data_2 | 데이터 분석가 | ✅ | ✅ | 6 | ✅ | ✅ |
| data_3 | 데이터 분석가 | ❌ | ❌ | 0 | ✅ | ✅ |
| algo_0 | 알고리즘 덕후 | ✅ | ✅ | 3 | ✅ | ✅ |
| algo_1 | 알고리즘 덕후 | ✅ | ✅ | 5 | ✅ | ✅ |
| algo_2 | 알고리즘 덕후 | ✅ | ✅ | 1 | ✅ | ✅ |
| algo_3 | 알고리즘 덕후 | ✅ | ✅ | 18 | ✅ | ✅ |
| text_0 | 문자열 처리 | ❌ | ❌ | 0 | ✅ | ✅ |
| text_1 | 문자열 처리 | ❌ | ❌ | 0 | ✅ | ✅ |
| text_2 | 문자열 처리 | ❌ | ❌ | 0 | ✅ | ✅ |
| text_3 | 문자열 처리 | ✅ | ✅ | 5 | ✅ | ✅ |
| math_0 | 수학/과학 | ✅ | ✅ | 8 | ✅ | ✅ |
| math_1 | 수학/과학 | ✅ | ✅ | 0 | ✅ | ✅ |
| math_2 | 수학/과학 | ✅ | ✅ | 1 | ✅ | ✅ |
| math_3 | 수학/과학 | ✅ | ✅ | 5 | ✅ | ✅ |
| cv_0 | OpenCV | ❌ | ❌ | 0 | ✅ | ✅ |
| cv_1 | OpenCV | ❌ | ❌ | 0 | ✅ | ✅ |
| cv_2 | OpenCV | ❌ | ❌ | 0 | ✅ | ✅ |
| cv_3 | OpenCV | ❌ | ❌ | 0 | ✅ | ✅ |

## 4. 실패 분류

### 4.1 파싱 실패 (9개)

| id | 원인 |
|---|---|
| cv_0 | 파일 1~4행 모듈 docstring(멀티라인 `"""..."""`) 후 `import cv2`에서 차단. 에러: `Expected NEWLINE, got "import"`. 삼중따옴표 문자열 statement 뒤 NEWLINE 미생성. |
| cv_1 | 동일 — 최상단 모듈 docstring 후 import에서 `Expected NEWLINE, got "import"`. |
| cv_2 | 동일 — 모듈 docstring 처리 결함. |
| cv_3 | 동일 — 모듈 docstring 처리 결함. |
| text_0 | 2~4행 멀티라인 삼중따옴표 문자열 리터럴(`raw = """..."""`)을 토크나이저가 못 닫음. 이후 6행 `rows`에서 `Expected NEWLINE, got "rows"`. |
| text_1 | 2~3행 멀티라인 삼중따옴표(`text = """..."""`) → 6행 `cleaned`에서 `Expected NEWLINE, got "cleaned"`. |
| text_2 | 2~11행 멀티라인 삼중따옴표(`config = """..."""`) → 13행 `settings`에서 `Expected NEWLINE, got "settings"`. |
| data_0 | line 27 중첩 튜플 for-언패킹 `for rank, (region, revenue) in enumerate(...)`. for-target이 `(` 만나 `Expected IDENTIFIER, got "("`. |
| data_3 | line 35~38 print 내부 **인접 문자열 리터럴 암묵적 연결**(콤마 없이 f-string 2개 나열). 두 번째 STRING에서 `Expected ")", got "..."`. |

근본 원인은 두 부류: **(A) 멀티라인 삼중따옴표 문자열 미지원(7건: cv_0~3, text_0~2)**, **(B) for-target 중첩 튜플 언패킹(data_0) / 인접 문자열 연결(data_3)**.

### 4.2 무손실 실패 (roundTrip=false)

roundTrip=false인 9개는 모두 위 파싱 실패 케이스와 동일합니다(파싱 실패 시 astToBlockly에 도달하지 못해 자동으로 false). **파싱이 성공한 15개는 전부 roundTrip=true** — 변환 로직 자체의 손실은 발견되지 않았습니다. 즉 무손실 실패는 변환 알고리즘의 손실이 아니라 파싱 차단의 부산물입니다.

### 4.3 통짜 변환 (rawLumps>0, 10개) — 어떤 구문이 raw로 빠졌는가

| id | rawLumps | raw로 빠진 구문 |
|---|---|---|
| algo_3 | 18 | 클래스 메서드 def 9개(Stack/Queue의 `__init__`/push/pop/peek/is_empty/enqueue/dequeue), 모듈 docstring 1개, 사용자 객체 메서드 호출 statement 2개(`s.push(v)`, `q.enqueue(v)`), 메서드 호출 expression 6개(`s.pop()`×3, `q.dequeue()`×3). 클래스/메서드 정의 + 사용자 객체 `.method()` 호출 블록 부재. |
| math_0 | 8 | `math.sqrt/hypot/radians/sin/cos/log/log2/log10` 호출 및 `math.e` 멤버 접근. 모듈 속성 함수 호출 전용 블록 없음. |
| data_1 | 7 | 모듈 docstring 1개, `statistics.mean/median/mode/pstdev` 등 모듈 메서드 호출 6개(2개는 슬라이스 `ordered[:n//2]` 포함). |
| data_2 | 6 | 모듈 docstring, `"""...""".lower()`(멀티라인 문자열+메서드), `text.split()`, `counts.most_common(3)`, `counts.items()`, `", ".join(... for ...)`(join+제너레이터+f-string). |
| algo_1 | 5 | 모듈 docstring, `result.extend(left[i:])`/`result.extend(right[j:])`(슬라이스 인자 메서드 호출), `merge_sort(arr[:mid])`/`merge_sort(arr[mid:])`의 슬라이스 표현식. |
| math_3 | 5 | comprehension iterable 5개: `range(cols_b)`, `range(rows_a)`, `range(len(m))`, `range(len(m[0]))`, `range(len(A))`. 중첩 comprehension / sum() 제너레이터 인자의 iterable이 통짜. |
| text_3 | 5 | `title.strip().lower()`(체인 메서드), `ch.isalnum()`, `ch.isspace()`, `"-".join("".join(chars).split())`(중첩 join/split), `account[-4:]`(복합 표현식 내 음수 슬라이스). |
| algo_0 | 3 | 모듈 docstring, comprehension iterable `range(8)`, `range(10)`. |
| math_2 | 1 | `math.sqrt(disc)` 모듈 메서드 호출. |
| algo_2 | 1 | 모듈 docstring 1개(순수 장식적 lump). |

raw lump 발생 패턴 빈도(중복 집계):
- **모듈/docstring 단독 문자열**: algo_0, algo_1, algo_2, algo_3, data_1, data_2 (6건)
- **모듈 속성 함수 호출(`math.*`/`statistics.*`)**: math_0(8), math_2(1), data_1(6) 다수
- **사용자 객체/내장 객체 메서드 호출(`.lower/.split/.most_common/.items/.join/.extend/.pop/.push`)**: data_2, text_3, algo_1, algo_3
- **클래스/메서드 정의**: algo_3 (9건)
- **슬라이스 표현식(`[a:b]`, `[i:]`, `[-4:]`)**: algo_1, text_3
- **comprehension / generator iterable의 `range(...)`**: algo_0, math_3

### 4.4 실행 에러/오답 (ran=false 또는 correct=false)

**없음.** 24개 전부 ran=true, correct=true, exit 0. 파싱에 실패한 9개조차 Pyodide 실행 자체는 기대 출력과 정확히 일치합니다(실행 엔진과 변환 엔진이 독립적이므로). 실행 측면의 회귀는 발견되지 않았습니다.

## 5. 우선순위 수정 계획

영향이 큰 순서(파싱 차단 > 다발 통짜 > 산발 통짜)로 정리합니다.

### P0 — 멀티라인 삼중따옴표 문자열 / docstring 처리 (최우선)
- **문제**: 모듈/함수 최상단 docstring 및 변수에 대입된 멀티라인 `"""..."""` 리터럴이 토크나이저에서 닫히지 못하거나, 닫힌 뒤 NEWLINE을 생성하지 못해 다음 statement(`import`, 식별자)와 충돌. 파싱 자체가 중단됨.
- **추정 원인**: `parser.js`의 Tokenizer가 삼중따옴표를 단일 STRING 토큰으로 줄바꿈 넘어 소비하지 못하거나, bare string expression-statement 직후 NEWLINE 토큰을 emit하지 않음.
- **수정 방향**: (1) Tokenizer에 삼중따옴표(`"""`/`'''`) 멀티라인 문자열 스캐닝 추가 — 종료 따옴표까지 줄바꿈 포함 소비 후 STRING 토큰 + 후속 NEWLINE emit. (2) 모듈/함수 docstring(단독 문자열 expression statement)을 위한 전용 블록(예: `python_docstring`/`text_statement`) 추가하여 raw_statement lump도 동시 제거.
- **영향 스니펫**: cv_0, cv_1, cv_2, cv_3, text_0, text_1, text_2 (파싱 7건 해제) + algo_0/algo_1/algo_2/algo_3/data_1/data_2의 docstring lump 6건 제거. **단일 수정으로 가장 큰 ROI.**

### P1 — 모듈 속성 함수 호출 블록(`math.*`, `statistics.*`)
- **문제**: 점(.) 접근 + 호출(`math.sqrt(...)`, `statistics.mean(...)`, `math.e`)이 전용 블록 없이 raw_expression으로 폴백.
- **추정 원인**: astToBlockly가 Attribute(모듈 멤버) 호출을 구조화 블록으로 매핑하는 핸들러 부재. cv2_*/sprite_* 스타일 동적 블록이 math/statistics에는 없음.
- **수정 방향**: `libraryAbstraction.js`의 `AI_PRESETS`/`registerBlock` 방식으로 math·statistics 모듈 함수용 동적 블록 프리셋 등록(인자 시그니처 포함), 파서가 dotted-name call을 해당 블록으로 매핑. 또는 일반 "모듈 함수 호출" 제네릭 블록 1종 도입.
- **영향 스니펫**: math_0(8), math_2(1), data_1(`statistics.*` 6 중 다수).

### P2 — 객체 메서드 호출 블록 (`.method()`, statement·expression 양쪽)
- **문제**: 사용자 정의 객체 및 내장 객체의 메서드 호출(`.lower/.split/.most_common/.items/.join/.extend/.pop/.push/.strip/.isalnum/.isspace`)이 statement/expression 모두 통짜.
- **추정 원인**: 일반 method-call(수신자 + 메서드명 + 인자) 블록 부재. 내장 리스트 `.append` 등 일부만 특수 처리되고 나머지는 폴백.
- **수정 방향**: 제네릭 "메서드 호출" 블록(RECEIVER + METHOD + ARGS) 1종을 statement/expression 양형으로 추가하고, 파서 Attribute-Call 경로에서 우선 매핑. 자주 쓰이는 str/list/dict 메서드는 별도 전용 블록으로 보강.
- **영향 스니펫**: algo_3(8 메서드 호출), data_2, text_3, algo_1.

### P3 — comprehension/generator iterable의 구조화 (`range(...)` 등)
- **문제**: list/set comprehension 및 `sum(... for ...)` 제너레이터의 `in` 뒤 iterable(`range(8)`, `range(len(A))` 등)이 raw_expression으로 빠짐. 본체(comprehension 자체)는 처리되는데 iterable만 통짜.
- **추정 원인**: astToBlockly의 comprehension 변환 경로가 iterable 부분에서 nested function-call(range 등) 재귀 변환을 누락하고 텍스트 폴백.
- **수정 방향**: comprehension/generator 변환 시 iterable 노드를 일반 expression 변환 경로(range/call 블록 매핑 포함)로 재귀 처리하도록 수정.
- **영향 스니펫**: math_3(5), algo_0(2), data_3(파싱 후 잠재).

### P4 — 슬라이스 표현식 블록 (`[a:b]`, `[i:]`, `[:mid]`, `[-4:]`)
- **문제**: 슬라이스 표현식 전용 블록이 없어 슬라이스 부분이 raw_expression으로, 이를 포함한 메서드 호출문(`.extend(left[i:])`)은 raw_statement로 빠짐.
- **추정 원인**: Subscript 중 Slice 노드(start:stop:step) 대응 블록 미구현. 단순 인덱싱(`arr[k]`)만 지원.
- **수정 방향**: `list_slice`(SEQ + START + STOP + STEP, 음수/생략 허용) 블록 추가 + 파서 Subscript-Slice 매핑.
- **영향 스니펫**: algo_1(슬라이스 4건), text_3(`account[-4:]`).

### P5 — for-target 중첩 튜플 언패킹 / 인접 문자열 연결 (파싱 차단 2건)
- **문제**: `for rank, (region, revenue) in ...`(중첩 튜플 타깃)과 콤마 없는 인접 f-string 암묵적 연결이 파서를 중단시킴.
- **추정 원인**: for-target 튜플 파서가 IDENTIFIER만 허용(괄호 그룹 미허용), 함수 인자/문자열 파서가 implicit string concatenation 미지원.
- **수정 방향**: (1) for-target 파서에 괄호로 묶인 중첩 튜플 타깃 재귀 허용. (2) 토크나이저/파서가 인접 STRING 토큰을 하나로 자동 연결(implicit concatenation) 처리.
- **영향 스니펫**: data_0(중첩 언패킹), data_3(인접 문자열).

---

### 부록: 회귀 기준선
student_0~3, math_1은 rawLumps=0의 완전 무손실 케이스로, 향후 파서 수정 시 회귀 테스트 기준선으로 활용하기에 적합합니다.

---

## 검증 및 수정 결과 (후속, 사람+직접검증)

위 자동 합성 결과를 **직접 재현·검증**한 뒤 수정했습니다. (자동 변환 체크는 Node 환경에서 돌아 `window.__blockpyEngine`이 없었기 때문에, 모듈/메서드 호출이 실제 브라우저에선 동적 블록인데도 raw로 잘못 집계된 **거짓 양성**이 있었음 — 브라우저에서 재검증함.)

### 파싱 실패 9건 → 전부 수정 ✅
근본 원인 3가지였습니다:
1. **멀티라인 문자열/docstring** (cv_0~3, text_0~2, 7건): 멀티라인 문자열이 내부 `\n`으로 `isLineStart`를 true로 남겨, 닫는 `"""` 뒤 줄바꿈의 NEWLINE이 "빈 줄"로 삼켜져 다음 문장과 붙었음. → `_scanString` 끝에서 `isLineStart=false` 리셋.
2. **중첩 튜플 for-타깃** (data_0): `for rank, (region, revenue) in ...` → `parseCompTarget`를 재귀적으로 고쳐 중첩 괄호 튜플 허용.
3. **인접 문자열 리터럴** (data_3): `f"a" f"b"` → 인접 STRING 토큰을 연결.

### 브라우저 변환 크래시 1건 → 수정 ✅
- **algo_3** (`dp = [0] + [INF] * amount`): 리스트 산술이 `math_arithmetic`(Number 입력)에 Array 출력 블록을 연결하려다 `BadConnectionCheck`로 로드 실패 → Parser Error. → 리스트/딕트/셋/튜플/문자열이 섞인 산술은 **untyped `binary_op` 블록**으로 변환.

### raw lump 재검증 (브라우저 기준)
- 모듈 함수 호출(`math.*`, `statistics.*`)·객체 메서드(`.split` 등): 브라우저에선 **동적 `lib_*` 블록**으로 변환됨 (Node 집계는 거짓 양성). 예: math_0은 브라우저에서 rawLumps=**0**.
- 실제 잔존 raw(무손실, 설계상 의도): **docstring**(단독 문자열 문장), **클래스 메서드/중첩 def**(Blockly hat 블록은 중첩 불가 → raw_statement로 무손실 보존), **컴프리헨션의 range()**·**슬라이스**(raw_expression, 무손실).

### 최종 상태
- 24/24 스니펫 **파싱 + 무손실 라운드트립** (주석 제외). 브라우저 변환 크래시 0건.
- 영구 회귀 테스트 추가: `tests/random_roundtrip.spec.js` (24개 페르소나 픽스처, 주석 무시 비교).
- 신규 블록: `func_call`/`func_call_stmt`(전역·내장 함수), `text_concat`(문자열 연결), `binary_op`(타입 혼합 산술), `print_multi`(다중 인자 print).
- 회귀: realistic 33 + gallery AST/실행 + gallery-blocks = **73 spec 통과**, 무회귀.

### 남은(선택) 개선 — 무손실이지만 블록 품질 향상 여지
1. docstring 전용 블록(현재 raw_statement) — 낮은 우선순위.
2. 컴프리헨션 iterable의 `range()`·슬라이스를 raw_expression 대신 전용 블록으로 — 중간.
3. 중첩 함수/클래스 메서드: hat 블록 중첩 제약 → 별도 "중첩 정의" 블록 필요 시 큰 작업.

---

## 회색(raw) 블록 감사 및 수정 (후속 2)

"회색 있으면 우선 보고 이유 찾고 피드백" 지시에 따라, 브라우저(엔진 활성)에서 전체 픽스처를 변환해 **모든 raw 블록을 수집·분류·진단·수정**했습니다.

### 발견 → 진단 → 수정
| 원인 | 진단 | 조치 |
|---|---|---|
| `for ch in "문자열"` **크래시** | controls_forEach의 LIST 입력이 `Array` 타입이라 String 블록 연결 거부 → 로드 실패. 또 단일 VAR 필드라 튜플 타깃 표현 불가. | 무타입 `for_each_custom` 블록(텍스트 타깃 + 무타입 iter)로 교체 |
| 슬라이스 `a[i:j:k]`, `:mid`, `:2` (15+) | subscript의 KEY가 Slice인데 변환 케이스 없음 → raw | `slice_expr` 블록 추가 |
| 키워드 인자 `key=val`, `start=1` (13) | Keyword 노드 변환 케이스 없음 → raw | `keyword_arg` 블록 추가 |
| `*args`/`**kwargs` (2) | Starred/DoubleStarred → raw | `starred_arg`/`double_starred_arg` 블록 |
| 체인 메서드 `a[i].sum()`, `Counter(x).most_common(n)` (9) | 리시버가 단순 이름이 아니라 getCallFullPath가 null → raw | 범용 `method_call` 블록(RECEIVER+METHOD+ARGS) |
| 리스트 산술 `[0]+[x]*n` 크래시 | math_arithmetic의 Number 입력이 Array 거부 | 무타입 `binary_op` 블록 |

### 결과: 회색 블록 100 → 45 (크래시·파싱에러 0)
남은 45개는 **전부 무손실(설계상 의도)** 또는 본질적 한계:
- **docstring 22**: 단독 문자열 문장(사실상 주석). raw_statement로 무손실.
- **중첩 def/클래스 메서드 18**: Blockly의 함수 정의는 최상위 'hat' 블록이라 다른 블록 안에 중첩 불가 → raw_statement로 무손실 보존(별도 중첩-정의 블록 신설은 큰 작업).
- **lambda 4**: 람다는 블록화가 본질적으로 어려움 → raw(무손실).
- **range(len(A)) 1**: 식 위치의 range → raw_expression(무손실).

### 신규 블록(이번 라운드)
`for_each_custom`, `slice_expr`, `keyword_arg`, `starred_arg`, `double_starred_arg`, `method_call`, `binary_op`.

### 도구
좌측 **"회색 블록 (N)" 탭**: 변환 후 남은 raw 블록을 목록으로 보여주고, 클릭하면 해당 블록으로 이동·선택. 회색 부분을 한눈에 점검 가능.
