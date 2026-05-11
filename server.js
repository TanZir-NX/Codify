require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Rate Limiting
const generateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded. Please wait a moment.' }
});

// Mock In-Memory Store (Simulates DB for minimal setup)
let appState = {
  totalRequests: 0,
  users: [{ id: 1, name: 'User', role: 'user' }, { id: 2, name: 'Admin', role: 'admin' }],
  logs: [],
  settings: { title: 'Codify', streaming: false, languages: ['HTML', 'CSS', 'JavaScript', 'React', 'Node.js', 'Python', 'Java', 'PHP', 'C++'] }
};

const logActivity = (msg) => {
  appState.logs.unshift({ time: new Date().toISOString(), message: msg });
  if (appState.logs.length > 50) appState.logs.pop();
};

// Routes
app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

app.get('/api/config', (req, res) => res.json(appState.settings));

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === 'admin' && password === 'admin123') return res.json({ token: 'admin', role: 'admin', name: 'Admin' });
  if (username === 'user' && password === 'user123') return res.json({ token: 'user', role: 'user', name: 'User' });
  res.status(401).json({ error: 'Invalid credentials' });
});

app.get('/api/admin/stats', (req, res) => {
  res.json({
    totalRequests: appState.totalRequests,
    activeUsers: appState.users.length,
    logs: appState.logs.slice(0, 10),
    supportedLanguages: appState.settings.languages,
    uptime: process.uptime().toFixed(2) + 's'
  });
});

app.post('/api/generate', generateLimiter, async (req, res) => {
  try {
    const { prompt, language, includeExplanation } = req.body;
    if (!prompt || prompt.length > 1000) return res.status(400).json({ error: 'Invalid or missing prompt' });

    logActivity(`Generated code for language: ${language || 'Auto'}`);
    appState.totalRequests++;

    const systemPrompt = `You are an expert full-stack engineer. Generate production-quality, well-commented code.
Respond STRICTLY as a JSON object with these keys: "title", "language", "code", "explanation", "warnings".
Do not wrap JSON in markdown blocks. Do not add conversational text.
Code must be clean, secure, and follow best practices.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://codify.app',
        'X-Title': 'Codify'
      },
      body: JSON.stringify({
        model: process.env.DEFAULT_MODEL || 'openrouter/auto',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate a ${language || 'script'} that does: ${prompt}. ${includeExplanation ? 'Include a brief explanation.' : ''}` }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    if (!response.ok) throw new Error(`OpenRouter error: ${response.status}`);
    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '{}';

    // Clean markdown wrapper if present
    content = content.replace(/^```(?:json)?\n?/i, '').replace(/```$/i, '');
    
    try {
      const parsed = JSON.parse(content);
      res.json({
        title: parsed.title || 'Generated Code',
        language: parsed.language || language || 'plaintext',
        code: parsed.code || '',
        explanation: parsed.explanation || (includeExplanation ? 'No explanation requested.' : ''),
        warnings: parsed.warnings || []
      });
    } catch (e) {
      res.json({
        title: 'Generated Code',
        language: language || 'plaintext',
        code: content,
        explanation: '',
        warnings: ['AI response parsing failed. Raw output returned.']
      });
    }
  } catch (err) {
    console.error('Generate Error:', err);
    res.status(500).json({ error: 'Failed to generate code. Check server logs or API quota.' });
  }
});

// Centralized Error Handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => console.log(`🚀 Codify running on http://localhost:${PORT}`));
