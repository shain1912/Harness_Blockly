# BlockPy(Harness_Blockly) 연구 피드백 및 논문 작성 방향 제언

> 이 문서는 BlockPy 프로젝트에 대한 학술 논문 작성을 위한 종합 연구 피드백이다. 핵심 기술 분석, 기존 연구와의 차별점, 현재 한계점, 논문 작성 방향, 미래 연구 방향을 포함한다.

---

## 1. 이 프로그램의 핵심 기술 요약

BlockPy(Harness_Blockly)는 단순한 블록 기반 프로그래밍 환경이 아니라, 다음의 독자적인 기술 요소들을 통합한 연구 시스템이다.

### 1.1 완전 무손실 양방향 AST 기반 트랜스파일 파이프라인

가장 핵심적인 기술 혁신이다. 시스템은 다음 파이프라인으로 구성된다:

```
Python 소스 코드
  → 커스텀 Lexer (토크나이징)
  → 커스텀 Parser (구문 분석)
  → AST IR (중간 표현, Intermediate Representation)
  → Blockly JSON (블록 직렬화 형식)
  → (역방향) Blockly JSON → AST IR → Python 소스 코드
```

이 파이프라인의 핵심은 **"완전 무손실(lossless) 라운드트립"** 이다. 즉, Python → Blockly → Python 변환 후 원본과 의미적으로 동일한 코드가 복원된다. 기존 Blockly 기반 도구(Pencil Code의 Droplet, 버지니아텍 BlockPy 등)에서는 이 라운드트립이 부분적이거나 제약이 있었다.

### 1.2 AST 디슈가러(Desugarer) 컴파일러 패스

Python의 고급 구문(syntactic sugar)을 Blockly가 직접 표현할 수 있는 단순 구조로 변환하는 컴파일러 패스다.

**디슈가링 대상:**
- **리스트 컴프리헨션**: `[x*2 for x in lst]` → 명시적 `for` 루프 + `append`
- **삼항연산자**: `a if condition else b` → `if-else` 블록 구조
- **연쇄 비교**: `1 < x < 10` → `1 < x and x < 10`

이 디슈가러는 Pombrio & Krishnamurthi(2014)의 리슈가링(resugaring) 이론의 실용적 구현으로 이해될 수 있다.

### 1.3 제너레이터 기반 단계 실행 AST 인터프리터

Python의 `yield`/제너레이터 메커니즘을 활용하여 AST를 한 노드씩 단계적으로 실행하는 인터프리터다. 스프라이트와 터틀 그래픽을 HTML Canvas에 렌더링하며, 각 단계에서 실행 상태를 시각화한다. 이는 Bret Victor의 "Inventing on Principle"(2012)에서 제안한 즉각적 피드백 원칙과, Hazel(Omar et al., 2019)의 "최대한 라이브" 원칙을 블록 프로그래밍 맥락에 적용한 것이다.

### 1.4 메타-블록 시스템

사용자가 `.blocklib.json` 형식으로 커스텀 블록을 정의하고 패키징할 수 있는 시스템이다. Snap!(Harvey & Mönig)의 사용자 정의 블록 기능을 확장하여, 블록 정의를 파일로 공유하고 동적으로 로드할 수 있게 한다.

### 1.5 동적 라이브러리 추상화 (AI 기반)

Python `import` 문을 분석하여 해당 라이브러리(cv2, requests, matplotlib, pandas 등)에 대한 Blockly 블록을 Claude LLM이 자동으로 생성하는 기능이다. 기존 블록 환경에서는 사용할 수 있는 라이브러리가 미리 정의된 것에 국한되었지만, BlockPy는 임의의 Python 라이브러리에 대한 블록을 런타임에 동적으로 생성한다. 이는 LLM 기반 코드 이해 연구(Chen et al., 2021)를 블록 생성 파이프라인에 창의적으로 적용한 것이다.

### 1.6 AI 바이브 코딩 에이전트

자연어 입력 → Claude API(스트리밍) → Python 코드 생성 → AST 파이프라인을 통해 Blockly 블록으로 자동 변환하는 엔드-투-엔드 파이프라인이다. 이 기능은 LLM 코드 생성(Kazemitabaar et al., 2023)의 교육적 한계(블랙박스 문제, 이해 없는 사용)를 Blockly 시각화로 해결하려는 독창적인 시도다.

---

## 2. 기존 연구와의 차별점

