# AI/LLM 보조 프로그래밍, 코드 생성, 자연어→코드

대형 언어 모델(Large Language Model, LLM)의 등장은 프로그래밍 교육과 소프트웨어 개발 환경을 근본적으로 변화시키고 있다. BlockPy의 두 가지 핵심 AI 기능인 "동적 라이브러리 추상화"(Claude가 import 분석 → Blockly 블록 자동 생성)와 "AI 바이브 코딩 에이전트"(자연어 → Python → Blockly 자동 변환)는 이 분야 최신 연구의 최전선에 있다. 이 섹션은 LLM 기반 코드 생성, 교육적 활용, 그리고 엔드유저 프로그래밍 지원에 관한 핵심 연구들을 정리한다.

---

## Paper 1

**Title:** Evaluating Large Language Models Trained on Code

**Authors:** Mark Chen, Jerry Tworek, Heewoo Jun, Qiming Yuan, Henrique Ponde de Oliveira Pinto, Jared Kaplan, Harrison Edwards, Yuri Burda, Nicholas Joseph, et al. (OpenAI)

**Venue/Journal:** ArXiv preprint (arXiv:2107.03374)

**Year:** 2021

**DOI/URL:** https://arxiv.org/abs/2107.03374

**설명:**
OpenAI의 Codex 모델을 소개하고 평가한 기념비적 논문이다. GPT-3를 GitHub의 공개 코드로 파인튜닝하여 자연어 독스트링에서 Python 함수를 생성하는 Codex를 제안하며, HumanEval 벤치마크(164개 프로그래밍 문제)를 도입했다. Codex는 단일 시도에서 28.8%, 100번 샘플링 시 70.2%의 문제를 해결했다. BlockPy의 AI 바이브 코딩 에이전트가 사용하는 Claude API는 이 Codex 연구의 후속 세대 모델로, 이 논문은 LLM 코드 생성 분야의 베이스라인을 정의한다.

---

## Paper 2

**Title:** Studying the Effect of AI Code Generators on Supporting Novice Learners in Introductory Programming

**Authors:** Majeed Kazemitabaar, Justin Chow, Carl Ka To Ma, Barbara J. Ericson, David Weintrop, Tovi Grossman

