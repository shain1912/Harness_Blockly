# 📦 BlockPy (Blockly ↔ Python Bidirectional System) 기술 명세 및 가이드 (COMPRESS.md)

이 문서는 **BlockPy** 프로젝트의 제품 요구사항 정의(PRD), 핵심 아키텍처, 양방향 AST 변환 로직, 엔지니어링 문제 해결(Troubleshooting), 개발자 및 사용자 가이드를 하나로 압축 정리한 종합 프레임워크 문서입니다.

---

## 🎯 1. 제품 요구사항 정의 (PRD)

### 1.1. 제품 비전 & 목적
* **제품명**: BlockPy (Visual Block Programming with Python)
* **비전**: 교육용 시각 블록 언어(Blockly/Scratch-like)와 텍스트 프로그래밍 언어(Python) 간의 물리적 장벽을 허무는 **1:1 양방향 무손실 변환 환경**을 제공합니다.
* **핵심 가치**: 
  1. 초등/중등 블록 코딩 학습자가 자연스럽게 파이썬 텍스트 코딩으로 전환할 수 있도록 도움.
  2. 단순 번역기가 아닌, 상호 편집이 가능한 완벽한 동기화 인프라 제공.
  3. AI와 메타-블록 제작 시스템을 통한 무한한 확장성 제공.

### 1.2. 주요 기능 범위 (Scope of Features)

#### 📦 A. AST 기반 1:1 양방향 실시간 변환 파이프라인
* **Block → Python**: 블록의 배치 상태를 구조적 파이썬 코드로 트랜스파일.
* **Python → Block**: 직접 작성하거나 외부에서 붙여넣은 파이썬 코드를 해석하여 동일한 블록 트리 구조로 자동 재조립.
* **무손실(Lossless) & 합성 가능(Composable)**: 중첩 루프, 다중 조건문, 클래스/함수 정의 및 이벤트 래핑 지원.

#### 🎨 Sprite & Stage 시각화 엔진
* **스크래치 스타일 시각화 Canvas**: 스프라이트(캐릭터), 배경(Backdrop), 애니메이션 코스튬 제어.
* **거북이 그래픽(Turtle Graphics) 지원**: 펜 내리기/올리기, 색상 변경, 궤적 그리기 등 수학적 시각화 도구 기본 제공.
* **상태 관리**: 위치($x, y$), 각도(Direction), 말풍선(Say/Think), 소리 등의 실시간 렌더링.

#### 🏗️ 비주얼 블록 빌더 (Block Builder) - 메타 블록 시스템
* **블록으로 블록을 만드는 환경**: 사용자가 툴박스에서 블록을 조립하여 새로운 '커스텀 이벤트 블록'을 직접 디자인.
* **파라미터 정의**: 드롭다운(Dropdown), 텍스트(Text), 숫자(Number) 입력 파라미터를 동적 추가.
* **내보내기 & 공유**: 제작된 블록 메타데이터를 단일 패키지(`.blocklib.json`) 파일로 즉시 다운로드하여 다른 세션이나 타인에게 공유 가능.

#### 🔌 pip-style 확장 라이브러리 매니저 (Library Manager)
* **원클릭 설치**: 로컬 또는 원격 JSON 명세를 복사-붙여넣기하여 F5 한 번으로 툴박스에 커스텀 카테고리와 블록을 동적 추가.
* **AI 자동 블록 패키지 생성**: API 키 입력을 통해 라이브러리 명칭과 프로젝트 맥락만으로 적합한 커스텀 블록 라이브러리를 LLM(Claude)이 즉시 실시간 설계 및 자동 패키징하여 설치.

#### 🤖 AI Vibe Coding Agent
* **Anthropic SDK 기반 에이전트 내장**: 프론트엔드 패널에서 AI Agent와 대화하며 Vibe Coding 가능.
* **실시간 코드 주입**: 사용자의 자연어 명령("우주선이 장애물을 피하는 게임을 짜줘")을 통해 파이썬 코드를 스트리밍 생성하고, 이를 자동으로 블록으로 파싱하여 워크스페이스에 실시간 주입.

---

## 🛠️ 2. 아키텍처 및 핵심 파일 구조

