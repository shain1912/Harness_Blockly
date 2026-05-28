require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const BlockPyDesugarer = require('./src/utils/desugarer');
const BlockPyAbstraction = require('./src/utils/libraryAbstraction');

const app = express();
app.use(cors());
app.use(express.json());

// ─── MiniMax API Key Pool (Round-Robin) ───────────────────────────────────────
const MINIMAX_KEYS = [
  process.env.MINIMAX1,
  process.env.MINIMAX2,
  process.env.MINIMAX3,
  process.env.MINIMAX4
].filter(Boolean);

if (MINIMAX_KEYS.length === 0) {
  console.error('[MiniMax] ⚠️  No API keys found in .env (MINIMAX1~MINIMAX4). AI endpoints will be unavailable.');
}

let keyIndex = 0;
function getNextKey() {
  const key = MINIMAX_KEYS[keyIndex % MINIMAX_KEYS.length];
  keyIndex++;
  return key;
}

// Build an Anthropic client pointed at MiniMax's Anthropic-compatible endpoint
function createMiniMaxClient() {
  return new Anthropic({
    apiKey: getNextKey(),
    baseURL: 'https://api.minimax.io/anthropic',
  });
}

const MINIMAX_MODEL = 'MiniMax-M2.7';

// ─── Helper: stream thinking + text blocks from MiniMax response ─────────────
async function callMiniMax(systemPrompt, userContent, opts = {}) {
  const client = createMiniMaxClient();
  const message = await client.messages.create({
    model: MINIMAX_MODEL,
    max_tokens: opts.maxTokens || 2048,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: userContent }]
      }
    ]
  });

  let thinkingText = '';
  let responseText = '';

  for (const block of message.content) {
    if (block.type === 'thinking') thinkingText += block.thinking;
    else if (block.type === 'text') responseText += block.text;
  }

  return { thinkingText, responseText };
}

// ─── 1. AST Desugar (heuristic – no AI cost) ─────────────────────────────────
app.post('/api/desugar', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code is required' });
  const result = BlockPyDesugarer.desugarPythonCode(code);
  res.json(result);
});

// ─── 2. AI Normalize: MiniMax rewrites Python into block-friendly form ────────
app.post('/api/ai-normalize', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code is required' });

  // Fast heuristic first pass
  const heuristic = BlockPyDesugarer.desugarPythonCode(code);

  if (MINIMAX_KEYS.length === 0) {
    // Fallback to heuristic only
    return res.json({
      success: heuristic.success,
      desugaredPython: heuristic.desugaredPython || code,
      explanation: '[Heuristic] AI key unavailable – heuristic desugaring applied.',
      ast: heuristic.desugaredAST,
      thoughts: []
    });
  }

  try {
    const systemPrompt = `You are a Python code normalizer for a visual block programming system.
Your task: rewrite Python code into the simplest, most "block-friendly" equivalent.

Rules (strict):
1. Unroll ALL list comprehensions into a standard for-loop with .append().
2. Expand ALL ternary expressions (x if cond else y) into full if/else blocks.
3. Split ALL chained comparisons (a < b < c) into (a < b and b < c).
4. Keep all other logic identical – never change semantics.
5. Never add imports, comments, or explanations in the code output.
6. Output ONLY the transformed Python code, nothing else.`;

    const { thinkingText, responseText } = await callMiniMax(systemPrompt, code, { maxTokens: 2048 });

    const thoughts = thinkingText
      ? thinkingText.split('\n').filter(l => l.trim()).slice(0, 8)
      : ['AI normalizer applied. Code is now block-friendly.'];

    res.json({
      success: true,
      desugaredPython: responseText.trim() || heuristic.desugaredPython || code,
      explanation: 'MiniMax-M2.7 rewrote the code into block-safe canonical form.',
      ast: heuristic.desugaredAST,
      thoughts
    });
  } catch (err) {
    console.error('[/api/ai-normalize] MiniMax error:', err.message);
    // Graceful fallback
    res.json({
      success: heuristic.success,
      desugaredPython: heuristic.desugaredPython || code,
      explanation: `[Fallback] MiniMax error (${err.message}). Heuristic applied.`,
      ast: heuristic.desugaredAST,
      thoughts: [`Error: ${err.message}`]
    });
  }
});

