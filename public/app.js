// Global Application State
let state = {
  openings: [],
  filteredOpenings: [],
  applications: [],
  currentTab: 'leaderboard',
  storyBank: '',
  preps: [],
  currentPage: 1,
  pageSize: 50
};


// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadOpenings();
  loadApplications();
  loadPrepList();
  setupDelegatedEvents();
});

// Event delegation for dynamically-rendered rows (avoids injecting
// scraped company/role/url data into inline onclick= JS strings)
function setupDelegatedEvents() {
  document.addEventListener('click', (e) => {
    const sourceBtn = e.target.closest('[data-action="select-source"]');
    if (sourceBtn) {
      selectSourcePill(sourceBtn.dataset.source);
      return;
    }
    const prepBtn = e.target.closest('[data-action="open-prep"]');
    if (prepBtn) {
      openPrepForCompany(prepBtn.dataset.company);
      return;
    }
  });

  document.addEventListener('change', (e) => {
    const statusSelect = e.target.closest('[data-action="update-status"]');
    if (statusSelect) {
      updateAppStatus(statusSelect.dataset.company, statusSelect.dataset.role, statusSelect.value);
      return;
    }
    const appliedToggle = e.target.closest('[data-action="toggle-applied"]');
    if (appliedToggle) {
      toggleApplied(appliedToggle.dataset.company, appliedToggle.dataset.role, appliedToggle.dataset.score, appliedToggle.checked);
    }
  });
}

// Theme Management
function initTheme() {
  const savedTheme = localStorage.getItem('jobhunt_theme') || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  applyTheme(savedTheme);
}

function toggleTheme() {
  const isLight = document.documentElement.classList.contains('light');
  applyTheme(isLight ? 'dark' : 'light');
}

function applyTheme(theme) {
  const html = document.documentElement;
  const icon = document.getElementById('theme-toggle-icon');
  
  if (theme === 'light') {
    html.classList.remove('dark');
    html.classList.add('light');
    if (icon) icon.innerText = 'dark_mode';
  } else {
    html.classList.remove('light');
    html.classList.add('dark');
    if (icon) icon.innerText = 'light_mode';
  }
  localStorage.setItem('jobhunt_theme', theme);
}


// Tab Navigation
function switchTab(tabId) {
  state.currentTab = tabId;
  document.querySelectorAll('.view-panel').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(el => {
    el.classList.remove('text-primary-fixed-dim', 'bg-surface-container-highest', 'border', 'border-primary-fixed-dim/30');
    el.classList.add('text-on-surface-variant');
  });

  const activePanel = document.getElementById(`view-${tabId}`);
  const activeBtn = document.getElementById(`tab-${tabId}`);
  if (activePanel) activePanel.classList.remove('hidden');
  if (activeBtn) {
    activeBtn.classList.remove('text-on-surface-variant');
    activeBtn.classList.add('text-primary-fixed-dim', 'bg-surface-container-highest', 'border', 'border-primary-fixed-dim/30');
  }

  if (tabId === 'applications') loadApplications();
  if (tabId === 'referrals') loadReferralsData();
  if (tabId === 'prep') loadPrepList();
}

// Fetch Openings Leaderboard
async function loadOpenings() {
  try {
    const res = await fetch('/api/openings');
    state.openings = await res.json();
    filterOpenings();
    updateStats();
  } catch (err) {
    console.error('Failed to load openings:', err);
    document.getElementById('openings-tbody').innerHTML = `
      <tr><td colspan="8" class="p-4 text-center text-rose-400">Failed to load openings. Make sure server is running.</td></tr>
    `;
  }
}

// Update Top Metrics Cards
function updateStats() {
  document.getElementById('stat-total-openings').innerText = state.openings.length;
  
  const aiTopCount = state.openings.filter(o => o.aiScore && o.aiScore >= 80).length;
  document.getElementById('stat-ai-top').innerText = aiTopCount;

  const appliedCount = state.applications.length;
  document.getElementById('stat-applied').innerText = appliedCount;
  document.getElementById('nav-app-count').innerText = appliedCount;

  const sponsoredCount = state.openings.filter(o => (o.signals || '').includes('✅')).length;
  document.getElementById('stat-sponsored').innerText = sponsoredCount;
}

