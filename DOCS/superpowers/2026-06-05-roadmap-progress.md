# 로드맵 진행 상황 (2026-06-05 자율 세션)

사용자 부재 중 자율 진행. 기준 문서: `specs/2026-06-05-ai-library-abstraction-roadmap.md`.

## 완료 (코드 + 테스트)

### P1 — 매크로 블록 모델 ✅
`src/utils/libraryAbstraction.js`에 **단방향(오서링 전용) 매크로 블록** 도입:

- `expandMacroTemplate(template, values)` — `{slotId}` 구멍을 슬롯 값으로 확장.
- `sampleValuesFor(spec)` — 슬롯 타입(number/string/value)별 파서-안전 기본값 생성.
- `validateMacroTemplate(spec, parser)` — **Invariant-2 게이트**: 템플릿을 확장해 코어 파서로
  파싱·`astToPython` round-trip 해 무손실인지 확인. 실패하면 `{ok:false, error}`.
- `LibraryAbstractionEngine.registerMacroBlock(spec)` — 검증 통과 시에만 Blockly 블록 +
  생성기 등록. value 슬롯 → 블록 연결, number/string 슬롯 → 인블록 편집 필드.
- `MACRO_PRESETS` — 검증된 초등학생용 프리셋 5종(손 인식 / 웹페이지 가져오기 / 웹캠 켜기 /
  그래프 그리기 / 표 데이터 분석). 한글 라벨, 영어 Python emit.

테스트: `tests/macro_block.spec.js` (6 케이스, 전부 green). 모든 프리셋이 Invariant-2 통과,
스펙 well-formed(고유 type, 모든 템플릿 구멍에 슬롯 존재) 검증.

### P4 — 1:1 유효성 하니스 / CI 게이트 ✅
`tests/validity_harness.spec.js` — 3계층:
- **Layer 1** (Invariant-1, 코어 무손실): 기존 코퍼스(random/realistic/method_def)가 권위 게이트.
- **Layer 2** (Invariant-2): 각 프리셋 템플릿이 코어로 무손실 round-trip.
- **Layer 3** (멱등성): 매크로가 emit한 Python이 코어 **fixpoint**(다시 돌려도 안 변함).

- `npm run test:validity` — 코어 코퍼스 + 매크로 계층을 한 명령으로 (78 tests green).
- `.github/workflows/validity.yml` — push/PR 머지 게이트 (GitHub Actions).

### 검증 베이스라인 ✅ (task #1)
전체 스위트: **184 passed / 12 failed / 2 skipped**. 메모리에 "4건"으로 적혀 있으나 실제 12건.
12건은 전부 블록 렌더링 e2e(아래)로, 이번 매크로 작업과 무관(순수 추가 변경).

## 사용자 결정 필요 (스캐폴드/보류)

### P2 — AI 생성 엔드포인트 (`/api/ai-abstract` 업글)
- **블로커**: MiniMax 키(`MINIMAX1..4`)가 `.env`에 있어야 실제 생성·테스트 가능. 현재 키 없이는
  503/휴리스틱 폴백.
- **제안**: 프롬프트에 "초등학생용·고수준·소수(2~6개)" 제약 + P1 스키마(`{type,name,slots,
  pythonTemplate,icon,colour,category}`) 강제 + 서버측 `validateMacroTemplate` 게이트(부적합
  템플릿 거부). → 키 제공 시 바로 구현.

### P3 — 큐레이션 UI
- **결정 필요**: 패널 위치/레이아웃(LibraryManager 탭 확장 vs 신규 모달), 편집 가능 필드 범위,
  승인→프리셋 저장 위치(localStorage vs 파일). UX 디자인이라 brainstorming 권장.

### P5 — 초등학생 폴리시 (i18n/난이도)
- **결정 필요**: 한글 라벨 i18n 구조(현재 프리셋에 한글 하드코딩 — i18n 맵으로 분리할지),
  난이도 레벨(초급/심화) 분류 기준, 아이콘 세트. 디자인 결정.

## 다음 추천 순서
P2(키 받으면) → P3(brainstorming으로 UX 확정) → P5(P3 위에서 폴리시).
