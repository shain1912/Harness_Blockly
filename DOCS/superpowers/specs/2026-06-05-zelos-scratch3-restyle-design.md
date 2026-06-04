# 설계: zelos(Scratch3) 렌더러 + 밝은 라이트 테마 (2026-06-05)

## 배경 / 목표

블록 비주얼을 MakeCode/Scratch3(레거시 코드) 형식으로 전환한다. Blockly의 **`zelos`
렌더러**가 곧 Scratch3/MakeCode의 둥글고 통통한 룩이며 CDN core(`blockly_compressed.js`)에
이미 포함되어 있으므로, 렌더러를 `geras` → `zelos`로 바꾸면 **모든 블록(표준 + 커스텀)이
일괄 전환**된다("나머지 전부"가 렌더러로 해결). 색 테마는 사용자 선택에 따라 **밝은
Scratch3/MakeCode 라이트**로 간다.

## 비목표

블록별 모양 커스텀 mutator, 커스텀 블록(sprite_*/cv2_*) 색 전면 재배색(현재 색 유지),
앱 셸(좌우 패널) 라이트화(다크 cyber 유지 — Blockly 캔버스만 라이트).

## 현재 상태

`src/components/BlocklyEditor.jsx`: `Blockly.inject(..., { renderer: 'geras', theme:
getBlocklyTheme() })`. `getBlocklyTheme()`는 `Themes.Classic` 기반 `cyber_dark`(다크 배경
+ 어두운 카테고리 색). `index.css`: `#blockly-div { background: #0c0f1b !important; }` +
`.light-theme #blockly-div { background:#f1f5f9 !important; }`. inject `grid.colour:
'rgba(255,255,255,0.05)'`.

## 상세 설계

### 1. 렌더러 전환 (`BlocklyEditor.jsx`)
`renderer: 'geras'` → `renderer: 'zelos'`. 커스텀 블록(sprite_*, cv2_*, method_def,
+/- FieldImage 버튼 포함)은 표준 블록 정의 API로 만들어졌으므로 zelos에서 자동 렌더.

### 2. 라이트 테마 `scratch_light` (`getBlocklyTheme()` 교체)

```js
window.Blockly.Theme.defineTheme('scratch_light', {
  'base': window.Blockly.Themes.Zelos,   // Classic -> Zelos
  'componentStyles': {
    'workspaceBackgroundColour': '#f8fafc',
    'toolboxBackgroundColour': '#ffffff',
    'toolboxForegroundColour': '#334155',
    'flyoutBackgroundColour': '#f1f5f9',
    'flyoutForegroundColour': '#334155',
    'flyoutOpacity': 1,
    'scrollbarColour': '#cbd5e1',
    'scrollbarOpacity': 0.6,
    'insertionMarkerColour': '#334155',
    'insertionMarkerOpacity': 0.3,
    'cursorColour': '#334155'
  },
  'blockStyles': {
    'logic_blocks':    { 'colourPrimary': '#4C97FF' },
    'loop_blocks':     { 'colourPrimary': '#FFAB19' },
    'math_blocks':     { 'colourPrimary': '#59C059' },
    'text_blocks':     { 'colourPrimary': '#5CB1D6' },
    'list_blocks':     { 'colourPrimary': '#9966FF' },
    'variable_blocks': { 'colourPrimary': '#FF8C1A' },
    'procedure_blocks':{ 'colourPrimary': '#FF6680' }
  }
});
```
(`Themes.Zelos`가 CDN core에 있으면 사용; 만일 없으면 `Themes.Classic`로 폴백 — 코드에서
`window.Blockly.Themes.Zelos || window.Blockly.Themes.Classic` 가드.) 커스텀 블록은 각자의
`setColour()` 유지(이미 비비드).

### 3. 그리드 / 배경 정리

- `BlocklyEditor.jsx` inject `grid.colour`: `'rgba(255,255,255,0.05)'` →
  `'rgba(0,0,0,0.06)'` (라이트 배경에서 보이는 옅은 십자 그리드).
- `src/index.css` `#blockly-div`: `background: #0c0f1b !important;` →
  `background: #f8fafc !important;` (테마 workspace 배경과 일치, 로드 시 다크 플래시 제거).
  `.light-theme #blockly-div`는 그대로 둠(이미 라이트, 정합).

### 4. 영향 파일

- `src/components/BlocklyEditor.jsx` — 렌더러, 테마(componentStyles/blockStyles), grid.colour.
- `src/index.css` — `#blockly-div` 배경 1줄.
- parser/생성기/변환/직렬화 무관(렌더러는 데이터에 영향 없음).

### 5. 엣지 / 리스크

| 항목 | 처리 |
|---|---|
| `Themes.Zelos` 부재 | `|| Themes.Classic` 폴백 가드 |
| 앱 셸 다크 + 캔버스 라이트 | 의도된 "라이트 아일랜드"(Scratch/MakeCode 캔버스 동일 컨셉) |
| zelos 큰 블록으로 레이아웃 변화 | 차원 단언 테스트 없음(gallery는 bbox>0만 확인) — 무영향 |
| 커스텀 블록 색이 라이트 배경서 흐릴 가능 | 현 색 유지, 필요 시 후속 미세조정(YAGNI) |

### 6. 테스트 / 검증

- **렌더러 잠금 회귀**(신규 e2e, `tests/zelos_renderer.spec.js`): 앱 부팅 후
  `window.__blocklyWorkspace.getRenderer().getClassName()` 또는
  `window.__blocklyWorkspace.options.renderer`가 `'zelos'`를 가리키는지 단언.
- **무회귀**: `examples_gallery_blocks`(블록 렌더 + 코드 재생성), `arity_buttons`,
  `method_def`, `random_roundtrip`, `realistic_roundtrip` 전체 통과 확인(렌더러는 변환·
  직렬화 무관).
- **시각 확인**: 앱 구동 → Blockly 탭 → 스크린샷으로 Scratch3 룩 육안 확인(보고 첨부).