// List Switcher Pill Handler
function selectSourcePill(sourceVal) {
  const select = document.getElementById('filter-source');
  if (select) {
    select.value = sourceVal;
  }

  document.querySelectorAll('.src-pill').forEach(btn => {
    btn.classList.remove('active', 'bg-primary-fixed-dim/20', 'text-primary-fixed-dim', 'border-primary-fixed-dim/40');
    btn.classList.add('bg-surface-container', 'text-on-surface-variant', 'border-outline-variant');
  });

  let pillId = 'src-pill-all';
  if (sourceVal === 'ATS Boards') pillId = 'src-pill-ats';
  if (sourceVal === 'LinkedIn Recent') pillId = 'src-pill-linkedin-recent';
  if (sourceVal === 'LinkedIn') pillId = 'src-pill-linkedin';
  if (sourceVal === 'Aggregators') pillId = 'src-pill-agg';
  if (sourceVal === 'Indeed') pillId = 'src-pill-indeed';
  if (sourceVal === 'Pipeline Inbox') pillId = 'src-pill-pipeline';


  const activePill = document.getElementById(pillId);
  if (activePill) {
    activePill.classList.remove('bg-surface-container', 'text-on-surface-variant', 'border-outline-variant');
    activePill.classList.add('active', 'bg-primary-fixed-dim/20', 'text-primary-fixed-dim', 'border-primary-fixed-dim/40');
  }

  filterOpenings();
}

// Filter Openings Table
function filterOpenings() {

  const query = (document.getElementById('search-input')?.value || '').toLowerCase();
  const sourceFilter = document.getElementById('filter-source')?.value || 'all';
  const statusFilter = document.getElementById('filter-status')?.value || 'all';
  const signalFilter = document.getElementById('filter-signals')?.value || 'all';

  state.filteredOpenings = state.openings.filter(item => {
    const textMatch = 
      item.company.toLowerCase().includes(query) ||
      item.role.toLowerCase().includes(query) ||
      (item.location || '').toLowerCase().includes(query) ||
      (item.signals || '').toLowerCase().includes(query) ||
      (item.source || '').toLowerCase().includes(query);

    let sourceMatch = true;
    if (sourceFilter !== 'all') {
      const itemSources = item.sources && item.sources.length ? item.sources : [item.source || ''];
      sourceMatch = itemSources.some(s => s.toLowerCase() === sourceFilter.toLowerCase());
    }

    let statusMatch = true;
    if (statusFilter === 'pending') statusMatch = item.status === 'Pending';
    if (statusFilter === 'applied') statusMatch = item.status === 'Applied';
    if (statusFilter === 'screening') statusMatch = ['Screening', 'Interviewing', 'Offer'].includes(item.status);

    let signalMatch = true;
    if (signalFilter === 'nyc') signalMatch = (item.signals || '').includes('🗽');
    if (signalFilter === 'sponsors') signalMatch = (item.signals || '').includes('✅');
    if (signalFilter === 'grad') signalMatch = (item.signals || '').includes('🎓');
    if (signalFilter === 'fresh') signalMatch = (item.signals || '').includes('🆕');

    return textMatch && sourceMatch && statusMatch && signalMatch;
  });

  state.currentPage = 1;
  renderOpeningsTable();
}

function changePage(delta) {
  const maxPage = Math.ceil(state.filteredOpenings.length / state.pageSize) || 1;
  const newPage = state.currentPage + delta;
  if (newPage >= 1 && newPage <= maxPage) {
    state.currentPage = newPage;
    renderOpeningsTable();
  }
}

function changePageSize(newSize) {
  state.pageSize = parseInt(newSize, 10) || 50;
  state.currentPage = 1;
  renderOpeningsTable();
}

function toggleQuickFilter(signalVal) {
  const select = document.getElementById('filter-signals');
  if (select) {
    select.value = select.value === signalVal ? 'all' : signalVal;
    filterOpenings();
  }
}

