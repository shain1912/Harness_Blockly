import React, { useState, useEffect, useRef } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';

function highlight(code) {
  return Prism.highlight(code, Prism.languages.python, 'python');
}

export default function PythonEditor({
  code,
  onCodeChange,
  onSyncToBlocks,
  syntaxStatus,
  highlightedLine,
  onLoadExample
}) {
  // Demo snippets grouped by category (single source of truth: window.BlockPyExamples)
  const examples = (typeof window !== 'undefined' && window.BlockPyExamples) || [];
  const examplesByCategory = examples.reduce((groups, snippet) => {
    (groups[snippet.category] = groups[snippet.category] || []).push(snippet);
    return groups;
  }, {});
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const textareaRef = useRef(null);
  const preRef = useRef(null);
  const lineNumbersRef = useRef(null);

  const syncScroll = (e) => {
    const { scrollTop, scrollLeft } = e.target;
    if (preRef.current) {
      preRef.current.scrollTop = scrollTop;
      preRef.current.scrollLeft = scrollLeft;
    }
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = scrollTop;
    }
  };

  const handleCursorMove = (e) => {
    const textarea = e.target;
    const textBeforeCursor = textarea.value.substring(0, textarea.selectionStart);
    const lines = textBeforeCursor.split('\n');
    setCursorPos({
      line: lines.length,
      col: lines[lines.length - 1].length + 1
    });
  };

  const handleKeyDown = (e) => {
    // Tab key → insert 4 spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart, selectionEnd, value } = e.target;
      const newVal = value.substring(0, selectionStart) + '    ' + value.substring(selectionEnd);
      onCodeChange(newVal);
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = selectionStart + 4;
          textareaRef.current.selectionEnd = selectionStart + 4;
        }
      });
    }
  };

  const linesCount = code.split('\n').length;
  const highlightedHtml = highlight(code + '\n'); // trailing \n keeps last line height

  return (
    <div className="editor-card" id="editor-card">
      <div className="panel-header">
        <div className="panel-title-group">
          <i className="fa-brands fa-python icon-yellow"></i>
          <h3>Python Source Editor</h3>
        </div>
        <div className="panel-actions">
          {examples.length > 0 && (
            <select
              id="example-picker"
              className="example-picker"
              defaultValue=""
              title="데모 예제 불러오기"
              onChange={(e) => {
                const sn = examples.find((s) => s.id === e.target.value);
                if (sn && onLoadExample) onLoadExample(sn);
              }}
            >
              <option value="" disabled>예제 선택…</option>
              {Object.entries(examplesByCategory).map(([category, items]) => (
                <optgroup key={category} label={category}>
                  {items.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
          <div
            id="syntax-status-text"
            className={`syntax-status ${syntaxStatus.valid ? 'valid' : 'invalid'}`}
          >
            {syntaxStatus.valid ? (
              <><i className="fa-solid fa-circle-check"></i> Code Valid</>
            ) : (
              <><i className="fa-solid fa-circle-xmark"></i> Parser Error: {syntaxStatus.error.substring(0, 30)}...</>
            )}
          </div>
          <button
            className="btn btn-primary btn-sm btn-glow"
            id="btn-sync-to-blocks"
            onClick={onSyncToBlocks}
            title="Convert to Visual Blocks (F4)"
          >
            <i className="fa-solid fa-sync"></i> Convert
          </button>
        </div>
      </div>

      <div className="code-editor-wrapper">
        {/* Line Numbers */}
        <div ref={lineNumbersRef} id="line-numbers" className="line-numbers">
          {Array.from({ length: linesCount }).map((_, i) => {
            const lineNum = i + 1;
            return (
              <div key={lineNum} className={lineNum === highlightedLine ? 'line-highlight' : ''}>
                {lineNum}
              </div>
            );
          })}
        </div>

        {/* Edit area: pre + textarea stacked */}
        <div className="edit-area">
          {/* Syntax-highlighted backdrop */}
          <pre
            ref={preRef}
            className="highlight-layer"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />

          {/* Editable textarea (transparent text, visible caret) */}
          <textarea
            ref={textareaRef}
            id="python-code"
            value={code}
            onChange={(e) => { onCodeChange(e.target.value); handleCursorMove(e); }}
            onScroll={syncScroll}
            onKeyDown={handleKeyDown}
            onKeyUp={handleCursorMove}
            onSelect={handleCursorMove}
            onClick={handleCursorMove}
            placeholder="# Start writing Python code here..."
            spellCheck="false"
            className="code-textarea"
          />
        </div>
      </div>

      <div className="editor-footer">
        <div className="editor-pos">Ln {cursorPos.line}, Col {cursorPos.col}</div>
        <div className="editor-mode">Python 3 (Sandbox Mode)</div>
      </div>
    </div>
  );
}
