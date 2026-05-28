# 블록 기반 → 텍스트 기반 프로그래밍 전환

블록 기반 프로그래밍에서 텍스트 기반 프로그래밍으로의 전환(transition)은 컴퓨팅 교육에서 가장 중요하고 어려운 문제 중 하나다. BlockPy의 가장 핵심적인 교육적 목표가 바로 이 전환을 원활하게 지원하는 것이다. 이 섹션은 전환 과정의 어려움을 진단하고, 지원 도구 및 교수법적 접근을 다룬 연구들을 정리한다.

---

## Paper 1

**Title:** Pencil Code: Block Code for a Text World

**Authors:** David Bau, D. Anthony Bau

**Venue/Journal:** Proceedings of the 14th International Conference on Interaction Design and Children (IDC '15)

**Year:** 2015

**DOI/URL:** https://dl.acm.org/doi/10.1145/2771839.2771875

**설명:**
Pencil Code는 Droplet이라는 이중 모드(dual-mode) 코드 에디터를 탑재한 교육용 프로그래밍 도구로, 블록 모드와 CoffeeScript/JavaScript 텍스트 모드를 언제든지 전환할 수 있다. 어떤 작업도 잃지 않고 모드 전환이 가능하며, 이는 BlockPy의 블록↔Python 무손실 전환과 동일한 설계 철학을 공유한다. BlockPy와 Pencil Code는 가장 직접적으로 비교되는 선행 연구이자 경쟁 도구다.

---

## Paper 2

**Title:** Droplet, a Blocks-Based Editor for Text Code

**Authors:** David Anthony Bau

**Venue/Journal:** Journal of Computing Sciences in Colleges, Vol. 30, No. 6

**Year:** 2015

**DOI/URL:** https://dl.acm.org/doi/10.5555/2753024.2753052

**설명:**
Pencil Code의 핵심 컴포넌트인 Droplet 에디터의 기술적 설계를 상세히 설명한 논문이다. Droplet은 텍스트 코드 위에 블록 UI를 오버레이하는 독특한 방식으로, 내부적으로는 항상 텍스트 코드를 정규 표현으로 유지한다. BlockPy의 접근 방식(AST IR을 공통 표현으로 사용)과 비교했을 때, Droplet은 텍스트 중심, BlockPy는 AST 중심으로 서로 다른 기술적 선택을 했다는 점에서 중요한 비교 대상이다.

---

## Paper 3

**Title:** Supporting Learners in the Transition from Block-Based to Text-Based Programming: A Systematic Review

**Authors:** (ScienceDirect / Computers & Education Open, 2025)

**Venue/Journal:** Computers & Education Open, Vol. 7

**Year:** 2025

**DOI/URL:** https://www.sciencedirect.com/science/article/pii/S2590118425000280

**설명:**
블록 기반에서 텍스트 기반 프로그래밍으로의 전환을 지원하는 방법에 대한 포괄적인 최신 체계적 문헌 고찰(systematic review)이다. 180개 논문을 검토하여 전환 지원 접근법의 공통 테마와 연구 공백을 분석한다. BlockPy 연구의 현재 위치를 파악하고, 논문에서 어떤 기여를 강조해야 하는지 판단하는 데 필수적인 최신 서베이다.

---

## Paper 4

**Title:** Scaffolding Progress: How Structured Editors Shape Novice Errors When Transitioning from Blocks to Text

**Authors:** Thomas W. Price, et al.

**Venue/Journal:** ArXiv preprint (EDM / ICER related)

**Year:** 2023

**DOI/URL:** https://arxiv.org/pdf/2302.05708

**설명:**
Scratch에서 Python으로 전환하는 26명의 고등학생을 추적한 연구로, 구조화된 에디터(structured editor)를 사용한 학생들이 그렇지 않은 학생에 비해 문법 오류를 4.6배 적게 발생시키고 데이터 타입 오류를 1.9배 적게 발생시켰음을 보여준다. BlockPy의 블록 기반 입력이 문법 오류를 원천적으로 제거하는 효과, 그리고 텍스트 모드에서의 단계적 전환 지원에 대한 실증적 근거를 제공한다.

---

## Paper 5

**Title:** Transitioning from Introductory Block-Based and Text-Based Environments to Professional Programming Languages in High School Computer Science Classrooms

**Authors:** David Weintrop, Uri Wilensky

**Venue/Journal:** Computers & Education, Vol. 142

**Year:** 2019

**DOI/URL:** https://www.sciencedirect.com/science/article/abs/pii/S036013151930199X

**설명:**
고등학교 CS 수업에서 Snap!, Racket, NetLogo 같은 입문 환경에서 Java, JavaScript 같은 전문 언어로 전환하는 과정의 도전과 전략을 연구한 논문이다. 전환 시 발생하는 "절벽(cliff)" 효과와 이를 완화하기 위한 교수법적 전략을 분석한다. BlockPy가 블록→텍스트 전환을 점진적으로(단계별로) 지원하는 설계 결정이 왜 필요한지 교육 연구적 근거를 제공한다.

---

## Paper 6

**Title:** A Comparative Study of the Effectiveness of Transitioning from Block-Based or Text-Based Programming to Python

**Authors:** (ResearchGate, 2023)

**Venue/Journal:** Education and Information Technologies, Springer

**Year:** 2023

**DOI/URL:** https://www.researchgate.net/publication/373927164

**설명:**
블록 기반 환경에서 Python으로 전환한 그룹과 처음부터 텍스트 기반으로 시작한 그룹을 비교한 실험 연구다. 블록→텍스트 순서가 텍스트만 학습한 경우보다 Python 습득 속도와 정확도에서 유의미한 차이를 보임을 분석한다. BlockPy의 "블록으로 시작하여 텍스트로 전환"이라는 핵심 교육 시나리오의 효과성을 검증하는 실증 데이터를 제공한다.

---

## Paper 7

**Title:** Enhancing Universal Access to Programming Education: Paradigm-Aligned Transition from Block-Based to Text-Based Languages

**Authors:** (Springer Nature Link, 2025)

**Venue/Journal:** Universal Access in the Information Society, Springer

**Year:** 2025

**DOI/URL:** https://link.springer.com/article/10.1007/s10209-025-01271-x

**설명:**
블록 기반 언어(Logo 철학, 객체지향)와 텍스트 기반 언어(Python, 절차적 패러다임) 간의 패러다임 불일치(paradigm mismatch)가 전환의 핵심 장벽임을 분석하는 최신 연구다. 패러다임을 맞춘 단계별 전환이 보편적 접근성(universal access)을 높임을 주장한다. BlockPy의 AST 디슈가러가 Python의 고급 구문을 Blockly가 표현할 수 있는 단순 구조로 변환하는 것이 이 패러다임 간격을 줄이는 기술적 해법임을 정당화하는 데 이 논문이 활용될 수 있다.

---

## Paper 8

**Title:** Moving Away from the Blocks: Evaluating the Usability of EduBlocks for Supporting Children to Transition from Block-Based Programming

**Authors:** (INTERACT 2023)

**Venue/Journal:** Human-Computer Interaction – INTERACT 2023, LNCS, Springer

**Year:** 2023

**DOI/URL:** https://dl.acm.org/doi/10.1007/978-3-031-42280-5_19

**설명:**
EduBlocks(블록 드래그→Python 코드 자동 생성 도구)의 사용성(usability)을 어린이 대상으로 평가한 연구다. 분할 화면 방식(블록 ↔ 텍스트 병렬 표시)의 교육적 효과와 한계를 실증적으로 분석한다. BlockPy의 이중 뷰 설계 및 전환 지원 UX를 비교 평가할 때 직접적인 비교 대상이 되는 도구에 대한 연구다.