### 2.1. 디렉토리 구성 및 역할
```
blocklyTest/
├── src/
│   ├── blocks/            # Blockly 커스텀 블록 정의 & 코드 제너레이터
│   │   ├── blockBuilder.js      # 블록을 디자인하기 위한 메타-블록 명세
│   │   ├── customBlocks.js      # 모션, 소리, 연산 등 코어 스프라이트 블록 정의
│   │   └── exactPythonBlocks.js # 파이썬 제어문(if, while, for) 대응 블록
│   ├── components/        # React UI 컴포넌트 레이어
│   │   ├── Stage.jsx            # 스프라이트/거북이 그래픽이 활성화되는 핵심 Canvas 화면
│   │   ├── BlocklyEditor.jsx    # Google Blockly 인스턴스 마운트, 라이프사이클 관리
│   │   ├── PythonEditor.jsx     # 파이썬 에디터 인터페이스
│   │   ├── LibraryManager.jsx   # 라이브러리 설치/내보내기/AI 생성 모달
│   │   └── AIAgent.jsx          # Claude API 연동 대화형 코딩 에이전트
│   ├── utils/             # 변환 및 백엔드 유틸리티 레이어
│   │   ├── ast.js               # 핵심! 3단계 파이썬↔AST↔Blockly 변환 컴파일러
│   │   ├── transpiler.js        # 정규식 기반 레거시 파서 및 헬퍼 처리
│   │   └── autoBlockGen.js      # Claude API 호출 및 자동 블록 디자인 알고리즘
│   ├── App.jsx            # 메인 애플리케이션 프레임워크 (Global State & Layout)
│   └── main.jsx           # 전역 엔트리 포인트
├── docs/                  # 기술 연구 및 시연 시나리오 문서
└── tests/                 # Vitest 유닛 테스트 및 Playwright E2E 테스트 스위트
```

### 2.2. AST 변환 핵심 3단계 파이프라인 (`src/utils/ast.js`)
기존의 단순 패턴 매칭이나 문자열 치환의 깨짐 문제를 완벽히 극복하기 위해 독자적인 **Intermediate Representation (IR)** 구조의 AST 컴파일러를 구현했습니다.

```
[Python Text] ─── (pythonToAst) ───► [독자 AST IR (Node Trees)] ◄─── (astToPython) ─── [Python Text]
                                             │
                                             ├─► (astToBlockly) ──► [Blockly JSON Model]
                                             └─► (blocklyToAst) ◄─┘
```

#### 주요 AST 노드 종류
* `Program`: 전체 실행 트리의 루트.
* `ClassDef`/`FunctionDef`: 클래스 선언 및 인자 맵을 가진 독립 함수 정의 블록 대응.
* `SpriteCall` / `StageCall`: `sprite.move(10)` / `stage.switch_backdrop("space")`와 같이 특정 타겟 객체 메소드 호출 노드.
* `WhileTrue` / `WhileUntil` / `ForRange`: 무한 루프 및 유한 횟수 루프 표현.
* `IfStmt`: 조건문 및 `else/elif` 블록 구조 보존.
* `Assign` / `AugAssign`: 변수 선언 및 연산 대입(`x += 5`).

---

## ⚡ 3. 핵심 엔지니어링 문제 해결 (Troubleshooting)

### 3.1. 무손실 라운드트립(Roundtrip) 안정성 달성
* **이슈**: 사용자가 블록 뷰와 파이썬 뷰를 오갈 때, 코드 형식이 약간만 바뀌어도 Blockly 워크스페이스 내의 블록 좌표가 헝클어지거나, 최상위 실행 진입점인 `on_start` Hat 블록이 탈락하여 흐름이 끊기는 문제 발생.
* **해결책**:
  1. **스냅샷 복원 패턴 (Snapshot Recovery)**: 사용자가 블록 모드에서 파이썬 모드로 전환할 때, 현재 워크스페이스의 온전한 Blockly JSON 데이터 스냅샷을 브라우저 상태에 저장합니다. 만약 사용자가 파이썬 에디터에서 코드를 한 글자도 수정하지 않고 다시 블록 뷰로 돌아온다면, 파싱 엔진을 돌리지 않고 **보관해 둔 스냅샷을 100% 그대로 복원**하여 완벽한 무손실 전환을 보장합니다.
  2. **`wrapRunnable` 파싱 필터**: 사용자가 파이썬 뷰에서 코드를 수정한 뒤 복귀할 경우, `pythonToBlockly(code, { wrapRunnable: true })` 옵션을 활성화합니다. 이 옵션은 파이썬 최상위 레벨에 단독으로 놓인 실행문들(`sprite.move()`, `time.sleep()` 등)을 감지하여 자동으로 `on_start` (초록색 깃발 클릭했을 때) 블록 내부의 실행 자식들로 감싸 조립해 줌으로써 시각적 정체성을 유지합니다.

