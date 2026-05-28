/* parser.js - Lexer, AST Parser & Blockly Code Transpiler */

const Blockly = typeof window !== 'undefined' && window.Blockly ? window.Blockly : (typeof global !== 'undefined' && global.Blockly ? global.Blockly : { Blocks: {}, Python: {} });

// Token types for the Python Lexer
const TokenType = {
  INDENT: 'INDENT',
  DEDENT: 'DEDENT',
  NEWLINE: 'NEWLINE',
  EOF: 'EOF',
  KEYWORD: 'KEYWORD',
  IDENTIFIER: 'IDENTIFIER',
  NUMBER: 'NUMBER',
  STRING: 'STRING',
  SYMBOL: 'SYMBOL',
  COMMENT: 'COMMENT'
};

const KEYWORDS = [
  'def', 'if', 'elif', 'else', 'while', 'for', 'in', 'and', 'or', 'not',
  'import', 'as', 'True', 'False', 'None', 'pass', 'return', 'class', 'lambda',
  'break', 'continue',
  'is' // [W3] identity operator keyword (OP-09)
];

class Token {
  constructor(type, value, line, col) {
    this.type = type;
    this.value = value;
    this.line = line;
    this.col = col;
  }
}

// -------------------------------------------------------------
// 1. Python Tokenizer (Lexer)
// -------------------------------------------------------------
class Tokenizer {
  constructor(source) {
    this.source = source;
    this.cursor = 0;
    this.line = 1;
    this.col = 1;
    this.indentStack = [0];
    this.tokens = [];
    this.isLineStart = true;
  }

  peekChar() {
    if (this.cursor >= this.source.length) return null;
    return this.source[this.cursor];
  }

  nextChar() {
    if (this.cursor >= this.source.length) return null;
    const char = this.source[this.cursor++];
    if (char === '\n') {
      this.line++;
      this.col = 1;
      this.isLineStart = true;
    } else {
      this.col++;
    }
    return char;
  }

  tokenize() {
    while (this.cursor < this.source.length) {
      const char = this.peekChar();

      // Handle Python Indentation at the start of a line
      if (this.isLineStart) {
        this.isLineStart = false;
        let spaceCount = 0;
        
        while (this.peekChar() === ' ' || this.peekChar() === '\t') {
          const space = this.nextChar();
          spaceCount += (space === '\t' ? 4 : 1);
        }
        
        const next = this.peekChar();
        // Skip indentation rules for empty lines or comments
        if (next === '\n' || next === '\r' || next === '#' || next === null) {
          continue; 
        }

        const currentIndent = this.indentStack[this.indentStack.length - 1];
        if (spaceCount > currentIndent) {
          this.indentStack.push(spaceCount);
          this.tokens.push(new Token(TokenType.INDENT, spaceCount, this.line, this.col));
        } else if (spaceCount < currentIndent) {
          while (this.indentStack.length > 0 && this.indentStack[this.indentStack.length - 1] > spaceCount) {
            this.indentStack.pop();
            this.tokens.push(new Token(TokenType.DEDENT, spaceCount, this.line, this.col));
          }
          if (this.indentStack[this.indentStack.length - 1] !== spaceCount) {
            throw new SyntaxError(`Indentation error at line ${this.line}`);
          }
        }
        continue;
      }

      // Handle Newlines
      if (char === '\n' || char === '\r') {
        const nl = this.nextChar();
        if (nl === '\r' && this.peekChar() === '\n') this.nextChar(); // CRLF
        this.tokens.push(new Token(TokenType.NEWLINE, '\n', this.line - 1, this.col));
        continue;
      }

      // Handle spaces outside of line start
      if (char === ' ' || char === '\t') {
        this.nextChar();
        continue;
      }

      // Handle Comments
      if (char === '#') {
        let commentText = '';
        while (this.peekChar() !== '\n' && this.peekChar() !== null) {
          commentText += this.nextChar();
        }
        // Save comment
        this.tokens.push(new Token(TokenType.COMMENT, commentText, this.line, this.col));
        continue;
      }

      // Handle Strings
      if (char === '"' || char === "'") {
        const quoteChar = this.nextChar();
        let strVal = '';
        let startLine = this.line;
        let startCol = this.col;
        
        while (this.peekChar() !== quoteChar && this.peekChar() !== null) {
          const c = this.nextChar();
          if (c === '\\') {
            const next = this.nextChar();
            if (next === 'n') strVal += '\n';
            else if (next === 't') strVal += '\t';
            else strVal += next;
          } else {
            strVal += c;
          }
        }
        
        if (this.peekChar() === quoteChar) {
          this.nextChar(); // consume end quote
        } else {
          throw new SyntaxError(`Unterminated string starting at line ${startLine}, col ${startCol}`);
        }
        
        this.tokens.push(new Token(TokenType.STRING, strVal, startLine, startCol));
        continue;
      }

      // Handle Numbers
      if (/[0-9]/.test(char)) {
        let numStr = '';
        const startCol = this.col;
        while (this.peekChar() !== null && /[0-9.]/.test(this.peekChar())) {
          numStr += this.nextChar();
        }
        this.tokens.push(new Token(TokenType.NUMBER, numStr, this.line, startCol));
        continue;
      }

      // Handle Identifiers and Keywords
      if (/[a-zA-Z_]/.test(char)) {
        let idStr = '';
        const startCol = this.col;
        while (this.peekChar() !== null && /[a-zA-Z0-9_]/.test(this.peekChar())) {
          idStr += this.nextChar();
        }
        
        const type = KEYWORDS.includes(idStr) ? TokenType.KEYWORD : TokenType.IDENTIFIER;
        this.tokens.push(new Token(type, idStr, this.line, startCol));
        continue;
      }

      // Handle Symbols & Multi-char operators
      // [W3] ORDER MATTERS — match longer operators first.
      // [W3] 3-char augmented ops: **= //= <<= >>= (ASG-05)
      const threeCharOps = ['**=', '//=', '<<=', '>>='];
      const nextThree = this.source.slice(this.cursor, this.cursor + 3);
      if (threeCharOps.includes(nextThree)) {
        const sym = nextThree;
        const startCol = this.col;
        this.nextChar(); this.nextChar(); this.nextChar();
        this.tokens.push(new Token(TokenType.SYMBOL, sym, this.line, startCol));
        continue;
      }

      // [W3] 2-char ops — added: ** // << >> %= &= |= ^= (OP-02/04/11, ASG-05)
      const twoCharOps = [
        '+=', '-=', '*=', '/=', '==', '!=', '<=', '>=',
        '**', '//', '<<', '>>', '%=', '&=', '|=', '^='
      ];
      const nextTwo = this.source.slice(this.cursor, this.cursor + 2);
      if (twoCharOps.includes(nextTwo)) {
        const sym = nextTwo;
        const startCol = this.col;
        this.nextChar(); this.nextChar();
        this.tokens.push(new Token(TokenType.SYMBOL, sym, this.line, startCol));
        continue;
      }

      // Single char symbols  ([W3] added: % & | ^ ~ for modulo/bitwise — OP-03/11)
      if ('=+-*/<>():[],.%&|^~'.includes(char)) {
        const sym = this.nextChar();
        this.tokens.push(new Token(TokenType.SYMBOL, sym, this.line, this.col - 1));
        continue;
      }

      // Unknown character fallback
      throw new SyntaxError(`Unexpected character "${char}" at line ${this.line}, col ${this.col}`);
    }

    // Dedent remaining indentation levels
    while (this.indentStack.length > 1) {
      this.indentStack.pop();
      this.tokens.push(new Token(TokenType.DEDENT, 0, this.line, this.col));
    }
    
    this.tokens.push(new Token(TokenType.EOF, '', this.line, this.col));
    return this.tokens;
  }
}

// -------------------------------------------------------------
// 2. Custom AST Node Classes
// -------------------------------------------------------------
class ASTNode {
  constructor(line) {
    this.line = line || 1;
  }
}

class ProgramNode extends ASTNode {
  constructor(body, line) {
    super(line);
    this.type = 'Program';
    this.body = body || [];
  }
}

class AssignNode extends ASTNode {
  constructor(target, value, line) {
    super(line);
    this.type = 'Assign';
    this.target = target; // NameNode
    this.value = value;   // ExpressionNode
  }
}

class AugAssignNode extends ASTNode {
  constructor(target, op, value, line) {
    super(line);
    this.type = 'AugAssign';
    this.target = target;
    this.op = op; // '+=', '-=', '*=', '/='
    this.value = value;
  }
}

class ForNode extends ASTNode {
  constructor(target, iter, body, line) {
    super(line);
    this.type = 'For';
    this.target = target; // NameNode
    this.iter = iter;     // Expression (RangeNode, NameNode, ListNode)
    this.body = body;     // List of statements
  }
}

class WhileNode extends ASTNode {
  constructor(test, body, line) {
    super(line);
    this.type = 'While';
    this.test = test;
    this.body = body;
  }
}

class IfNode extends ASTNode {
  constructor(test, body, orelse, line) {
    super(line);
    this.type = 'If';
    this.test = test;
    this.body = body;
    this.orelse = orelse || []; // can be list of statements or another IfNode
  }
}

class CallNode extends ASTNode {
  constructor(func, args, line) {
    super(line);
    this.type = 'Call';
    this.func = func; // NameNode or AttributeNode (e.g. sprite.move)
    this.args = args; // list of ExpressionNodes
  }
}

class ListCompNode extends ASTNode {
  constructor(elt, target, iter, ifs, line) {
    if (line === undefined) {
      line = ifs;
      ifs = null;
    }
    super(line);
    this.type = 'ListComp';
    this.elt = elt;
    this.target = target;
    this.iter = iter;
    this.ifs = ifs || null;
  }
}

class TernaryNode extends ASTNode {
  constructor(test, body, orelse, line) {
    super(line);
    this.type = 'Ternary';
    this.test = test;
    this.body = body;
    this.orelse = orelse;
  }
}

class AttributeNode extends ASTNode {
  constructor(value, attr, line) {
    super(line);
    this.type = 'Attribute';
    this.value = value; // ExpressionNode (e.g. NameNode 'sprite')
    this.attr = attr;   // string attr name (e.g. 'move')
  }
}

class NameNode extends ASTNode {
  constructor(id, line) {
    super(line);
    this.type = 'Name';
    this.id = id;
  }
}

class NumNode extends ASTNode {
  constructor(value, line) {
    super(line);
    this.type = 'Num';
    this.value = parseFloat(value);
  }
}

class StrNode extends ASTNode {
  constructor(value, line) {
    super(line);
    this.type = 'Str';
    this.value = value;
  }
}

class BoolNode extends ASTNode {
  constructor(value, line) {
    super(line);
    this.type = 'Bool';
    this.value = value; // true/false
  }
}

class ListNode extends ASTNode {
  constructor(elts, line) {
    super(line);
    this.type = 'List';
    this.elts = elts || [];
  }
}

class BinOpNode extends ASTNode {
  constructor(left, op, right, line) {
    super(line);
    this.type = 'BinOp';
    this.left = left;
    this.op = op;
    this.right = right;
  }
}

class RangeNode extends ASTNode {
  constructor(start, stop, step, line) {
    super(line);
    this.type = 'Range';
    this.start = start || new NumNode(0, line);
    this.stop = stop;
    this.step = step || new NumNode(1, line);
  }
}

class PassNode extends ASTNode {
  constructor(line) {
    super(line);
    this.type = 'Pass';
  }
}

class BreakNode extends ASTNode {
  constructor(line) {
    super(line);
    this.type = 'Break';
  }
}

class ContinueNode extends ASTNode {
  constructor(line) {
    super(line);
    this.type = 'Continue';
  }
}

class FunctionDefNode extends ASTNode {
  constructor(name, params, body, decorators, line) {
    super(line);
    this.type = 'FunctionDef';
    this.name = name;
    this.params = params || [];
    this.body = body || [];
    this.decorators = decorators || [];
  }
}

class ReturnNode extends ASTNode {
  constructor(value, line) {
    super(line);
    this.type = 'Return';
    this.value = value;
  }
}

class ImportNode extends ASTNode {
  constructor(names, line) {
    super(line);
    this.type = 'Import';
    this.names = names; // array of { name: 'requests', as: 'req' }
  }
}

class ClassDefNode extends ASTNode {
  constructor(name, bases, body, decorators, line) {
    super(line);
    this.type = 'ClassDef';
    this.name = name;
    this.bases = bases || [];
    this.body = body || [];
    this.decorators = decorators || [];
  }
}

class LambdaNode extends ASTNode {
  constructor(params, body, line) {
    super(line);
    this.type = 'Lambda';
    this.params = params || [];
    this.body = body;
  }
}