// ─── 3. AI Library Abstraction: MiniMax designs visual blocks for a library ───
app.post('/api/ai-abstract', async (req, res) => {
  const { libName, customCode } = req.body;
  if (!libName) return res.status(400).json({ error: 'libName is required' });

  // Check built-in presets first (no AI cost)
  if (libName !== 'custom') {
    const preset = BlockPyAbstraction.AI_PRESETS[libName];
    if (preset) {
      return res.json({ success: true, libName, thoughts: preset.thoughts, blocks: preset.blocks });
    }
  }

  // Custom or unknown library → ask MiniMax
  if (MINIMAX_KEYS.length === 0) {
    return res.status(503).json({ error: 'No MiniMax API keys configured.' });
  }

  try {
    const systemPrompt = `You are a Python library block designer for a visual programming system.
Given a library name and/or sample usage code, design a minimal, complete set of Blockly-style visual blocks that covers its essential operations.

Respond in strict JSON only – no markdown, no extra text. Use this exact schema:
{
  "thoughts": ["reasoning step 1", "reasoning step 2", "...up to 6 steps"],
  "blocks": [
    {
      "func": "function_name",
      "args": ["arg1", "arg2"],
      "hasOutput": true,
      "colour": "#hexcolor",
      "title": "lib.function_name"
    }
  ]
}

Rules:
- Keep block names as Python identifiers (snake_case).
- hasOutput = true if the call returns a value, false if it's a statement.
- Choose distinct, pleasant hex colours for visual variety.
- Limit to the 6-10 most important operations.
- Never include function definition blocks or comment blocks.`;

    const userContent = `Library: ${libName}${customCode ? `\nSample usage:\n${customCode}` : ''}`;

    const { thinkingText, responseText } = await callMiniMax(systemPrompt, userContent, { maxTokens: 1500 });

    let parsed;
    try {
      // Strip possible markdown code fence if model wraps in ```json
      const jsonStr = responseText.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new Error('MiniMax returned invalid JSON: ' + responseText.slice(0, 200));
    }

    const thoughts = [
      ...(thinkingText ? thinkingText.split('\n').filter(l => l.trim()).slice(0, 4) : []),
      ...(parsed.thoughts || [])
    ].slice(0, 8);

    res.json({
      success: true,
      libName,
      thoughts,
      blocks: parsed.blocks || []
    });
  } catch (err) {
    console.error('[/api/ai-abstract] MiniMax error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 4. AI Chat: general-purpose MiniMax chat for the AI Agent panel ──────────
app.post('/api/ai-chat', async (req, res) => {
  const { messages, systemPrompt } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  if (MINIMAX_KEYS.length === 0) {
    return res.status(503).json({ error: 'No MiniMax API keys configured.' });
  }

  try {
    const client = createMiniMaxClient();
    const response = await client.messages.create({
      model: MINIMAX_MODEL,
      max_tokens: 3000,
      system: systemPrompt || 'You are BlockPy AI – a helpful coding assistant for the BlockPy visual Python playground. When asked to write code, output only clean Python that can be visually represented as blocks.',
      messages
    });

    let thinking = '';
    let text = '';
    for (const block of response.content) {
      if (block.type === 'thinking') thinking += block.thinking;
      else if (block.type === 'text') text += block.text;
    }

    res.json({ success: true, thinking, text, model: MINIMAX_MODEL });
  } catch (err) {
    console.error('[/api/ai-chat] MiniMax error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    model: MINIMAX_MODEL,
    baseURL: 'https://api.minimax.io/anthropic',
    keysLoaded: MINIMAX_KEYS.length,
    keyPool: MINIMAX_KEYS.map((_, i) => `MINIMAX${i + 1}`)
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 BlockPy Express Server  →  http://localhost:${PORT}`);
  console.log(`🤖 AI Engine: MiniMax-M2.7  (via Anthropic SDK)`);
  console.log(`🔑 Key pool: ${MINIMAX_KEYS.length} key(s) loaded (round-robin)\n`);
});
