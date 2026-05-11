const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// State
const state = {
  token: localStorage.getItem('codify_token') || null,
  role: localStorage.getItem('codify_role') || 'user',
  history: JSON.parse(localStorage.getItem('codify_history') || '[]'),
  theme: localStorage.getItem('codify_theme') || 'dark'
};

// Init
document.documentElement.setAttribute('data-theme', state.theme);
$('#themeBtn').textContent = state.theme === 'dark' ? '🌙' : '☀️';
renderHistory();
initTabs();

// Auth Flow
$('#profileBtn').onclick = () => $('#authModal').classList.toggle('active');
$('.close-modal').onclick = () => $('#authModal').classList.remove('active');
$('#loginBtn').onclick = async () => {
  const username = $('#authUser').value.trim();
  const password = $('#authPass').value;
  if (!username || !password) return showToast('Fill all fields', 'error');

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    state.token = data.token; state.role = data.role;
    localStorage.setItem('codify_token', data.token);
    localStorage.setItem('codify_role', data.role);
    updateUI();
    $('#authModal').classList.remove('active');
    showToast(`Logged in as ${data.name}`, 'success');
  } catch (e) {
    showToast(e.message || 'Login failed', 'error');
  }
};

// Theme
$('#themeBtn').onclick = () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  $('#themeBtn').textContent = state.theme === 'dark' ? '🌙' : '☀️';
  localStorage.setItem('codify_theme', state.theme);
};

// Generate
$('#generateBtn').onclick = generateCode;
$('#regenerateBtn').onclick = generateCode;

async function generateCode() {
  const prompt = $('#prompt').value.trim();
  if (!prompt) return showToast('Please enter a prompt', 'error');
  
  const btn = $('#generateBtn');
  const status = $('#statusMsg');
  btn.disabled = true; btn.innerHTML = '<span class="loader"></span> Generating...';
  status.textContent = 'Thinking...';
  $('#codeOutput').innerHTML = '<span style="color:var(--text-muted)">Waiting for AI...</span>';

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token || 'guest'}` },
      body: JSON.stringify({
        prompt,
        language: $('#language').value,
        includeExplanation: $('#explainToggle').checked
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    $('#codeOutput').textContent = data.code;
    $('#explanationOutput').textContent = data.explanation;
    if ($('#explainToggle').checked) $('#explanationOutput').classList.add('active');
    else $('#explanationOutput').classList.remove('active');

    updateButtons(true);
    addToHistory({ prompt, lang: data.language || 'auto', title: data.title || prompt.slice(0, 20), code: data.code });
    status.textContent = 'Ready';
  } catch (e) {
    status.textContent = 'Error';
    showToast(e.message, 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = '✨ Generate Code';
  }
}

// Actions
$('#copyBtn').onclick = () => {
  navigator.clipboard.writeText($('#codeOutput').textContent);
  showToast('Copied to clipboard', 'success');
};
$('#downloadBtn').onclick = () => {
  const code = $('#codeOutput').textContent;
  const blob = new Blob([code], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `codify_${Date.now()}.txt`;
  a.click();
  showToast('File downloaded', 'success');
};
$('#clearBtn').onclick = () => {
  $('#codeOutput').textContent = '// Generated code will appear here...';
  $('#explanationOutput').classList.remove('active');
  updateButtons(false);
};

// History
$('#clearHistory').onclick = () => {
  state.history = [];
  localStorage.setItem('codify_history', '[]');
  renderHistory();
};

function addToHistory(item) {
  state.history.unshift(item);
  if (state.history.length > 10) state.history.pop();
  localStorage.setItem('codify_history', JSON.stringify(state.history));
  renderHistory();
}
function renderHistory() {
  const list = $('#historyList');
  list.innerHTML = state.history.length ? '' : '<div style="color:var(--text-muted);font-size:0.8rem;padding:0.5rem">No history yet</div>';
  state.history.forEach(h => {
    const el = document.createElement('div');
    el.className = 'tab fade-in'; el.style.cursor = 'pointer'; el.style.marginBottom = '0.5rem';
    el.innerHTML = `<strong style="font-size:0.85rem">${h.title}</strong><br><span style="font-size:0.7rem;color:var(--text-muted)">${h.lang}</span>`;
    el.onclick = () => { $('#codeOutput').textContent = h.code; updateButtons(true); showToast('Loaded from history', 'success'); };
    list.appendChild(el);
  });
}

// Admin UI
function initTabs() {
  $$('.tab').forEach(t => {
    t.onclick = (e) => {
      if (t.parentElement.classList.contains('tabs')) {
        t.parentElement.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        renderAdminView(t.dataset.view);
      }
    }
  });
}
function updateUI() {
  if (state.role === 'admin') {
    $('#adminPanel').classList.add('active');
    renderAdminView('stats');
  } else {
    $('#adminPanel').classList.remove('active');
  }
  $('#profileBtn').textContent = state.role === 'admin' ? '🛡️' : '👤';
}
function renderAdminView(view) {
  const box = $('#adminContent');
  if (view === 'stats') {
    box.innerHTML = '<p style="text-align:center;padding:1rem;color:var(--text-muted)">Loading stats...</p>';
    fetch('/api/admin/stats').then(r => r.json()).then(d => {
      box.innerHTML = `
        <div class="stat-grid">
          <div class="stat-card"><div class="stat-val">${d.totalRequests}</div><div class="stat-label">Requests</div></div>
          <div class="stat-card"><div class="stat-val">${d.activeUsers}</div><div class="stat-label">Users</div></div>
          <div class="stat-card"><div class="stat-val">${d.uptime}</div><div class="stat-label">Uptime</div></div>
        </div>
        <div style="margin-top:1rem"><label>Supported Languages</label><input type="text" value="${d.supportedLanguages.join(', ')}" readonly></div>
      `;
    });
  } else if (view === 'settings') {
    box.innerHTML = `
      <div class="input-group"><label>App Title</label><input type="text" value="Codify" id="adminTitle"></div>
      <div class="input-group"><label><input type="checkbox" id="streamToggle" checked> Enable Streaming Mode</label></div>
      <button class="btn btn-primary" onclick="showToast('Settings saved (mock)', 'success')">Save Settings</button>
    `;
  } else {
    fetch('/api/admin/stats').then(r => r.json()).then(d => {
      box.innerHTML = d.logs.map(l => `<div class="tab fade-in" style="margin-bottom:0.5rem"><strong>${l.time.slice(0,19)}</strong> ${l.message}</div>`).join('');
    });
  }
}

// Utils
function updateButtons(active) {
  $('#copyBtn').disabled = !active; $('#downloadBtn').disabled = !active;
}
function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`; t.textContent = msg;
  $('#toastContainer').appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
}

// Boot
updateUI();
