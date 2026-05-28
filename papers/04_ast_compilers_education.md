# AST 기반 접근법, 프로그램 변환 및 교육에서의 디슈가링

추상 구문 트리(Abstract Syntax Tree, AST)는 소스 코드의 계층적 구조를 표현하는 데이터 구조로, 컴파일러, 인터프리터, 프로그램 변환 도구의 핵심이다. BlockPy의 가장 독자적인 기술 요소는 커스텀 Python Lexer → Parser → AST IR → Blockly JSON 파이프라인이며, AST 디슈가러(Desugarer) 컴파일러 패스가 이 중 핵심이다. 이 섹션은 AST 기반 변환, 디슈가링, 라이브 프로그래밍, 컴퓨팅 사고력에 관한 연구들을 정리한다.

---

## Paper 1

**Title:** Resugaring: Lifting Evaluation Sequences through Syntactic Sugar

**Authors:** Justin Pombrio, Shriram Krishnamurthi

**Venue/Journal:** Proceedings of the 35th ACM SIGPLAN Conference on Programming Language Design and Implementation (PLDI 2014)

**Year:** 2014

**DOI/URL:** https://dl.acm.org/doi/abs/10.1145/2594291.2594319

**설명:**
디슈가링(desugaring)의 역방향 연산인 리슈가링(resugaring)을 처음으로 형식화한 획기적인 논문이다. 설탕(syntactic sugar)으로 작성된 표층 언어(surface language) 프로그램이 핵심 언어(core language)로 변환되면 디버거/스텝 트레이서가 사용자에게 낯선 코어 표현을 보여주는 문제를 해결한다. BlockPy의 AST 디슈가러가 `[x for x in lst]` 같은 구문을 `for` 루프로 변환하고, 역방향 변환 시 원래 구문으로 복원하는 것은 정확히 이 논문의 리슈가링 문제다. BlockPy 논문에서 이 연구와의 관계를 명시적으로 논의해야 한다.

---

## Paper 2

**Title:** Semantics Lifting for Syntactic Sugar

**Authors:** Justin Pombrio, Shriram Krishnamurthi

**Venue/Journal:** Proceedings of the ACM on Programming Languages (OOPSLA 2024)

**Year:** 2024

**DOI/URL:** https://dl.acm.org/doi/10.1145/3689758

**설명:**
Pombrio와 Krishnamurthi의 리슈가링 연구의 최신 확장으로, 타입 규칙과 스코프 규칙까지 설탕 표층 언어로 들어올리는(lift) 방법을 제안한다. 설탕 구문에 대한 의미론(semantics)을 자동으로 유도하는 것이 가능함을 보여준다. BlockPy의 디슈가러가 지원하는 구문 변환 목록(삼항연산자, 리스트 컴프리헨션, 연쇄 비교)에 대해 타입 추론과 에러 메시지를 원래 구문 기준으로 보여주는 미래 확장에 이 연구가 직접 활용될 수 있다.

---

## Paper 3

**Title:** BlockPy: An Open Access Data-Science Environment for Introductory Programmers

**Authors:** Austin Cory Bart, Ryan Whitcomb, Javier Tibau, Luke Gusukuma, Dennis Kafura

**Venue/Journal:** IEEE Computer, Vol. 50, No. 5

**Year:** 2017

**DOI/URL:** https://dl.acm.org/doi/10.1109/MC.2017.132

**설명:**
Virginia Tech에서 개발된 BlockPy(본 프로젝트와 이름이 같은 선행 연구)를 소개하는 논문이다. 이 BlockPy는 Blockly 기반 블록과 Python 텍스트를 양방향으로 전환하는 데이터 과학 입문 환경으로, "Mutual Language Translation" 기술을 사용한다. 본 프로젝트(Harness_Blockly)는 이 선행 BlockPy와 독립적으로 개발되었으나, 같은 이름과 유사한 아이디어를 가지므로 논문에서 명확한 차별화 서술이 필요하다.

---

## Paper 4

**Title:** Live Functional Programming with Typed Holes

**Authors:** Cyrus Omar, Ian Voysey, Michael Hilton, Jonathan Aldrich, Matthew Hammer

**Venue/Journal:** Proceedings of the ACM on Programming Languages (POPL 2019)

**Year:** 2019

**DOI/URL:** https://arxiv.org/abs/1805.00155