**Venue/Journal:** Proceedings of the 2023 CHI Conference on Human Factors in Computing Systems (CHI '23)

**Year:** 2023

**DOI/URL:** https://dl.acm.org/doi/10.1145/3544548.3580919

**설명:**
AI 코드 생성기(OpenAI Codex)가 초보 프로그래밍 학습자를 지원하는 효과를 연구한 논문이다. Codex를 사용한 학생들이 코드 완성률 1.15배, 점수 1.8배 향상을 보이면서도 수동 코드 수정 능력은 저하되지 않았음을 발견했다. BlockPy의 AI 바이브 코딩이 학습자의 Python 이해를 돕는 발판(scaffold)이 될 수 있음을 지지하는 핵심 실증 연구다. 과도한 의존성 문제를 예방하기 위한 설계 시사점도 제공한다.

---

## Paper 3

**Title:** Generative AI for Programming Education: Benchmarking ChatGPT, GPT-4, and Human Tutors

**Authors:** Tung Phung, Victor-Alexandru Pădurean, Anjali Singh, Christopher Brooks, José Cambronero, Sumit Gulwani, Adish Singla, Gustavo Soares

**Venue/Journal:** Proceedings of the 2023 ACM Conference on International Computing Education Research (ICER '23)

**Year:** 2023

**DOI/URL:** https://dl.acm.org/doi/abs/10.1145/3568812.3603476

**설명:**
ChatGPT, GPT-4, 그리고 인간 튜터의 프로그래밍 교육 시나리오 수행 능력을 체계적으로 비교 평가한 연구다. 코드 설명, 버그 수정, 힌트 제공 등 다양한 교육적 시나리오에서 GPT-4가 2023년 7월 기준 시험 점수의 99.5%를 달성했음을 보고한다. BlockPy의 AI 기능이 활용하는 Claude API 성능이 이 연구에서 벤치마킹된 GPT-4 수준의 LLM과 동등하거나 그 이상임을 논문에서 주장할 근거를 제공한다.

---

## Paper 4

**Title:** From "Ban It Till We Understand It" to "Resistance is Futile": How University Programming Instructors Plan to Adapt as More Students Use AI Code Generation and Explanation Tools

**Authors:** Sam Lau, Philip J. Guo

**Venue/Journal:** Proceedings of the 2023 ACM Conference on International Computing Education Research (ICER '23)

**Year:** 2023

**DOI/URL:** https://dl.acm.org/doi/10.1145/3568813.3600138

**설명:**
ChatGPT와 GitHub Copilot 같은 AI 코드 생성 도구에 대응하는 대학 프로그래밍 교육자들의 인식과 적응 전략을 질적 연구한 논문이다. "금지"에서 "통합 활용"으로의 패러다임 전환을 분석하며, AI를 교육 도구로 설계하는 방향을 논의한다. BlockPy의 AI 바이브 코딩이 단순한 코드 생성이 아니라 Blockly 블록으로의 변환까지 수행함으로써 학습자의 이해를 돕는 교육적 설계를 강조할 때 이 논문의 프레임워크가 유용하다.

---

## Paper 5

**Title:** "It's Weird That It Knows What I Want": Usability and Interactions with Copilot for Novice Programmers

**Authors:** Majeed Kazemitabaar, Xinying Hou, Austin Z. Henley, Barbara J. Ericson, David Weintrop, Tovi Grossman

**Venue/Journal:** ACM Transactions on Computer-Human Interaction (TOCHI), Vol. 30, No. 5

**Year:** 2023

**DOI/URL:** https://dl.acm.org/doi/10.1145/3617367

**설명:**
GitHub Copilot을 사용하는 초보 프로그래머들의 경험과 상호작용 패턴을 심층 사용자 연구(user study)한 논문이다. 초보자들이 Copilot의 제안을 비판적으로 평가하는 데 어려움을 겪으며, AI 제안이 학습 과정을 방해할 수 있음을 발견했다. BlockPy에서 AI가 생성한 코드를 즉시 Blockly 블록으로 변환하여 시각적으로 보여주는 기능이 이런 "블랙박스" 문제를 해결하는 설계 혁신으로 논문에서 제시할 수 있다.

---

## Paper 6

**Title:** Natural Language Generation and Understanding of Big Code for AI-Assisted Programming: A Review

**Authors:** (NIH/PubMed, 2023)

**Venue/Journal:** Entropy (MDPI), Vol. 25, No. 6

**Year:** 2023

**DOI/URL:** https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10297336/

**설명:**
자연어 처리(NLP)와 코드 생성의 교차점에 있는 AI 보조 프로그래밍 연구를 포괄적으로 검토한 서베이 논문이다. 코드 생성, 코드 검색, 코드 요약, 코드 번역 등 다양한 태스크에서의 LLM 성능과 한계를 분석한다. BlockPy의 "동적 라이브러리 추상화" 기능(AI가 Python import 문 분석 → Blockly 블록 자동 생성)이 이 서베이가 정의하는 "코드 이해 및 변환" 태스크의 새로운 응용임을 논문에서 위치 지을 수 있다.

---

## Paper 7

**Title:** Large Language Models in Computer Science Education: A Systematic Literature Review

**Authors:** (Multiple authors, ACM SIGCSE 2025)

**Venue/Journal:** Proceedings of the 56th ACM Technical Symposium on Computer Science Education (SIGCSE TS '25)

**Year:** 2025

**DOI/URL:** https://dl.acm.org/doi/10.1145/3641554.3701863

**설명:**
CS 교육에서 LLM 활용에 관한 포괄적인 체계적 문헌 고찰이다. 코드 생성, 코드 설명, 디버깅 지원, 자동 채점 등 다양한 교육 응용을 체계적으로 분류하고 분석한다. BlockPy의 AI 기능(바이브 코딩 에이전트, 동적 블록 생성)이 이 분야의 연구 지형에서 어디에 위치하는지 파악하고, 논문의 "관련 연구" 섹션을 구성하는 데 필수적인 최신 서베이다.

---

## Paper 8

**Title:** How Novices Use LLM-Based Code Generators to Solve CS1 Coding Tasks in a Self-Paced Learning Environment

**Authors:** (ArXiv, 2023)

**Venue/Journal:** ArXiv preprint (EDM/ICER related)

**Year:** 2023

**DOI/URL:** https://arxiv.org/pdf/2309.14049

**설명:**
자기주도 학습 환경에서 초보 학생들이 LLM 기반 코드 생성기를 어떻게 활용하는지 관찰한 연구다. 학생들이 프롬프트 작성 전략을 발전시키고, 생성된 코드를 부분적으로 수정하는 패턴을 보임을 분석한다. BlockPy의 AI 바이브 코딩 에이전트가 자연어 프롬프트를 통해 Python을 생성하고 이를 Blockly로 변환하는 시나리오에서 학생들이 어떻게 상호작용할지를 예측하는 데 이 연구의 관찰 결과가 활용된다.
