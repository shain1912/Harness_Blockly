# 블록 기반 비주얼 프로그래밍 언어 및 교육 환경

블록 기반(Block-based) 프로그래밍 언어는 코드를 드래그 앤 드롭 방식의 시각적 블록으로 표현함으로써, 텍스트 기반 언어의 문법적 장벽을 낮추고 초보 학습자의 컴퓨팅 사고력(Computational Thinking) 함양을 목표로 한다. 이 섹션은 BlockPy가 직접적으로 계승하는 Scratch, Blockly, Snap!, Alice 등의 환경에 대한 핵심 학술 연구를 정리한다.

---

## Paper 1

**Title:** Scratch: Programming for All

**Authors:** Mitchel Resnick, John Maloney, Andrés Monroy-Hernández, Natalie Rusk, Evelyn Eastmond, Karen Brennan, Amon Millner, Eric Rosenbaum, Jay Silver, Brian Silverman, Yasmin Kafai

**Venue/Journal:** Communications of the ACM, Vol. 52, No. 11

**Year:** 2009

**DOI/URL:** https://dl.acm.org/doi/10.1145/1592761.1592779

**설명:**
MIT Media Lab에서 개발된 Scratch 프로그래밍 환경을 소개하는 핵심 논문이다. Scratch는 8~16세 대상의 시각적 블록 기반 언어로, 스프라이트(Sprite)와 스크립트를 통해 애니메이션, 게임, 인터랙티브 스토리를 제작할 수 있다. BlockPy의 스프라이트/터틀 그래픽 인터프리터는 이 환경에서 영감을 받았으며, "모든 사람을 위한 프로그래밍"이라는 교육 철학을 공유한다.

---

## Paper 2

**Title:** The Scratch Programming Language and Environment

**Authors:** John Maloney, Mitchel Resnick, Natalie Rusk, Brian Silverman, Evelyn Eastmond

**Venue/Journal:** ACM Transactions on Computing Education (TOCE), Vol. 10, No. 4

**Year:** 2010

**DOI/URL:** https://dl.acm.org/doi/10.1145/1868358.1868363

**설명:**
Scratch의 기술적 설계 철학과 언어 환경에 대한 심층 분석 논문이다. 블록 기반 구문, 이벤트 기반 실행 모델, 다중 스프라이트 동시성 등 핵심 기술 요소를 다룬다. BlockPy의 제너레이터 기반 단계 실행 인터프리터가 해결하려는 동시성 및 시각적 피드백 문제를 이 논문이 교육적 관점에서 먼저 제기하였다.

---

## Paper 3

**Title:** Comparing Block-Based and Text-Based Programming in High School Computer Science Classrooms

**Authors:** David Weintrop, Uri Wilensky

**Venue/Journal:** ACM Transactions on Computing Education (TOCE), Vol. 18, No. 1

**Year:** 2017

**DOI/URL:** https://dl.acm.org/doi/10.1145/3089799

**설명:**
고등학교 CS 수업에서 블록 기반 환경과 텍스트 기반 환경을 동일 커리큘럼으로 비교한 대규모 실증 연구다. 블록 조건의 평균 점수(66.6%)가 텍스트 조건(58.8%)보다 높았으며, 블록 기반 환경이 초보 학습자의 프로그래밍 개념 이해에 더 효과적임을 보여준다. BlockPy가 블록 편집기를 기본 진입점으로 제공하는 설계 결정을 뒷받침하는 핵심 근거 논문이다.

---

## Paper 4

**Title:** Snap! (Build Your Own Blocks): A Blocks-Based Language for CS Principles

**Authors:** Brian Harvey, Jens Mönig

**Venue/Journal:** Proceedings of the Workshop in Primary and Secondary Computing Education (WiPSCE)

**Year:** 2015

**DOI/URL:** https://snap.berkeley.edu/about

