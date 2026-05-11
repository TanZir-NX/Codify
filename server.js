require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ✅ Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Rate Limiting
const generateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: { error: 'Rate limit exceeded. Please wait a moment.' }
});

// Mock Store
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

// API Routes
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
    if (!prompt || prompt.length > 1000) return res.status(400).json({ error: 'Invalid prompt' });

    logActivity(`Generated code for: ${language || 'Auto'}`);
    appState.totalRequests++;

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
          { role: 'system', content: 'You are an expert coder. Return ONLY valid JSON with keys: title, language, code, explanation, warnings. No markdown, no extra text.' },
          { role: 'user', content: `Generate ${language || 'code'} for: ${prompt}. ${includeExplanation ? 'Add explanation.' : ''}` }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    if (!response.ok) throw new Error(`OpenRouter error: ${response.status}`);
    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '{}';
    content = content.replace(/^```(?:json)?\n?/i, '').replace(/```$/i, '');
    
    try {
      const parsed = JSON.parse(content);
      res.json({
        title: parsed.title || 'Generated Code',
        language: parsed.language || language || 'plaintext',
        code: parsed.code || '',
        explanation: parsed.explanation || '',
        warnings: parsed.warnings || []
      });
    } catch (e) {
      res.json({ title: 'Code', language, code: content, explanation: '', warnings: ['Parse failed'] });
    }
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Generation failed' });
  }
});

// ✅ Catch-all route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Codify running on port ${PORT}`);
});
