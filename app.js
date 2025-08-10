(() => {
  'use strict';

  // Base URL of the backend API. Change this to the host and port where
  // you run backend.js (e.g. http://localhost:3000). If you deploy the
  // backend elsewhere, update API_BASE accordingly. You can also define
  // window.API_BASE before loading this script to override the default.
  const API_BASE = window.API_BASE || 'http://localhost:3000';

  // In‑memory state mirrors the backend. It holds the current set of
  // habits, XP and freeze tokens returned by the server. Do not modify
  // this directly; instead call the backend via api() and refreshState().
  let state = { habits: {}, xp: 0, freezes: 1 };

  // Generic helper for making API requests. It prepends API_BASE to the
  // endpoint, sets JSON headers, serializes the body (if provided) and
  // throws on non‑2xx responses. The returned value is the parsed JSON.
  async function api(path, method = 'GET', body = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body != null) opts.body = JSON.stringify(body);
    const res = await fetch(API_BASE + path, opts);
    let data;
    try {
      data = await res.json();
    } catch (e) {
      data = { error: 'Invalid JSON response' };
    }
    if (!res.ok) {
      throw data;
    }
    return data;
  }

  // Fetch the latest habits and status from the backend and update the
  // local state. After calling this, call updateStats() and renderHabits()
  // to refresh the UI. Any errors are logged to the console and shown
  // as a toast.
  async function refreshState(filter = '') {
    try {
      const [habits, status] = await Promise.all([
        api('/habits'),
        api('/status')
      ]);
      state.habits = habits;
      state.xp = status.xp;
      state.freezes = status.freezes;
      updateStats();
      renderHabits(filter);
    } catch (err) {
      console.error('Failed to refresh state', err);
      showToast(err?.error || 'Failed to load data');
    }
  }

  // ===== Utility functions =====
  const msPerDay = 86400000;
  const todayDate = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  };
  const dateToIso = (date) => {
    return date.toISOString().slice(0, 10); // YYYY-MM-DD
  };
  function formatDisplayDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}-${m}-${y}`;
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[m];
    });
  }
  function escapeAttr(str) {
    return String(str).replace(/"/g, '&quot;');
  }
  function csvEscape(v) {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // Toast notifications
  let toastTimer;
  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  // Legacy localStorage functions have been removed. Persistence and streak
  // computation now happen on the backend. See backend.js for details.

  // ===== Rendering =====
  function renderHabits(filter = '') {
    const tbody = document.getElementById('habitBody');
    tbody.innerHTML = '';
    const q = filter.trim().toLowerCase();
    const shorts = Object.keys(state.habits).sort((a, b) => a.localeCompare(b));
    shorts.forEach(short => {
      const h = state.habits[short];
      if (q && !(short.toLowerCase().includes(q) || (h.name || '').toLowerCase().includes(q))) return;
      const tr = document.createElement('tr');
      const periodDisplay = h.period === 'times per week' && h.count ? `${h.period} (${h.count}/wk)` : h.period;
      tr.innerHTML =
        `<td class="nowrap"><span class="kbd">${escapeHtml(short)}</span></td>` +
        `<td>${escapeHtml(h.name || '')}</td>` +
        `<td>${escapeHtml(periodDisplay || '')}</td>` +
        `<td class="nowrap">${escapeHtml(formatDisplayDate(h.lastDone))}</td>` +
        `<td class="nowrap">${h.streak || 0}</td>` +
        `<td class="nowrap"><div class="action-row">` +
          `<button class="btn primary small" data-action="done" data-short="${escapeAttr(short)}">Done</button>` +
          `<button class="btn secondary small" data-action="info" data-short="${escapeAttr(short)}">Info</button>` +
          `<button class="btn danger small" data-action="del" data-short="${escapeAttr(short)}">Delete</button>` +
        `</div></td>`;
      tbody.appendChild(tr);
    });
  }

  // ===== Stats & motivation =====
  function updateStats() {
    // Update XP and level
    const xpEl = document.getElementById('xpValue');
    const levelEl = document.getElementById('levelValue');
    const progressBar = document.getElementById('levelProgress');
    const freezesEl = document.getElementById('freezesValue');

    xpEl.textContent = state.xp;
    // Leveling: every 100 XP -> next level
    const level = Math.floor(state.xp / 100) + 1;
    const progress = state.xp % 100;
    levelEl.textContent = level;
    progressBar.style.width = `${progress}%`;
    freezesEl.textContent = state.freezes;
    updateMotivation();
  }

  function updateMotivation() {
    const motEl = document.getElementById('motivation');
    // Determine highest streak
    let maxStreak = 0;
    let totalHabits = 0;
    for (const s in state.habits) {
      totalHabits++;
      const st = state.habits[s].streak || 0;
      if (st > maxStreak) maxStreak = st;
    }
    const messages = [];
    if (totalHabits === 0) {
      messages.push('Add your first habit to get started!');
    } else if (maxStreak === 0) {
      messages.push('Let’s build some momentum! Complete a habit today.');
    } else if (maxStreak < 3) {
      messages.push(`Nice! You have a ${maxStreak}-day streak going.`);
    } else if (maxStreak < 7) {
      messages.push(`Great job! A ${maxStreak}-day streak! Keep going!`);
    } else if (maxStreak < 14) {
      messages.push(`Awesome! Your ${maxStreak}-day streak is impressive.`);
    } else {
      messages.push(`Incredible! You’re on a ${maxStreak}-day streak!`);
    }
    // Add variety
    const extras = [
      'Every small step counts.',
      'Progress over perfection.',
      'Keep moving forward!',
      'Your future self thanks you.'
    ];
    // Show one message randomly
    const message = messages[Math.floor(Math.random() * messages.length)];
    motEl.textContent = message;
  }

  // ===== Habit actions =====
  async function addHabit() {
    const nameInput = document.getElementById('habitName');
    const shortInput = document.getElementById('habitShort');
    const periodSelect = document.getElementById('habitPeriod');
    const countInput = document.getElementById('habitCount');
    const name = nameInput.value.trim();
    const short = shortInput.value.trim();
    const period = periodSelect.value;
    const count = countInput.valueAsNumber;
    if (!short) return showToast('Short name is required');
    if (!name) return showToast('Habit name is required');
    if (state.habits.hasOwnProperty(short)) return showToast('Short name already exists');
    try {
      await api('/habits', 'POST', {
        short: short,
        name: name,
        period: period,
        count: Number.isFinite(count) ? count : null
      });
      // Clear inputs and refresh state from server
      nameInput.value = '';
      shortInput.value = '';
      countInput.value = '';
      await refreshState(document.getElementById('searchInput').value);
      showToast('Habit added');
    } catch (err) {
      console.error('Add habit failed', err);
      showToast(err?.error || 'Failed to add habit');
    }
  }

  async function deleteHabit(short) {
    if (!state.habits[short]) return;
    if (!confirm(`Delete habit “${short}”?`)) return;
    try {
      await api('/habits/' + encodeURIComponent(short), 'DELETE');
      await refreshState(document.getElementById('searchInput').value);
      showToast('Habit deleted');
    } catch (err) {
      console.error('Delete habit failed', err);
      showToast(err?.error || 'Failed to delete');
    }
  }

  async function markDone(short) {
    const habit = state.habits[short];
    if (!habit) return;
    try {
      const result = await api('/habits/' + encodeURIComponent(short) + '/done', 'PUT');
      await refreshState(document.getElementById('searchInput').value);
      showToast(`Marked “${short}” done (+${result.xpGain} XP)`);
    } catch (err) {
      console.error('Mark done failed', err);
      showToast(err?.error || 'Failed to mark done');
    }
  }

  async function habitInfo(short) {
    // Fetch the latest habit from the server to ensure info is current
    try {
      const habit = await api('/habits/' + encodeURIComponent(short));
      const info = {};
      info[short] = {
        name: habit.name,
        period: habit.period,
        count: habit.count,
        lastDone: formatDisplayDate(habit.lastDone),
        streak: habit.streak
      };
      document.getElementById('infoContent').textContent = JSON.stringify(info, null, 2);
      document.getElementById('infoDialog').showModal();
    } catch (err) {
      console.error('Fetch habit info failed', err);
      showToast(err?.error || 'Failed to fetch info');
    }
  }

  // ===== Export / Import =====
  function download(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  function exportCsv() {
    // Compose CSV from the in‑memory state. Since state mirrors the backend
    // we can use it directly.
    const rows = [['short', 'name', 'period', 'count', 'lastDone', 'streak']];
    for (const s in state.habits) {
      const h = state.habits[s];
      rows.push([
        s,
        h.name || '',
        h.period || '',
        h.count != null ? h.count : '',
        h.lastDone || '',
        h.streak || 0
      ]);
    }
    const csv = rows.map(r => r.map(cell => csvEscape(cell)).join(',')).join('\n');
    download('habits.csv', csv);
    showToast('CSV exported');
  }

  function exportCompat() {
    const shorts = Object.keys(state.habits);
    const header = [''].concat(shorts);
    const nameRow = ['name'].concat(shorts.map(s => state.habits[s].name || ''));
    const periodRow = ['period'].concat(shorts.map(s => state.habits[s].period || ''));
    const lastRow = ['lastDone'].concat(shorts.map(s => state.habits[s].lastDone || ''));
    const streakRow = ['streak'].concat(shorts.map(s => state.habits[s].streak || 0));
    const countRow = ['count'].concat(shorts.map(s => state.habits[s].count != null ? state.habits[s].count : ''));
    const rows = [header, nameRow, periodRow, lastRow, streakRow, countRow];
    const csv = rows.map(r => r.map(cell => csvEscape(cell)).join(',')).join('\n');
    download('habits_compat.csv', csv);
    showToast('Compat CSV exported');
  }

  async function importFromText(text) {
    text = text.trim();
    if (!text) return showToast('Empty file');
    // Build a habits object from JSON or CSV. The format matches the
    // backend import API: an object keyed by short names.
    let habits = {};
    // Try JSON first
    try {
      const obj = JSON.parse(text);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const keys = Object.keys(obj);
        if (keys.every(k => typeof obj[k] === 'object')) {
          keys.forEach(s => {
            const h = obj[s];
            habits[s] = {
              name: h.name || '',
              period: h.period || '',
              count: h.count != null ? h.count : null,
              lastDone: h.lastDone ? (function() {
                if (/^\d{4}-\d{2}-\d{2}$/.test(h.lastDone)) return h.lastDone;
                const parts = String(h.lastDone).split('-');
                if (parts.length === 3) return `${parts[2]}-${pad(parts[1])}-${pad(parts[0])}`;
                return '';
              })() : '',
              streak: h.streak != null ? h.streak : 0
            };
          });
        }
      }
    } catch {}
    if (Object.keys(habits).length === 0) {
      // Attempt CSV
      const lines = text.split(/\r?\n/);
      if (!lines.length) return showToast('Empty file');
      const first = safeSplitCsv(lines[0]);
      const headerLower = first[0] ? first[0].toLowerCase() : '';
      if (headerLower === 'short' || headerLower === 'short_name') {
        const map = {};
        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          const cols = safeSplitCsv(lines[i]);
          const [short, name, period, count, lastDone, streak] = cols;
          if (!short) continue;
          map[short] = {
            name: name || '',
            period: period || '',
            count: count ? parseInt(count) : null,
            lastDone: lastDone ? (function() {
              if (/^\d{4}-\d{2}-\d{2}$/.test(lastDone)) return lastDone;
              const parts = lastDone.split('-');
              return parts.length === 3 ? `${parts[2]}-${pad(parts[1])}-${pad(parts[0])}` : '';
            })() : '',
            streak: streak ? parseInt(streak) || 0 : 0
          };
        }
        habits = map;
      } else if (first[0] === '' || first[0] === undefined) {
        const headerShorts = first.slice(1).map(s => s && s.trim());
        const rows = lines.slice(1).map(l => safeSplitCsv(l));
        const map = {};
        headerShorts.forEach((short, idx) => {
          if (!short) return;
          map[short] = {
            name: '',
            period: '',
            count: null,
            lastDone: '',
            streak: 0
          };
        });
        rows.forEach(row => {
          const key = (row[0] || '').toLowerCase();
          headerShorts.forEach((short, idx) => {
            if (!short) return;
            const value = row[idx + 1] || '';
            if (!map[short]) map[short] = { name:'', period:'', count:null, lastDone:'', streak:0 };
            if (key === 'name') map[short].name = value;
            else if (key === 'period') map[short].period = value;
            else if (key === 'lastdone' || key === 'done') {
              map[short].lastDone = value ? (function() {
                if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
                const parts = value.split('-');
                return parts.length === 3 ? `${parts[2]}-${pad(parts[1])}-${pad(parts[0])}` : '';
              })() : '';
            } else if (key === 'streak') map[short].streak = parseInt(value) || 0;
            else if (key === 'count') map[short].count = value ? parseInt(value) || 0 : null;
          });
        });
        habits = map;
      }
    }
    if (Object.keys(habits).length === 0) {
      return showToast('Unrecognized file format');
    }
    // Send to backend import endpoint
    try {
      await api('/import', 'POST', { habits });
      await refreshState(document.getElementById('searchInput').value);
      showToast('Import successful');
    } catch (err) {
      console.error('Import failed', err);
      showToast(err?.error || 'Failed to import');
    }
  }

  function safeSplitCsv(line) {
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
        continue;
      }
      if (ch === ',' && !inQ) {
        out.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out;
  }

  // ===== Buy freeze =====
  async function buyFreeze() {
    try {
      await api('/freeze', 'POST');
      await refreshState(document.getElementById('searchInput').value);
      showToast('Purchased a freeze token');
    } catch (err) {
      console.error('Buy freeze failed', err);
      showToast(err?.error || 'Not enough XP');
    }
  }

  // ===== Event bindings =====
  document.addEventListener('DOMContentLoaded', () => {
    // Load habits and stats from backend when the page loads
    refreshState();
    // Period select toggles count input
    const periodSelect = document.getElementById('habitPeriod');
    const countInput = document.getElementById('habitCount');
    periodSelect.addEventListener('change', (e) => {
      if (e.target.value === 'times per week') {
        countInput.style.display = '';
      } else {
        countInput.style.display = 'none';
      }
    });
    // Add habit button
    document.getElementById('addHabitBtn').addEventListener('click', addHabit);
    // Search filter
    document.getElementById('searchInput').addEventListener('input', (e) => {
      renderHabits(e.target.value);
    });
    // Table actions: done, delete, info
    document.getElementById('habitTable').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      const short = btn.getAttribute('data-short');
      if (action === 'done') markDone(short);
      else if (action === 'del') deleteHabit(short);
      else if (action === 'info') habitInfo(short);
    });
    // Export buttons
    document.getElementById('exportCsv').addEventListener('click', exportCsv);
    document.getElementById('exportCompat').addEventListener('click', exportCompat);
    // Import file input
    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('fileImport').click());
    document.getElementById('fileImport').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      importFromText(text);
      e.target.value = '';
    });
    // Clear all: reset all habits via backend import
    document.getElementById('clearBtn').addEventListener('click', async () => {
      if (!Object.keys(state.habits).length) return showToast('Nothing to clear');
      if (confirm('This removes ALL habits on the server. Proceed?')) {
        try {
          await api('/import', 'POST', { habits: {} });
          await refreshState();
          showToast('Cleared');
        } catch (err) {
          console.error('Clear failed', err);
          showToast(err?.error || 'Failed to clear');
        }
      }
    });
    // Help dialog
    document.getElementById('helpBtn').addEventListener('click', () => document.getElementById('helpDialog').showModal());
    document.getElementById('helpClose').addEventListener('click', () => document.getElementById('helpDialog').close());
    // Info dialog
    document.getElementById('infoClose').addEventListener('click', () => document.getElementById('infoDialog').close());
    document.getElementById('copyJson').addEventListener('click', () => {
      const txt = document.getElementById('infoContent').textContent;
      navigator.clipboard?.writeText(txt);
      showToast('JSON copied');
    });
    // Buy freeze button
    document.getElementById('buyFreeze').addEventListener('click', buyFreeze);
  });

})();