### 2.1 버지니아텍 BlockPy(Bart et al., 2017)와의 차이

| 측면 | 버지니아텍 BlockPy | Harness_Blockly(본 프로젝트) |
|------|------------------|---------------------------|
| 트랜스파일 방향 | 주로 블록→Python | 완전 양방향, 무손실 |
| 디슈가링 | 없음 | AST 디슈가러 컴파일러 패스 포함 |
| 인터프리터 | Python 서버 실행 | 커스텀 AST 인터프리터 (클라이언트) |
| AI 통합 | 없음 | Claude LLM 완전 통합 (2기능) |
| 라이브러리 확장 | 정적 | AI 기반 동적 라이브러리 추상화 |
| 스프라이트 그래픽 | 없음 | HTML Canvas 스프라이트/터틀 |

### 2.2 Pencil Code / Droplet(Bau & Bau, 2015)과의 차이

- **Droplet**: 텍스트 위에 블록 UI를 오버레이. 내부 표현 = 텍스트. 파싱 실패 시 블록 전환 불가.
- **Harness_Blockly**: AST IR이 공통 표현. 구문 오류가 있어도 부분적 블록 변환 가능. 디슈가링으로 더 넓은 Python 구문 지원.

### 2.3 EduBlocks/MakeCode 등 전환 도구들과의 차이

- 기존 도구들: 블록→코드 단방향, 또는 코드→블록 부분적 지원
- **Harness_Blockly**: 완전 양방향 + AI 동적 블록 생성 + 메타-블록 시스템으로 임의 라이브러리 지원

### 2.4 기술적 혁신의 핵심 주장

**"임의의 Python 프로그램을 완전 무손실로 Blockly 블록으로 변환하고 다시 복원할 수 있는 첫 번째 오픈 시스템"** 이 이 프로젝트의 핵심 기여 주장이 될 수 있다.

---

## 3. 현재 한계점과 개선 방향

### 3.1 디슈가링의 커버리지 한계

**현재 한계:**
- 지원 대상: 리스트 컴프리헨션, 삼항연산자, 연쇄 비교
- 미지원: 딕셔너리 컴프리헨션, 제너레이터 표현식, 람다(lambda), 데코레이터(@), 클래스(class), 비동기(async/await), 예외 처리(try/except), f-string

**개선 방향:**
- 디슈가링 대상 확장: `with` 문, 다중 할당(tuple unpacking), 슬라이싱(`a[1:3]`)
- 부분적 변환(partial conversion): 변환 불가 구문을 "텍스트 블록"으로 감싸서 라운드트립 유지
- Pombrio & Krishnamurthi(2014)의 리슈가링 역방향 연산 완전 구현

### 3.2 AI 기반 동적 블록 생성의 신뢰성

**현재 한계:**
- Claude LLM이 생성한 Blockly 블록 JSON이 항상 문법적으로 올바르다고 보장할 수 없음
- 복잡한 라이브러리(예: numpy ndarray 연산)에 대한 블록 생성의 정확도 검증 부재
- 스트리밍 방식으로 생성된 코드의 부분적 오류 처리 미흡

**개선 방향:**
- JSON Schema 검증 레이어 추가
- 생성된 블록에 대한 단위 테스트 자동 생성 (LLM이 블록 + 테스트 동시 생성)
- 사용자 피드백 기반 블록 품질 점진적 개선(RLHF 스타일)

### 3.3 성능 및 확장성

**현재 한계:**
- 클라이언트 사이드 커스텀 인터프리터는 대규모 데이터 처리나 CPU 집약적 작업에서 성능 제한
- 메타-블록 라이브러리 생태계가 아직 초기 단계

**개선 방향:**
- WebAssembly(WASM)를 통한 인터프리터 성능 향상
- 블록 라이브러리 공유 플랫폼(npm 스타일) 구축
- 서버사이드 Python 실행과 클라이언트 AST 인터프리터의 하이브리드 전략

### 3.4 교육적 효과성 검증 부재

**현재 한계:**
- 도구의 기술적 구현은 완성되었으나 학습자 대상 실증 연구가 없음
- 블록→텍스트 전환 효과, AI 도움 유무에 따른 학습 결과 비교 데이터 없음