**설명:**
Hazel 프로그래밍 환경을 위한 타입 홀(typed holes)이 있는 라이브 함수형 프로그래밍의 형식적 의미론을 제안한 논문이다. 프로그램이 불완전한 상태(hole이 있는 상태)에서도 실행이 가능하도록 하는 "최대한 라이브(maximally live)" 의미론을 제공한다. BlockPy의 단계 실행 인터프리터가 불완전하거나 오류가 있는 프로그램도 최대한 실행하며 피드백을 제공하는 설계는 이 논문의 라이브 프로그래밍 원칙과 맥락을 같이한다.

---

## Paper 5

**Title:** Computational Thinking

**Authors:** Jeannette M. Wing

**Venue/Journal:** Communications of the ACM, Vol. 49, No. 3

**Year:** 2006

**DOI/URL:** https://www.microsoft.com/en-us/research/wp-content/uploads/2012/08/Jeannette_Wing.pdf

**설명:**
"컴퓨팅 사고력(Computational Thinking)"이라는 개념을 CS 교육 커뮤니티에 정식 소개한 역사적 논문이다. 분해(decomposition), 패턴 인식, 추상화, 알고리즘적 사고를 컴퓨팅 사고의 핵심으로 정의한다. BlockPy가 교육적 목표로 삼는 "컴퓨팅 사고력 함양을 위한 비주얼 프로그래밍 환경"의 개념적 기반이 되는 논문으로, 거의 모든 CS 교육 논문에서 인용된다.

---

## Paper 6

**Title:** Defining Computational Thinking for Mathematics and Science Classrooms

**Authors:** David Weintrop, Elham Beheshti, Michael Horn, Kai Orton, Kemi Jona, Laura Trouille, Uri Wilensky

**Venue/Journal:** Journal of Science Education and Technology, Vol. 25, No. 1

**Year:** 2016

**DOI/URL:** https://link.springer.com/article/10.1007/s10956-015-9581-5

**설명:**
수학 및 과학 수업 맥락에서 컴퓨팅 사고력을 정의하는 분류 체계(taxonomy)를 제안한 논문이다. 데이터 실천(data practices), 모델링 및 시뮬레이션, 컴퓨팅 문제 해결 실천, 시스템 사고 등 4개 주요 범주를 포함한다. BlockPy의 시각적 프로그래밍 환경이 STEM 교육에서 어떻게 컴퓨팅 사고력을 지원하는지 논의할 때 이 분류 체계를 사용하여 BlockPy의 교육적 기여를 구체적으로 측정할 수 있다.

---

## Paper 7

**Title:** Learnable Programming: Blocks and Beyond

**Authors:** Leo Ureel II, Charles Wallace

**Venue/Journal:** ArXiv preprint (Submitted to IEEE/ACM)

**Year:** 2017

**DOI/URL:** https://arxiv.org/pdf/1705.09413

**설명:**
Bret Victor의 "학습 가능한 프로그래밍(Learnable Programming)" 원칙을 블록 기반 프로그래밍 환경에 적용한 연구다. 즉각적인 피드백, 데이터 가시화, 점진적 학습 지원이 블록 환경에서 어떻게 구현될 수 있는지 분석한다. BlockPy의 제너레이터 기반 단계 실행 및 HTML Canvas 시각화가 "학습 가능한 프로그래밍" 원칙을 어떻게 구현하는지 논의할 때 이 논문이 핵심 이론적 틀을 제공한다.

---

## Paper 8

**Title:** Broadening the View of Live Programmers: Integrating a Cross-Cutting Perspective on Run-Time Behavior into a Live Programming Environment

**Authors:** (LIVE 2024 Workshop)

**Venue/Journal:** ArXiv preprint (LIVE Workshop 2024)

**Year:** 2024

**DOI/URL:** https://arxiv.org/pdf/2403.02428

**설명:**
라이브 프로그래밍 환경에서 런타임 동작에 대한 단면적(cross-cutting) 관점을 통합하는 방법을 연구한 최신 논문이다. 실행 중인 프로그램의 다양한 측면(변수 값, 호출 스택, 실행 흐름)을 동시에 시각화하는 방법을 탐구한다. BlockPy의 단계 실행 인터프리터와 스프라이트 시각화가 라이브 프로그래밍 환경 연구 맥락에서 어떻게 위치하는지 설명하는 데 활용할 수 있는 최신 참고 논문이다.