// -------------------------------------------------------------
// 3. Recursive Descent AST Parser
// -------------------------------------------------------------
class Parser {
  constructor(tokens) {
    this.tokens = tokens.filter(t => t.type !== TokenType.COMMENT); // filter comments out for parsing
    this.cursor = 0;
  }

  peek() {
    if (this.cursor >= this.tokens.length) return null;
    return this.tokens[this.cursor];
  }

  next() {
    if (this.cursor >= this.tokens.length) return null;
    return this.tokens[this.cursor++];
  }

  match(type, value) {
    const tok = this.peek();
    if (!tok) return false;
    if (tok.type !== type) return false;
    if (value !== undefined && tok.value !== value) return false;
    this.next();
    return true;
  }

  expect(type, value, message) {
    const tok = this.peek();
    if (!tok || tok.type !== type || (value !== undefined && tok.value !== value)) {
      const displayVal = value ? `"${value}"` : type;
      const actualVal = tok ? `"${tok.value}" (${tok.type})` : 'EOF';
      throw new SyntaxError(`${message || 'Parsing error'}: Expected ${displayVal}, got ${actualVal} at line ${tok ? tok.line : 'unknown'}`);
    }
    return this.next();
  }

  parse() {
    return this.parseProgram();
  }

  parseProgram() {
    const body = [];
    const firstLine = this.peek() ? this.peek().line : 1;
    
    while (this.peek() && this.peek().type !== TokenType.EOF) {
      // skip extra newlines at program top
      if (this.match(TokenType.NEWLINE)) continue;
      
      const stmt = this.parseStatement();
      if (stmt) body.push(stmt);
      
      // Consume trailing newline or wait for EOF/DEDENT
      const nextTok = this.peek();
      if (stmt && stmt.type !== 'For' && stmt.type !== 'While' && stmt.type !== 'If' && stmt.type !== 'FunctionDef' && stmt.type !== 'ClassDef') {
        if (nextTok && nextTok.type !== TokenType.EOF && nextTok.type !== TokenType.DEDENT) {
          this.expect(TokenType.NEWLINE, undefined, 'Statements must be separated by newlines');
        }
      } else {
        this.match(TokenType.NEWLINE);
      }
    }
    return new ProgramNode(body, firstLine);
  }

  parseStatement() {
    const tok = this.peek();
    if (!tok) return null;

    if (tok.type === TokenType.KEYWORD) {
      switch (tok.value) {
        case 'pass':
          this.next();
          return new PassNode(tok.line);
        case 'break':
          this.next();
          return new BreakNode(tok.line);
        case 'continue':
          this.next();
          return new ContinueNode(tok.line);
        case 'import':
          return this.parseImport();
        case 'if':
          return this.parseIf();
        case 'while':
          return this.parseWhile();
        case 'for':
          return this.parseFor();
        case 'def':
          return this.parseFunctionDef([]);
        case 'return':
          return this.parseReturn();
        case 'class':
          return this.parseClassDef([]);
      }
    }

    // Default: expression statement or assignment
    return this.parseExpressionStatement();
  }

  parseImport() {
    const tok = this.expect(TokenType.KEYWORD, 'import');
    const names = [];
    
    const nameId = this.expect(TokenType.IDENTIFIER, undefined, 'Expected library name after import');
    let alias = null;
    if (this.match(TokenType.KEYWORD, 'as')) {
      alias = this.expect(TokenType.IDENTIFIER, undefined, 'Expected alias name after as').value;
    }
    names.push({ name: nameId.value, as: alias });

    while (this.match(TokenType.SYMBOL, ',')) {
      const subName = this.expect(TokenType.IDENTIFIER, undefined, 'Expected library name after comma');
      let subAlias = null;
      if (this.match(TokenType.KEYWORD, 'as')) {
        subAlias = this.expect(TokenType.IDENTIFIER, undefined, 'Expected alias name').value;
      }
      names.push({ name: subName.value, as: subAlias });
    }

    return new ImportNode(names, tok.line);
  }

  parseIf() {
    const tok = this.expect(TokenType.KEYWORD, 'if');
    const test = this.parseExpression();
    this.expect(TokenType.SYMBOL, ':', 'Expected ":" after IF condition');
    this.expect(TokenType.NEWLINE, undefined, 'Expected newline after IF statement');
    
    const body = this.parseSuite();
    let orelse = [];

    // Check for elif or else
    while (this.peek() && this.peek().type === TokenType.KEYWORD && this.peek().value === 'elif') {
      const elifTok = this.next();
      const elifTest = this.parseExpression();
      this.expect(TokenType.SYMBOL, ':', 'Expected ":" after ELIF condition');
      this.expect(TokenType.NEWLINE, undefined, 'Expected newline after ELIF statement');
      const elifBody = this.parseSuite();
      orelse.push(new IfNode(elifTest, elifBody, [], elifTok.line));
    }

    if (this.peek() && this.peek().type === TokenType.KEYWORD && this.peek().value === 'else') {
      this.next();
      this.expect(TokenType.SYMBOL, ':', 'Expected ":" after ELSE');
      this.expect(TokenType.NEWLINE, undefined, 'Expected newline after ELSE statement');
      const elseBody = this.parseSuite();
      
      if (orelse.length > 0) {
        // Nest else block into the last elif
        let lastElif = orelse[orelse.length - 1];
        lastElif.orelse = elseBody;
      } else {
        orelse = elseBody;
      }
    }

    return new IfNode(test, body, orelse, tok.line);
  }

  parseWhile() {
    const tok = this.expect(TokenType.KEYWORD, 'while');
    const test = this.parseExpression();
    this.expect(TokenType.SYMBOL, ':', 'Expected ":" after while condition');
    this.expect(TokenType.NEWLINE, undefined, 'Expected newline after while statement');
    const body = this.parseSuite();
    return new WhileNode(test, body, tok.line);
  }

  parseFor() {
    const tok = this.expect(TokenType.KEYWORD, 'for');
    const targetId = this.expect(TokenType.IDENTIFIER, undefined, 'Expected loop variable name');
    const target = new NameNode(targetId.value, targetId.line);
    
    this.expect(TokenType.KEYWORD, 'in', 'Expected "in" keyword in for-loop');
    const iter = this.parseExpression();
    
    this.expect(TokenType.SYMBOL, ':', 'Expected ":" after loop expression');
    this.expect(TokenType.NEWLINE, undefined, 'Expected newline after for statement');
    
    const body = this.parseSuite();
    return new ForNode(target, iter, body, tok.line);
  }

  parseFunctionDef(decorators) {
    const tok = this.expect(TokenType.KEYWORD, 'def');
    const nameId = this.expect(TokenType.IDENTIFIER, undefined, 'Expected function name after "def"');
    this.expect(TokenType.SYMBOL, '(', 'Expected "(" after function name');

    const params = [];
    if (!this.match(TokenType.SYMBOL, ')')) {
      const firstParam = this.expect(TokenType.IDENTIFIER, undefined, 'Expected parameter name');
      params.push(firstParam.value);
      while (this.match(TokenType.SYMBOL, ',')) {
        const p = this.expect(TokenType.IDENTIFIER, undefined, 'Expected parameter name after comma');
        params.push(p.value);
      }
      this.expect(TokenType.SYMBOL, ')', 'Expected ")" closing parameter list');
    }
    this.expect(TokenType.SYMBOL, ':', 'Expected ":" after function signature');
    this.expect(TokenType.NEWLINE, undefined, 'Expected newline after function signature');
    const body = this.parseSuite();
    return new FunctionDefNode(nameId.value, params, body, decorators || [], tok.line);
  }

  parseReturn() {
    const tok = this.expect(TokenType.KEYWORD, 'return');
    const next = this.peek();
    if (!next || next.type === TokenType.NEWLINE || next.type === TokenType.EOF || next.type === TokenType.DEDENT) {
      return new ReturnNode(null, tok.line);
    }
    const val = this.parseExpression();
    return new ReturnNode(val, tok.line);
  }

  parseClassDef(decorators) {
    const tok = this.expect(TokenType.KEYWORD, 'class');
    const nameId = this.expect(TokenType.IDENTIFIER, undefined, 'Expected class name after "class"');

    const bases = [];
    if (this.match(TokenType.SYMBOL, '(')) {
      if (!this.match(TokenType.SYMBOL, ')')) {
        const firstBase = this.expect(TokenType.IDENTIFIER, undefined, 'Expected base class name');
        bases.push(new NameNode(firstBase.value, firstBase.line));
        while (this.match(TokenType.SYMBOL, ',')) {
          const b = this.expect(TokenType.IDENTIFIER, undefined, 'Expected base class name after comma');
          bases.push(new NameNode(b.value, b.line));
        }
        this.expect(TokenType.SYMBOL, ')', 'Expected ")" closing base class list');
      }
    }
    this.expect(TokenType.SYMBOL, ':', 'Expected ":" after class signature');
    this.expect(TokenType.NEWLINE, undefined, 'Expected newline after class signature');
    const body = this.parseSuite();
    return new ClassDefNode(nameId.value, bases, body, decorators || [], tok.line);
  }

  parseSuite() {
    this.expect(TokenType.INDENT, undefined, 'Expected indentation block');
    const body = [];
    
    while (this.peek() && this.peek().type !== TokenType.DEDENT) {
      if (this.match(TokenType.NEWLINE)) continue;
      const stmt = this.parseStatement();
      if (stmt) body.push(stmt);
      
      const nextTok = this.peek();
      if (stmt && stmt.type !== 'For' && stmt.type !== 'While' && stmt.type !== 'If' && stmt.type !== 'FunctionDef' && stmt.type !== 'ClassDef') {
        if (nextTok && nextTok.type !== TokenType.DEDENT && nextTok.type !== TokenType.NEWLINE && nextTok.type !== TokenType.EOF) {
          this.expect(TokenType.NEWLINE, undefined, 'Suite statements must be separated by newlines');
        }
      } else {
        this.match(TokenType.NEWLINE);
      }
    }
    
    this.expect(TokenType.DEDENT, undefined, 'Expected dedent at the end of block');
    return body;
  }

  parseExpressionStatement() {
    const expr = this.parseExpression();
    const tok = this.peek();
    
    if (tok && tok.type === TokenType.SYMBOL) {
      if (tok.value === '=') {
        this.next(); // consume '='
        const valExpr = this.parseExpression();
        return new AssignNode(expr, valExpr, expr.line);
      }
      
      // [W3] full augmented-assign set (ASG-05): added //= %= **= &= |= ^= >>= <<=
      const augOps = ['+=', '-=', '*=', '/=', '//=', '%=', '**=', '&=', '|=', '^=', '>>=', '<<='];
      if (augOps.includes(tok.value)) {
        const op = tok.value;
        this.next(); // consume op
        const valExpr = this.parseExpression();
        return new AugAssignNode(expr, op, valExpr, expr.line);
      }
    }
    
    return expr;
  }

  parseExpression() {
    return this.parseTernaryExpression();
  }

  hasElseBeforeSymbolOrNewline() {
    let depth = 0;
    let idx = this.cursor;
    if (this.tokens[idx] && this.tokens[idx].value === 'if') {
      idx++;
    }
    while (idx < this.tokens.length) {
      const tok = this.tokens[idx];
      if (!tok || tok.type === TokenType.EOF || tok.type === TokenType.NEWLINE || tok.type === TokenType.DEDENT) {
        break;
      }
      if (tok.type === TokenType.SYMBOL) {
        if (tok.value === '(' || tok.value === '[' || tok.value === '{') {
          depth++;
        } else if (tok.value === ')' || tok.value === ']' || tok.value === '}') {
          if (depth === 0) break;
          depth--;
        } else if (tok.value === ':' && depth === 0) {
          break;
        }
      } else if (tok.type === TokenType.KEYWORD) {
        if (tok.value === 'else' && depth === 0) {
          return true;
        }
      }
      idx++;
    }
    return false;
  }

  parseTernaryExpression() {
    const expr = this.parseLogicalOr();
    
    if (this.peek() && this.peek().type === TokenType.KEYWORD && this.peek().value === 'if') {
      if (this.hasElseBeforeSymbolOrNewline()) {
        this.next(); // consume 'if'
        const test = this.parseLogicalOr();
        this.expect(TokenType.KEYWORD, 'else', 'Expected "else" in ternary expression');
        const orelse = this.parseTernaryExpression();
        return new TernaryNode(test, expr, orelse, expr.line);
      }
    }
    
    return expr;
  }

  parseLogicalOr() {
    let expr = this.parseLogicalAnd();
    while (this.match(TokenType.KEYWORD, 'or')) {
      const right = this.parseLogicalAnd();
      expr = new BinOpNode(expr, 'or', right, expr.line);
    }
    return expr;
  }

