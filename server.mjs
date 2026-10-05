import express from 'express';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3005;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to safely read file
function readFileSafe(filePath, defaultVal = '') {
  try {
    if (existsSync(filePath)) {
      return readFileSync(filePath, 'utf-8');
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
  }
  return defaultVal;
}

// Config & CV APIs
app.get('/api/config', (req, res) => {
  try {
    const raw = readFileSafe('config.yml');
    const parsed = yaml.load(raw);
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/cv', (req, res) => {
  const content = readFileSafe('cv.md');
  res.json({ content });
});

// Markdown-table parser that understands escaped pipes and multiple tables.
// The old split('|') parser silently shifted columns for titles containing |.
function splitMdRow(line) {
  const cells = [];
  let cell = '', escaped = false;
  for (const ch of line.trim()) {
    if (escaped) { cell += ch; escaped = false; continue; }
    if (ch === '\\') { escaped = true; cell += ch; continue; }
    if (ch === '|') { cells.push(cell.trim().replace(/\\\|/g, '|')); cell = ''; }
    else cell += ch;
  }
  if (cell) cells.push(cell.trim().replace(/\\\|/g, '|'));
  if (cells[0] === '') cells.shift();
  if (cells.at(-1) === '') cells.pop();
  return cells;
}
const headerKey = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
function parseMdTable(mdContent) {
  const rows = [];
  let headers = null;
  for (const raw of mdContent.split('\n')) {
    const line = raw.trim();
    if (!line) continue; // a blank line inside a table shouldn't drop the header state
    if (!line.startsWith('|') || !line.endsWith('|')) { headers = null; continue; }
    const cells = splitMdRow(line);
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    const keys = cells.map(headerKey);
    if (keys.includes('company') && keys.includes('role')) { headers = keys; continue; }
    if (!headers || cells.length !== headers.length) continue;
    const row = {};
    headers.forEach((header, index) => { if (header) row[header] = cells[index]; });
    rows.push(row);
  }
  return rows;
}

// Applications API
app.get('/api/applications', (req, res) => {
  const mdContent = readFileSafe('data/applications.md');
  const lines = mdContent.split('\n').map(l => l.trim());
  const rows = [];

  for (const line of lines) {
    if (line.startsWith('|') && !line.includes('---') && !line.toLowerCase().includes('| company |')) {
      const parts = line.split('|').slice(1, -1).map(s => s.trim());
      if (parts.length >= 6) {
        rows.push({
          id: parts[0] || String(rows.length + 1),
          date: parts[1],
          company: parts[2],
          role: parts[3],
          score: parts[4],
          status: parts[5] || 'Applied',
          notes: parts[6] || ''
        });
      }
    }
  }
  res.json(rows);
});

app.post('/api/applications', (req, res) => {
  try {
    const { company, role, score, status = 'Applied', notes = '', url = '' } = req.body;
    if (!company || !role) {
      return res.status(400).json({ error: 'Company and role are required' });
    }

    const mdContent = readFileSafe('data/applications.md', '# Applications Tracker\n\n| # | Date | Company | Role | Score | Status | Notes |\n|---|------|---------|------|-------|--------|-------|\n');
    const lines = mdContent.split('\n');
    // Drop trailing blank lines so a new row lands right after the last data
    // row, not after a stray gap — a mid-table blank line broke the reader
    // used by GET /api/openings (parseMdTable resets on any non-table line).
    while (lines.length && lines.at(-1).trim() === '') lines.pop();

    const dateStr = new Date().toISOString().split('T')[0];
    let found = false;
    const updatedLines = lines.map(line => {
      if (line.startsWith('|') && !line.includes('---') && !line.toLowerCase().includes('| company |')) {
        const parts = line.split('|').slice(1, -1).map(s => s.trim());
        if (parts[2]?.toLowerCase() === company.toLowerCase() && parts[3]?.toLowerCase() === role.toLowerCase()) {
          found = true;
          return `| ${parts[0]} | ${parts[1] || dateStr} | ${company} | ${role} | ${score || parts[4]} | ${status} | ${notes || parts[6] || ''} |`;
        }
      }
      return line;
    });

    if (!found) {
      let count = 0;
      lines.forEach(l => {
        if (l.startsWith('|') && !l.includes('---') && !l.toLowerCase().includes('| company |')) count++;
      });
      const newRow = `| ${count + 1} | ${dateStr} | ${company} | ${role} | ${score || 'N/A'} | ${status} | ${notes} |`;
      updatedLines.push(newRow);
    }

    writeFileSync('data/applications.md', updatedLines.join('\n'), 'utf-8');
    res.json({ success: true, message: 'Application tracker updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/applications', (req, res) => {
  try {
    const { company, role } = req.body;
    if (!company || !role) {
      return res.status(400).json({ error: 'Company and role are required' });
    }

    const mdContent = readFileSafe('data/applications.md');
    const lines = mdContent.split('\n');
    const updatedLines = lines.filter(line => {
      if (line.startsWith('|') && !line.includes('---') && !line.toLowerCase().includes('| company |')) {
        const parts = line.split('|').slice(1, -1).map(s => s.trim());
        if (parts[2]?.toLowerCase() === company.toLowerCase() && parts[3]?.toLowerCase() === role.toLowerCase()) {
          return false;
        }
      }
      return true;
    });

    writeFileSync('data/applications.md', updatedLines.join('\n'), 'utf-8');
    res.json({ success: true, message: 'Application removed from tracker' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to extract links from markdown `[Text](URL)`
function parseMdLink(cellStr) {
  if (!cellStr) return { title: '', url: '' };
  const match = cellStr.match(/\[(.*?)\]\((.*?)\)/);
  if (match) {
    return { title: match[1], url: match[2] };
  }
  return { title: cellStr.replace(/<[^>]*>/g, ''), url: '' };
}

// Openings Leaderboard API
app.get('/api/openings', (req, res) => {
  try {
    const aiScoresRaw = readFileSafe('data/ai-scores.json', '{}');
    let aiScores = {};
    try { aiScores = JSON.parse(aiScoresRaw); } catch (e) {}

    const apps = parseMdTable(readFileSafe('data/applications.md'));

    const appliedSet = new Map();
    apps.forEach(a => {
      if (a.company) appliedSet.set(a.company.toLowerCase() + '::' + (a.role || '').toLowerCase(), a.status || 'Applied');
    });

    const sources = [
      { name: 'ATS Boards', file: existsSync('data/ats-recent.md') ? 'data/ats-recent.md' : 'data/ats-openings.md' },
      { name: 'Aggregators', file: existsSync('data/aggregator-recent.md') ? 'data/aggregator-recent.md' : 'data/aggregator-openings.md' },
      { name: 'LinkedIn Recent', file: 'data/linkedin-recent.md' },
      { name: 'LinkedIn', file: 'data/linkedin-openings.md' },
      { name: 'Indeed', file: 'data/indeed-openings.md' },
    ];


    const urlMap = new Map();

    sources.forEach(src => {
      const content = readFileSafe(src.file);
      if (!content) return;

      for (const row of parseMdTable(content)) {
        const company = row.company || 'Unknown';
        const roleCell = row.role || '';
        if (!roleCell) continue;
        let aiScore = (row.ai || row.aifit || '—').replace(/\*/g, '').trim();
        const heurScore = (row.score || '—').replace(/\*/g, '').trim();
        const location = row.location || 'Remote/US';
        const posted = row.posted || '';
        const salary = row.salary || row.comp || '—';
        const signals = [row.decision || '', row.signals || ''].filter(Boolean).join(' ');

        const { title: roleTitle, url } = parseMdLink(roleCell);
        if (!url) continue;
        const itemUrl = url;


        if ((!aiScore || aiScore === '—') && aiScores[itemUrl]) aiScore = String(aiScores[itemUrl].score);

        const appKey = company.toLowerCase() + '::' + (roleTitle || '').toLowerCase();
        const currentStatus = appliedSet.get(appKey) || 'Pending';

        if (urlMap.has(itemUrl)) {
          const existing = urlMap.get(itemUrl);
          if (!existing.sources.includes(src.name)) {
            existing.sources.push(src.name);
            existing.source = existing.sources.join(', ');
          }
        } else {
          const newItem = {
                company,
                role: roleTitle || roleCell,
                url: itemUrl,
                aiScore: aiScore === '—' ? null : parseInt(aiScore, 10),
                heuristicScore: heurScore === '—' ? null : parseInt(heurScore, 10),
                location,
                posted,
                salary,
                signals,
                sources: [src.name],
                source: src.name,
                status: currentStatus,
            reason: aiScores[itemUrl]?.reason || '',
            decision: row.decision || ''
          };
          urlMap.set(itemUrl, newItem);
        }
      }
    });

    let allOpenings = Array.from(urlMap.values());


    // Also check pipeline.md for unranked pending links
    const seenUrls = new Set(urlMap.keys());
    const pipelineContent = readFileSafe('data/pipeline.md');
    const pipelineLines = pipelineContent.split('\n');
    for (const pLine of pipelineLines) {
      if (pLine.startsWith('- [ ]') || pLine.startsWith('- [x]')) {
        const parts = pLine.replace(/^- \[(x| )\]\s*/, '').split('|').map(s => s.trim());
        if (parts.length >= 3) {
          const url = parts[0];
          const company = parts[1];
          const role = parts[2];

          if (!seenUrls.has(url)) {
            seenUrls.add(url);
            const appKey = company.toLowerCase() + '::' + role.toLowerCase();
            const status = pLine.startsWith('- [x]') ? 'Applied' : (appliedSet.get(appKey) || 'Pending');

            allOpenings.push({
              company,
              role,
              url,
              aiScore: aiScores[url]?.score || null,
              heuristicScore: 50,
              location: 'US',
              posted: 'Recent',
              salary: '—',
              signals: '🆕',
              source: 'Pipeline Inbox',
              status,
              reason: aiScores[url]?.reason || ''
            });
          }
        }
      }
    }

    allOpenings.sort((a, b) => {
      const scoreA = (a.aiScore !== null ? a.aiScore * 1.5 : (a.heuristicScore || 0));
      const scoreB = (b.aiScore !== null ? b.aiScore * 1.5 : (b.heuristicScore || 0));
      return scoreB - scoreA;
    });

    res.json(allOpenings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Referrals API
app.get('/api/referrals', (req, res) => {
  const referralsMd = readFileSafe('data/referrals.md');
  const targetsMd = readFileSafe('data/referral-targets.md');
  res.json({
    referrals: referralsMd,
    targets: targetsMd
  });
});

app.post('/api/referrals/outreach', (req, res) => {
  const { targetType, personName, company, role, connectionDetails } = req.body;

  let draft = '';
  if (targetType === 'recruiter') {
    draft = `Hi ${personName || 'there'},\n\nI noticed ${company} is hiring for ${role || 'Software Engineer'}. I have strong experience building full-stack AI/systems applications (such as CareConnect and CodePulse with Node/React/GCP) and am available for F-1 OPT roles starting May 2026.\n\nI'd love to connect and share my resume if this aligns with what your team is looking for!\n\nBest,\nHarshil Modh`;
  } else if (targetType === 'hm') {
    draft = `Hi ${personName || 'there'},\n\nI came across your team's work on ${role || 'engineering'} at ${company}. Having architected distributed systems & TA-led 100+ students at Stevens, I'm passionate about building resilient backend services and high-scale tools.\n\nI'd love to learn how your team is navigating current infrastructure scaling challenges—are you open to a brief chat?\n\nBest,\nHarshil Modh`;
  } else {
    draft = `Hi ${personName || 'there'},\n\nHope you're doing well! I saw you're working at ${company}—${connectionDetails || 'as a fellow engineer'}. I'm applying for the ${role || 'Software Engineer'} role at ${company}.\n\nWould you be open to referring me or putting me in touch with the hiring manager? I'd really appreciate your support!\n\nBest,\nHarshil Modh`;
  }

  res.json({ draft });
});

// Story Bank & Interview Prep API
app.get('/api/story-bank', (req, res) => {
  const content = readFileSafe('data/story-bank.md');
  res.json({ content });
});

app.get('/api/prep-list', (req, res) => {
  try {
    const dir = 'interview-prep';
    if (!existsSync(dir)) return res.json([]);
    const files = readdirSync(dir).filter(f => f.endsWith('.md'));
    const preps = files.map(f => {
      const company = f.replace('.md', '');
      const content = readFileSafe(path.join(dir, f));
      return { company, filename: f, content };
    });
    res.json(preps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/prep/:company', (req, res) => {
  const company = req.params.company.toLowerCase();
  if (!/^[a-z0-9._-]+$/.test(company)) {
    return res.status(400).json({ error: 'Invalid company name' });
  }
  const filePath = path.join('interview-prep', `${company}.md`);
  const content = readFileSafe(filePath, `No prep sheet found for ${company}. You can generate one via CLI: node prep.mjs`);
  res.json({ company, content });
});

// Server-Sent Events Task Streamer — each task is a list of [script, ...args] steps,
// run sequentially over one SSE connection (mirrors jobhunt.mjs's recommended
// "Everything" defaults for the multi-step 'pipeline' task).
let activeWorkstationTask = false;
app.get('/api/run-task', (req, res) => {
  const { task, args } = req.query;

  let steps;
  if (task === 'pipeline') {
    // Mirrors jobhunt.mjs's interactive prompts (freshness / aggregators / LinkedIn / AI),
    // just sourced from query params instead of readline.
    const DAYS = [0, 1, 4, 7, 14].includes(parseInt(req.query.days, 10)) ? parseInt(req.query.days, 10) : 1;
    const USE_AGG = req.query.agg !== '0';
    const USE_LINKEDIN = req.query.linkedin !== '0';
    const USE_AI = req.query.ai !== '0';

    steps = [['scan.mjs']];
    if (USE_AGG) steps.push(['aggregators.mjs', '--days', String(DAYS)]);
    if (USE_LINKEDIN) steps.push(['linkedin.mjs']);

    const rankArgs = ['rank.mjs'];
    if (DAYS > 0) rankArgs.push('--days', String(DAYS));
    if (USE_AI) rankArgs.push('--ai');
    steps.push(rankArgs);
    steps.push(['board-recent.mjs', '--days', String(DAYS)]);

    // LinkedIn Recent stays a rolling 24-hour decision view. The selected DAYS
    // value controls aggregator discovery, board AI scope, and board recent views.
    if (USE_LINKEDIN) steps.push(['linkedin-recent.mjs', '--days', '1']);
  } else {
    const validTasks = {
      'scan': [['scan.mjs']],
      'rank': [['rank.mjs'], ['board-recent.mjs', '--days', '1']],
      'rank-ai': [['rank.mjs', '--days', '1', '--ai'], ['board-recent.mjs', '--days', '1']],
      'today': [['today.mjs']],
      'aggregators': [['aggregators.mjs']],
      'liveness': [['liveness.mjs']],
      'linkedin': [['linkedin.mjs']],
    };
    steps = validTasks[task];
  }

  if (!steps) {
    return res.status(400).json({ error: 'Invalid task requested' });
  }
  if (activeWorkstationTask) {
    return res.status(409).json({ error: 'Another workstation task is already running. Wait for it to finish.' });
  }
  activeWorkstationTask = true;
  let finished = false;
  let currentChild = null;
  const finish = () => {
    if (finished) return;
    finished = true;
    activeWorkstationTask = false;
  };
  // The UI's EventSource can disconnect (tab closed, navigation) mid-run —
  // without this the spawned pipeline kept running unattended and the
  // 409 "already running" lock never cleared until the process was killed.
  req.on('close', () => {
    if (finished) return;
    if (currentChild) currentChild.kill();
    finish();
  });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // args passthrough only applies to single-step tasks (unused by the UI today,
  // kept for parity with the old behavior).
  const extraArgs = args ? args.split(' ') : [];
  const safeWrite = (payload) => { if (!finished) res.write(`data: ${JSON.stringify(payload)}\n\n`); };

  function runStep(i) {
    if (finished) return;
    if (i >= steps.length) {
      const label = steps.length > 1 ? `Pipeline finished (${steps.length} steps)` : 'Task finished';
      safeWrite({ log: `\n> ${label}\n`, done: true });
      finish();
      res.end();
      return;
    }

    const scriptArgs = steps.length === 1 ? [...steps[i], ...extraArgs] : [...steps[i]];
    const prefix = steps.length > 1 ? `[${i + 1}/${steps.length}] ` : '';
    safeWrite({ log: `\n> ${prefix}Initializing process: node ${scriptArgs.join(' ')}\n` });

    const child = spawn('node', scriptArgs, { cwd: __dirname });
    currentChild = child;

    child.stdout.on('data', (data) => {
      safeWrite({ log: data.toString() });
    });

    child.stderr.on('data', (data) => {
      safeWrite({ log: data.toString(), isError: true });
    });

    child.on('close', (code) => {
      currentChild = null;
      if (finished) return;
      if (code !== 0) {
        safeWrite({ log: `\n> ${prefix}exited with code ${code} — stopping.\n`, isError: true, done: true });
        finish();
        res.end();
        return;
      }
      runStep(i + 1);
    });

    child.on('error', (err) => {
      currentChild = null;
      safeWrite({ log: `> Execution error: ${err.message}\n`, error: true, done: true });
      finish();
      res.end();
    });
  }

  runStep(0);
});

app.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n==================================================`);
  console.log(`🚀 JobHunt Web Server running at ${url}`);
  console.log(`   Tabs: Leaderboard · Tracker · Referrals · Interview Prep · Workstation`);
  console.log(`   Ctrl+C to stop`);
  console.log(`==================================================\n`);

  if (!process.env.JOBHUNT_NO_OPEN) {
    const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    spawn(openCmd, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
  }
});