// Render Openings Leaderboard Table (Paginated)
function renderOpeningsTable() {
  const tbody = document.getElementById('openings-tbody');
  const total = state.filteredOpenings.length;

  if (!total) {
    tbody.innerHTML = `
      <tr><td colspan="9" class="p-8 text-center text-on-surface-variant">No job openings found matching current filters.</td></tr>
    `;
    updatePaginationControls(0, 0, 0, 1);
    return;
  }

  const startIdx = (state.currentPage - 1) * state.pageSize;
  const endIdx = Math.min(startIdx + state.pageSize, total);
  const pageItems = state.filteredOpenings.slice(startIdx, endIdx);
  const totalPages = Math.ceil(total / state.pageSize) || 1;

  updatePaginationControls(startIdx + 1, endIdx, total, totalPages);

  tbody.innerHTML = pageItems.map((item, idx) => {
    const aiBadge = item.aiScore !== null
      ? `<span class="px-2 py-0.5 rounded text-xs font-bold ${item.aiScore >= 80 ? 'bg-primary-fixed-dim/20 text-primary-fixed-dim border border-primary-fixed-dim/40' : item.aiScore >= 65 ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30' : 'bg-surface-container text-on-surface-variant'}">${item.aiScore}/100</span>`
      : `<span class="text-on-surface-variant">—</span>`;

    const heurBadge = item.heuristicScore !== null
      ? `<span class="px-2 py-0.5 rounded text-xs font-mono text-on-surface bg-surface-container border border-outline-variant">${item.heuristicScore}</span>`
      : `—`;

    const primarySource = (item.sources && item.sources[0]) || item.source || '';
    const sourceBadge = `<button data-action="select-source" data-source="${escapeHtml(primarySource)}" title="${escapeHtml(item.source)}" class="px-2 py-0.5 rounded text-[10px] font-mono bg-surface-container hover:bg-surface-container-highest border border-outline-variant text-on-surface-variant">${escapeHtml(item.source)}</button>`;

    const statusBadgeClass = 
      item.status === 'Applied' ? 'bg-sky-500/20 text-sky-300 border-sky-500/30' :
      item.status === 'Interviewing' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
      item.status === 'Rejected' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' :
      'bg-surface-container text-on-surface-variant border-outline-variant';

    const reasoningBox = item.reason 
      ? `<div class="bg-surface-container border border-primary-fixed-dim/30 rounded p-2 text-xs border-l-2 border-l-primary-fixed-dim mt-1.5 max-w-sm">
           <div class="flex items-center gap-1 text-primary-fixed-dim font-bold text-[11px] mb-0.5">
             <span class="material-symbols-outlined text-[13px]">auto_awesome</span> Match Reasoning
           </div>
           <p class="text-on-surface-variant text-[11px] leading-relaxed line-clamp-2">${escapeHtml(item.reason)}</p>
         </div>`
      : '';

    return `
      <tr class="hover:bg-surface-container/60 transition-colors">
        <!-- 1. AI Fit -->
        <td class="p-3 align-top font-mono">${aiBadge}</td>
        
        <!-- 2. Heuristic -->
        <td class="p-3 align-top font-mono">${heurBadge}</td>
        
        <!-- 3. Source -->
        <td class="p-3 align-top font-mono">${sourceBadge}</td>
        
        <!-- 4. Company & Role -->
        <td class="p-3 align-top">
          <div class="font-bold text-on-surface hover:text-primary-fixed-dim text-sm">
            <a href="${escapeHtml(item.url)}" target="_blank" class="hover:underline flex items-center gap-1">
              ${escapeHtml(item.company)}
              <span class="material-symbols-outlined text-[14px] opacity-70">open_in_new</span>
            </a>
          </div>
          <div class="text-[12px] text-on-surface-variant font-sans mt-0.5 line-clamp-1">${escapeHtml(item.role)}</div>
        </td>
        
        <!-- 5. Location -->
        <td class="p-3 align-top text-on-surface-variant text-[11px] font-sans">${escapeHtml(item.location)}</td>
        
        <!-- 6. Posted / Comp -->
        <td class="p-3 align-top font-mono">
          <div class="text-on-surface text-[11px]">${escapeHtml(item.posted)}</div>
          <div class="text-[10px] text-primary-fixed-dim font-bold mt-0.5">${escapeHtml(item.salary)}</div>
        </td>
        
        <!-- 7. Signals & Reasoning -->
        <td class="p-3 align-top">
          <div class="text-xs tracking-wide">${escapeHtml(item.signals || '—')}</div>
          ${reasoningBox}
        </td>
        
        <!-- 8. Status -->
        <td class="p-3 align-top text-center">
          <div class="flex items-center justify-center gap-1.5">
            <input type="checkbox" data-action="toggle-applied" data-company="${escapeHtml(item.company)}" data-role="${escapeHtml(item.role)}" data-score="${escapeHtml(String(item.aiScore || item.heuristicScore || 75))}"
              ${item.status !== 'Pending' ? 'checked' : ''}
              ${item.status !== 'Pending' && item.status !== 'Applied' ? 'disabled title="Advanced past Applied — change status in the Tracker tab"' : 'title="Mark applied"'}
              class="accent-primary-fixed-dim w-3.5 h-3.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"/>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusBadgeClass}">${item.status}</span>
          </div>
        </td>
        
        <!-- 9. Actions -->
        <td class="p-3 align-top text-right">
          <a href="${escapeHtml(item.url)}" target="_blank" class="inline-flex items-center gap-1 bg-primary-fixed-dim hover:bg-primary text-black text-[11px] font-bold px-3 py-1.5 rounded transition-all shadow-sm">
            Apply <span class="material-symbols-outlined text-[12px]">arrow_outward</span>
          </a>
        </td>
      </tr>

    `;
  }).join('');
}