  parseLogicalAnd() {
    let expr = this.parseLogicalNot();
    while (this.match(TokenType.KEYWORD, 'and')) {
      const right = this.parseLogicalNot();
      expr = new BinOpNode(expr, 'and', right, expr.line);
    }
    return expr;
  }

  parseLogicalNot() {
    if (this.match(TokenType.KEYWORD, 'not')) {
      const op = this.tokens[this.cursor - 1].value;
      const operand = this.parseLogicalNot();
      return new BinOpNode(null, op, operand, operand.line);
    }
    return this.parseComparison();
  }

  // [W3] Detect a comparison operator at the cursor (symbol or keyword form).
  // Returns the canonical operator string and consumes its token(s), or null.
  // Handles: == != < > <= >= and (OP-09/10) is / is not / in / not in.
  matchComparisonOp() {
    const tok = this.peek();
    if (!tok) return null;
    const compSymOps = ['==', '!=', '<', '>', '<=', '>='];
    if (tok.type === TokenType.SYMBOL && compSymOps.includes(tok.value)) {
      return this.next().value;
    }
    // [W3] identity: is / is not (OP-09)
    if (tok.type === TokenType.KEYWORD && tok.value === 'is') {
      this.next();
      if (this.peek() && this.peek().type === TokenType.KEYWORD && this.peek().value === 'not') {
        this.next();
        return 'is not';
      }
      return 'is';
    }
    // [W3] membership: in (OP-10)
    if (tok.type === TokenType.KEYWORD && tok.value === 'in') {
      this.next();
      return 'in';
    }
    // [W3] membership: not in (OP-10) — 'not' followed by 'in'
    if (tok.type === TokenType.KEYWORD && tok.value === 'not'
        && this.tokens[this.cursor + 1] && this.tokens[this.cursor + 1].type === TokenType.KEYWORD
        && this.tokens[this.cursor + 1].value === 'in') {
      this.next(); this.next();
      return 'not in';
    }
    return null;
  }

  parseComparison() {
    let expr = this.parseBitOr();

    // [W3] Collect a chain of comparisons (OP-06/07/09/10).
    // a OP1 b OP2 c ... is rewritten into (a OP1 b) and (b OP2 c) ... so it
    // maps cleanly to existing logic blocks and is semantically correct.
    let op = this.matchComparisonOp();
    if (op === null) return expr;

    let prevOperand = expr;
    let chain = null; // accumulated 'and' tree of pairwise comparisons
    while (op !== null) {
      const right = this.parseBitOr();
      const pair = new BinOpNode(prevOperand, op, right, expr.line);
      chain = chain === null ? pair : new BinOpNode(chain, 'and', pair, expr.line);
      prevOperand = right;
      op = this.matchComparisonOp();
    }
    return chain;
  }

  // [W3] Bitwise OR `|` (OP-11) — lowest bitwise precedence.
  parseBitOr() {
    let expr = this.parseBitXor();
    while (this.peek() && this.peek().type === TokenType.SYMBOL && this.peek().value === '|') {
      const op = this.next().value;
      const right = this.parseBitXor();
      expr = new BinOpNode(expr, op, right, expr.line);
    }
    return expr;
  }

  // [W3] Bitwise XOR `^` (OP-11).
  parseBitXor() {
    let expr = this.parseBitAnd();
    while (this.peek() && this.peek().type === TokenType.SYMBOL && this.peek().value === '^') {
      const op = this.next().value;
      const right = this.parseBitAnd();
      expr = new BinOpNode(expr, op, right, expr.line);
    }
    return expr;
  }

  // [W3] Bitwise AND `&` (OP-11).
  parseBitAnd() {
    let expr = this.parseShift();
    while (this.peek() && this.peek().type === TokenType.SYMBOL && this.peek().value === '&') {
      const op = this.next().value;
      const right = this.parseShift();
      expr = new BinOpNode(expr, op, right, expr.line);
    }
    return expr;
  }

  // [W3] Shift operators `<< >>` (OP-11).
  parseShift() {
    let expr = this.parseAdditive();
    while (this.peek() && this.peek().type === TokenType.SYMBOL && (this.peek().value === '<<' || this.peek().value === '>>')) {
      const op = this.next().value;
      const right = this.parseAdditive();
      expr = new BinOpNode(expr, op, right, expr.line);
    }
    return expr;
  }

  parseAdditive() {
    let expr = this.parseMultiplicative();
    while (this.peek() && this.peek().type === TokenType.SYMBOL && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.next().value;
      const right = this.parseMultiplicative();
      expr = new BinOpNode(expr, op, right, expr.line);
    }
    return expr;
  }

  parseMultiplicative() {
    let expr = this.parseUnary();
    // [W3] added floor-division `//` and modulo `%` (OP-02/03)
    const mulOps = ['*', '/', '//', '%'];
    while (this.peek() && this.peek().type === TokenType.SYMBOL && mulOps.includes(this.peek().value)) {
      const op = this.next().value;
      const right = this.parseUnary();
      expr = new BinOpNode(expr, op, right, expr.line);
    }
    return expr;
  }

  parseUnary() {
    // [W3] added bitwise NOT `~` as a unary prefix (OP-11), alongside - and +.
    if (this.peek() && this.peek().type === TokenType.SYMBOL && (this.peek().value === '-' || this.peek().value === '+' || this.peek().value === '~')) {
      const op = this.next().value;
      const operand = this.parseUnary();
      return new BinOpNode(null, op, operand, operand.line);
    }
    return this.parsePower();
  }

  // [W3] Power `**` (OP-04) — right-associative; binds tighter than unary on its
  // right operand. Python: -2 ** 2 == -(2 ** 2); 2 ** -1 is valid; 2 ** 3 ** 2 == 2 ** 9.
  parsePower() {
    const base = this.parsePrimary();
    if (this.peek() && this.peek().type === TokenType.SYMBOL && this.peek().value === '**') {
      const op = this.next().value;
      // right operand may itself be unary (e.g. 2 ** -1) — parseUnary handles
      // that and recurses back into parsePower for right-associativity.
      const exponent = this.parseUnary();
      return new BinOpNode(base, op, exponent, base.line);
    }
    return base;
  }

  parsePrimary() {
    let expr = this.parseAtom();
    
    while (this.peek()) {
      const tok = this.peek();
      if (tok.type === TokenType.SYMBOL && tok.value === '.') {
        this.next(); // consume '.'
        const attrId = this.expect(TokenType.IDENTIFIER, undefined, 'Expected attribute name after "."');
        expr = new AttributeNode(expr, attrId.value, expr.line);
      } else if (tok.type === TokenType.SYMBOL && tok.value === '(') {
        this.next(); // consume '('
        const args = [];
        if (!this.match(TokenType.SYMBOL, ')')) {
          args.push(this.parseExpression());
          while (this.match(TokenType.SYMBOL, ',')) {
            args.push(this.parseExpression());
          }
          this.expect(TokenType.SYMBOL, ')', 'Expected ")" at the end of function call');
        }
        
        // Special case standard functions mapping: range(...)
        if (expr instanceof NameNode && expr.id === 'range') {
          let start = null, stop = null, step = null;
          if (args.length === 1) {
            stop = args[0];
          } else if (args.length === 2) {
            start = args[0];
            stop = args[1];
          } else if (args.length === 3) {
            start = args[0];
            stop = args[1];
            step = args[2];
          }
          expr = new RangeNode(start, stop, step, expr.line);
        } else {
          expr = new CallNode(expr, args, expr.line);
        }
      } else if (tok.type === TokenType.SYMBOL && tok.value === '[') {
        // List index retrieval e.g. arr[i]
        this.next(); // consume '['
        const indexExpr = this.parseExpression();
        this.expect(TokenType.SYMBOL, ']', 'Expected "]" in list index retrieval');
        expr = new BinOpNode(expr, 'INDEX', indexExpr, expr.line);
      } else {
        break;
      }
    }
    
    return expr;
  }

  parseAtom() {
    const tok = this.peek();
    if (!tok) throw new SyntaxError('Unexpected EOF inside expression');

    if (tok.type === TokenType.NUMBER) {
      this.next();
      return new NumNode(tok.value, tok.line);
    }
    if (tok.type === TokenType.STRING) {
      this.next();
      return new StrNode(tok.value, tok.line);
    }
    if (tok.type === TokenType.KEYWORD) {
      if (tok.value === 'True' || tok.value === 'False') {
        this.next();
        return new BoolNode(tok.value === 'True', tok.line);
      }
      if (tok.value === 'None') {
        this.next();
        return new NameNode('None', tok.line);
      }
      if (tok.value === 'lambda') {
        this.next();
        const params = [];
        if (this.peek() && this.peek().type === TokenType.IDENTIFIER) {
          params.push(this.next().value);
          while (this.match(TokenType.SYMBOL, ',')) {
            const p = this.expect(TokenType.IDENTIFIER, undefined, 'Expected parameter name in lambda');
            params.push(p.value);
          }
        }
        this.expect(TokenType.SYMBOL, ':', 'Expected ":" in lambda expression');
        const body = this.parseExpression();
        return new LambdaNode(params, body, tok.line);
      }
    }
    if (tok.type === TokenType.IDENTIFIER) {
      this.next();
      return new NameNode(tok.value, tok.line);
    }
    if (tok.type === TokenType.SYMBOL && tok.value === '(') {
      this.next();
      const expr = this.parseExpression();
      this.expect(TokenType.SYMBOL, ')', 'Expected closing parenthesis');
      return expr;
    }
    if (tok.type === TokenType.SYMBOL && tok.value === '[') {
      return this.parseListOrComprehension();
    }

    throw new SyntaxError(`Unexpected token "${tok.value}" in expression at line ${tok.line}`);
  }

  parseListOrComprehension() {
    const startTok = this.expect(TokenType.SYMBOL, '[');
    
    // Check for empty list
    if (this.match(TokenType.SYMBOL, ']')) {
      return new ListNode([], startTok.line);
    }

    const first = this.parseExpression();

    // Check for List Comprehension: [elt for target in iter]
    if (this.peek() && this.peek().type === TokenType.KEYWORD && this.peek().value === 'for') {
      this.next(); // consume 'for'
      const targetId = this.expect(TokenType.IDENTIFIER, undefined, 'Expected identifier in list comprehension loop');
      const target = new NameNode(targetId.value, targetId.line);
      
      this.expect(TokenType.KEYWORD, 'in', 'Expected "in" keyword in list comprehension');
      const iter = this.parseExpression();
      
      let ifs = null;
      if (this.peek() && this.peek().type === TokenType.KEYWORD && this.peek().value === 'if') {
        this.next(); // consume 'if'
        ifs = this.parseExpression();
      }
      
      this.expect(TokenType.SYMBOL, ']', 'Expected closing bracket "]" in list comprehension');
      
      return new ListCompNode(first, target, iter, ifs, startTok.line);
    }

    // Standard list: [elt1, elt2, ...]
    const elts = [first];
    while (this.match(TokenType.SYMBOL, ',')) {
      if (this.peek().type === TokenType.SYMBOL && this.peek().value === ']') break; // handle trailing comma
      elts.push(this.parseExpression());
    }
    
    this.expect(TokenType.SYMBOL, ']', 'Expected closing bracket "]" at the end of list');
    return new ListNode(elts, startTok.line);
  }
}