### 3.2. 콤마(`,`) 기준 문자열 분할 에러 (Tokenizing Comma Split Bug)
* **이슈**: `sprite.say("Hello, World!")` 블록을 파이썬 코드로 변환한 후 다시 블록으로 파싱할 때, 인자 목록을 단순 `.split(',')`으로 자르게 되어 `"Hello"`와 `" World!"`라는 두 개의 잘못된 인자로 쪼개져 구문 에러가 나는 현상 발생.
* **해결책**: 정규식을 이용해 따옴표 구조(쌍따옴표 및 홑따옴표) 내부에 있는 쉼표를 무시하고 괄호 외부의 실질적인 아규먼트 경계선만 찾아 분리하는 안전한 `splitArgs(argsStr)` 알고리즘을 도입했습니다.

### 3.3. React StrictMode 및 이중 렌더링에 의한 Blockly 메모리 오염
* **이슈**: React 18+ 및 React 19의 개발 환경에서 StrictMode는 컴포넌트의 부작용을 찾기 위해 마운트를 의도적으로 이중 실행(`mount` → `unmount` → `mount`)합니다. 이 과정에서 Blockly div 컨테이너가 제대로 파괴(Dispose)되지 않고 중복 마운트되어 Headless 테스트 환경(특히 Chromium)에서 인스턴스 락(Lock)이 발생하거나 테스트가 터짐.
* **해결책**:
  1. `BlocklyEditor.jsx` 컴포넌트 내부에 확실하게 정리 작업을 수행하는 Cleanup 함수 구현:
     ```javascript
     return () => {
       if (workspace.current) {
         workspace.current.dispose();
         workspace.current = null;
       }
     };
     ```
  2. 확실히 인스턴스가 생성되고 컴포넌트가 살아남은 상태에서만 `onMount` 콜백을 트리거하고, 이를 브라우저 전역 `window.__blocklyWorkspace`에 바인딩하여 안전성을 영속화함.

### 3.4. 음수 회전 및 방향성 불일치 문제 (`turn_left` 변환)
* **이슈**: 파이썬 상의 `sprite.turn_left(90)` 또는 `sprite.turn(-90)` 코드는 실질적으로 좌측 회전을 가리키나, Blockly에는 오직 우측 회전 블록(`turn_right`)에 내부 방향 파라미터(`DIRECTION: 'left'`)가 삽입되는 구성을 가짐.
* **해결책**: AST 분석 단계에서 `turn_left` 호출을 감지하거나 `turn_right`에 음수 값이 들어올 경우, 이를 Blockly의 단일 `turn_right` 블록 모델로 치환하고 내부 `DIRECTION` 드롭다운 필드를 `'left'`로 정확히 채워 넣는 정규화 맵을 구축했습니다.

### 3.5. `change_variable` 필드명 싱크 에러
* **이슈**: Blockly 기본 블록은 값의 증분을 `"VALUE"` 필드로 수신하지만 레거시 트랜스파일러 코드는 파이썬 변환 시 `"CHANGE"`라는 잘못된 필드 속성을 주입하여 값이 지속적으로 유실되던 현상 발생.
* **해결책**: AST Generator 맵에서 `change_variable` 블록의 명세를 엄격히 디버깅하여 필드 키를 `"VALUE"`로 일괄 통일함으로써 라운드트립 테스트를 성공적으로 통과시켰습니다.

---

## 🏃 4. 사용 방법 및 워크플로우

### 4.1. 환경 구축 및 전체 실행
BlockPy는 프론트엔드와 간단한 목(Mock) API 서버 역할을 해줄 수 있는 백엔드가 결합된 풀스택 구조로 시작 가능합니다.

```bash
# 1. 의존성 패키지 설치
npm install

# 2. 통합 실행 (Vite 프론트엔드 http://localhost:5173 + 백엔드 API http://localhost:3001 동시 실행)
npm start
```

### 4.2. 테스트 스위트 구동 가이드
프로젝트의 무결성을 증명하기 위한 63개의 유닛 테스트와 16개의 시나리오 기반 Playwright E2E 테스트 실행 방법입니다.

```bash
# 1. Vitest 유닛 테스트 실행 (ast, transpiler, customBlocks 완벽 검증)
npx vitest run

# 2. Playwright E2E 테스트 실행 (WSL2/Linux 환경 대응 ALSA 오디오 드라이버 우회 스크립트 적용)
export LD_LIBRARY_PATH=/tmp/alsa-lib/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH
npx playwright test --timeout=30000

# 3. 디버깅용 Playwright GUI 모드 실행
npx playwright test --ui
```

