/* desugarer.js - AST Desugaring Compiler (Unrolling List Comp, Ternaries, Chained Comparisons) */

const BlockPyParser = typeof window !== 'undefined' ? window.BlockPyParser : require('./parser');

class ASTDesugarer {
  constructor() {
    this.tempCounter = 0;
    this.prependedStatements = [];
  }

  generateTempVar(prefix = '_temp') {
    return `${prefix}_${this.tempCounter++}`;
  }

  desugar(programNode) {
    if (!programNode || programNode.type !== 'Program') return programNode;
    this.tempCounter = 0;
    
    const desugaredBody = this.desugarSuite(programNode.body);
    return new BlockPyParser.ProgramNode(desugaredBody, programNode.line);
  }

  // Desugars a block of statements (suite)
  desugarSuite(statements) {
    if (!statements) return [];
    const newSuite = [];

    // Save current stack frame (parent prepended array)
    const parentPrepended = this.prependedStatements;

    for (const stmt of statements) {
      // Clear prepended statements stack for the current statement
      this.prependedStatements = [];

      // Recursively process this statement
      const processedStmt = this.visitNode(stmt);

      // If any statements were prepended (e.g., unrolled loops), add them first
      if (this.prependedStatements.length > 0) {
        newSuite.push(...this.prependedStatements);
      }
      
      if (processedStmt) {
        newSuite.push(processedStmt);
      }
    }

    // Restore parent stack frame
    this.prependedStatements = parentPrepended;

    return newSuite;
  }