// -------------------------------------------------------------
// 4. AST to Python Code Generator (For Roundtrip Validation)
// -------------------------------------------------------------
function astToPython(node, indentLevel = 0) {
  if (!node) return '';
  const indent = '    '.repeat(indentLevel);

  switch (node.type) {
    case 'Program':
      return node.body.map(stmt => astToPython(stmt, indentLevel)).join('\n');
      
    case 'Assign':
      return `${indent}${astToPython(node.target)} = ${astToPython(node.value)}`;
      
    case 'AugAssign':
      return `${indent}${astToPython(node.target)} ${node.op} ${astToPython(node.value)}`;
      
    case 'For':
      const forHead = `${indent}for ${astToPython(node.target)} in ${astToPython(node.iter)}:`;
      const forBody = node.body.map(stmt => astToPython(stmt, indentLevel + 1)).join('\n');
      return `${forHead}\n${forBody || (indent + '    pass')}`;
      
    case 'While':
      const whileHead = `${indent}while ${astToPython(node.test)}:`;
      const whileBody = node.body.map(stmt => astToPython(stmt, indentLevel + 1)).join('\n');
      return `${whileHead}\n${whileBody || (indent + '    pass')}`;
      
    case 'If':
      const ifHead = `${indent}if ${astToPython(node.test)}:`;
      const ifBody = node.body.map(stmt => astToPython(stmt, indentLevel + 1)).join('\n');
      let orelseStr = '';
      if (node.orelse && node.orelse.length > 0) {
        if (node.orelse.length === 1 && node.orelse[0].type === 'If') {
          // Elif compaction
          const elifCode = astToPython(node.orelse[0], indentLevel);
          orelseStr = '\n' + elifCode.replace(new RegExp('^' + indent + 'if'), indent + 'elif');
        } else {
          const elseHead = `\n${indent}else:`;
          const elseBody = node.orelse.map(stmt => astToPython(stmt, indentLevel + 1)).join('\n');
          orelseStr = `${elseHead}\n${elseBody || (indent + '    pass')}`;
        }
      }
      return `${ifHead}\n${ifBody || (indent + '    pass')}${orelseStr}`;
      
    case 'Call':
      const callCode = `${astToPython(node.func)}(${node.args.map(arg => astToPython(arg)).join(', ')})`;
      return indentLevel > 0 ? `${indent}${callCode}` : callCode;
      
    case 'ListComp':
      return `[${astToPython(node.elt)} for ${astToPython(node.target)} in ${astToPython(node.iter)}${node.ifs ? ' if ' + astToPython(node.ifs) : ''}]`;
      
    case 'Ternary':
      return `${astToPython(node.body)} if ${astToPython(node.test)} else ${astToPython(node.orelse)}`;
      
    case 'Attribute':
      return `${astToPython(node.value)}.${node.attr}`;
      
    case 'Name':
      return node.id;
      
    case 'Num':
      return node.value.toString();
      
    case 'Str':
      return `"${node.value.replace(/"/g, '\\"')}"`;
      
    case 'Bool':
      return node.value ? 'True' : 'False';
      
    case 'List':
      return `[${node.elts.map(elt => astToPython(elt)).join(', ')}]`;
      
    case 'BinOp':
      if (node.op === 'INDEX') {
        return `${astToPython(node.left)}[${astToPython(node.right)}]`;
      }
      // Unary operators (-x, +x, ~x, not x) have a null left operand
      if (!node.left) {
        // [W3] bitwise NOT `~` prints with no space, like - and + (OP-11)
        if (node.op === '-' || node.op === '+' || node.op === '~') {
          return `${node.op}${astToPython(node.right)}`;
        }
        // logical 'not' (keyword operator) needs a trailing space
        return `${node.op} ${astToPython(node.right)}`;
      }
      // [W3] All binary ops (incl. // % ** & | ^ << >> is/is not in/not in)
      // print with surrounding spaces, matching Python style.
      return `${astToPython(node.left)} ${node.op} ${astToPython(node.right)}`;
      
    case 'Range':
      let rArgs = [];
      if (node.start.type !== 'Num' || node.start.value !== 0 || node.step.type !== 'Num' || node.step.value !== 1) {
        rArgs.push(astToPython(node.start));
      }
      rArgs.push(astToPython(node.stop));
      if (node.step.type !== 'Num' || node.step.value !== 1) {
        if (rArgs.length === 1) rArgs.unshift(new NumNode(0).value); // add start parameter
        rArgs.push(astToPython(node.step));
      }
      return `range(${rArgs.join(', ')})`;
      
    case 'FunctionDef': {
      const decoratorLines = (node.decorators || []).map(d => `${indent}@${astToPython(d)}`).join('\n');
      const sig = `${indent}def ${node.name}(${node.params.join(', ')}):`;
      const fnBody = node.body.map(stmt => astToPython(stmt, indentLevel + 1)).join('\n');
      const prefix = decoratorLines ? decoratorLines + '\n' : '';
      return `${prefix}${sig}\n${fnBody || (indent + '    pass')}`;
    }
    case 'Return':
      return node.value === null ? `${indent}return` : `${indent}return ${astToPython(node.value)}`;
    case 'Lambda':
      return `lambda ${node.params.join(', ')}: ${astToPython(node.body)}`;

    case 'ClassDef': {
      const decoratorLines = (node.decorators || []).map(d => `${indent}@${astToPython(d)}`).join('\n');
      const baseList = node.bases && node.bases.length > 0 ? `(${node.bases.map(b => astToPython(b)).join(', ')})` : '';
      const sig = `${indent}class ${node.name}${baseList}:`;
      const clsBody = node.body.map(stmt => astToPython(stmt, indentLevel + 1)).join('\n');
      const prefix = decoratorLines ? decoratorLines + '\n' : '';
      return `${prefix}${sig}\n${clsBody || (indent + '    pass')}`;
    }

    case 'Pass':
      return `${indent}pass`;

    case 'Break':
      return `${indent}break`;

    case 'Continue':
      return `${indent}continue`;

    case 'Import':
      const namesStr = node.names.map(n => n.as ? `${n.name} as ${n.as}` : n.name).join(', ');
      return `${indent}import ${namesStr}`;
      
    default:
      return '';
  }
}

// -------------------------------------------------------------
// 5. AST to Blockly JSON Converter
// -------------------------------------------------------------
let blockIdCounter = 0;
function makeBlockId() {
  return `block_id_${blockIdCounter++}_${Math.random().toString(36).substring(2, 7)}`;
}

function collectVariables(node, varsSet = new Set()) {
  if (!node) return varsSet;

  switch (node.type) {
    case 'Program':
      if (node.body && Array.isArray(node.body)) {
        for (const stmt of node.body) {
          collectVariables(stmt, varsSet);
        }
      }
      break;
    case 'Assign':
      collectVariables(node.target, varsSet);
      collectVariables(node.value, varsSet);
      break;
    case 'AugAssign':
      collectVariables(node.target, varsSet);
      collectVariables(node.value, varsSet);
      break;
    case 'For':
      collectVariables(node.target, varsSet);
      collectVariables(node.iter, varsSet);
      if (node.body && Array.isArray(node.body)) {
        for (const stmt of node.body) {
          collectVariables(stmt, varsSet);
        }
      }
      break;
    case 'While':
      collectVariables(node.test, varsSet);
      if (node.body && Array.isArray(node.body)) {
        for (const stmt of node.body) {
          collectVariables(stmt, varsSet);
        }
      }
      break;
    case 'If':
      collectVariables(node.test, varsSet);
      if (node.body && Array.isArray(node.body)) {
        for (const stmt of node.body) {
          collectVariables(stmt, varsSet);
        }
      }
      if (node.orelse) {
        if (Array.isArray(node.orelse)) {
          for (const stmt of node.orelse) {
            collectVariables(stmt, varsSet);
          }
        } else {
          collectVariables(node.orelse, varsSet);
        }
      }
      break;
    case 'Call':
      // Don't add function/class names as workspace variables
      if (node.args && Array.isArray(node.args)) {
        for (const arg of node.args) {
          collectVariables(arg, varsSet);
        }
      }
      break;
    case 'ListComp':
      collectVariables(node.elt, varsSet);
      collectVariables(node.target, varsSet);
      collectVariables(node.iter, varsSet);
      if (node.ifs) collectVariables(node.ifs, varsSet);
      break;
    case 'Ternary':
      collectVariables(node.test, varsSet);
      collectVariables(node.body, varsSet);
      collectVariables(node.orelse, varsSet);
      break;
    case 'Attribute':
      collectVariables(node.value, varsSet);
      break;
    case 'Name':
      const id = node.id;
      const excluded = ['True', 'False', 'None', 'sprite', 'print', 'range'];
      if (!excluded.includes(id)) {
        varsSet.add(id);
      }
      break;
    case 'List':
      if (node.elts && Array.isArray(node.elts)) {
        for (const elt of node.elts) {
          collectVariables(elt, varsSet);
        }
      }
      break;
    case 'BinOp':
      if (node.left) collectVariables(node.left, varsSet);
      collectVariables(node.right, varsSet);
      break;
    case 'Range':
      if (node.start) collectVariables(node.start, varsSet);
      if (node.stop) collectVariables(node.stop, varsSet);
      if (node.step) collectVariables(node.step, varsSet);
      break;
    case 'FunctionDef':
    case 'ClassDef':
      // Skip function/class bodies — local variables are not workspace-level
      break;
  }
  return varsSet;
}

function astToBlockly(astNode) {
  if (!astNode || astNode.type !== 'Program') {
    return { "blocks": { "languageVersion": 0, "blocks": [] } };
  }

  blockIdCounter = 0;
  const blocks = [];

  // FunctionDef/ClassDef blocks don't support next connections — place them separately
  const standaloneTypes = new Set(['FunctionDef', 'ClassDef']);
  const standaloneBlocks = [];
  let currentBlock = null;
  let rootBlock = null;

  for (const stmtNode of astNode.body) {
    const block = convertStatementToBlock(stmtNode);
    if (!block) continue;

    if (standaloneTypes.has(stmtNode.type)) {
      standaloneBlocks.push(block);
      continue;
    }

    if (!rootBlock) {
      rootBlock = block;
      currentBlock = block;
    } else {
      currentBlock.next = { "block": block };
      currentBlock = block;
    }
  }

  let yOffset = 40;
  for (const block of standaloneBlocks) {
    block.x = 40;
    block.y = yOffset;
    yOffset += 220;
    blocks.push(block);
  }

  if (rootBlock) {
    rootBlock.x = 40;
    rootBlock.y = yOffset;
    blocks.push(rootBlock);
  }

  const varsSet = collectVariables(astNode);
  const variables = Array.from(varsSet).map(name => ({
    "name": name,
    "id": name
  }));

  return {
    "blocks": {
      "languageVersion": 0,
      "blocks": blocks
    },
    "variables": variables
  };
}