function updatePaginationControls(start, end, total, totalPages) {
  const info = document.getElementById('pagination-info');
  const pageNum = document.getElementById('pagination-page-num');
  const btnPrev = document.getElementById('btn-prev-page');
  const btnNext = document.getElementById('btn-next-page');

  if (info) info.innerText = `Showing ${start}–${end} of ${total.toLocaleString()} openings`;
  if (pageNum) pageNum.innerText = `Page ${state.currentPage} of ${totalPages.toLocaleString()}`;
  if (btnPrev) btnPrev.disabled = state.currentPage <= 1;
  if (btnNext) btnNext.disabled = state.currentPage >= totalPages;
}



// Leaderboard checkbox: tick = log as Applied, untick = remove from tracker
// (only reachable while status is Pending/Applied — further-along statuses
// are managed from the Tracker tab so this can't silently wipe progress).
async function toggleApplied(company, role, score, isChecked) {
  try {
    if (isChecked) {
      await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, role, score, status: 'Applied', notes: 'Marked applied in Web UI' })
      });
    } else {
      await fetch('/api/applications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, role })
      });
    }
    loadApplications();
    loadOpenings();
  } catch (e) {
    console.error(e);
  }
}

// Fetch & Render Applications Tracker
async function loadApplications() {
  try {
    const res = await fetch('/api/applications');
    state.applications = await res.json();
    renderApplicationsTable();
    updateStats();
  } catch (err) {
    console.error('Failed to load applications:', err);
  }
}

function renderApplicationsTable() {
  const tbody = document.getElementById('applications-tbody');
  if (!state.applications.length) {
    tbody.innerHTML = `
      <tr><td colspan="8" class="p-8 text-center text-on-surface-variant">No logged applications yet. Click 'Log Application' above!</td></tr>
    `;
    return;
  }

  tbody.innerHTML = state.applications.map((app, idx) => `
    <tr class="hover:bg-surface-container/60">
      <td class="p-3 text-on-surface-variant">${idx + 1}</td>
      <td class="p-3 text-on-surface-variant">${escapeHtml(app.date)}</td>
      <td class="p-3 font-bold text-on-surface">${escapeHtml(app.company)}</td>
      <td class="p-3 text-on-surface">${escapeHtml(app.role)}</td>
      <td class="p-3 text-primary-fixed-dim font-bold">${escapeHtml(app.score)}</td>
      <td class="p-3">
        <select data-action="update-status" data-company="${escapeHtml(app.company)}" data-role="${escapeHtml(app.role)}" class="bg-surface-container border border-outline-variant rounded px-2 py-1 text-xs text-on-surface">
          <option value="Applied" ${app.status === 'Applied' ? 'selected' : ''}>Applied</option>
          <option value="Screening" ${app.status === 'Screening' ? 'selected' : ''}>Screening</option>
          <option value="Interviewing" ${app.status === 'Interviewing' ? 'selected' : ''}>Interviewing</option>
          <option value="Offer" ${app.status === 'Offer' ? 'selected' : ''}>Offer</option>
          <option value="Rejected" ${app.status === 'Rejected' ? 'selected' : ''}>Rejected</option>
        </select>
      </td>
      <td class="p-3 text-on-surface-variant text-[11px]">${escapeHtml(app.notes || '—')}</td>
      <td class="p-3 text-right">
        <button data-action="open-prep" data-company="${escapeHtml(app.company)}" class="text-xs text-primary-fixed-dim hover:underline flex items-center gap-1 ml-auto">
          <span class="material-symbols-outlined text-[14px]">description</span> Prep
        </button>
      </td>
    </tr>
  `).join('');
}

async function updateAppStatus(company, role, newStatus) {
  await fetch('/api/applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company, role, status: newStatus })
  });
  loadApplications();
}

// Modal Handlers
function openAddAppModal() {
  document.getElementById('modal-add-app').classList.remove('hidden');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
}

