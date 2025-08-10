(() => {
  'use strict';

  const STORAGE_KEY = 'habit_tracker_state_v2';
  let state = { habits: {}, xp: 0, freezes: 1 };

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

  // ===== State persistence =====
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') state = obj;
      }
    } catch {}
    // Initialize defaults
    if (!state.habits) state.habits = {};
    if (typeof state.xp !== 'number') state.xp = 0;
    if (typeof state.freezes !== 'number') state.freezes = 1;
    // Migration from old format
    if (Object.keys(state.habits).length === 0) {
      try {
        const oldRaw = localStorage.getItem('habits_v1');
        if (oldRaw) {
          const old = JSON.parse(oldRaw);
          if (old && typeof old === 'object') {
            for (const s in old) {
              const h = old[s];
              let iso = '';
              if (h.done) {
                const parts = h.done.split('-');
                if (parts.length === 3) {
                  iso = `${parts[2]}-${pad(parts[1])}-${pad(parts[0])}`;
                }
              }
              state.habits[s] = {
                name: h.name || '',
                period: h.period || '',
                count: h.period === 'times per week' ? null : null,
                lastDone: iso,
                streak: 0
              };
            }
            state.xp = 0;
            state.freezes = 1;
          }
        }
      } catch {}
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ===== Streak computation =====
  function updateAllStreaks() {
    const now = todayDate();
    for (const s in state.habits) {
      const h = state.habits[s];
      if (!h.lastDone) continue;
      if (h.streak == null) h.streak = 0;
      const last = new Date(h.lastDone);
      const diff = Math.floor((now - last) / msPerDay);
      if (diff === 0) {
        // done today, streak is valid
        continue;
      } else if (diff === 1) {
        // done yesterday, streak continues
        continue;
      } else if (diff === 2) {
        // missed exactly one day
        if (state.freezes > 0) {
          state.freezes--;
        } else {
          h.streak = 0;
        }
      } else if (diff > 2) {
        h.streak = 0;
      }
    }
  }

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
  function addHabit() {
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
    const habit = {
      name: name,
      period: period,
      count: period === 'times per week' && Number.isFinite(count) ? count : null,
      lastDone: '',
      streak: 0
    };
    state.habits[short] = habit;
    saveState();
    nameInput.value = '';
    shortInput.value = '';
    countInput.value = '';
    renderHabits(document.getElementById('searchInput').value);
    updateStats();
    showToast('Habit added');
  }

  function deleteHabit(short) {
    if (!state.habits[short]) return;
    if (!confirm(`Delete habit “${short}”?`)) return;
    delete state.habits[short];
    saveState();
    renderHabits(document.getElementById('searchInput').value);
    updateStats();
    showToast('Habit deleted');
  }

  function markDone(short) {
    const habit = state.habits[short];
    if (!habit) return;
    const now = todayDate();
    const iso = dateToIso(now);
    if (habit.lastDone) {
      const last = new Date(habit.lastDone);
      const diff = Math.floor((now - last) / msPerDay);
      if (diff === 0) {
        return showToast('Already marked done today');
      } else if (diff === 1) {
        habit.streak += 1;
      } else if (diff === 2) {
        if (state.freezes > 0) {
          state.freezes--;
          habit.streak += 1;
        } else {
          habit.streak = 1;
        }
      } else {
        habit.streak = 1;
      }
    } else {
      habit.streak = 1;
    }
    habit.lastDone = iso;
    // Award XP: base + bonus per streak
    const xpGain = 10 + Math.max(0, habit.streak - 1) * 5;
    state.xp += xpGain;
    saveState();
    updateStats();
    renderHabits(document.getElementById('searchInput').value);
    showToast(`Marked “${short}” done (+${xpGain} XP)`);
  }

  function habitInfo(short) {
    const habit = state.habits[short];
    if (!habit) return;
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

  function importFromText(text) {
    text = text.trim();
    if (!text) return showToast('Empty file');
    // Try JSON
    try {
      const obj = JSON.parse(text);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        // If root keys seem like habits
        const keys = Object.keys(obj);
        if (keys.every(k => typeof obj[k] === 'object')) {
          state.habits = {};
          for (const s of keys) {
            const h = obj[s];
            state.habits[s] = {
              name: h.name || '',
              period: h.period || '',
              count: h.count != null ? h.count : null,
              lastDone: h.lastDone ? (function() {
                // attempt to convert dd-mm-YYYY to ISO if necessary
                if (/^\d{4}-\d{2}-\d{2}$/.test(h.lastDone)) return h.lastDone;
                const parts = String(h.lastDone).split('-');
                if (parts.length === 3) return `${parts[2]}-${pad(parts[1])}-${pad(parts[0])}`;
                return '';
              })() : '',
              streak: h.streak != null ? h.streak : 0
            };
          }
          // reset xp and freezes
          state.xp = 0;
          state.freezes = 1;
          saveState();
          updateStats();
          renderHabits(document.getElementById('searchInput').value);
          showToast('Imported JSON');
          return;
        }
      }
    } catch {}
    // CSV
    const lines = text.split(/\r?\n/);
    if (!lines.length) return showToast('Empty file');
    const first = safeSplitCsv(lines[0]);
    // Row-based: header starts with short or short_name
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
      state.habits = map;
      state.xp = 0;
      state.freezes = 1;
      saveState();
      updateStats();
      renderHabits(document.getElementById('searchInput').value);
      showToast('Imported CSV');
      return;
    }
    // Compat: first cell empty
    if (first[0] === '' || first[0] === undefined) {
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
      state.habits = map;
      state.xp = 0;
      state.freezes = 1;
      saveState();
      updateStats();
      renderHabits(document.getElementById('searchInput').value);
      showToast('Imported CSV (compat)');
      return;
    }
    showToast('Unrecognized file format');
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
  function buyFreeze() {
    if (state.xp < 50) {
      showToast('Not enough XP');
      return;
    }
    state.xp -= 50;
    state.freezes += 1;
    saveState();
    updateStats();
    showToast('Purchased a freeze token');
  }

  // ===== Event bindings =====
  document.addEventListener('DOMContentLoaded', () => {
    // Load and compute streaks
    loadState();
    updateAllStreaks();
    saveState();
    // Render
    updateStats();
    renderHabits();
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
    // Search
    document.getElementById('searchInput').addEventListener('input', (e) => {
      renderHabits(e.target.value);
    });
    // Table actions
    document.getElementById('habitTable').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      const short = btn.getAttribute('data-short');
      if (action === 'done') markDone(short);
      else if (action === 'del') deleteHabit(short);
      else if (action === 'info') habitInfo(short);
    });
    // Export
    document.getElementById('exportCsv').addEventListener('click', exportCsv);
    document.getElementById('exportCompat').addEventListener('click', exportCompat);
    // Import
    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('fileImport').click());
    document.getElementById('fileImport').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      importFromText(text);
      e.target.value = '';
    });
    // Clear all
    document.getElementById('clearBtn').addEventListener('click', () => {
      if (!Object.keys(state.habits).length) return showToast('Nothing to clear');
      if (confirm('This removes ALL habits from this browser. Proceed?')) {
        state.habits = {};
        state.xp = 0;
        state.freezes = 1;
        saveState();
        updateStats();
        renderHabits();
        showToast('Cleared');
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
    // Buy freeze
    document.getElementById('buyFreeze').addEventListener('click', buyFreeze);
  });

})();