### 4.3. 사용자 워크플로우 (How to Use)

#### 1) 내장 시연 예제 구동 (Demo Scripts)
1. 브라우저에서 `http://localhost:5173`에 접속합니다.
2. 우측 상단의 **예제 모음** 또는 `public/examples/` 폴더 내의 `.py` 파일을 복사합니다. (예: `02_turtle_shapes.py`)
3. **Python Editor** 탭에 코드를 붙여넣습니다.
4. **[🔄 Convert]** 버튼을 눌러 순식간에 블록이 아름답게 조립되는 광경을 목격합니다.
5. **[▶ Run]** 버튼을 클릭하여 좌측 Stage Canvas에서 거북이가 선을 그리고 스프라이트가 움직이는 시각 효과를 관찰합니다.

#### 2) 메타 블록 빌더 활용 (Block Builder)
1. Blockly 툴박스의 가장 하단에 위치한 `🏗️ Block Builder` 카테고리를 선택합니다.
2. `[📦 Define Event Block]` 블록을 캔버스 중앙에 배치합니다.
   * `Block Type`을 영어 스네이크 케이스로 기입합니다. (예: `on_key_w_pressed`)
   * `Display Label`에 화면에 뜰 이름을 적습니다. 이모지(⌨️, 🖱️)를 넣으면 더 화려해집니다.
   * `Colour` 칩으로 블록의 전반적인 메인 컬러를 고릅니다.
3. 파라미터 조립 슬롯에 `[➕ Dropdown Parameter]`, `[➕ Number Parameter]` 등을 부착하여 키 입력 값이나 강도 값을 유동적으로 설계합니다.
4. `Event Code` 몸체 내부에 해당 블록이 작동될 때 구동될 기본 액션 블록들(`say`, `move` 등)을 조립합니다.
5. 우측 하단의 **Library Manager (📦 버튼)** 모달을 엽니다.
6. **Export** 탭에서 이름과 버전 등 메타데이터를 입력하고 **[📥 Download .blocklib.json]** 버튼으로 라이브러리를 다운로드합니다.
7. 동일한 모달의 **Install** 탭에 복사한 JSON 코드를 붙여넣고 설치한 후 새로고침(F5)을 누르면, **내가 직접 만든 비주얼 블록이 툴박스에 즉시 영구 등록**되어 코딩에 활용할 수 있습니다.

#### 3) AI Vibe Coding & 자동 블록 디자인
1. 브라우저 우측의 AI Agent 패널에 본인의 `Claude API Key`를 등록합니다. (로컬 스토리지에 안전하게 보관됩니다.)
2. AI 대화창에 원하는 코딩 목표를 자연어로 입력합니다. (예: *"별 모양을 그리는 거북이 애니메이션을 만들어줘"*)
3. AI Agent가 코드를 실시간 스트리밍 방식으로 타이핑하여 파이썬 편집기에 기입하고, 생성이 끝남과 동시에 해당 코드를 Blockly 변환 파이프라인에 주입하여 완벽한 블록 트리 구조로 치환해 줍니다.
4. 새로운 외장 라이브러리를 탐색하고 싶다면 Library Manager의 **AI Auto-Generate** 섹션에서 원하는 라이브러리 목적을 기술하십시오. LLM이 적합한 블록 규격 명세 패키지를 수초 내에 설계 및 빌드하여 즉석 라이브러리로 탑재시켜 줍니다.

---

## 🎓 5. 학술 및 기술적 기여도 (Value Highlights)

1. **완벽한 양방향성(Full Bidirectionality)**: 시중의 단순 일방향 코드 생성기(블록 → 텍스트) 한계를 뛰어넘어, 텍스트의 구조적 변화를 실시간 분석해 블록으로 환원하는 대칭 구조의 컴파일러를 브라우저 환경에서 경량 AST 인터프리터 수준으로 완벽하게 구현했습니다.
2. **동적 툴박스 리하이드레이션(Toolbox Rehydration)**: 정적인 블록 구성을 넘어서 사용자가 웹 브라우저 런타임에서 새로운 형태의 블록 규격을 실시간 생성, 임포트, 배포하는 메타 구조를 지원합니다.
3. **AI 오케스트레이션 패러다임**: 자연어 처리 엔진을 컴파일 파이프라인의 입구(Python code generation) 및 설정 인터페이스(Library generator)와 직접 결합하여 비주얼/프로그래밍 교육 도구의 새로운 방향성을 제시하였습니다.
