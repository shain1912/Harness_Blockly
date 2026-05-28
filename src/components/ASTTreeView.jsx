import React, { useState, useEffect } from 'react';

// Recursive Helper Component to render individual AST nodes
function ASTNodeView({ node, onHoverLine, onLeaveLine }) {
  const [isOpen, setIsOpen] = useState(true);

  if (!node) return null;

  let hasChildren = false;
  let detailsText = '';
  let detailsNodes = [];
  let childrenNodes = [];

  // Categorize rendering based on AST type
  switch (node.type) {
    case 'Program':
      hasChildren = node.body && node.body.length > 0;
      if (hasChildren) {
        childrenNodes = node.body.map((stmt, idx) => (
          <ASTNodeView 
            key={idx} 
            node={stmt} 
            onHoverLine={onHoverLine} 
            onLeaveLine={onLeaveLine} 
          />
        ));
      }
      break;

    case 'Assign':
      hasChildren = true;
      detailsNodes.push(
        <span key="target-label" className="ast-prop">target=</span>
      );
      detailsNodes.push(
        <ASTNodeView 
          key="target-node" 
          node={node.target} 
          onHoverLine={onHoverLine} 
          onLeaveLine={onLeaveLine} 
        />
      );
      detailsNodes.push(
        <span key="value-label" className="ast-prop"> value=</span>
      );
      childrenNodes.push(
        <ASTNodeView 
          key="value-node" 
          node={node.value} 
          onHoverLine={onHoverLine} 
          onLeaveLine={onLeaveLine} 
        />
      );
      break;

    case 'AugAssign':
      hasChildren = true;
      detailsNodes.push(
        <span key="desc" className="ast-prop">
          target=<span className="ast-val">{node.target?.id || 'var'}</span> op=<span className="ast-val">{node.op}</span> value=
        </span>
      );
      childrenNodes.push(
        <ASTNodeView 
          key="value-node" 
          node={node.value} 
          onHoverLine={onHoverLine} 
          onLeaveLine={onLeaveLine} 
        />
      );
      break;

    case 'For':
      hasChildren = true;
      detailsNodes.push(
        <span key="desc" className="ast-prop">
          target=<span className="ast-val">{node.target?.id || 'var'}</span>
        </span>
      );
      childrenNodes.push(
        <div key="iter-wrapper" className="ast-node">
          <span className="ast-prop">iter=</span>
          <ASTNodeView node={node.iter} onHoverLine={onHoverLine} onLeaveLine={onLeaveLine} />
        </div>
      );
      childrenNodes.push(
        <div key="body-wrapper" className="ast-node">
          <span className="ast-prop">body=</span>
          {node.body.map((stmt, idx) => (
            <ASTNodeView key={idx} node={stmt} onHoverLine={onHoverLine} onLeaveLine={onLeaveLine} />
          ))}
        </div>
      );
      break;

    case 'While':
      hasChildren = true;
      childrenNodes.push(
        <div key="test-wrapper" className="ast-node">
          <span className="ast-prop">test=</span>
          <ASTNodeView node={node.test} onHoverLine={onHoverLine} onLeaveLine={onLeaveLine} />
        </div>
      );
      childrenNodes.push(
        <div key="body-wrapper" className="ast-node">
          <span className="ast-prop">body=</span>
          {node.body.map((stmt, idx) => (
            <ASTNodeView key={idx} node={stmt} onHoverLine={onHoverLine} onLeaveLine={onLeaveLine} />
          ))}
        </div>
      );
      break;

    case 'If':
      hasChildren = true;
      childrenNodes.push(
        <div key="test-wrapper" className="ast-node">
          <span className="ast-prop">test=</span>
          <ASTNodeView node={node.test} onHoverLine={onHoverLine} onLeaveLine={onLeaveLine} />
        </div>
      );
      childrenNodes.push(
        <div key="body-wrapper" className="ast-node">
          <span className="ast-prop">body=</span>
          {node.body.map((stmt, idx) => (
            <ASTNodeView key={idx} node={stmt} onHoverLine={onHoverLine} onLeaveLine={onLeaveLine} />
          ))}
        </div>
      );
      if (node.orelse && node.orelse.length > 0) {
        childrenNodes.push(
          <div key="else-wrapper" className="ast-node">
            <span className="ast-prop">orelse=</span>
            {node.orelse.map((stmt, idx) => (
              <ASTNodeView key={idx} node={stmt} onHoverLine={onHoverLine} onLeaveLine={onLeaveLine} />
            ))}
          </div>
        );
      }
      break;

    case 'Call':
      hasChildren = node.args && node.args.length > 0;
      detailsNodes.push(
        <span key="func-label" className="ast-prop">func=</span>
      );
      detailsNodes.push(
        <ASTNodeView 
          key="func-node" 
          node={node.func} 
          onHoverLine={onHoverLine} 
          onLeaveLine={onLeaveLine} 
        />
      );
      if (hasChildren) {
        node.args.forEach((arg, idx) => {
          childrenNodes.push(
            <div key={`arg-${idx}`} className="ast-node">
              <span className="ast-prop">arg[{idx}]=</span>
              <ASTNodeView node={arg} onHoverLine={onHoverLine} onLeaveLine={onLeaveLine} />
            </div>
          );
        });
      }
      break;

    case 'ListComp':
      hasChildren = true;
      detailsNodes.push(
        <span key="desc" className="ast-prop">
          target=<span className="ast-val">{node.target?.id || 'var'}</span>
        </span>
      );
      childrenNodes.push(
        <div key="elt-wrapper" className="ast-node">
          <span className="ast-prop">elt=</span>
          <ASTNodeView node={node.elt} onHoverLine={onHoverLine} onLeaveLine={onLeaveLine} />
        </div>
      );
      childrenNodes.push(
        <div key="iter-wrapper" className="ast-node">
          <span className="ast-prop">iter=</span>
          <ASTNodeView node={node.iter} onHoverLine={onHoverLine} onLeaveLine={onLeaveLine} />
        </div>
      );
      break;

    case 'Ternary':
      hasChildren = true;
      childrenNodes.push(
        <div key="test-wrapper" className="ast-node">
          <span className="ast-prop">test=</span>
          <ASTNodeView node={node.test} onHoverLine={onHoverLine} onLeaveLine={onLeaveLine} />
        </div>
      );
      childrenNodes.push(
        <div key="body-wrapper" className="ast-node">
          <span className="ast-prop">body=</span>
          <ASTNodeView node={node.body} onHoverLine={onHoverLine} onLeaveLine={onLeaveLine} />
        </div>
      );
      childrenNodes.push(
        <div key="else-wrapper" className="ast-node">
          <span className="ast-prop">orelse=</span>
          <ASTNodeView node={node.orelse} onHoverLine={onHoverLine} onLeaveLine={onLeaveLine} />
        </div>
      );
      break;

    case 'Attribute':
      detailsText = ` value=${node.value?.id || 'val'} attr="${node.attr}"`;
      break;

    case 'Name':
      detailsText = ` id=${node.id}`;
      break;

    case 'Num':
      detailsNodes.push(
        <span key="desc" className="ast-prop">
          value=<span className="ast-val number">{node.value}</span>
        </span>
      );
      break;

    case 'Str':
      detailsNodes.push(
        <span key="desc" className="ast-prop">
          value=<span className="ast-val string">"{node.value}"</span>
        </span>
      );
      break;

    case 'Bool':
      detailsText = ` value=${node.value ? 'True' : 'False'}`;
      break;

    case 'BinOp':
      detailsText = ` op=${node.op}`;
      hasChildren = true;
      if (node.left) {
        childrenNodes.push(
          <div key="left" className="ast-node">
            <span className="ast-prop">left=</span>
            <ASTNodeView node={node.left} onHoverLine={onHoverLine} onLeaveLine={onLeaveLine} />
          </div>
        );
      }
      childrenNodes.push(
        <div key="right" className="ast-node">
          <span className="ast-prop">right=</span>
          <ASTNodeView node={node.right} onHoverLine={onHoverLine} onLeaveLine={onLeaveLine} />
        </div>
      );
      break;

    case 'Range':
      hasChildren = true;
      childrenNodes.push(
        <div key="start" className="ast-node">
          <span className="ast-prop">start=</span>
          <ASTNodeView node={node.start} onHoverLine={onHoverLine} onLeaveLine={onLeaveLine} />
        </div>
      );
      childrenNodes.push(
        <div key="stop" className="ast-node">
          <span className="ast-prop">stop=</span>
          <ASTNodeView node={node.stop} onHoverLine={onHoverLine} onLeaveLine={onLeaveLine} />
        </div>
      );
      break;

    case 'Import':
      detailsText = ` lib=${node.names?.[0]?.name || ''}`;
      break;

    default:
      detailsText = '';
  }

  return (
    <div className="ast-node">
      <div 
        className="ast-node-header" 
        title={`Line ${node.line}`}
        onMouseOver={(e) => {
          e.stopPropagation();
          onHoverLine(node.line);
        }}
        onMouseLeave={onLeaveLine}
      >
        <span 
          className="ast-toggle" 
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) setIsOpen(!isOpen);
          }}
        >
          {hasChildren ? (
            isOpen ? (
              <i className="fa-solid fa-chevron-down"></i>
            ) : (
              <i className="fa-solid fa-chevron-right"></i>
            )
          ) : (
            <i className="fa-solid fa-circle-notch" style={{ fontSize: '0.5rem', opacity: 0.3 }}></i>
          )}
        </span>
        <span className="ast-type">{node.type}</span>
        {detailsText && <span className="ast-details">{detailsText}</span>}
        {detailsNodes.length > 0 && <span className="ast-details">{detailsNodes}</span>}
      </div>
      {hasChildren && isOpen && (
        <div className="ast-node-children">
          {childrenNodes}
        </div>
      )}
    </div>
  );
}

export default function ASTTreeView({ code, onHoverLine, onLeaveLine }) {
  const [ast, setAst] = useState(null);
  const [parseError, setParseError] = useState(null);

  useEffect(() => {
    try {
      const lexer = new window.BlockPyParser.Tokenizer(code);
      const tokens = lexer.tokenize();
      const parser = new window.BlockPyParser.Parser(tokens);
      const parsedAst = parser.parse();
      setAst(parsedAst);
      setParseError(null);
    } catch (err) {
      setParseError(err.message);
    }
  }, [code]);

  return (
    <div className="ast-card">
      <div className="panel-header">
        <div className="panel-title-group">
          <i className="fa-solid fa-network-wired icon-cyan"></i>
          <h3>Interactive AST Explorer</h3>
        </div>
      </div>
      <div id="ast-tree-view" className="ast-body">
        {parseError && !ast ? (
          <div className="tree-placeholder error">
            AST Parsing error: {parseError}
          </div>
        ) : ast ? (
          <ASTNodeView 
            node={ast} 
            onHoverLine={onHoverLine} 
            onLeaveLine={onLeaveLine} 
          />
        ) : (
          <div className="tree-placeholder">
            Loading AST...
          </div>
        )}
      </div>
    </div>
  );
}