function convertStatementToBlock(node) {
  if (!node) return null;

  switch (node.type) {
    case 'Call': {
      // Map sprite methods or standard print calls
      const callBlock = convertCallExpression(node, true);
      if (callBlock) return callBlock;
      
      // If general unsupported call statement, fall back to generic expression block
      return makeGenericCallBlock(node);
    }
    
    case 'Assign': {
      // Handle variable assignment: e.g. x = 10
      const targetName = node.target.type === 'Name' ? node.target.id : 'x';
      return {
        "type": "variables_set",
        "id": makeBlockId(),
        "fields": {
          "VAR": {
            "id": targetName
          }
        },
        "inputs": {
          "VALUE": {
            "block": convertExpressionToBlock(node.value)
          }
        }
      };
    }

    case 'AugAssign': {
      // Handle augmented assignments like x += 5 by expanding to set x = x OP v.
      // [W3] Build the value as a synthesized BinOp and route it through
      // convertExpressionToBlock so EVERY operator (incl. // % ** & | ^ << >>)
      // maps to its proper block (math_arithmetic, math_modulo, math_int_divide,
      // bitwise_operation, …) instead of a hard-coded math_arithmetic table.
      const varName = node.target.type === 'Name' ? node.target.id : 'x';
      const baseOp = node.op.slice(0, -1); // strip trailing '=' → '+','-','//','%','**','&','|','^','<<','>>'
      const synthBinOp = new BinOpNode(
        new NameNode(varName, node.line),
        baseOp,
        node.value,
        node.line
      );
      return {
        "type": "variables_set",
        "id": makeBlockId(),
        "fields": {
          "VAR": {
            "id": varName
          }
        },
        "inputs": {
          "VALUE": {
            "block": convertExpressionToBlock(synthBinOp)
          }
        }
      };
    }

    case 'For': {
      // Handle simple loops
      const varName = node.target.type === 'Name' ? node.target.id : 'i';
      
      // If iterating range(10): map to repeating loops
      if (node.iter.type === 'Range') {
        const range = node.iter;
        const startVal = range.start ? range.start.value : 0;
        const stopVal = range.stop ? range.stop.value : 10;
        const stepVal = range.step ? range.step.value : 1;
        
        // If simple repeat 10 times (starts from 0, increments by 1)
        if (startVal === 0 && stepVal === 1 && typeof stopVal === 'number') {
          return {
            "type": "controls_repeat_ext",
            "id": makeBlockId(),
            "inputs": {
              "TIMES": {
                "shadow": {
                  "type": "math_number",
                  "id": makeBlockId(),
                  "fields": { "NUM": stopVal }
                }
              },
              "DO": {
                "block": convertStatementListToBlock(node.body)
              }
            }
          };
        }

        // Standard numeric for loop block
        return {
          "type": "controls_for",
          "id": makeBlockId(),
          "fields": {
            "VAR": {
              "id": varName
            }
          },
          "inputs": {
            "FROM": {
              "shadow": {
                "type": "math_number",
                "id": makeBlockId(),
                "fields": { "NUM": startVal }
              }
            },
            "TO": {
              "shadow": {
                "type": "math_number",
                "id": makeBlockId(),
                "fields": { "NUM": stopVal }
              }
            },
            "BY": {
              "shadow": {
                "type": "math_number",
                "id": makeBlockId(),
                "fields": { "NUM": stepVal }
              }
            },
            "DO": {
              "block": convertStatementListToBlock(node.body)
            }
          }
        };
      }
      
      // If iterating arbitrary collections (e.g. lists), map to controls_forEach
      return {
        "type": "controls_forEach",
        "id": makeBlockId(),
        "fields": {
          "VAR": {
            "id": varName
          }
        },
        "inputs": {
          "LIST": {
            "block": convertExpressionToBlock(node.iter)
          },
          "DO": {
            "block": convertStatementListToBlock(node.body)
          }
        }
      };
    }

    case 'While': {
      return {
        "type": "controls_whileUntil",
        "id": makeBlockId(),
        "fields": {
          "MODE": "WHILE"
        },
        "inputs": {
          "BOOL": {
            "block": convertExpressionToBlock(node.test)
          },
          "DO": {
            "block": convertStatementListToBlock(node.body)
          }
        }
      };
    }

    case 'If': {
      // Map to standard If-else branching
      const hasElse = node.orelse && node.orelse.length > 0;
      const isElif = hasElse && node.orelse.length === 1 && node.orelse[0].type === 'If';

      const ifBlock = {
        "type": "controls_if",
        "id": makeBlockId(),
        "extraState": {
          "hasElse": (hasElse && !isElif) ? true : undefined,
          "elseIfCount": isElif ? 1 : undefined
        },
        "inputs": {
          "IF0": {
            "block": convertExpressionToBlock(node.test)
          },
          "DO0": {
            "block": convertStatementListToBlock(node.body)
          }
        }
      };

      if (isElif) {
        const elifNode = node.orelse[0];
        ifBlock.inputs["IF1"] = {
          "block": convertExpressionToBlock(elifNode.test)
        };
        ifBlock.inputs["DO1"] = {
          "block": convertStatementListToBlock(elifNode.body)
        };
        // Check if the elif also has an else block
        if (elifNode.orelse && elifNode.orelse.length > 0) {
          ifBlock.extraState.hasElse = true;
          ifBlock.inputs["ELSE"] = {
            "block": convertStatementListToBlock(elifNode.orelse)
          };
        }
      } else if (hasElse) {
        ifBlock.inputs["ELSE"] = {
          "block": convertStatementListToBlock(node.orelse)
        };
      }

      return ifBlock;
    }

    case 'FunctionDef': {
      const body = node.body;
      const lastStmt = body[body.length - 1];
      const hasReturn = lastStmt && lastStmt.type === 'Return';
      const extraState = { "params": node.params.map(p => ({ name: p, id: p })) };
      if (node.decorators && node.decorators.length > 0) {
        extraState.decorators = node.decorators.map(d => astToPython(d));
      }
      const noComment = { "text": "", "pinned": false, "height": 80, "width": 160 };

      if (hasReturn) {
        const bodyBeforeReturn = body.slice(0, -1);
        const blockData = {
          "type": "procedures_defreturn",
          "id": makeBlockId(),
          "fields": { "NAME": node.name },
          "extraState": extraState,
          "comment": noComment,
          "inputs": {}
        };
        if (bodyBeforeReturn.length > 0) {
          blockData.inputs["STACK"] = { "block": convertStatementListToBlock(bodyBeforeReturn) };
        }
        if (lastStmt.value !== null) {
          blockData.inputs["RETURN"] = { "block": convertExpressionToBlock(lastStmt.value) };
        }
        return blockData;
      } else {
        const blockData = {
          "type": "procedures_defnoreturn",
          "id": makeBlockId(),
          "fields": { "NAME": node.name },
          "extraState": extraState,
          "comment": noComment,
          "inputs": {}
        };
        const stackBlock = convertStatementListToBlock(body);
        if (stackBlock) blockData.inputs["STACK"] = { "block": stackBlock };
        return blockData;
      }
    }
    case 'Return': {
      if (node.value === null) {
        return {
          "type": "function_return",
          "id": makeBlockId(),
          "fields": { "HAS_VALUE": "FALSE" }
        };
      }
      return {
        "type": "function_return",
        "id": makeBlockId(),
        "fields": { "HAS_VALUE": "TRUE" },
        "inputs": {
          "VALUE": {
            "block": convertExpressionToBlock(node.value)
          }
        }
      };
    }
    case 'ClassDef': {
      // Class body: methods (FunctionDef) become raw_statement blocks to allow nesting
      const classBodyBlock = convertClassBodyToBlock(node.body);
      const classDef = {
        "type": "class_def",
        "id": makeBlockId(),
        "fields": {
          "NAME": node.name,
          "BASES": node.bases.map(b => b.id).join(', ')
        },
        "inputs": {}
      };
      if (classBodyBlock) classDef.inputs["BODY"] = { "block": classBodyBlock };
      return classDef;
    }

    case 'Pass':
      // Dedicated "pass" block (controls_pass)
      return {
        "type": "controls_pass",
        "id": makeBlockId()
      };

    case 'Break':
      // Standard Blockly break/continue block (controls_flow_statements)
      return {
        "type": "controls_flow_statements",
        "id": makeBlockId(),
        "fields": { "FLOW": "BREAK" }
      };

    case 'Continue':
      return {
        "type": "controls_flow_statements",
        "id": makeBlockId(),
        "fields": { "FLOW": "CONTINUE" }
      };

    case 'Import': {
      // Dedicated import_statement block (module + optional alias).
      // Use the first imported name (the parser supports comma lists, but
      // the block models a single module/alias pair).
      const first = (node.names && node.names[0]) || { name: '', as: null };
      const importBlock = {
        "type": "import_statement",
        "id": makeBlockId(),
        "fields": {
          "MODULE": first.name,
          "ALIAS": first.as || ''
        }
      };
      return importBlock;
    }

    default:
      // Fallback for expressions occurring in statement context
      return makeGenericCallBlock(node);
  }
}

function convertClassBodyToBlock(stmts) {
  if (!stmts || stmts.length === 0) return null;
  let firstBlock = null, currentBlock = null;
  for (const stmt of stmts) {
    // Methods become raw_statement blocks so they can nest inside class_def BODY input
    const block = stmt.type === 'FunctionDef'
      ? { "type": "raw_statement", "id": makeBlockId(), "fields": { "STMT": astToPython(stmt, 0) } }
      : convertStatementToBlock(stmt);
    if (!block) continue;
    if (!firstBlock) { firstBlock = block; currentBlock = block; }
    else { currentBlock.next = { "block": block }; currentBlock = block; }
  }
  return firstBlock;
}

function convertStatementListToBlock(statements) {
  if (!statements || statements.length === 0) return null;
  
  let firstBlock = null;
  let currentBlock = null;

  for (const stmt of statements) {
    const block = convertStatementToBlock(stmt);
    if (!block) continue;

    if (!firstBlock) {
      firstBlock = block;
      currentBlock = block;
    } else {
      currentBlock.next = { "block": block };
      currentBlock = block;
    }
  }

  return firstBlock;
}

function getCallFullPath(funcNode) {
  if (funcNode.type === 'Name') {
    return { lib: 'global', func: funcNode.id };
  }
  if (funcNode.type === 'Attribute') {
    if (funcNode.value.type === 'Name') {
      return { lib: funcNode.value.id, func: funcNode.attr };
    }
    // Handle nested attribute access (e.g. a.b.c)
    let current = funcNode;
    const parts = [];
    while (current && current.type === 'Attribute') {
      parts.unshift(current.attr);
      current = current.value;
    }
    if (current && current.type === 'Name') {
      parts.unshift(current.id);
      return { lib: parts[0], func: parts.slice(1).join('_') };
    }
  }
  return null;
}

function convertCallExpression(node, isStatement = false) {
  if (node.func.type === 'Attribute' && node.func.value.type === 'Name' && node.func.value.id === 'sprite') {
    const attr = node.func.attr;
    
    // sprite.move(10)
    if (attr === 'move') {
      const stepsArg = node.args[0] || new NumNode(50);
      return {
        "type": "sprite_move",
        "id": makeBlockId(),
        "inputs": {
          "STEPS": {
            "block": convertExpressionToBlock(stepsArg)
          }
        }
      };
    }
    
    // sprite.turn_right(90) or sprite.turn(90)
    if (attr === 'turn_right' || attr === 'turn') {
      const angleArg = node.args[0] || new NumNode(90);
      return {
        "type": "sprite_turn",
        "id": makeBlockId(),
        "fields": {
          "DIRECTION": "right"
        },
        "inputs": {
          "ANGLE": {
            "block": convertExpressionToBlock(angleArg)
          }
        }
      };
    }

    // sprite.turn_left(90)
    if (attr === 'turn_left') {
      const angleArg = node.args[0] || new NumNode(90);
      return {
        "type": "sprite_turn",
        "id": makeBlockId(),
        "fields": {
          "DIRECTION": "left"
        },
        "inputs": {
          "ANGLE": {
            "block": convertExpressionToBlock(angleArg)
          }
        }
      };
    }

    // sprite.pen_down() or sprite.pen_up()
    if (attr === 'pen_down' || attr === 'pen_up') {
      return {
        "type": "sprite_pen",
        "id": makeBlockId(),
        "fields": {
          "PEN_STATE": attr === 'pen_down' ? 'down' : 'up'
        }
      };
    }

    // sprite.color("red")
    if (attr === 'color') {
      const colVal = node.args[0] ? node.args[0].value : '#a855f7';
      return {
        "type": "sprite_color",
        "id": makeBlockId(),
        "fields": {
          "COLOR": colVal
        }
      };
    }

    // sprite.say("Hello")
    if (attr === 'say') {
      const msgArg = node.args[0] || new StrNode('Hello!');
      return {
        "type": "sprite_say",
        "id": makeBlockId(),
        "inputs": {
          "MESSAGE": {
            "block": convertExpressionToBlock(msgArg)
          }
        }
      };
    }
  }

  // print("text")
  if (node.func.type === 'Name' && node.func.id === 'print') {
    const valArg = node.args[0] || new StrNode('');
    return {
      "type": "text_print",
      "id": makeBlockId(),
      "inputs": {
        "TEXT": {
          "block": convertExpressionToBlock(valArg)
        }
      }
    };
  }

  // list.append(val)
  if (node.func.type === 'Attribute' && node.func.attr === 'append') {
    const listExpr = node.func.value;
    const valArg = node.args[0] || new NumNode(0);
    
    return {
      "type": "list_append_custom",
      "id": makeBlockId(),
      "inputs": {
        "LIST": {
          "block": convertExpressionToBlock(listExpr)
        },
        "VALUE": {
          "block": convertExpressionToBlock(valArg)
        }
      }
    };
  }

  // Dynamic Abstract Library and Global calls
  const path = getCallFullPath(node.func);
  if (path) {
    const { lib: libName, func: funcName } = path;
    // Skip print and range standard overrides
    if (libName === 'global' && (funcName === 'print' || funcName === 'range')) {
      return null;
    }
    
    const blockType = `lib_${libName}_${funcName}`;
    
    // On-the-fly static block registration!
    if (!Blockly.Blocks[blockType] && window.appOrchestrator && window.appOrchestrator.abstractionEngine) {
      const args = node.args.map((_, idx) => `param_${idx}`);
      const hasOutput = !isStatement;
      const colour = libName === 'cv2' ? '#06b6d4' : (libName === 'global' ? '#b55bf7' : '#009688');
      const title = libName === 'global' ? `${funcName}` : `${libName}.${funcName}`;
      
      window.appOrchestrator.abstractionEngine.registerBlock(libName, funcName, args, hasOutput, colour, title);
      
      // Update orchestrator active blocks list & UI
      if (!window.appOrchestrator.abstractionEngine.activeBlocks.some(b => b.type === blockType)) {
        window.appOrchestrator.abstractionEngine.activeBlocks.push({
          type: blockType,
          title: title,
          hasOutput: hasOutput
        });
        window.appOrchestrator.abstractionEngine.installedBlocksCount++;
        
        const badgeCount = document.getElementById('dynamic-blocks-count');
        if (badgeCount) {
          badgeCount.innerText = `${window.appOrchestrator.abstractionEngine.installedBlocksCount} Blocks Installed`;
        }
        
        const blocksList = document.getElementById('dynamic-blocks-list');
        if (blocksList) {
          if (blocksList.querySelector('.empty-list-placeholder')) {
            blocksList.innerHTML = '';
          }
          const pill = document.createElement('div');
          pill.className = 'dyn-block-pill';
          pill.innerHTML = `
            <span class="dyn-block-name">${title}</span>
            <span class="dyn-block-type">${hasOutput ? 'Output Block' : 'Statement Block'}</span>
          `;
          blocksList.appendChild(pill);
        }
        
        window.appOrchestrator.abstractionEngine.updateBlocklyToolbox();
      }
    }
    
    if (Blockly.Blocks[blockType]) {
      const dynamicBlock = {
        "type": blockType,
        "id": makeBlockId(),
        "inputs": {}
      };
      
      node.args.forEach((arg, idx) => {
        dynamicBlock.inputs[`ARG${idx}`] = {
          "block": convertExpressionToBlock(arg)
        };
      });
      return dynamicBlock;
    }
  }

  return null;
}