**개선 방향:**
- 무작위 대조 실험(RCT): BlockPy 사용 그룹 vs 전통적 Python 교육 그룹
- 학습 경로 추적(learning analytics): 블록→텍스트 전환 패턴 분석
- 사용자 연구(user study): AI 바이브 코딩 사용 시 학습 이해도 변화 측정

---

## 4. 추천 논문 작성 방향

### 방향 A: 시스템 논문 (Technical Systems Paper)

**제목 예시:** *"BlockPy: A Lossless Bidirectional Block-Python Transpiler with AI-Powered Dynamic Library Abstraction"*

**타겟 학회:** ACM SIGPLAN / SPLASH / OOPSLA, 또는 IEEE VL/HCC (Visual Languages and Human-Centric Computing)

**주요 기여:**
1. 완전 무손실 양방향 AST 기반 트랜스파일 파이프라인 설계 및 구현
2. AST 디슈가러 컴파일러 패스의 형식화 및 구현
3. AI 기반 동적 라이브러리 추상화 파이프라인
4. Playwright 기반 E2E 테스트로 검증된 라운드트립 정확도

**논문 구조 (제안):**
1. Introduction: 블록-텍스트 양방향 전환의 기술적 도전
2. Background: 기존 도구들의 한계 (Pencil Code/Droplet, VT-BlockPy, EduBlocks)
3. System Architecture: Lexer → Parser → AST IR → Blockly JSON 파이프라인
4. AST Desugarer: 디슈가링 규칙의 형식적 정의
5. AI Integration: 동적 라이브러리 추상화 및 바이브 코딩 에이전트
6. Evaluation: 라운드트립 정확도 (테스트 케이스 기반), 성능 벤치마크
7. Discussion: 한계 및 미래 작업

---

### 방향 B: 교육 연구 논문 (Educational Research Paper)

**제목 예시:** *"From Blocks to Code: Supporting Novice-to-Expert Transitions through Bidirectional Visual-Textual Programming"*

**타겟 학회:** ACM ICER (International Computing Education Research), ACM SIGCSE, Computers & Education

**주요 기여:**
1. 블록→텍스트 전환을 지원하는 새로운 교육 환경 설계
2. 학습자 대상 실증 연구: BlockPy 사용 그룹 vs 통제 그룹 비교
3. AI 바이브 코딩이 초보 학습자의 이해에 미치는 영향 분석

**주의:** 이 방향으로 논문을 쓰려면 사용자 연구(user study)가 필수다.

---

### 방향 C: AI 교육 도구 논문 (AI in Education Paper)

**제목 예시:** *"Visual-First LLM Programming: Grounding AI Code Generation in Block Representations for Novice Learners"*

**타겟 학회:** ACM CHI, AIED (AI in Education), ITS (Intelligent Tutoring Systems)

**주요 기여:**
1. LLM 생성 코드의 "블랙박스" 문제를 블록 시각화로 해결하는 새로운 인터페이스 패러다임
2. 자연어 → Python → Blockly 엔드-투-엔드 파이프라인
3. 동적 라이브러리 추상화: LLM을 활용한 런타임 DSL 생성

---

### 방향 D: 프로그래밍 언어 이론 논문 (PL Theory Paper)

**제목 예시:** *"Bidirectional Desugaring: A Compiler Pass for Lossless Block-Text Mutual Representation"*

**타겟 학회:** ACM PLDI, POPL, ICFP

**주요 기여:**
1. 블록 기반 환경을 위한 양방향 디슈가러의 형식적 정의
2. Pombrio & Krishnamurthi(2014) 리슈가링 이론의 교육적 블록 환경에 대한 확장
3. 디슈가링 규칙의 correctness 증명 (라운드트립 법칙 만족)

---

## 5. 추가 아이디어 및 미래 연구 방향

### 5.1 블록 커버리지 자동 측정 시스템

어떤 Python 프로그램이 Blockly로 완전히 변환 가능한지(block-representable)를 자동으로 분류하는 시스템. 실제 Python 코드베이스(GitHub, Kaggle 노트북)에서 샘플링하여 "블록 커버리지율"을 측정. 이 지표를 통해 디슈가러의 개선 우선순위를 데이터 기반으로 결정 가능.

### 5.2 블록 기반 디버거 (Block Debugger)

단계 실행 인터프리터를 확장하여 블록 수준에서 중단점(breakpoint)을 설정하고, 변수 값을 블록 위에 인라인으로 표시하는 시각적 디버거. Hazel(Omar et al., 2019)의 타입 홀 개념을 블록 디버깅에 적용. "지금 이 블록이 무엇을 하는지 이해"를 돕는 교육적 도구.