  visitNode(node) {
    if (!node) return null;

    switch (node.type) {
      case 'Assign':
        node.target = this.visitNode(node.target);
        node.value = this.visitNode(node.value);
        return node;

      case 'AugAssign':
        node.target = this.visitNode(node.target);
        node.value = this.visitNode(node.value);
        return node;

      case 'For':
        node.target = this.visitNode(node.target);
        node.iter = this.visitNode(node.iter);
        node.body = this.desugarSuite(node.body);
        return node;

      case 'While':
        node.test = this.visitNode(node.test);
        node.body = this.desugarSuite(node.body);
        return node;

      case 'If':
        node.test = this.visitNode(node.test);
        node.body = this.desugarSuite(node.body);
        node.orelse = this.desugarSuite(node.orelse);
        return node;

      case 'Call':
        node.func = this.visitNode(node.func);
        node.args = node.args.map(arg => this.visitNode(arg));
        return node;

      case 'Attribute':
        node.value = this.visitNode(node.value);
        return node;

      case 'BinOp':
        // Detect chained comparisons: e.g. 10 < speed < 100
        if (node.op !== 'INDEX' && node.left && node.left.type === 'BinOp') {
          const compOps = ['==', '!=', '<', '>', '<=', '>='];
          if (compOps.includes(node.op) && compOps.includes(node.left.op)) {
            // Chained comparison unrolling:
            // (10 < speed) < 100  -->  (10 < speed) and (speed < 100)
            const leftComp = node.left;
            const middleTerm = leftComp.right; // "speed" term
            
            const newLeft = leftComp; // (10 < speed)
            const newRight = new BlockPyParser.BinOpNode(middleTerm, node.op, node.right, node.line); // (speed < 100)
            
            const andNode = new BlockPyParser.BinOpNode(newLeft, 'and', newRight, node.line);
            return this.visitNode(andNode);
          }
        }
        
        if (node.left) node.left = this.visitNode(node.left);
        node.right = this.visitNode(node.right);
        return node;

      case 'List':
        node.elts = node.elts.map(elt => this.visitNode(elt));
        return node;

      case 'Range':
        if (node.start) node.start = this.visitNode(node.start);
        node.stop = this.visitNode(node.stop);
        if (node.step) node.step = this.visitNode(node.step);
        return node;

      // -------------------------------------------------------------
      // CORE COMPILER REWRITE: List Comprehension Unrolling
      // -------------------------------------------------------------
      case 'ListComp': {
        // [x * 2 for x in items if x > 2]
        const elt = node.elt;
        const target = node.target;
        const iter = node.iter;
        const ifs = node.ifs;

        const tempListName = this.generateTempVar('_list_comp_res');
        const tempListVar = new BlockPyParser.NameNode(tempListName, node.line);

        // 1. Initialize empty list: _list_comp_res = []
        const initStmt = new BlockPyParser.AssignNode(
          tempListVar,
          new BlockPyParser.ListNode([], node.line),
          node.line
        );
        this.prependedStatements.push(initStmt);

        // 2. Build append method call: _list_comp_res.append(elt)
        const appendAttr = new BlockPyParser.AttributeNode(tempListVar, 'append', node.line);
        const appendCall = new BlockPyParser.CallNode(appendAttr, [elt], node.line);

        // 3. Build loop body: if there is an if-condition, wrap it in an If statement
        let loopBody = [appendCall];
        if (ifs) {
          const ifStmt = new BlockPyParser.IfNode(
            this.visitNode(ifs),
            [appendCall],
            [],
            node.line
          );
          loopBody = [ifStmt];
        }

        // 4. Build loop block: for target in iter: loopBody
        // Ensure child expressions of loop target, iter, and elt are also recursively desugared
        const forLoop = new BlockPyParser.ForNode(
          this.visitNode(target),
          this.visitNode(iter),
          loopBody,
          node.line
        );

        // Recursively desugar the newly built loop to capture any nested list comprehensions
        const desugaredLoop = this.visitNode(forLoop);
        this.prependedStatements.push(desugaredLoop);

        // 5. Replace the original ListComp node in the expression with the temporary variable name
        return tempListVar;
      }

      // -------------------------------------------------------------
      // CORE COMPILER REWRITE: Ternary Operator Unrolling
      // -------------------------------------------------------------
      case 'Ternary': {
        // body if test else orelse
        const test = node.test;
        const body = node.body;
        const orelse = node.orelse;

        const tempTernaryName = this.generateTempVar('_ternary_res');
        const tempTernaryVar = new BlockPyParser.NameNode(tempTernaryName, node.line);

        // 1. Pre-declare: _ternary_res = None (represented as variable target)
        const initStmt = new BlockPyParser.AssignNode(
          tempTernaryVar,
          new BlockPyParser.NameNode('None', node.line),
          node.line
        );
        this.prependedStatements.push(initStmt);

        // 2. Build if-else block to assign values
        const assignIf = new BlockPyParser.AssignNode(tempTernaryVar, body, node.line);
        const assignElse = new BlockPyParser.AssignNode(tempTernaryVar, orelse, node.line);

        const ifStmt = new BlockPyParser.IfNode(
          this.visitNode(test),
          [this.visitNode(assignIf)],
          [this.visitNode(assignElse)],
          node.line
        );

        this.prependedStatements.push(ifStmt);

        // 3. Replace the original Ternary expression with the temporary variable name
        return tempTernaryVar;
      }

      case 'FunctionDef':
        node.body = this.desugarSuite(node.body);
        return node;

      case 'ClassDef':
        node.body = this.desugarSuite(node.body);
        return node;

      case 'Return':
        if (node.value) node.value = this.visitNode(node.value);
        return node;

      case 'Lambda':
        node.body = this.visitNode(node.body);
        return node;

      default:
        // Leaf nodes (Name, Num, Str, Bool, Pass) remain unchanged
        return node;
    }
  }
}

// -------------------------------------------------------------
// High-Level Helper function for side-by-side Normalizer display
// -------------------------------------------------------------
function desugarPythonCode(sourceCode) {
  try {
    const lexer = new BlockPyParser.Tokenizer(sourceCode);
    const tokens = lexer.tokenize();
    const parser = new BlockPyParser.Parser(tokens);
    const originalAST = parser.parse();
    
    // Deep clone original AST to avoid modifying it
    const originalASTCopy = JSON.parse(JSON.stringify(originalAST));
    
    const desugarer = new ASTDesugarer();
    const desugaredAST = desugarer.desugar(originalAST);
    
    const desugaredPython = BlockPyParser.astToPython(desugaredAST);
    
    return {
      success: true,
      originalAST: originalASTCopy,
      desugaredAST: desugaredAST,
      desugaredPython: desugaredPython,
      error: null
    };
  } catch (err) {
    return {
      success: false,
      originalAST: null,
      desugaredAST: null,
      desugaredPython: null,
      error: err.message
    };
  }
}

// Expose globally and for Node environment
const BlockPyDesugarer = {
  ASTDesugarer,
  desugarPythonCode
};

if (typeof window !== 'undefined') {
  window.BlockPyDesugarer = BlockPyDesugarer;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BlockPyDesugarer;
}