function convertExpressionToBlock(node) {
  if (!node) return null;

  switch (node.type) {
    case 'Num':
      return {
        "type": "math_number",
        "id": makeBlockId(),
        "fields": {
          "NUM": node.value
        }
      };

    case 'Str':
      return {
        "type": "text",
        "id": makeBlockId(),
        "fields": {
          "TEXT": node.value
        }
      };

    case 'Bool':
      return {
        "type": "logic_boolean",
        "id": makeBlockId(),
        "fields": {
          "BOOL": node.value ? 'TRUE' : 'FALSE'
        }
      };

    case 'Name':
      if (node.id === 'True' || node.id === 'False') {
        return {
          "type": "logic_boolean",
          "id": makeBlockId(),
          "fields": { "BOOL": node.id.toUpperCase() }
        };
      }
      if (node.id === 'None') {
        return {
          "type": "logic_null",
          "id": makeBlockId()
        };
      }
      return {
        "type": "variables_get",
        "id": makeBlockId(),
        "fields": {
          "VAR": {
            "id": node.id
          }
        }
      };

    case 'List': {
      if (node.elts.length === 0) {
        return {
          "type": "lists_create_empty",
          "id": makeBlockId()
        };
      }
      // Map standard array list creation
      const listBlock = {
        "type": "lists_create_with",
        "id": makeBlockId(),
        "extraState": {
          "itemCount": node.elts.length
        },
        "inputs": {}
      };
      
      node.elts.forEach((elt, idx) => {
        listBlock.inputs[`ADD${idx}`] = {
          "block": convertExpressionToBlock(elt)
        };
      });

      return listBlock;
    }

    case 'BinOp': {
      // Unary minus/plus/not: parseUnary produces a BinOp with a null left operand.
      if (!node.left && (node.op === '-' || node.op === '+')) {
        // Unary plus is a no-op in Python — emit the operand directly.
        if (node.op === '+') {
          return convertExpressionToBlock(node.right);
        }
        // Unary minus → standard math_single NEG block.
        return {
          "type": "math_single",
          "id": makeBlockId(),
          "fields": { "OP": "NEG" },
          "inputs": {
            "NUM": {
              "block": convertExpressionToBlock(node.right)
            }
          }
        };
      }

      // [W3] Unary bitwise NOT `~x` → custom bitwise_not block (OP-11)
      if (!node.left && node.op === '~') {
        return {
          "type": "bitwise_not",
          "id": makeBlockId(),
          "inputs": {
            "VALUE": {
              "block": convertExpressionToBlock(node.right)
            }
          }
        };
      }

      // Standard mathematical operations
      const mathOps = { '+': 'ADD', '-': 'MINUS', '*': 'MULTIPLY', '/': 'DIVIDE' };
      if (mathOps[node.op]) {
        return {
          "type": "math_arithmetic",
          "id": makeBlockId(),
          "fields": {
            "OP": mathOps[node.op]
          },
          "inputs": {
            "A": {
              "block": convertExpressionToBlock(node.left)
            },
            "B": {
              "block": convertExpressionToBlock(node.right)
            }
          }
        };
      }

      // [W3] Modulo `%` → standard math_modulo block (OP-03)
      if (node.op === '%') {
        return {
          "type": "math_modulo",
          "id": makeBlockId(),
          "inputs": {
            "DIVIDEND": {
              "block": convertExpressionToBlock(node.left)
            },
            "DIVISOR": {
              "block": convertExpressionToBlock(node.right)
            }
          }
        };
      }

      // [W3] Power `**` → standard math_arithmetic block with OP=POWER (OP-04)
      if (node.op === '**') {
        return {
          "type": "math_arithmetic",
          "id": makeBlockId(),
          "fields": { "OP": "POWER" },
          "inputs": {
            "A": {
              "block": convertExpressionToBlock(node.left)
            },
            "B": {
              "block": convertExpressionToBlock(node.right)
            }
          }
        };
      }

      // [W3] Floor division `//` → custom math_int_divide block (OP-02)
      if (node.op === '//') {
        return {
          "type": "math_int_divide",
          "id": makeBlockId(),
          "inputs": {
            "A": {
              "block": convertExpressionToBlock(node.left)
            },
            "B": {
              "block": convertExpressionToBlock(node.right)
            }
          }
        };
      }

      // [W3] Binary bitwise ops `& | ^ << >>` → custom bitwise_operation block (OP-11)
      const bitwiseOps = { '&': 'AND', '|': 'OR', '^': 'XOR', '<<': 'LSHIFT', '>>': 'RSHIFT' };
      if (bitwiseOps[node.op]) {
        return {
          "type": "bitwise_operation",
          "id": makeBlockId(),
          "fields": { "OP": bitwiseOps[node.op] },
          "inputs": {
            "A": {
              "block": convertExpressionToBlock(node.left)
            },
            "B": {
              "block": convertExpressionToBlock(node.right)
            }
          }
        };
      }

      // [W3] Identity `is` / `is not` → custom identity_test block (OP-09)
      const identityOps = { 'is': 'IS', 'is not': 'IS_NOT' };
      if (identityOps[node.op]) {
        return {
          "type": "identity_test",
          "id": makeBlockId(),
          "fields": { "OP": identityOps[node.op] },
          "inputs": {
            "A": {
              "block": convertExpressionToBlock(node.left)
            },
            "B": {
              "block": convertExpressionToBlock(node.right)
            }
          }
        };
      }

      // [W3] Membership `in` / `not in` → custom membership_test block (OP-10)
      const membershipOps = { 'in': 'IN', 'not in': 'NOT_IN' };
      if (membershipOps[node.op]) {
        return {
          "type": "membership_test",
          "id": makeBlockId(),
          "fields": { "OP": membershipOps[node.op] },
          "inputs": {
            "A": {
              "block": convertExpressionToBlock(node.left)
            },
            "B": {
              "block": convertExpressionToBlock(node.right)
            }
          }
        };
      }

      // Comparisons: ==, !=, <, >, <=, >=
      const compOps = { '==': 'EQ', '!=': 'NEQ', '<': 'LT', '<=': 'LTE', '>': 'GT', '>=': 'GTE' };
      if (compOps[node.op]) {
        return {
          "type": "logic_compare",
          "id": makeBlockId(),
          "fields": {
            "OP": compOps[node.op]
          },
          "inputs": {
            "A": {
              "block": convertExpressionToBlock(node.left)
            },
            "B": {
              "block": convertExpressionToBlock(node.right)
            }
          }
        };
      }

      // Logical operations: and, or
      const logicalOps = { 'and': 'AND', 'or': 'OR' };
      if (logicalOps[node.op]) {
        return {
          "type": "logic_operation",
          "id": makeBlockId(),
          "fields": {
            "OP": logicalOps[node.op]
          },
          "inputs": {
            "A": {
              "block": convertExpressionToBlock(node.left)
            },
            "B": {
              "block": convertExpressionToBlock(node.right)
            }
          }
        };
      }

      // Unary logical negation: not
      if (node.op === 'not') {
        return {
          "type": "logic_negate",
          "id": makeBlockId(),
          "inputs": {
            "BOOL": {
              "block": convertExpressionToBlock(node.right)
            }
          }
        };
      }

      // List indexing extraction: arr[i] -> represented using Blockly lists_getIndex block
      if (node.op === 'INDEX') {
        return {
          "type": "lists_getIndex",
          "id": makeBlockId(),
          "fields": {
            "MODE": "GET",
            "WHERE": "FROM_START"
          },
          "inputs": {
            "VALUE": {
              "block": convertExpressionToBlock(node.left)
            },
            "AT": {
              "block": convertExpressionToBlock(node.right)
            }
          }
        };
      }

      break;
    }

    case 'Call': {
      const callVal = convertCallExpression(node, false);
      if (callVal) return callVal;
      // User-defined function call: use raw_expression to preserve semantics
      return {
        "type": "raw_expression",
        "id": makeBlockId(),
        "fields": { "EXPR": astToPython(node) }
      };
    }

    case 'Lambda':
      // Use raw_expression to preserve lambda as callable (not string literal)
      return {
        "type": "raw_expression",
        "id": makeBlockId(),
        "fields": { "EXPR": astToPython(node) }
      };

    case 'Ternary':
      // a if cond else b  ->  custom logic_ternary block (IF / THEN / ELSE)
      return {
        "type": "logic_ternary",
        "id": makeBlockId(),
        "inputs": {
          "IF": {
            "block": convertExpressionToBlock(node.test)
          },
          "THEN": {
            "block": convertExpressionToBlock(node.body)
          },
          "ELSE": {
            "block": convertExpressionToBlock(node.orelse)
          }
        }
      };

    case 'ListComp': {
      // [expr for var in iter (if cond)?]  ->  custom list_comprehension block
      const targetName = node.target && node.target.type === 'Name' ? node.target.id : 'x';
      const compBlock = {
        "type": "list_comprehension",
        "id": makeBlockId(),
        "extraState": {
          "hasFilter": node.ifs ? true : undefined
        },
        "fields": {
          "VAR": targetName
        },
        "inputs": {
          "EXPR": {
            "block": convertExpressionToBlock(node.elt)
          },
          "ITER": {
            "block": convertExpressionToBlock(node.iter)
          }
        }
      };
      if (node.ifs) {
        compBlock.inputs["COND"] = {
          "block": convertExpressionToBlock(node.ifs)
        };
      }
      return compBlock;
    }

    case 'Attribute':
      // obj.attr  ->  custom attribute_access block (OBJECT value + NAME field)
      return {
        "type": "attribute_access",
        "id": makeBlockId(),
        "fields": {
          "NAME": node.attr
        },
        "inputs": {
          "OBJECT": {
            "block": convertExpressionToBlock(node.value)
          }
        }
      };

  }

  // Fallback for unrecognized expressions inside values
  return {
    "type": "text",
    "id": makeBlockId(),
    "fields": {
      "TEXT": astToPython(node)
    }
  };
}

function makeGenericCallBlock(node) {
  // Graceful fallback: raw statement block preserving Python semantics
  return {
    "type": "raw_statement",
    "id": makeBlockId(),
    "fields": { "STMT": astToPython(node) }
  };
}

// Register a custom visual "list append" block for Blockly since standard blockly is quite complex for appends
Blockly.Blocks['list_append_custom'] = {
  init: function() {
    this.appendValueInput("LIST")
        .setCheck("Array")
        .appendField("append to list");
    this.appendValueInput("VALUE")
        .setCheck(null)
        .appendField("item");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(120);
    this.setTooltip("Appends an item to the end of a list.");
    this.setHelpUrl("");
  }
};

Blockly.Python['list_append_custom'] = function(block) {
  const list = Blockly.Python.valueToCode(block, 'LIST', Blockly.Python.ORDER_MEMBER) || '[]';
  const val = Blockly.Python.valueToCode(block, 'VALUE', Blockly.Python.ORDER_NONE) || 'None';
  return `${list}.append(${val})\n`;
};
if (Blockly.Python.forBlock) {
  Blockly.Python.forBlock['list_append_custom'] = Blockly.Python['list_append_custom'];
}

// --- Custom Sprite & Pen Block Registrations ---
Blockly.Blocks['sprite_move'] = {
  init: function() {
    this.appendValueInput("STEPS")
        .setCheck("Number")
        .appendField("move");
    this.appendDummyInput()
        .appendField("steps");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour("#2b82c9");
    this.setTooltip("Moves the sprite forward by the specified number of steps.");
    this.setHelpUrl("");
  }
};

Blockly.Python['sprite_move'] = function(block) {
  const steps = Blockly.Python.valueToCode(block, 'STEPS', Blockly.Python.ORDER_NONE) || '50';
  return `sprite.move(${steps})\n`;
};
if (Blockly.Python.forBlock) {
  Blockly.Python.forBlock['sprite_move'] = Blockly.Python['sprite_move'];
}

Blockly.Blocks['sprite_turn'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("turn")
        .appendField(new Blockly.FieldDropdown([["right", "right"], ["left", "left"]]), "DIRECTION");
    this.appendValueInput("ANGLE")
        .setCheck("Number");
    this.appendDummyInput()
        .appendField("degrees");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour("#2b82c9");
    this.setTooltip("Turns the sprite right or left by the specified angle.");
    this.setHelpUrl("");
  }
};

