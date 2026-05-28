# BlockPy / Harness_Blockly - 관련 논문 모음

이 디렉터리는 BlockPy 프로젝트(양방향 블록 ↔ Python 텍스트 프로그래밍 시스템)에 관한 학술 논문 논의를 위해 관련 연구 논문들을 주제별로 정리한 것입니다.

---

## 파일 목록 (File Index)

| 파일 | 주제 |
|------|------|
| [01_visual_block_programming.md](./01_visual_block_programming.md) | 블록 기반 비주얼 프로그래밍 언어 및 교육 환경 |
| [02_bidirectional_transformation.md](./02_bidirectional_transformation.md) | 양방향 프로그램 변환, 동기화, 무손실 라운드트립 컴파일 |
| [03_block_to_text_transition.md](./03_block_to_text_transition.md) | 블록 기반 → 텍스트 기반 프로그래밍 전환 |
| [04_ast_compilers_education.md](./04_ast_compilers_education.md) | AST 기반 접근법, 프로그램 변환, 교육에서의 디슈가링 |
| [05_ai_assisted_programming.md](./05_ai_assisted_programming.md) | AI/LLM 보조 프로그래밍, 코드 생성, 자연어→코드 |
| [06_feedback_and_directions.md](./06_feedback_and_directions.md) | **[핵심]** 연구 피드백 및 방향 제언 (한국어) |

---

## 주제별 논문 목록 요약

### 1. 블록 기반 비주얼 프로그래밍 (Visual Block-Based Programming)
- Resnick et al. (2009) - Scratch: Programming for All
- Weintrop & Wilensky (2017) - Comparing Block-Based and Text-Based Programming
- Harvey & Mönig (2012) - Snap! (Build Your Own Blocks)
- Cooper et al. (2000) - Alice: 3D programming for novices
- Maloney et al. (2010) - The Scratch Programming Language and Environment

### 2. 양방향 변환 (Bidirectional Transformation)
- Bohannon et al. (2006) - Relational Lenses (get/put paradigm)
- Schürr (1994) - Triple Graph Grammars
- Czarnecki et al. (2009) - Bidirectional Transformations: A Cross-Discipline Perspective
- KBX (2024) - Verified Model Synchronization via Formal BX

### 3. 블록→텍스트 전환 (Block-to-Text Transition)
- Bau & Bau (2015) - Pencil Code: block code for a text world
- Price & Barnes (2023) - Scaffolding Progress (structured editors)
- Kölling et al. (2019) - Transitioning from introductory to professional languages
- Hermans & Aivaloglou (2017) - Teaching Software Engineering Concepts with Blocks

### 4. AST 기반 컴파일러/교육 (AST-based Compilers & Education)
- Pombrio & Krishnamurthi (2014) - Resugaring: Lifting Evaluation Sequences
- Bart et al. (2017) - BlockPy: Dual Text/Block Python Environment
- Omar et al. (2019) - Live Functional Programming with Typed Holes (Hazel)
- Wing (2006) - Computational Thinking

### 5. AI 보조 프로그래밍 (AI-Assisted Programming)
- Chen et al. (2021) - Evaluating Large Language Models Trained on Code (Codex)
- Kazemitabaar et al. (2023) - Studying the Effect of AI Code Generators on Novice Learners
- Phung et al. (2023) - Generative AI for Programming Education (ICER 2023)
- Lau & Guo (2023) - From "Ban It" to "Resistance is Futile" (ICER 2023)

---

## BlockPy 프로젝트 핵심 특징

1. **양방향 AST 기반 트랜스파일**: 커스텀 Lexer → Parser → AST IR → Blockly JSON (역방향 포함), 완전 무손실 라운드트립
2. **AST 디슈가러**: 리스트 컴프리헨션, 삼항연산자, 연쇄 비교문 → 단순 구조 변환 컴파일러 패스
3. **커스텀 AST 인터프리터**: 제너레이터 기반 단계 실행, HTML Canvas 스프라이트/터틀 그래픽
4. **메타-블록 시스템**: 사용자 정의 블록 패키지 (`.blocklib.json`)
5. **동적 라이브러리 추상화**: Claude LLM이 Python import 문 분석 → cv2, matplotlib 등에 대한 Blockly 블록 자동 생성
6. **AI 바이브 코딩 에이전트**: 자연어 → Python 코드 → Blockly 블록 자동 변환 (Claude API 스트리밍)
7. **교육적 초점**: 노빈 학습자의 블록 코딩 → Python 텍스트 코딩 전환 지원