async function submitApplication(e) {
  e.preventDefault();
  const company = document.getElementById('app-form-company').value;
  const role = document.getElementById('app-form-role').value;
  const score = document.getElementById('app-form-score').value;
  const status = document.getElementById('app-form-status').value;
  const notes = document.getElementById('app-form-notes').value;

  await fetch('/api/applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company, role, score, status, notes })
  });

  closeModal('modal-add-app');
  loadApplications();
  loadOpenings();
}

// Referral Outreach Generator
function prepOutreachForRole(company, role) {
  switchTab('referrals');
  document.getElementById('outreach-company').value = company;
  document.getElementById('outreach-role').value = role;
  generateOutreachDraft();
}

async function generateOutreachDraft() {
  const targetType = document.getElementById('outreach-target').value;
  const personName = document.getElementById('outreach-name').value;
  const company = document.getElementById('outreach-company').value;
  const role = document.getElementById('outreach-role').value;

  try {
    const res = await fetch('/api/referrals/outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetType, personName, company, role })
    });
    const data = await res.json();
    document.getElementById('outreach-result').value = data.draft;
  } catch (err) {
    console.error(err);
  }
}

function copyOutreach() {
  const textarea = document.getElementById('outreach-result');
  textarea.select();
  document.execCommand('copy');
  alert('Outreach message copied to clipboard!');
}

// Prep & Story Bank Loader
async function loadPrepList() {
  try {
    const res = await fetch('/api/prep-list');
    const preps = await res.json();
    state.preps = preps;

    const listEl = document.getElementById('prep-files-list');
    if (!preps.length) {
      listEl.innerHTML = `<div class="p-2 text-on-surface-variant">No company preps created yet. Run prep.mjs via CLI to generate!</div>`;
      return;
    }

    listEl.innerHTML = preps.map(p => `
      <button data-action="open-prep" data-company="${escapeHtml(p.company)}" class="w-full text-left p-2 rounded hover:bg-surface-container text-on-surface flex items-center justify-between">
        <span class="font-bold capitalize">${escapeHtml(p.company)}</span>
        <span class="material-symbols-outlined text-[14px]">chevron_right</span>
      </button>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

async function openPrepForCompany(company) {
  switchTab('prep');
  document.getElementById('prep-title').innerText = `Interview Prep Sheet — ${company.toUpperCase()}`;
  document.getElementById('prep-content').innerText = `Loading prep sheet for ${company}...`;

  try {
    const res = await fetch(`/api/prep/${company}`);
    const data = await res.json();
    document.getElementById('prep-content').innerText = data.content;
  } catch (err) {
    document.getElementById('prep-content').innerText = `Error loading prep: ${err.message}`;
  }
}

async function loadStoryBank() {
  switchTab('prep');
  document.getElementById('prep-title').innerText = `STAR+R Story Bank (8 Shipped Projects & TA Stories)`;
  document.getElementById('prep-content').innerText = `Loading story bank...`;

  try {
    const res = await fetch('/api/story-bank');
    const data = await res.json();
    document.getElementById('prep-content').innerText = data.content;
  } catch (err) {
    document.getElementById('prep-content').innerText = `Error loading stories: ${err.message}`;
  }
}

// Real-time SSE Terminal Runner
// Full Pipeline — same choices as jobhunt.mjs's interactive prompts
function runPipeline() {
  const days = document.getElementById('pipeline-days').value;
  const agg = document.getElementById('pipeline-agg').checked ? '1' : '0';
  const linkedin = document.getElementById('pipeline-linkedin').checked ? '1' : '0';
  const ai = document.getElementById('pipeline-ai').checked ? '1' : '0';
  runTask('pipeline', { days, agg, linkedin, ai });
}

function runTask(taskName, extraParams = {}) {
  switchTab('terminal');
  const logsEl = document.getElementById('terminal-logs');
  logsEl.innerText += `\n> Launching background task: ${taskName}...\n`;

  const params = new URLSearchParams({ task: taskName, ...extraParams });
  const eventSource = new EventSource(`/api/run-task?${params.toString()}`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.log) {
        logsEl.innerText += data.log;
        const win = document.getElementById('terminal-window');
        win.scrollTop = win.scrollHeight;
      }
      if (data.done) {
        eventSource.close();
        loadOpenings();
        loadApplications();
      }
    } catch (e) {
      console.error(e);
    }
  };

  eventSource.onerror = () => {
    logsEl.innerText += `\n[Stream connection closed]\n`;
    eventSource.close();
  };
}

function clearTerminal() {
  document.getElementById('terminal-logs').innerText = '';
}

// Utilities
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
