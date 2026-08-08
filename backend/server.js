import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// ── MIDDLEWARE ──
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── GROQ MODELS: Best for Career Guidance ──
// Groq uses ultra-fast LPU hardware (~320 tokens/sec)
// All models are completely free with email-only signup
const GROQ_MODELS = [
  'llama-3.3-70b-versatile',      // Strongest model, excellent reasoning
  'llama-3.1-70b-versatile',      // Strong alternative
  'mixtral-8x7b-32768',           // Good reasoning, large context
  'gemma-7b-it',                  // Lightweight fallback
];

// ── HEALTH CHECK ──
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'CareerCompass backend is running' });
});

// ── API: CHAT ENDPOINT ──
app.post('/api/chat', async (req, res) => {
  try {
    const { systemPrompt, messages } = req.body || {};

    // Validate input
    if (!systemPrompt) {
      return res.status(400).json({ error: 'Missing systemPrompt' });
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Missing or invalid messages array' });
    }

    // Validate Groq API key
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'Groq API key not configured',
        hint: 'Set GROQ_API_KEY in your .env file (get free key from console.groq.com)'
      });
    }

    let lastError = null;

    // Try each Groq model in order
    for (const model of GROQ_MODELS) {
      try {
        console.log(`[${new Date().toISOString()}] Trying Groq model: ${model}`);

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              ...messages
            ],
            temperature: 0.7,
            max_tokens: 2000,
            top_p: 0.95,
            frequency_penalty: 0.0,
            presence_penalty: 0.1,
          })
        });

        const data = await response.json();

        if (response.ok && data.choices && data.choices[0]) {
          const finalResponse = data.choices[0].message?.content;
          
          if (finalResponse) {
            console.log(`✓ Success with Groq ${model} (${finalResponse.length} chars, ${data.usage?.completion_tokens || '?'} tokens used)`);
            return res.json({ reply: finalResponse });
          }
        } else {
          const errorMsg = data.error?.message || `HTTP ${response.status}`;
          console.warn(`✗ Groq ${model} failed: ${errorMsg}`);
          lastError = errorMsg;
          
          // If rate limited, try next model
          if (errorMsg.includes('rate') || errorMsg.includes('429')) {
            console.warn(`  → Rate limited on ${model}, trying next...`);
            continue;
          }
        }
      } catch (err) {
        console.error(`✗ Groq ${model} network error: ${err.message}`);
        lastError = err.message;
        continue;
      }
    }

    // All models failed
    console.error(`All Groq models failed. Last error: ${lastError}`);
    return res.status(503).json({
      error: 'Groq API unavailable',
      details: lastError || 'Please try again later',
      hint: 'Check your Groq API key at console.groq.com'
    });

  } catch (error) {
    console.error('Chat endpoint error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// ── STATIC FILES ──
app.use(express.static(join(__dirname, '../public')));

// ── SPA CATCH-ALL ──
app.get('*', (req, res) => {
  const indexPath = join(__dirname, '../public/index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(404).json({ error: 'Page not found' });
    }
  });
});

// ── ERROR HANDLING ──
app.use((err, req, res, next) => {
  console.error('Uncaught error:', err);
  res.status(500).json({ error: 'Server error', details: err.message });
});

// ── START SERVER ──
const server = app.listen(PORT, () => {
  console.log(`\n✦ CareerCompass backend running on http://localhost:${PORT}`);
  console.log(`✓ Health: http://localhost:${PORT}/health`);
  console.log(`✓ Chat API: POST http://localhost:${PORT}/api/chat`);
  console.log(`✓ Provider: Groq (completely free, no credit card needed)`);
  console.log(`✓ Models: Llama 3.3 70B + fallbacks`);
  console.log(`✓ Speed: 320 tokens/sec (ultra-fast LPU hardware)\n`);
});

export default app;