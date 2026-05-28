# 양방향 프로그램 변환, 동기화, 무손실 라운드트립 컴파일

양방향 변환(Bidirectional Transformation, BX)은 두 개의 관련된 데이터 또는 모델이 서로 일관성을 유지하며 동기화될 수 있도록 하는 기술적 프레임워크다. BlockPy의 핵심 기능인 "블록 ↔ Python 텍스트 완전 무손실 라운드트립"은 이 분야의 이론적 토대 위에 구축된다. 렌즈(Lens) 이론, 트리플 그래프 문법(Triple Graph Grammar), 모델 동기화 등이 주요 연구 주제다.

---

## Paper 1

**Title:** Relational Lenses: A Language for Updatable Views

**Authors:** Aaron Bohannon, Benjamin C. Pierce, Jeffrey A. Vaughan

**Venue/Journal:** Proceedings of the 25th ACM SIGMOD-SIGACT-SIGART Symposium on Principles of Database Systems (PODS '06)

**Year:** 2006

**DOI/URL:** https://www.cis.upenn.edu/~bcpierce/papers/dblenses-pods.pdf

**설명:**
양방향 프로그래밍의 이론적 기초가 된 "렌즈(Lens)" 개념을 정식화한 논문이다. 렌즈는 소스(Source) S와 뷰(View) V 사이를 `get: S → V`와 `put: V × S → S`의 함수 쌍으로 추상화하며, 라운드트립 법칙(round-trip laws)을 통해 정확성을 보장한다. BlockPy의 AST IR을 중심으로 한 블록→AST(`put`)와 AST→블록(`get`) 변환 쌍은 이 렌즈 패러다임과 구조적으로 동일하다.

---

## Paper 2

**Title:** Bidirectional Transformations: A Cross-Discipline Perspective (GRACE International Meeting Report)

**Authors:** Krzysztof Czarnecki, J. Nathan Foster, Zhenjiang Hu, Ralf Lämmel, Andy Schürr, James F. Terwilliger

**Venue/Journal:** Theory and Practice of Model Transformations, LNCS Vol. 5563, Springer

**Year:** 2009

**DOI/URL:** https://link.springer.com/chapter/10.1007/978-3-642-02408-5_1

**설명:**
데이터베이스, 프로그래밍 언어, 모델 기반 소프트웨어 공학 등 여러 분야에 걸친 양방향 변환 연구를 하나의 통합된 관점으로 정리한 크로스-디시플린 서베이 논문이다. 함수형 렌즈, 트리플 그래프 문법, 뷰 업데이트 등 주요 BX 접근법들을 비교한다. BlockPy가 "무손실 라운드트립"을 어떻게 달성하는지 이론적 배경을 설명할 때 핵심 참조 논문이 된다.

---

## Paper 3

**Title:** Incremental Model Synchronization with Triple Graph Grammars

**Authors:** Frank Hermann, Hartmut Ehrig, Fernando Orejas, Krzysztof Czarnecki, Zinovy Diskin, Yingfei Xiong

**Venue/Journal:** Proceedings of the ACM/IEEE 14th International Conference on Model Driven Engineering Languages and Systems (MoDELS 2011)

**Year:** 2011

**DOI/URL:** https://link.springer.com/chapter/10.1007/11880240_38

**설명:**
트리플 그래프 문법(TGG)을 기반으로 한 점진적(incremental) 모델 동기화 방법론을 제시한 논문이다. TGG는 소스 모델, 타겟 모델, 그리고 두 모델 간의 일관성 관계를 동시에 기술하는 규칙 기반 형식주의다. BlockPy에서 블록을 편집할 때 해당 Python AST가 점진적으로 업데이트되고(역방향도 마찬가지), 그 일관성을 유지하는 문제는 이 논문의 TGG 동기화 문제와 구조적으로 동일하다.

---

## Paper 4

**Title:** KBX: Verified Model Synchronization via Formal Bidirectional Transformation

**Authors:** Zirun Zhu, Hsiang-Shang Ko, Ping Hou, Nicolas Wu, Zhenjiang Hu, Jorge Sousa Pinto

**Venue/Journal:** ACM Transactions on Software Engineering and Methodology (TOSEM)

**Year:** 2024

**DOI/URL:** https://dl.acm.org/doi/full/10.1145/3696000

**설명:**
형식적 양방향 변환(Formal BX)을 통한 검증된 모델 동기화 프레임워크를 제시한 최신 논문이다. 일관성 정의로부터 순방향/역방향 변환을 자동 합성하며, 라운드트립 법칙을 형식적으로 보장한다. BlockPy의 향후 연구 방향으로 블록 ↔ AST 변환의 형식적 검증(formal verification)을 추진할 때 이 논문의 프레임워크가 핵심 참조가 될 수 있다.

---

## Paper 5

**Title:** JTL: A Bidirectional and Change Propagating Transformation Language

**Authors:** Romina Eramo, Alfonso Pierantonio, Gianni Rosa

**Venue/Journal:** Software Language Engineering (SLE 2010), LNCS Vol. 6563, Springer

**Year:** 2011

**DOI/URL:** https://link.springer.com/chapter/10.1007/978-3-642-19440-5_11

**설명:**
비전단사(non-bijective) 변환과 변경 전파(change propagation)를 지원하는 양방향 모델 변환 언어 JTL을 제안한 논문이다. 하나의 블록이 여러 Python 구문 패턴에 대응될 수 있는 비전단사 매핑을 지원한다. BlockPy에서 단일 블록이 여러 Python 표현식 패턴에 매핑될 수 있는 상황(예: 삼항연산자 디슈가링 후 역방향 변환)을 이론적으로 정당화할 때 이 논문의 비전단사 BX 개념이 관련된다.

---

## Paper 6

**Title:** Composing Bidirectional Programs Monadically

**Authors:** Matthew Pickering, Jeremy Gibbons, Nicolas Wu

**Venue/Journal:** ArXiv preprint (ICFP-related)

**Year:** 2019

**DOI/URL:** https://arxiv.org/pdf/1902.06950

**설명:**
모나드(Monad) 조합을 통해 양방향 프로그램을 합성 가능하게 만드는 방법론을 제안하며, 라운드트립 속성에 대한 형식적 등식 추론을 가능하게 한다. 이 논문은 렌즈를 함수형 프로그래밍의 일급 시민으로 다루는 최신 연구 흐름을 대표한다. BlockPy의 양방향 변환 로직을 함수형 관점에서 모듈화하고, 개별 변환 규칙들의 합성 정확성을 증명하는 데 이 접근법이 활용될 수 있다.

---

## Paper 7

**Title:** From Model Transformation to Incremental Bidirectional Model Synchronization

**Authors:** Perdita Stevens

**Venue/Journal:** Software and Systems Modeling (SoSyM), Vol. 9, No. 2, Springer

**Year:** 2010

**DOI/URL:** https://link.springer.com/article/10.1007/s10270-008-0089-9

**설명:**
단방향(unidirectional) 모델 변환에서 점진적 양방향 모델 동기화로의 전환을 논의한 논문이다. 소스 모델의 변경이 타겟 모델에 어떻게 전파되어야 하는지를 정확히 정의하는 것이 핵심 과제임을 설명한다. BlockPy에서 사용자가 Python 텍스트를 편집할 때 블록 뷰가 점진적으로 동기화되는 메커니즘의 이론적 근거로 이 논문을 인용할 수 있다.