Blockly.Python['sprite_turn'] = function(block) {
  const direction = block.getFieldValue('DIRECTION');
  const angle = Blockly.Python.valueToCode(block, 'ANGLE', Blockly.Python.ORDER_NONE) || '90';
  return `sprite.turn_${direction}(${angle})\n`;
};
if (Blockly.Python.forBlock) {
  Blockly.Python.forBlock['sprite_turn'] = Blockly.Python['sprite_turn'];
}

Blockly.Blocks['sprite_pen'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("pen")
        .appendField(new Blockly.FieldDropdown([["down", "down"], ["up", "up"]]), "PEN_STATE");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour("#2b82c9");
    this.setTooltip("Sets the pen state to draw or stop drawing.");
    this.setHelpUrl("");
  }
};

Blockly.Python['sprite_pen'] = function(block) {
  const state = block.getFieldValue('PEN_STATE');
  return `sprite.pen_${state}()\n`;
};
if (Blockly.Python.forBlock) {
  Blockly.Python.forBlock['sprite_pen'] = Blockly.Python['sprite_pen'];
}

Blockly.Blocks['sprite_color'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("set pen color to")
        .appendField(new Blockly.FieldTextInput("#a855f7"), "COLOR");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour("#2b82c9");
    this.setTooltip("Sets the drawing pen color.");
    this.setHelpUrl("");
  }
};

Blockly.Python['sprite_color'] = function(block) {
  const color = block.getFieldValue('COLOR');
  return `sprite.color("${color}")\n`;
};
if (Blockly.Python.forBlock) {
  Blockly.Python.forBlock['sprite_color'] = Blockly.Python['sprite_color'];
}

Blockly.Blocks['sprite_say'] = {
  init: function() {
    this.appendValueInput("MESSAGE")
        .setCheck(null)
        .appendField("say");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour("#2b82c9");
    this.setTooltip("Shows a speech bubble with the message.");
    this.setHelpUrl("");
  }
};

Blockly.Python['sprite_say'] = function(block) {
  const msg = Blockly.Python.valueToCode(block, 'MESSAGE', Blockly.Python.ORDER_NONE) || '""';
  return `sprite.say(${msg})\n`;
};
if (Blockly.Python.forBlock) {
  Blockly.Python.forBlock['sprite_say'] = Blockly.Python['sprite_say'];
}

// Custom class definition block
Blockly.Blocks['class_def'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("class")
        .appendField(new Blockly.FieldTextInput("MyClass"), "NAME")
        .appendField("(")
        .appendField(new Blockly.FieldTextInput(""), "BASES")
        .appendField(")");
    this.appendStatementInput("BODY")
        .setCheck(null)
        .appendField("body");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour("#8b5cf6");
    this.setTooltip("Defines a Python class");
  }
};

Blockly.Python['class_def'] = function(block) {
  const name = block.getFieldValue('NAME');
  const bases = (block.getFieldValue('BASES') || '').trim();
  const baseList = bases ? `(${bases})` : '';
  const body = Blockly.Python.statementToCode(block, 'BODY') || '    pass\n';
  return `class ${name}${baseList}:\n${body}\n`;
};
if (Blockly.Python.forBlock) {
  Blockly.Python.forBlock['class_def'] = Blockly.Python['class_def'];
}

// Raw Python statement block — used as fallback for statements that can't map to built-in blocks
Blockly.Blocks['raw_statement'] = {
  init: function() {
    this.appendDummyInput().appendField(new Blockly.FieldTextInput('stmt'), 'STMT');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#888888');
    this.setTooltip('Raw Python statement');
  }
};
Blockly.Python['raw_statement'] = function(block) {
  return block.getFieldValue('STMT') + '\n';
};
if (Blockly.Python.forBlock) {
  Blockly.Python.forBlock['raw_statement'] = Blockly.Python['raw_statement'];
}

// Raw Python expression block — used as fallback for expressions that can't map to built-in blocks
Blockly.Blocks['raw_expression'] = {
  init: function() {
    this.appendDummyInput().appendField(new Blockly.FieldTextInput('expr'), 'EXPR');
    this.setOutput(true, null);
    this.setColour('#888888');
    this.setTooltip('Raw Python expression');
  }
};
Blockly.Python['raw_expression'] = function(block) {
  const expr = block.getFieldValue('EXPR');
  return [expr, Blockly.Python.ORDER_ATOMIC];
};
if (Blockly.Python.forBlock) {
  Blockly.Python.forBlock['raw_expression'] = Blockly.Python['raw_expression'];
}

// Custom function return block (replaces procedures_ifreturn which is restricted to defreturn)
Blockly.Blocks['function_return'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("return");
    this.appendValueInput("VALUE")
        .setCheck(null);
    this.setPreviousStatement(true, null);
    this.setNextStatement(false, null);
    this.setColour("#9b59b6");
    this.setTooltip("Returns a value from the function");
  }
};
Blockly.Python['function_return'] = function(block) {
  const val = Blockly.Python.valueToCode(block, 'VALUE', Blockly.Python.ORDER_NONE);
  return val ? `return ${val}\n` : `return\n`;
};
if (Blockly.Python.forBlock) {
  Blockly.Python.forBlock['function_return'] = Blockly.Python['function_return'];
}

// ── New custom blocks (ternary, comprehension, pass, import, attribute) ──────

// Ternary conditional expression: (THEN if IF else ELSE)
Blockly.Blocks['logic_ternary'] = {
  init: function() {
    this.appendValueInput("THEN")
        .setCheck(null);
    this.appendValueInput("IF")
        .setCheck("Boolean")
        .appendField("if");
    this.appendValueInput("ELSE")
        .setCheck(null)
        .appendField("else");
    this.setOutput(true, null);
    this.setInputsInline(true);
    this.setColour("#5b80a5");
    this.setTooltip("Conditional (ternary) expression: value if condition else other value.");
    this.setHelpUrl("");
  }
};
Blockly.Python['logic_ternary'] = function(block) {
  const cond = Blockly.Python.valueToCode(block, 'IF', Blockly.Python.ORDER_CONDITIONAL) || 'False';
  const thenVal = Blockly.Python.valueToCode(block, 'THEN', Blockly.Python.ORDER_CONDITIONAL) || 'None';
  const elseVal = Blockly.Python.valueToCode(block, 'ELSE', Blockly.Python.ORDER_CONDITIONAL) || 'None';
  const code = `${thenVal} if ${cond} else ${elseVal}`;
  return [code, Blockly.Python.ORDER_CONDITIONAL];
};
if (Blockly.Python.forBlock) {
  Blockly.Python.forBlock['logic_ternary'] = Blockly.Python['logic_ternary'];
}

// List comprehension: [EXPR for VAR in ITER (if COND)?]
Blockly.Blocks['list_comprehension'] = {
  init: function() {
    this.appendValueInput("EXPR")
        .setCheck(null)
        .appendField("[");
    this.appendDummyInput()
        .appendField("for")
        .appendField(new Blockly.FieldTextInput("x"), "VAR")
        .appendField("in");
    this.appendValueInput("ITER")
        .setCheck(null);
    this.appendValueInput("COND")
        .setCheck("Boolean")
        .appendField("if");
    this.appendDummyInput()
        .appendField("]");
    this.setOutput(true, "Array");
    this.setInputsInline(true);
    this.setColour("#745ba5");
    this.setTooltip("List comprehension. Leave the 'if' input empty for no filter.");
    this.setHelpUrl("");
  }
};
Blockly.Python['list_comprehension'] = function(block) {
  const expr = Blockly.Python.valueToCode(block, 'EXPR', Blockly.Python.ORDER_NONE) || 'x';
  const varName = block.getFieldValue('VAR') || 'x';
  const iter = Blockly.Python.valueToCode(block, 'ITER', Blockly.Python.ORDER_NONE) || '[]';
  const cond = Blockly.Python.valueToCode(block, 'COND', Blockly.Python.ORDER_NONE);
  const filterStr = cond ? ` if ${cond}` : '';
  const code = `[${expr} for ${varName} in ${iter}${filterStr}]`;
  return [code, Blockly.Python.ORDER_ATOMIC];
};
if (Blockly.Python.forBlock) {
  Blockly.Python.forBlock['list_comprehension'] = Blockly.Python['list_comprehension'];
}

// pass statement
Blockly.Blocks['controls_pass'] = {
  init: function() {
    this.appendDummyInput().appendField("pass");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour("#5ba55b");
    this.setTooltip("Does nothing (Python 'pass' statement).");
    this.setHelpUrl("");
  }
};
Blockly.Python['controls_pass'] = function() {
  return 'pass\n';
};
if (Blockly.Python.forBlock) {
  Blockly.Python.forBlock['controls_pass'] = Blockly.Python['controls_pass'];
}

// import statement: import <module> (as <alias>)?
Blockly.Blocks['import_statement'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("import")
        .appendField(new Blockly.FieldTextInput("math"), "MODULE")
        .appendField("as")
        .appendField(new Blockly.FieldTextInput(""), "ALIAS");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour("#b55bf7");
    this.setTooltip("Imports a module. Leave 'as' empty to import under its own name.");
    this.setHelpUrl("");
  }
};
Blockly.Python['import_statement'] = function(block) {
  const moduleName = (block.getFieldValue('MODULE') || '').trim();
  const alias = (block.getFieldValue('ALIAS') || '').trim();
  if (!moduleName) return '';
  return alias ? `import ${moduleName} as ${alias}\n` : `import ${moduleName}\n`;
};
if (Blockly.Python.forBlock) {
  Blockly.Python.forBlock['import_statement'] = Blockly.Python['import_statement'];
}

// attribute access: <object>.<name>
Blockly.Blocks['attribute_access'] = {
  init: function() {
    this.appendValueInput("OBJECT")
        .setCheck(null);
    this.appendDummyInput()
        .appendField(".")
        .appendField(new Blockly.FieldTextInput("attr"), "NAME");
    this.setOutput(true, null);
    this.setInputsInline(true);
    this.setColour("#a55b80");
    this.setTooltip("Accesses an attribute of an object: object.name");
    this.setHelpUrl("");
  }
};
Blockly.Python['attribute_access'] = function(block) {
  const object = Blockly.Python.valueToCode(block, 'OBJECT', Blockly.Python.ORDER_MEMBER) || 'obj';
  const name = block.getFieldValue('NAME') || 'attr';
  return [`${object}.${name}`, Blockly.Python.ORDER_MEMBER];
};
if (Blockly.Python.forBlock) {
  Blockly.Python.forBlock['attribute_access'] = Blockly.Python['attribute_access'];
}

// ── [W3] Operator custom blocks (floor-div, bitwise, identity, membership) ──

// [W3] Floor division: A // B (OP-02)
Blockly.Blocks['math_int_divide'] = {
  init: function() {
    this.appendValueInput("A").setCheck("Number");
    this.appendValueInput("B").setCheck("Number").appendField("//");
    this.setInputsInline(true);
    this.setOutput(true, "Number");
    this.setColour("#5b67a5");
    this.setTooltip("Integer (floor) division: A // B");
    this.setHelpUrl("");
  }
};
Blockly.Python['math_int_divide'] = function(block) {
  const a = Blockly.Python.valueToCode(block, 'A', Blockly.Python.ORDER_MULTIPLICATIVE) || '0';
  const b = Blockly.Python.valueToCode(block, 'B', Blockly.Python.ORDER_MULTIPLICATIVE) || '1';
  return [`${a} // ${b}`, Blockly.Python.ORDER_MULTIPLICATIVE];
};
if (Blockly.Python.forBlock) {
  Blockly.Python.forBlock['math_int_divide'] = Blockly.Python['math_int_divide'];
}

// [W3] Binary bitwise operations: A & | ^ << >> B (OP-11)
Blockly.Blocks['bitwise_operation'] = {
  init: function() {
    this.appendValueInput("A").setCheck("Number");
    this.appendValueInput("B").setCheck("Number")
        .appendField(new Blockly.FieldDropdown([
          ["&", "AND"], ["|", "OR"], ["^", "XOR"], ["<<", "LSHIFT"], [">>", "RSHIFT"]
        ]), "OP");
    this.setInputsInline(true);
    this.setOutput(true, "Number");
    this.setColour("#5b67a5");
    this.setTooltip("Bitwise operation: AND (&), OR (|), XOR (^), left shift (<<), right shift (>>).");
    this.setHelpUrl("");
  }
};
Blockly.Python['bitwise_operation'] = function(block) {
  const opMap = { 'AND': ['&', Blockly.Python.ORDER_BITWISE_AND],
                  'OR': ['|', Blockly.Python.ORDER_BITWISE_OR],
                  'XOR': ['^', Blockly.Python.ORDER_BITWISE_XOR],
                  'LSHIFT': ['<<', Blockly.Python.ORDER_BITWISE_SHIFT],
                  'RSHIFT': ['>>', Blockly.Python.ORDER_BITWISE_SHIFT] };
  const opKey = block.getFieldValue('OP');
  const entry = opMap[opKey] || ['&', Blockly.Python.ORDER_BITWISE_AND];
  const order = (typeof entry[1] === 'number') ? entry[1] : Blockly.Python.ORDER_NONE;
  const a = Blockly.Python.valueToCode(block, 'A', order) || '0';
  const b = Blockly.Python.valueToCode(block, 'B', order) || '0';
  return [`${a} ${entry[0]} ${b}`, order];
};
if (Blockly.Python.forBlock) {
  Blockly.Python.forBlock['bitwise_operation'] = Blockly.Python['bitwise_operation'];
}

