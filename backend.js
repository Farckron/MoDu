// backend.js
// Simple Express backend for Habit Tracker with Duolingo‑style streaks, XP and freeze tokens.

// This server exposes a REST API that the front‑end can call to store
// and retrieve habit data. It persists state in a JSON file on disk
// so the data survives restarts and can be shared across devices.

// Endpoints:
//   GET    /status            → returns XP, number of freeze tokens and longest streak
//   GET    /habits            → returns an object keyed by short names
//   GET    /habits/:short     → returns a single habit
//   POST   /habits            → create a new habit (body: { short, name, period, count })
//   PUT    /habits/:short/done → mark a habit as done for today (awards XP and updates streak)
//   DELETE /habits/:short     → delete a habit
//   POST   /freeze            → purchase one freeze token for 50 XP
//   POST   /import            → replace all habits with provided data (body: { habits: {...} })
//   GET    /export            → returns the entire state object

// To run this server you need Node.js and the dependencies in package.json.
// Install dependencies via `npm install`, then start the server:
//   node backend.js

// The server listens on PORT environment variable or 3000 by default.

const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Where to store the persistent state on disk. The file lives alongside this script.
const DATA_FILE = path.join(__dirname, 'state.json');

// Helpers to load and save state. If the file doesn't exist,
// initialize with sensible defaults: no habits, 0 XP and 1 freeze.
function loadState() {
  try {
    const contents = fs.readFileSync(DATA_FILE, 'utf8');
    const obj = JSON.parse(contents);
    // Validate structure
    if (!obj || typeof obj !== 'object') throw new Error('Invalid state');
    if (!obj.habits || typeof obj.habits !== 'object') obj.habits = {};
    if (typeof obj.xp !== 'number') obj.xp = 0;
    if (typeof obj.freezes !== 'number') obj.freezes = 1;
    return obj;
  } catch (e) {
    return { habits: {}, xp: 0, freezes: 1 };
  }
}

function saveState(state) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

// Compute streak decay based on last completion dates. This mirrors the
// front‑end logic: if you miss a day and have a freeze token, it is consumed
// to maintain the streak. Otherwise the streak resets. Gaps > 2 days also
// reset the streak. Today and yesterday leave the streak unchanged.
function updateStreaks(state) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msPerDay = 24 * 60 * 60 * 1000;
  for (const short in state.habits) {
    const habit = state.habits[short];
    if (!habit.lastDone) continue;
    // Ensure streak property exists
    if (typeof habit.streak !== 'number') habit.streak = 0;
    const last = new Date(habit.lastDone);
    const lastDate = new Date(last.getFullYear(), last.getMonth(), last.getDate());
    const diff = Math.floor((today - lastDate) / msPerDay);
    if (diff === 0) {
      // Completed today → nothing to do
      continue;
    } else if (diff === 1) {
      // Completed yesterday → streak continues
      continue;
    } else if (diff === 2) {
      // Missed one day exactly
     if (state.freezes > 0) {
        state.freezes--;
      } else {
        habit.streak = 0;
      }
    } else if (diff > 2) {
      // Missed more than one day → reset streak
      habit.streak = 0;
    }
  }
}

// Apply JSON parsing middleware and CORS so the API can be called from the static front‑end.
app.use(express.json());
app.use(cors());

// Load state for every request and attach to req.state. This ensures we
// always operate on the most recent data. After modifying the state,
// handlers must call saveState() to persist changes.
app.use((req, res, next) => {
  req.state = loadState();
  next();
});

// GET /status → XP, freezes and longest streak
app.get('/status', (req, res) => {
  updateStreaks(req.state);
  saveState(req.state);
  // Compute longest streak across habits
  let longest = 0;
  for (const short in req.state.habits) {
    const st = req.state.habits[short].streak || 0;
    if (st > longest) longest = st;
  }
  res.json({ xp: req.state.xp, freezes: req.state.freezes, longestStreak: longest });
});

// GET /habits → all habits keyed by short name
app.get('/habits', (req, res) => {
  updateStreaks(req.state);
  saveState(req.state);
  res.json(req.state.habits);
});

// GET /habits/:short → single habit
app.get('/habits/:short', (req, res) => {
  const habit = req.state.habits[req.params.short];
  if (!habit) return res.status(404).json({ error: 'Not found' });
  res.json(habit);
});

// POST /habits → create a new habit
app.post('/habits', (req, res) => {
  const { short, name, period, count } = req.body;
  if (!short || !name) {
    return res.status(400).json({ error: 'Short and name are required' });
  }
  if (req.state.habits[short]) {
   
 return res.status(400).json({ error: 'Habit already exists' });
  }
  req.state.habits[short] = {
    name,
    period: period || '',
    count: (period === 'times per week' && Number.isFinite(count)) ? count : null,
    lastDone: '',
    streak: 0
  };
  saveState(req.state);
  res.json({ success: true });
});

// PUT /habits/:short/done → mark a habit as completed today
app.put('/habits/:short/done', (req, res) => {
  const { short } = req.params;
  const habit = req.state.habits[short];
  if (!habit) return res.status(404).json({ error: 'Habit not found' });
  // Get today's date in ISO YYYY-MM-DD
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const msPerDay = 24 * 60 * 60 * 1000;
  let xpGain = 0;
  if (habit.lastDone) {
    const last = new Date(habit.lastDone);
    const lastDate = new Date(last.getFullYear(), last.getMonth(), last.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.floor((today - lastDate) / msPerDay);
    if (diff === 0) {
      return res.status(400).json({ error: 'Already marked done today' });
    } else if (diff === 1) {
      habit.streak += 1;
    } else if (diff === 2) {
      if (req.state.freezes > 0) {
        req.state.freezes--;
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
  habit.lastDone = todayIso;
  xpGain = 10 + Math.max(0, habit.streak - 1) * 5;
  req.state.xp += xpGain;
  saveState(req.state);
  res.json({ success: true, xpGain, newStreak: habit.streak, xp: req.state.xp, freezes: req.state.freezes });
});

// DELETE /habits/:short → remove a habit
app.delete('/habits/:short', (req, res) => {
  const { short } = req.params;
  if (!req.state.habits[short]) {
    return res.status(404).json({ error: 'Habit not found' });
  }
  delete req.state.habits[short];
  saveState(req.state);
  res.json({ success: true });
});

// POST /freeze → purchase a freeze token for 50 XP
app.post('/freeze', (req, res) => {
  if (req.state.xp < 50) {
    return res.status(400).json({ error: 'Not enough XP' });
  }
  req.state.xp -= 50;
  req.state.freezes += 1;
  saveState(req.state);
  res.json({ success: true, freezes: req.state.freezes, xp: req.state.xp });
});

// POST /import → replace all habits (XP resets to 0 and freezes to 1)
app.post('/import', (req, res) => {
  const { habits } = req.body;
  if (!habits || typeof habits !== 'object') {
    return res.status(400).json({ error: 'Habits object required' });
  }
  req.state.habits = {};
  for (const short in habits) {
    const h = habits[short];
    req.state.habits[short] = {
      name: h.name || '',
      period: h.period || '',
      count: h.count != null ? h.count : null,
      lastDone: h.lastDone || '',
      streak: h.streak != null ? h.streak : 0
    };
  }
  req.state.xp = 0;
  req.state.freezes = 1;
  saveState(req.state);
  res.json({ success: true });
});

// GET /export → export entire state
app.get('/export', (req, res) => {
  res.json(req.state);
});

app.listen(port, () => {
  console.log(`Habit tracker backend listening on port ${port}`);
});