### 5.3 개인화 적응형 블록-텍스트 전환 지원

학습자의 블록 사용 패턴(어떤 블록을 얼마나 사용하는지)을 분석하여, 텍스트로 전환할 준비가 된 구체적인 블록을 AI가 추천하는 시스템. "이 블록은 Python에서 `for` 루프로 씁니다 - 지금 텍스트로 바꿔볼까요?"와 같은 개인화된 전환 유도.

### 5.4 협업 블록 프로그래밍 환경

여러 학습자가 동시에 같은 Blockly 프로그램을 편집하는 실시간 협업 환경. 블록 기반의 Operational Transformation(OT) 또는 CRDT 구현. 교실 환경에서 페어 프로그래밍(pair programming)을 지원하는 교육적 응용.

### 5.5 자연어 블록 검색 (Block Search by Natural Language)

"화면에 원을 그리는 블록", "리스트에서 가장 큰 값을 찾는 블록"과 같은 자연어 쿼리로 관련 블록을 검색하고 자동 삽입하는 기능. Claude API를 활용하여 블록 의미론적 검색 구현. 이는 "AI 도움 없이 블록을 찾는 것도 어려운" 초보 학습자의 발견 가능성(discoverability) 문제를 해결한다.

### 5.6 블록 프로그램의 자동 테스트 생성

AI(Claude)가 현재 블록 프로그램의 의도를 분석하여 단위 테스트를 자동 생성하는 기능. 학습자가 자신의 프로그램이 "올바른지" 검증하는 습관을 기를 수 있게 지원. Test-Driven Development(TDD) 개념을 블록 프로그래밍 교육에 도입하는 새로운 시도.

### 5.7 다중 언어 지원으로의 확장

현재 Python 전용인 시스템을 JavaScript, Lua, R 등으로 확장. AST IR을 언어 독립적으로 설계하여 동일한 Blockly 블록이 여러 타겟 언어로 생성될 수 있도록 함. 이는 "언어에 독립적인 컴퓨팅 사고력 교육" 도구로서의 가치를 높인다.

### 5.8 블록 프로그램의 복잡도 분석 및 시각화

현재 블록 프로그램의 인지적 복잡도(cyclomatic complexity, nesting depth 등)를 시각적으로 표시하는 기능. "이 프로그램이 너무 복잡해지고 있습니다 - 함수로 분리해볼까요?"와 같은 리팩터링 가이드. 학습자가 좋은 프로그래밍 습관을 형성하는 데 도움.

---

## 6. 논문 작성 시 주의사항

### 6.1 선행 연구와의 명확한 차별화

버지니아텍 BlockPy(Bart et al., 2017)와 이름이 동일하므로, 논문 초반부에서 다음을 명확히 해야 한다:
- 본 시스템은 버지니아텍 BlockPy와 독립적으로 개발되었음
- 기술적 접근 방식의 핵심 차이점 (AST IR 중심 vs Blockly 직접 생성)
- 기여의 차별성 (완전 무손실 라운드트립, AI 통합, 동적 블록 생성)

### 6.2 "무손실(lossless)" 주장의 정확한 범위 정의

"완전 무손실"이라는 주장을 뒷받침하기 위해 다음을 명확히 해야 한다:
- 어떤 Python 구문 서브셋이 완전히 지원되는지 (지원 범위 명시)
- 디슈가링 후 역방향 변환 시 의미적 동등성(semantic equivalence)이 보장되는 조건
- 코멘트, 공백, 독스트링 등 비의미적 요소의 처리 방식

### 6.3 실증적 근거 확보의 중요성

기술적 구현 논문(방향 A, D)이라도 최소한 다음의 실증적 데이터가 필요하다:
- E2E 테스트 통과율과 테스트 케이스 설명
- 지원하는 Python 구문 범위에 대한 정량적 커버리지
- 성능 벤치마크 (변환 속도, 메모리 사용량)

교육 연구 논문(방향 B, C)을 목표로 한다면 IRB 승인하의 학습자 대상 연구가 반드시 필요하다.

---

*이 문서는 BlockPy(Harness_Blockly) 프로젝트의 학술 논문 작성을 위한 연구 전략 문서이다. 2026년 5월 기준으로 작성되었다.*