// [W3] Unary bitwise NOT: ~A (OP-11)
Blockly.Blocks['bitwise_not'] = {
  init: function() {
    this.appendValueInput("VALUE").setCheck("Number").appendField("~");
    this.setInputsInline(true);
    this.setOutput(true, "Number");
    this.setColour("#5b67a5");
    this.setTooltip("Bitwise NOT (one's complement): ~value");
    this.setHelpUrl("");
  }
};
Blockly.Python['bitwise_not'] = function(block) {
  const order = (typeof Blockly.Python.ORDER_BITWISE_NOT === 'number')
    ? Blockly.Python.ORDER_BITWISE_NOT
    : (typeof Blockly.Python.ORDER_UNARY_SIGN === 'number' ? Blockly.Python.ORDER_UNARY_SIGN : Blockly.Python.ORDER_NONE);
  const val = Blockly.Python.valueToCode(block, 'VALUE', order) || '0';
  return [`~${val}`, order];
};
if (Blockly.Python.forBlock) {
  Blockly.Python.forBlock['bitwise_not'] = Blockly.Python['bitwise_not'];
}

// [W3] Identity test: A is B / A is not B (OP-09)
Blockly.Blocks['identity_test'] = {
  init: function() {
    this.appendValueInput("A").setCheck(null);
    this.appendValueInput("B").setCheck(null)
        .appendField(new Blockly.FieldDropdown([
          ["is", "IS"], ["is not", "IS_NOT"]
        ]), "OP");
    this.setInputsInline(true);
    this.setOutput(true, "Boolean");
    this.setColour("#5b80a5");
    this.setTooltip("Identity test: checks whether two values are the same object.");
    this.setHelpUrl("");
  }
};
Blockly.Python['identity_test'] = function(block) {
  const opKey = block.getFieldValue('OP');
  const opStr = opKey === 'IS_NOT' ? 'is not' : 'is';
  const order = (typeof Blockly.Python.ORDER_RELATIONAL === 'number') ? Blockly.Python.ORDER_RELATIONAL : Blockly.Python.ORDER_NONE;
  const a = Blockly.Python.valueToCode(block, 'A', order) || 'None';
  const b = Blockly.Python.valueToCode(block, 'B', order) || 'None';
  return [`${a} ${opStr} ${b}`, order];
};
if (Blockly.Python.forBlock) {
  Blockly.Python.forBlock['identity_test'] = Blockly.Python['identity_test'];
}

// [W3] Membership test: A in B / A not in B (OP-10)
Blockly.Blocks['membership_test'] = {
  init: function() {
    this.appendValueInput("A").setCheck(null);
    this.appendValueInput("B").setCheck(null)
        .appendField(new Blockly.FieldDropdown([
          ["in", "IN"], ["not in", "NOT_IN"]
        ]), "OP");
    this.setInputsInline(true);
    this.setOutput(true, "Boolean");
    this.setColour("#5b80a5");
    this.setTooltip("Membership test: checks whether a value is contained in a collection.");
    this.setHelpUrl("");
  }
};
Blockly.Python['membership_test'] = function(block) {
  const opKey = block.getFieldValue('OP');
  const opStr = opKey === 'NOT_IN' ? 'not in' : 'in';
  const order = (typeof Blockly.Python.ORDER_RELATIONAL === 'number') ? Blockly.Python.ORDER_RELATIONAL : Blockly.Python.ORDER_NONE;
  const a = Blockly.Python.valueToCode(block, 'A', order) || 'None';
  const b = Blockly.Python.valueToCode(block, 'B', order) || '[]';
  return [`${a} ${opStr} ${b}`, order];
};
if (Blockly.Python.forBlock) {
  Blockly.Python.forBlock['membership_test'] = Blockly.Python['membership_test'];
}

// [W3] math_modulo & math_arithmetic come from the Blockly CDN; only provide a
// generator if the CDN default is missing (don't clobber a working default).
if (!Blockly.Python['math_modulo']) {
  Blockly.Python['math_modulo'] = function(block) {
    const order = (typeof Blockly.Python.ORDER_MULTIPLICATIVE === 'number') ? Blockly.Python.ORDER_MULTIPLICATIVE : Blockly.Python.ORDER_NONE;
    const dividend = Blockly.Python.valueToCode(block, 'DIVIDEND', order) || '0';
    const divisor = Blockly.Python.valueToCode(block, 'DIVISOR', order) || '1';
    return [`${dividend} % ${divisor}`, order];
  };
}
if (Blockly.Python.forBlock && !Blockly.Python.forBlock['math_modulo']) {
  Blockly.Python.forBlock['math_modulo'] = Blockly.Python['math_modulo'];
}

// logic_null & controls_flow_statements come from the Blockly CDN; only provide
// a generator if the CDN default is missing (don't clobber a working default).
if (!Blockly.Python['logic_null']) {
  Blockly.Python['logic_null'] = function() {
    return ['None', Blockly.Python.ORDER_ATOMIC];
  };
}
if (Blockly.Python.forBlock && !Blockly.Python.forBlock['logic_null']) {
  Blockly.Python.forBlock['logic_null'] = Blockly.Python['logic_null'];
}

if (!Blockly.Python['controls_flow_statements']) {
  Blockly.Python['controls_flow_statements'] = function(block) {
    const flow = block.getFieldValue('FLOW');
    return flow === 'CONTINUE' ? 'continue\n' : 'break\n';
  };
}
if (Blockly.Python.forBlock && !Blockly.Python.forBlock['controls_flow_statements']) {
  Blockly.Python.forBlock['controls_flow_statements'] = Blockly.Python['controls_flow_statements'];
}

// Python generators for built-in Blockly procedure blocks
Blockly.Python['procedures_defnoreturn'] = function(block) {
  if (block.commentModel) block.commentModel.text = '';
  const name = block.getFieldValue('NAME');
  const params = (block.arguments_ || []).join(', ');
  const branch = Blockly.Python.statementToCode(block, 'STACK') || '    pass\n';
  return `def ${name}(${params}):\n${branch}\n`;
};
if (Blockly.Python.forBlock) {
  Blockly.Python.forBlock['procedures_defnoreturn'] = Blockly.Python['procedures_defnoreturn'];
}

Blockly.Python['procedures_defreturn'] = function(block) {
  if (block.commentModel) block.commentModel.text = '';
  const name = block.getFieldValue('NAME');
  const params = (block.arguments_ || []).join(', ');
  const branch = Blockly.Python.statementToCode(block, 'STACK') || '';
  const returnValue = Blockly.Python.valueToCode(block, 'RETURN', Blockly.Python.ORDER_NONE) || '';
  const returnStmt = returnValue ? `    return ${returnValue}\n` : '';
  const fallback = returnStmt ? '' : '    pass\n';
  return `def ${name}(${params}):\n${branch || fallback}${returnStmt}\n`;
};
if (Blockly.Python.forBlock) {
  Blockly.Python.forBlock['procedures_defreturn'] = Blockly.Python['procedures_defreturn'];
}

Blockly.Python['procedures_ifreturn'] = function(block) {
  const val = Blockly.Python.valueToCode(block, 'VALUE', Blockly.Python.ORDER_NONE);
  return val ? `return ${val}\n` : `return\n`;
};
if (Blockly.Python.forBlock) {
  Blockly.Python.forBlock['procedures_ifreturn'] = Blockly.Python['procedures_ifreturn'];
}

// -------------------------------------------------------------

// Expose functions globally for modular interaction
// -------------------------------------------------------------
const BlockPyParser = {
  TokenType,
  Tokenizer,
  Parser,
  astToPython,
  astToBlockly,
  ProgramNode,
  AssignNode,
  AugAssignNode,
  ForNode,
  WhileNode,
  IfNode,
  CallNode,
  ListCompNode,
  TernaryNode,
  AttributeNode,
  NameNode,
  NumNode,
  StrNode,
  BoolNode,
  ListNode,
  BinOpNode,
  RangeNode,
  ImportNode,
  FunctionDefNode,
  ReturnNode,
  ClassDefNode,
  LambdaNode,
  PassNode,
  BreakNode,
  ContinueNode
};

// ── OpenCV Blocks ──────────────────────────────────────────────────────────────

Blockly.Blocks['cv2_videocapture'] = {
  init: function() {
    this.appendValueInput('DEVICE').setCheck('Number').appendField('cv2.VideoCapture(');
    this.appendDummyInput().appendField(')');
    this.setOutput(true, null);
    this.setColour('#c0392b');
    this.setTooltip('Open a camera or video file');
  }
};
Blockly.Python['cv2_videocapture'] = function(block) {
  const dev = Blockly.Python.valueToCode(block, 'DEVICE', Blockly.Python.ORDER_NONE) || '0';
  return [`cv2.VideoCapture(${dev})`, Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Blocks['cv2_read'] = {
  init: function() {
    this.appendValueInput('CAP').setCheck(null).appendField('cap =');
    this.appendDummyInput().appendField('.read()  → frame');
    this.setOutput(true, null);
    this.setColour('#c0392b');
    this.setTooltip('Read a frame from a VideoCapture');
  }
};
Blockly.Python['cv2_read'] = function(block) {
  const cap = Blockly.Python.valueToCode(block, 'CAP', Blockly.Python.ORDER_MEMBER) || 'cap';
  return [`${cap}.read()`, Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Blocks['cv2_imshow'] = {
  init: function() {
    this.appendValueInput('TITLE').setCheck('String').appendField('cv2.imshow(');
    this.appendValueInput('FRAME').setCheck(null).appendField(',');
    this.appendDummyInput().appendField(')');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#c0392b');
    this.setTooltip('Show an image in a named window');
  }
};
Blockly.Python['cv2_imshow'] = function(block) {
  const title = Blockly.Python.valueToCode(block, 'TITLE', Blockly.Python.ORDER_NONE) || '"Frame"';
  const frame = Blockly.Python.valueToCode(block, 'FRAME', Blockly.Python.ORDER_NONE) || 'frame';
  return `cv2.imshow(${title}, ${frame})\n`;
};

Blockly.Blocks['cv2_waitkey'] = {
  init: function() {
    this.appendValueInput('DELAY').setCheck('Number').appendField('cv2.waitKey(');
    this.appendDummyInput().appendField(')');
    this.setOutput(true, 'Number');
    this.setColour('#c0392b');
    this.setTooltip('Wait for a key press (ms). 0 = forever, 1 = 1ms');
  }
};
Blockly.Python['cv2_waitkey'] = function(block) {
  const delay = Blockly.Python.valueToCode(block, 'DELAY', Blockly.Python.ORDER_NONE) || '1';
  return [`cv2.waitKey(${delay})`, Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Blocks['cv2_destroyall'] = {
  init: function() {
    this.appendDummyInput().appendField('cv2.destroyAllWindows()');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#c0392b');
    this.setTooltip('Close all OpenCV windows');
  }
};
Blockly.Python['cv2_destroyall'] = function() {
  return 'cv2.destroyAllWindows()\n';
};

Blockly.Blocks['cv2_release'] = {
  init: function() {
    this.appendValueInput('CAP').setCheck(null).appendField('');
    this.appendDummyInput().appendField('.release()');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#c0392b');
    this.setTooltip('Release the camera');
  }
};
Blockly.Python['cv2_release'] = function(block) {
  const cap = Blockly.Python.valueToCode(block, 'CAP', Blockly.Python.ORDER_MEMBER) || 'cap';
  return `${cap}.release()\n`;
};

// Register forBlock aliases
['cv2_videocapture','cv2_read','cv2_imshow','cv2_waitkey','cv2_destroyall','cv2_release'].forEach(t => {
  if (Blockly.Python.forBlock) Blockly.Python.forBlock[t] = Blockly.Python[t];
});

if (typeof window !== 'undefined') {
  window.BlockPyParser = BlockPyParser;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BlockPyParser;
}