**설명:**
UC Berkeley에서 개발된 Snap!은 Scratch에서 파생되었으나 일급 함수(first-class procedures), 일급 리스트(first-class lists), 사용자 정의 블록(custom blocks), 객체 상속 등 고급 CS 개념을 블록 형태로 제공한다. BlockPy의 "메타-블록 시스템"(사용자 정의 블록 패키징)은 Snap!의 이 설계에서 직접적인 영감을 받았다. 실행 중 프로그램 변경이 가능한 라이브 편집 기능도 주목할 만하다.

---

## Paper 5

**Title:** Alice: A 3-D Tool for Introductory Programming Concepts

**Authors:** Stephen Cooper, Wanda Dann, Randy Pausch

**Venue/Journal:** Proceedings of the 5th Annual CCSC Northeastern Conference

**Year:** 2000

**DOI/URL:** https://www.researchgate.net/publication/228405788

**설명:**
Carnegie Mellon University에서 개발된 Alice는 3D 가상 세계에서 객체를 조작하는 방식으로 객체지향 프로그래밍 개념을 가르치는 초기 시각적 프로그래밍 환경이다. 드래그 앤 드롭 방식의 스크립트 작성과 즉각적인 3D 애니메이션 피드백이 특징이다. BlockPy의 스프라이트 기반 시각적 인터프리터는 Alice의 교육적 접근법, 즉 "코드를 실행하면 즉시 시각적 결과가 나타나는" 원칙을 계승한다.

---

## Paper 6

**Title:** BBVPL: A Block-Based Visual Programming Language Built on Google's Blockly

**Authors:** (Multiple authors, ResearchGate/Academia.edu publication)

**Venue/Journal:** ResearchGate / Academia.edu

**Year:** 2021

**DOI/URL:** https://www.researchgate.net/publication/353703227

**설명:**
Google의 오픈소스 Blockly 프레임워크를 기반으로 확장된 블록 기반 시각적 프로그래밍 언어(BBVPL)를 소개한다. Blockly가 코드를 생성하는 방식, 블록 정의 구조, 코드 생성기 아키텍처를 분석한다. BlockPy는 Blockly를 블록 렌더링 엔진으로 직접 사용하기 때문에, 이 논문의 기술적 분석은 BlockPy의 블록 시스템 설계 결정을 이해하는 데 직접적인 참조가 된다.

---

## Paper 7

**Title:** Exploring the Effectiveness and Moderators of Block-Based Visual Programming on Student Learning: A Meta-Analysis

**Authors:** Yue Hu, Cheng-Huan Chen, Chien-Yuan Su

**Venue/Journal:** Journal of Educational Computing Research, Vol. 58, No. 8

**Year:** 2021

**DOI/URL:** https://journals.sagepub.com/doi/abs/10.1177/0735633120945935

**설명:**
블록 기반 시각적 프로그래밍이 학생 학습에 미치는 효과에 대한 메타분석 연구다. 47개 실증 연구를 분석하여 블록 기반 프로그래밍의 평균 효과 크기(effect size)가 유의미하게 양성임을 보여준다. 학습자의 연령, 경험 수준, 교육 환경 등의 조절 변수에 따른 차이를 분석하여, BlockPy가 목표로 하는 초보 학습자 대상 교육 설계에 중요한 시사점을 제공한다.

---

## Paper 8

**Title:** The Impact of a Block-Based Visual Programming Curriculum: Untangling Coding Skills and Computational Thinking

**Authors:** (ScienceDirect, 2024)

**Venue/Journal:** Computers & Education, Vol. 218

**Year:** 2024

**DOI/URL:** https://www.sciencedirect.com/science/article/abs/pii/S0959475224001683

**설명:**
블록 기반 비주얼 프로그래밍 커리큘럼이 코딩 기술(coding skills)과 컴퓨팅 사고력(computational thinking)에 미치는 영향을 분리하여 분석한 최신 연구다. 두 역량이 서로 다른 발달 궤적을 가짐을 밝혀, 단순히 코딩을 가르치는 것과 컴퓨팅 사고력을 기르는 것이 별개임을 시사한다. BlockPy의 이중 블록/텍스트 환경이 두 역량을 동시에 지원할 수 있는 방향성을 논의하는 데 중요한 근거를 제공한다.
