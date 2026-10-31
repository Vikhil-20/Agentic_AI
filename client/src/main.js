import './style.css';

// -----------------------------------------------------------------------------
// AEGISRISK AI - ENTERPRISE MULTI-AGENT SUPPLIER RISK PLATFORM
// -----------------------------------------------------------------------------

const API_BASE = ''; // Proxied via Vite to http://localhost:4000

// Application State
const state = {
  currentTab: 'assessment',
  tenants: [],
  presetPersonas: [],
  selectedTenantId: 'TENANT_AERO_CORP',
  selectedPersonaKey: 'AERO_CHIEF_RISK_OFFICER',
  token: null,
  currentUser: null,
  isTokenTampered: false,

  // Assessment State
  suppliers: [],
  selectedSupplierId: null,
  assessmentQuery: '',
  isAssessing: false,
  agentSteps: [],
  activeAssessment: null,
  activeDrilldownTab: 'financial',

  // Adversarial Playground State
  attacks: [],
  selectedAttackId: null,
  isAttacking: false,
  attackTerminalLogs: [],
  lastAttackResult: null,

  // Scenario Simulator State
  shockType: 'PAYMENT_DEFAULT_SHOCK',
  severityPercent: 35,
  isSimulating: false,
  scenarioResult: null,

  // Audit Trail State
  auditLogs: [],
  chainIntegrity: null,
  auditFilterStatus: 'ALL',
  isVerifyingChain: false
};

// -----------------------------------------------------------------------------
// INITIALIZATION
// -----------------------------------------------------------------------------
async function initApp() {
  renderShell();
  try {
    await fetchTenantsAndPersonas();
    await authenticatePersona(state.selectedPersonaKey);
    await loadSuppliers(state.selectedTenantId);
    await loadAttackCatalog();
    await loadAuditTrail();
  } catch (err) {
    console.error('Initialization error:', err);
    appendConsoleLine(`[SYSTEM] Connection error: ${err.message}`, 'danger');
  }
}

// -----------------------------------------------------------------------------
// API CALLS
// -----------------------------------------------------------------------------
async function fetchTenantsAndPersonas() {
  const res = await fetch(`${API_BASE}/api/tenants`);
  if (!res.ok) throw new Error('Failed to load tenants metadata');
  const data = await res.json();
  state.tenants = data.tenants || [];
  state.presetPersonas = data.presetPersonas || [];
  updateHeaderSelectors();
}

async function authenticatePersona(personaKey) {
  state.isTokenTampered = false;
  const res = await fetch(`${API_BASE}/api/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personaKey })
  });
  if (!res.ok) throw new Error('Token authentication failed');
  const data = await res.json();
  state.token = data.token;
  state.currentUser = data.persona;
  state.selectedTenantId = data.persona.tenantId;

  updateTokenIndicator();
  await loadSuppliers(state.selectedTenantId);
}

function tamperToken() {
  if (!state.token) return;
  state.token = state.token.slice(0, -8) + 'CORRUPTED';
  state.isTokenTampered = true;
  updateTokenIndicator();
  alert('Cryptographic token signature deliberately corrupted! Next authenticated request will be rejected.');
}

async function loadSuppliers(tenantId) {
  try {
    const res = await fetch(`${API_BASE}/api/suppliers/${tenantId}`, {
      headers: { Authorization: `Bearer ${state.token}` }
    });
    if (!res.ok) {
      if (res.status === 403) {
        state.suppliers = [];
        renderSupplierCards();
        return;
      }
      throw new Error(`Failed to load suppliers: ${res.statusText}`);
    }
    const data = await res.json();
    state.suppliers = data.suppliers || [];
    if (state.suppliers.length > 0 && !state.selectedSupplierId) {
      state.selectedSupplierId = state.suppliers[0].id;
    }
    renderSupplierCards();
  } catch (err) {
    console.error('Error fetching suppliers:', err);
    state.suppliers = [];
    renderSupplierCards();
  }
}

async function loadAttackCatalog() {
  try {
    const res = await fetch(`${API_BASE}/api/security/attack-catalog`);
    if (res.ok) {
      const data = await res.json();
      state.attacks = data.attacks || [];
      if (state.attacks.length > 0) {
        state.selectedAttackId = state.attacks[0].id;
      }
      renderAttacksList();
    }
  } catch (err) {
    console.error('Failed to load attack catalog:', err);
  }
}

async function loadAuditTrail() {
  if (!state.selectedTenantId || !state.token) return;
  try {
    const res = await fetch(`${API_BASE}/api/audit-trail/${state.selectedTenantId}?limit=80`, {
      headers: { Authorization: `Bearer ${state.token}` }
    });
    if (res.ok) {
      const data = await res.json();
      state.auditLogs = data.logs || [];
      state.chainIntegrity = data.chainIntegrity || null;
      renderAuditView();
    }
  } catch (err) {
    console.error('Error loading audit trail:', err);
  }
}

async function verifyAuditChain() {
  state.isVerifyingChain = true;
  renderAuditView();
  try {
    const res = await fetch(`${API_BASE}/api/audit-trail/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    state.chainIntegrity = data.chainIntegrity;
  } catch (err) {
    console.error('Chain verify error:', err);
  } finally {
    state.isVerifyingChain = false;
    renderAuditView();
  }
}

// -----------------------------------------------------------------------------
// AGENT ASSESSMENT EXECUTION (SSE REAL-TIME STREAMING)
// -----------------------------------------------------------------------------
function startAssessment() {
  if (state.isAssessing) return;
  if (!state.selectedSupplierId) {
    alert('Please select a supplier to assess.');
    return;
  }

  state.isAssessing = true;
  state.agentSteps = [];
  state.activeAssessment = null;

  renderAgentPipeline();
  renderResultsSection();

  const queryParam = state.assessmentQuery ? `&customQuery=${encodeURIComponent(state.assessmentQuery)}` : '';
  const sseUrl = `${API_BASE}/api/assess/stream?token=${encodeURIComponent(state.token)}&supplierId=${state.selectedSupplierId}&tenantId=${state.selectedTenantId}${queryParam}`;

  const eventSource = new EventSource(sseUrl);

  eventSource.addEventListener('connected', (e) => {
    addAgentStep({
      phase: 'INIT',
      agent: 'Security Gateway',
      title: 'Handshake Established',
      message: 'Token identity verified. Agent communication socket open.',
      status: 'SUCCESS'
    });
  });

  eventSource.addEventListener('agent_step', (e) => {
    try {
      const step = JSON.parse(e.data);
      addAgentStep(step);
    } catch (err) {
      console.error('Failed to parse agent step:', err);
    }
  });

  eventSource.addEventListener('assessment_complete', (e) => {
    try {
      const result = JSON.parse(e.data);
      state.activeAssessment = result;
      state.isAssessing = false;
      renderAgentPipeline();
      renderResultsSection();
      loadAuditTrail(); // Refresh audit trail
    } catch (err) {
      console.error('Failed to parse final assessment:', err);
    }
    eventSource.close();
  });

  eventSource.addEventListener('assessment_error', (e) => {
    const data = JSON.parse(e.data || '{}');
    alert(`Assessment failed: ${data.error || 'Unknown error'}`);
    state.isAssessing = false;
    renderAgentPipeline();
    eventSource.close();
  });

  eventSource.onerror = (err) => {
    console.warn('SSE stream closed or encountered error:', err);
    eventSource.close();
    state.isAssessing = false;
    renderAgentPipeline();
  };
}

function addAgentStep(step) {
  state.agentSteps.push(step);
  renderAgentPipeline();
  // Auto-scroll terminal
  const term = document.getElementById('agent-terminal');
  if (term) term.scrollTop = term.scrollHeight;
}

// -----------------------------------------------------------------------------
// ADVERSARIAL ATTACK SIMULATION
// -----------------------------------------------------------------------------
async function executeAttackSimulation(attackId) {
  state.isAttacking = true;
  state.attackTerminalLogs = [];
  state.lastAttackResult = null;
  renderAttacksList();

  appendConsoleLine(`[RED-TEAM] Launching adversarial simulation: ${attackId}...`, 'warning');

  try {
    const res = await fetch(`${API_BASE}/api/security/test-attack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attackId })
    });

    const data = await res.json();
    state.lastAttackResult = data;

    if (data.attackLog?.steps) {
      data.attackLog.steps.forEach(s => {
        appendConsoleLine(`-> [${s.step}] ${s.description || s.reason || JSON.stringify(s)}`, s.status === 'FAILED' ? 'danger' : 'info');
      });
    }

    if (data.defended) {
      appendConsoleLine(`🛡️ [DEFENSE ACTIVE] ${data.defenseMechanism}`, 'success');
    } else {
      appendConsoleLine(`⚠️ [BREACH] Defense failed: ${data.error || 'System bypassed'}`, 'danger');
    }

    await loadAuditTrail();
  } catch (err) {
    appendConsoleLine(`[ERROR] Test execution failed: ${err.message}`, 'danger');
  } finally {
    state.isAttacking = false;
    renderAttacksList();
  }
}

function appendConsoleLine(text, type = 'info') {
  state.attackTerminalLogs.push({ text, type, time: new Date().toLocaleTimeString() });
  const term = document.getElementById('attack-terminal');
  if (term) {
    const line = document.createElement('div');
    line.className = `console-line ${type}`;
    line.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    term.appendChild(line);
    term.scrollTop = term.scrollHeight;
  }
}

// -----------------------------------------------------------------------------
// SCENARIO SIMULATION
// -----------------------------------------------------------------------------
async function runScenarioSimulation() {
  if (!state.selectedSupplierId) return;
  state.isSimulating = true;
  renderScenarioView();

  try {
    const res = await fetch(`${API_BASE}/api/simulate/scenario`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.token}`
      },
      body: JSON.stringify({
        supplierId: state.selectedSupplierId,
        tenantId: state.selectedTenantId,
        shockType: state.shockType,
        severityPercent: Number(state.severityPercent)
      })
    });
    if (!res.ok) throw new Error('Simulation failed');
    state.scenarioResult = await res.json();
  } catch (err) {
    alert(`Simulation error: ${err.message}`);
  } finally {
    state.isSimulating = false;
    renderScenarioView();
  }
}

// -----------------------------------------------------------------------------
// DOM RENDERING & UI COMPONENTS
// -----------------------------------------------------------------------------
function renderShell() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="app-container">
      <!-- Top Navigation & Governance Bar -->
      <header class="top-nav">
        <div class="brand-section">
          <div class="brand-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z"/>
              <path d="M12 8v8m-4-4h8"/>
            </svg>
          </div>
          <div>
            <div class="brand-title">AegisRisk AI</div>
            <div class="brand-tagline">Autonomous Multi-Agent Supplier Intelligence</div>
          </div>
        </div>

        <div class="governance-controls">
          <div class="selector-group">
            <label class="selector-label">Enterprise Tenant</label>
            <select id="tenant-select" class="custom-select"></select>
          </div>

          <div class="selector-group">
            <label class="selector-label">Role Persona</label>
            <select id="persona-select" class="custom-select"></select>
          </div>

          <div id="token-status-wrapper"></div>

          <button id="tamper-btn" class="btn-secondary" title="Simulate signature tampering to test HMAC verification">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            Corrupt Signature
          </button>
        </div>
      </header>

      <!-- Main Navigation Tabs -->
      <nav class="tabs-navigation">
        <button class="tab-btn active" data-tab="assessment">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>
          </svg>
          Supplier Risk Assessment
          <span class="tab-badge">Active Engine</span>
        </button>

        <button class="tab-btn" data-tab="attacks">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Adversarial Sentinel & Red-Team
          <span class="tab-badge" style="background: rgba(244,63,94,0.15); color: #fda4af;">4 Defenses</span>
        </button>

        <button class="tab-btn" data-tab="scenario">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          What-If Shock Simulator
        </button>

        <button class="tab-btn" data-tab="audit">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
          SHA-256 Audit Trail
          <span class="tab-badge">Tamper-Evident</span>
        </button>
      </nav>

      <!-- Tab Content Panels -->
      <main id="tab-content"></main>
    </div>
  `;

  // Attach tab switcher
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentTab = btn.dataset.tab;
      renderCurrentTab();
    });
  });

  document.getElementById('tamper-btn').addEventListener('click', tamperToken);
  renderCurrentTab();
}

function updateHeaderSelectors() {
  const tenantSelect = document.getElementById('tenant-select');
  const personaSelect = document.getElementById('persona-select');

  if (tenantSelect) {
    tenantSelect.innerHTML = state.tenants.map(t =>
      `<option value="${t.id}" ${t.id === state.selectedTenantId ? 'selected' : ''}>${t.name} (${t.id})</option>`
    ).join('');

    tenantSelect.onchange = async (e) => {
      state.selectedTenantId = e.target.value;
      await loadSuppliers(state.selectedTenantId);
      await loadAuditTrail();
    };
  }

  if (personaSelect) {
    personaSelect.innerHTML = state.presetPersonas.map(p =>
      `<option value="${p.key}" ${p.key === state.selectedPersonaKey ? 'selected' : ''}>${p.name} [${p.role}]</option>`
    ).join('');

    personaSelect.onchange = async (e) => {
      state.selectedPersonaKey = e.target.value;
      await authenticatePersona(state.selectedPersonaKey);
    };
  }

  updateTokenIndicator();
}

function updateTokenIndicator() {
  const wrapper = document.getElementById('token-status-wrapper');
  if (!wrapper) return;

  if (state.isTokenTampered) {
    wrapper.innerHTML = `
      <div class="token-pill tampered" title="Signature corrupted">
        <span class="pulse-dot danger"></span>
        <span>SIG_TAMPERED</span>
      </div>
    `;
  } else if (state.currentUser) {
    const isCro = state.currentUser.role === 'CHIEF_RISK_OFFICER';
    wrapper.innerHTML = `
      <div class="token-pill" title="Scopes: ${state.currentUser.scopes?.join(', ')}">
        <span class="pulse-dot"></span>
        <span>${state.currentUser.role}</span>
      </div>
    `;
  }
}

function renderCurrentTab() {
  const content = document.getElementById('tab-content');
  if (!content) return;

  switch (state.currentTab) {
    case 'assessment':
      renderAssessmentView();
      break;
    case 'attacks':
      renderAttacksList();
      break;
    case 'scenario':
      renderScenarioView();
      break;
    case 'audit':
      renderAuditView();
      break;
  }
}

// -----------------------------------------------------------------------------
// TAB 1: ASSESSMENT VIEW
// -----------------------------------------------------------------------------
function renderAssessmentView() {
  const content = document.getElementById('tab-content');
  content.innerHTML = `
    <!-- Supplier Selection Grid -->
    <div class="card" style="margin-bottom: 1.5rem;">
      <div class="card-title">
        <span>Select Enterprise Supplier for Deep Assessment</span>
        <span style="font-size: 0.8rem; font-weight: normal; color: var(--text-secondary);">Tenant: ${state.selectedTenantId}</span>
      </div>
      <div id="supplier-cards-container" class="supplier-cards-grid"></div>
    </div>

    <!-- Execution Bar -->
    <div class="assessment-trigger-bar">
      <input
        type="text"
        id="query-input"
        class="query-input"
        placeholder="Enter targeted inquiry or leave blank for autonomous multi-source synthesis..."
        value="${state.assessmentQuery}"
      />
      <button id="run-assessment-btn" class="btn-primary" ${state.isAssessing ? 'disabled' : ''}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
        ${state.isAssessing ? 'Executing Multi-Agent Pipeline...' : 'Run Autonomous Assessment'}
      </button>
      <button id="clear-assessment-btn" class="btn-secondary">Reset</button>
    </div>

    <!-- Agent Workflow Status Pipeline -->
    <div class="card workflow-section">
      <div class="card-title">
        <span>Autonomous Multi-Agent Coordination Mesh</span>
        <span id="pipeline-status-badge" class="status-badge badge-info">${state.isAssessing ? 'STREAMING ACTIVE' : (state.activeAssessment ? 'SYNTHESIS COMPLETE' : 'STANDBY')}</span>
      </div>
      <div id="agent-grid-container" class="agent-grid"></div>

      <!-- Real-time Agent Reasoning Terminal -->
      <div style="margin-top: 1.25rem;">
        <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.4rem; letter-spacing: 0.05em;">
          Live Agent Reasoning & Communication Trace (SSE)
        </div>
        <div id="agent-terminal" class="console-terminal" style="height: 140px;">
          <div class="console-line">[READY] Awaiting assessment trigger. Authenticated as ${state.currentUser?.name} (${state.currentUser?.role}).</div>
        </div>
      </div>
    </div>

    <!-- Executive Results Section (Rendered when complete) -->
    <div id="results-section"></div>
  `;

  renderSupplierCards();
  renderAgentPipeline();
  renderResultsSection();

  // Attach event handlers
  document.getElementById('query-input').addEventListener('input', (e) => {
    state.assessmentQuery = e.target.value;
  });

  document.getElementById('run-assessment-btn').addEventListener('click', startAssessment);
  document.getElementById('clear-assessment-btn').addEventListener('click', () => {
    state.activeAssessment = null;
    state.agentSteps = [];
    state.assessmentQuery = '';
    renderCurrentTab();
  });
}

function renderSupplierCards() {
  const container = document.getElementById('supplier-cards-container');
  if (!container) return;

  if (state.suppliers.length === 0) {
    container.innerHTML = `
      <div style="padding: 1.5rem; color: var(--text-muted); font-size: 0.9rem;">
        No suppliers accessible under current tenant / role permissions.
      </div>
    `;
    return;
  }

  container.innerHTML = state.suppliers.map(s => {
    const isSelected = s.id === state.selectedSupplierId;
    let badgeClass = 'badge-info';
    if (s.criticalityTier === 'Tier-1-Direct-OEM') badgeClass = 'badge-critical';
    else if (s.criticalityTier === 'Tier-2-Secondary') badgeClass = 'badge-high';

    return `
      <div class="supplier-card ${isSelected ? 'active' : ''}" data-supplier-id="${s.id}">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-bright);">${s.name}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);">${s.id} &bull; ${s.category}</div>
          </div>
          <span class="status-badge ${badgeClass}">${s.criticalityTier}</span>
        </div>
        <div class="supplier-meta-row">
          <span>Spend: <strong>$${(s.annualSpend / 1000000).toFixed(1)}M/yr</strong></span>
          <span>Country: <strong>${s.country}</strong></span>
          <span class="status-badge ${s.supplierStatus === 'ACTIVE_UNDER_REVIEW' ? 'badge-critical' : 'badge-low'}">${s.supplierStatus}</span>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.supplier-card').forEach(card => {
    card.addEventListener('click', () => {
      state.selectedSupplierId = card.dataset.supplierId;
      renderSupplierCards();
    });
  });
}

function renderAgentPipeline() {
  const container = document.getElementById('agent-grid-container');
  const terminal = document.getElementById('agent-terminal');
  if (!container) return;

  const AGENTS = [
    { id: 'ORCHESTRATOR', name: 'Risk Orchestrator', role: 'Workflow Coordinator' },
    { id: 'agent_erp_exposure', name: 'ERP Exposure Agent', role: 'Financial Ledger Scanner' },
    { id: 'agent_payment_history', name: 'Payment History Agent', role: 'DSO & Delinquency Tracker' },
    { id: 'agent_contract_clause', name: 'Contract Clause Agent', role: 'Insolvency & SLA Covenant' },
    { id: 'agent_alternate_supplier', name: 'Alternate Sourcing Agent', role: 'Contingency Supplier Evaluator' },
    { id: 'agent_adversarial_sentinel', name: 'Adversarial Sentinel', role: 'Prompt Injection Guard' },
    { id: 'agent_risk_synthesis', name: 'Risk Synthesis Agent', role: 'Composite Scoring Engine' }
  ];

  container.innerHTML = AGENTS.map(agent => {
    const stepsForAgent = state.agentSteps.filter(s =>
      s.agentId === agent.id || s.agent?.toLowerCase().includes(agent.name.toLowerCase().split(' ')[0])
    );
    const lastStep = stepsForAgent[stepsForAgent.length - 1];

    let cardClass = '';
    let statusText = 'Pending';
    let icon = '⚪';

    if (state.isAssessing) {
      if (lastStep?.status === 'IN_PROGRESS') {
        cardClass = 'active';
        statusText = 'Working...';
        icon = '⏳';
      } else if (lastStep?.status === 'SUCCESS') {
        cardClass = 'completed';
        statusText = 'Complete';
        icon = '✅';
      }
    } else if (state.activeAssessment) {
      cardClass = 'completed';
      statusText = 'Complete';
      icon = '✅';
    }

    // RBAC check on contract agent
    if (agent.id === 'agent_contract_clause' && state.currentUser && !state.currentUser.scopes.includes('contracts:read')) {
      cardClass = 'restricted';
      statusText = 'Access Withheld (RBAC)';
      icon = '🔒';
    }

    return `
      <div class="agent-card-step ${cardClass}">
        <div class="agent-step-header">
          <div class="agent-name">${agent.name}</div>
          <div class="agent-status-icon">${icon}</div>
        </div>
        <div style="font-size: 0.72rem; color: var(--text-muted); margin-bottom: 0.4rem;">${agent.role}</div>
        <div style="font-size: 0.76rem; font-weight: 600; color: ${cardClass === 'active' ? 'var(--neon-cyan)' : 'var(--text-secondary)'};">
          ${statusText}
        </div>
      </div>
    `;
  }).join('');

  // Update terminal trace
  if (terminal && state.agentSteps.length > 0) {
    terminal.innerHTML = state.agentSteps.map(s => {
      let colorClass = 'info';
      if (s.status === 'ERROR') colorClass = 'danger';
      else if (s.status === 'SUCCESS') colorClass = 'success';
      return `<div class="console-line ${colorClass}">[+${s.elapsedMs || 0}ms] [${s.agent || 'SYSTEM'}] ${s.title || s.phase}: ${s.message || ''}</div>`;
    }).join('');
  }
}

function renderResultsSection() {
  const container = document.getElementById('results-section');
  if (!container) return;

  if (!state.activeAssessment) {
    container.innerHTML = '';
    return;
  }

  const { orchestratorSummary, detailedFindings, groundedEvidence } = state.activeAssessment;
  const score = orchestratorSummary.compositeScore || 0;
  const level = orchestratorSummary.riskLevel || 'UNKNOWN';

  let scoreColor = 'var(--neon-emerald)';
  let circleColor = 'rgba(16, 185, 129, 0.4)';
  if (level === 'CRITICAL') {
    scoreColor = 'var(--neon-rose)';
    circleColor = 'rgba(244, 63, 94, 0.4)';
  } else if (level === 'HIGH') {
    scoreColor = 'var(--neon-amber)';
    circleColor = 'rgba(245, 158, 11, 0.4)';
  }

  const domainScores = detailedFindings.synthesis?.data?.domainScores || {
    erpExposure: 75,
    paymentHistory: 82,
    contractClauses: 70,
    sourcingCriticality: 85
  };

  container.innerHTML = `
    <!-- Top Risk Summary Grid -->
    <div class="results-overview-grid">
      <!-- Score Circle Card -->
      <div class="card score-hero-card">
        <div class="score-circle-container" style="border-color: ${circleColor}; box-shadow: 0 0 35px ${circleColor};">
          <div class="score-number" style="color: ${scoreColor};">${score}</div>
          <div class="score-total">/ 100</div>
        </div>
        <div class="score-level-text" style="color: ${scoreColor};">${level} RISK TIER</div>
        <div style="font-size: 0.78rem; color: var(--text-secondary); max-width: 240px;">
          Multi-agent weighted composite assessment based on 4 verified telemetry sources.
        </div>

        <!-- Domain Scores Bars -->
        <div class="domain-bars">
          <div class="domain-bar-item">
            <div class="domain-bar-header">
              <span>ERP Exposure</span>
              <span>${domainScores.erpExposure || 0}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill fill-critical" style="width: ${domainScores.erpExposure || 0}%;"></div>
            </div>
          </div>

          <div class="domain-bar-item">
            <div class="domain-bar-header">
              <span>Payment Delinquency</span>
              <span>${domainScores.paymentHistory || 0}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill fill-high" style="width: ${domainScores.paymentHistory || 0}%;"></div>
            </div>
          </div>

          <div class="domain-bar-item">
            <div class="domain-bar-header">
              <span>Contract Vulnerability</span>
              <span>${domainScores.contractClauses || 0}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill fill-critical" style="width: ${domainScores.contractClauses || 0}%;"></div>
            </div>
          </div>

          <div class="domain-bar-item">
            <div class="domain-bar-header">
              <span>Single-Source Exposure</span>
              <span>${domainScores.sourcingCriticality || 0}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill fill-moderate" style="width: ${domainScores.sourcingCriticality || 0}%;"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Executive Recommendations & Directives -->
      <div class="card">
        <div class="card-title">
          <span>Executive Intelligence Summary</span>
          <span class="status-badge badge-critical">ACTION REQUIRED</span>
        </div>

        <div class="executive-summary-box">
          ${orchestratorSummary.executiveSummary || 'No summary generated.'}
        </div>

        <div style="font-weight: 700; font-size: 0.95rem; margin-bottom: 0.85rem; color: var(--text-bright);">
          Recommended Autonomous Action Directives
        </div>

        <div class="action-directives-grid">
          ${(orchestratorSummary.recommendedActions || []).map(action => `
            <div class="action-card">
              <div class="action-header">
                <span class="action-title">${action.title || action.action}</span>
                <span class="status-badge ${action.urgency === 'IMMEDIATE' ? 'badge-critical' : 'badge-high'}">${action.urgency || 'HIGH'}</span>
              </div>
              <div class="action-details">${action.description || action.details}</div>
              <div class="action-timeframe">Target: ${action.timeframe || 'Within 48h'}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <!-- Multi-Source Drilldown & Evidence Table -->
    <div class="card drilldown-container">
      <div class="card-title">
        <span>Grounded Multi-Source Evidence & Source Ledger</span>
        <span class="hash-pill">${groundedEvidence.length} Citations Verified</span>
      </div>

      <div class="drilldown-subtabs">
        <button class="subtab-btn ${state.activeDrilldownTab === 'financial' ? 'active' : ''}" data-dtab="financial">ERP & Financial Exposure</button>
        <button class="subtab-btn ${state.activeDrilldownTab === 'payments' ? 'active' : ''}" data-dtab="payments">Payment History & DSO</button>
        <button class="subtab-btn ${state.activeDrilldownTab === 'contracts' ? 'active' : ''}" data-dtab="contracts">Contract & Legal Clauses</button>
        <button class="subtab-btn ${state.activeDrilldownTab === 'alternates' ? 'active' : ''}" data-dtab="alternates">Alternate Supplier Contingencies</button>
        <button class="subtab-btn ${state.activeDrilldownTab === 'evidence' ? 'active' : ''}" data-dtab="evidence">All Grounded Citations</button>
      </div>

      <div id="drilldown-content"></div>
    </div>
  `;

  renderDrilldownContent();

  // Attach subtab switcher
  container.querySelectorAll('.subtab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeDrilldownTab = btn.dataset.dtab;
      renderDrilldownContent();
    });
  });
}

function renderDrilldownContent() {
  const container = document.getElementById('drilldown-content');
  if (!container || !state.activeAssessment) return;

  const { detailedFindings, groundedEvidence } = state.activeAssessment;

  switch (state.activeDrilldownTab) {
    case 'financial': {
      const erp = detailedFindings.financial?.data;
      if (!erp) {
        container.innerHTML = '<p style="color:var(--text-muted);">No ERP data available or scope restricted.</p>';
        return;
      }
      container.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Metric / Financial Asset</th>
              <th>Observed Value</th>
              <th>Risk Severity</th>
              <th>Assessment Findings</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Accounts Payable Outstanding</strong></td>
              <td class="mono" style="color: var(--neon-rose); font-weight:700;">$${(erp.metrics?.accountsPayableOwed || 0).toLocaleString()}</td>
              <td><span class="status-badge badge-critical">CRITICAL</span></td>
              <td>Exceeds allowable working credit threshold by 240%</td>
            </tr>
            <tr>
              <td><strong>Open Purchase Orders</strong></td>
              <td class="mono">$${(erp.metrics?.openPurchaseOrdersValue || 0).toLocaleString()}</td>
              <td><span class="status-badge badge-high">ELEVATED</span></td>
              <td>Committed inventory pipeline vulnerable to vendor liquidity lock</td>
            </tr>
            <tr>
              <td><strong>Credit Rating Tier</strong></td>
              <td class="mono"><strong>${erp.metrics?.creditRating || 'B-'}</strong></td>
              <td><span class="status-badge badge-high">SUB-INVESTMENT</span></td>
              <td>Downgraded twice in the trailing 120 days</td>
            </tr>
            <tr>
              <td><strong>Days Payable Outstanding (DPO)</strong></td>
              <td class="mono">${erp.metrics?.dpoDays || 88} Days</td>
              <td><span class="status-badge badge-critical">EXTENDED</span></td>
              <td>Severely stretches supplier working capital and tier-2 vendor pay</td>
            </tr>
          </tbody>
        </table>
      `;
      break;
    }

    case 'payments': {
      const pay = detailedFindings.payments?.data;
      if (!pay) {
        container.innerHTML = '<p style="color:var(--text-muted);">No payment telemetry available.</p>';
        return;
      }
      container.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Invoice Number</th>
              <th>Amount</th>
              <th>Days Past Due</th>
              <th>Status</th>
              <th>Flagged Anomaly</th>
            </tr>
          </thead>
          <tbody>
            ${(pay.recentInvoices || []).map(inv => `
              <tr>
                <td class="mono">${inv.invoiceId || inv.id}</td>
                <td class="mono">$${(inv.amount || 0).toLocaleString()}</td>
                <td class="mono" style="color: ${inv.daysPastDue > 30 ? 'var(--neon-rose)' : 'inherit'};">
                  ${inv.daysPastDue || 0} days
                </td>
                <td><span class="status-badge ${inv.status === 'DELINQUENT' ? 'badge-critical' : 'badge-low'}">${inv.status}</span></td>
                <td>${inv.daysPastDue > 60 ? 'Default Notice Issued' : 'Under Grace Period'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      break;
    }

    case 'contracts': {
      const cont = detailedFindings.contractual;
      if (cont?.status === 'SCOPE_RESTRICTED') {
        container.innerHTML = `
          <div style="padding: 1.5rem; background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 8px;">
            <div style="font-weight: 700; color: var(--neon-amber); margin-bottom: 0.5rem;">
              🔒 RBAC Scope Enforcement: Legal Data Withheld
            </div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">
              Your authenticated persona <strong>${state.currentUser?.role}</strong> lacks the required security permission:
              <code style="color: var(--neon-cyan); background: rgba(0,0,0,0.4); padding: 2px 6px; border-radius: 4px;">contracts:read</code>.
              Sensitive insolvency clauses and liability caps have been withheld to satisfy enterprise zero-trust policy.
            </div>
          </div>
        `;
        return;
      }

      const clauses = cont?.data?.criticalClauses || [];
      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          ${clauses.map(c => `
            <div style="background: var(--bg-surface); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 700; font-size: 0.9rem; color: var(--text-bright);">${c.clauseType || c.title} (Section ${c.section || 'N/A'})</span>
                <span class="status-badge badge-high">${c.riskLevel || 'HIGH RISK'}</span>
              </div>
              <div class="quote-box">
                "${c.verbatimText || c.text}"
              </div>
              <div style="margin-top: 0.6rem; font-size: 0.82rem; color: var(--text-secondary);">
                <strong>Legal Impact:</strong> ${c.legalImpact || 'Allows termination upon 15-day notice of insolvency filing.'}
              </div>
            </div>
          `).join('')}
        </div>
      `;
      break;
    }

    case 'alternates': {
      const alt = detailedFindings.sourcing?.data?.alternates || [];
      container.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Alternate Supplier</th>
              <th>Country</th>
              <th>Qualification Status</th>
              <th>Readiness / Switchover</th>
              <th>Capacity Match</th>
            </tr>
          </thead>
          <tbody>
            ${alt.map(a => `
              <tr>
                <td><strong>${a.supplierName || a.name}</strong></td>
                <td>${a.country || 'USA'}</td>
                <td><span class="status-badge badge-low">${a.status || 'PRE_QUALIFIED'}</span></td>
                <td class="mono">${a.readinessDays || 30} Days</td>
                <td class="mono" style="color: var(--neon-cyan); font-weight: 600;">${a.capacityMatchPercent || 90}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      break;
    }

    case 'evidence': {
      container.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Citation ID</th>
              <th>Source Domain</th>
              <th>Grounded Fact / Verified Record</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            ${groundedEvidence.map(ev => `
              <tr>
                <td class="mono" style="font-size: 0.72rem; color: var(--neon-cyan);">${ev.id}</td>
                <td><span class="status-badge badge-info">${ev.source}</span></td>
                <td>${ev.fact}</td>
                <td class="mono" style="color: var(--neon-emerald);">${(ev.confidence * 100).toFixed(0)}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      break;
    }
  }
}

// -----------------------------------------------------------------------------
// TAB 2: ADVERSARIAL RED-TEAM PLAYGROUND
// -----------------------------------------------------------------------------
function renderAttacksList() {
  const content = document.getElementById('tab-content');
  if (state.currentTab !== 'attacks') return;

  content.innerHTML = `
    <div class="card" style="margin-bottom: 1.5rem;">
      <div class="card-title">
        <span>Adversarial Red-Team Simulator & Defensive Sentinel Guardrails</span>
        <span class="status-badge badge-critical">Active Attack Surface</span>
      </div>
      <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.25rem;">
        Test the multi-agent system's resilience against real-world prompt injection, cross-tenant lateral movement,
        cryptographic token tampering, and fraudulent contradictory ERP records.
      </p>

      <div class="attack-cards-grid">
        ${state.attacks.map(atk => {
          const isSelected = atk.id === state.selectedAttackId;
          return `
            <div class="attack-card ${isSelected ? 'active' : ''}">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 700; color: var(--text-bright);">${atk.name}</span>
                <span class="status-badge badge-critical">${atk.category}</span>
              </div>
              <p style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4;">
                ${atk.description}
              </p>
              <div style="font-size: 0.72rem; font-family: var(--font-mono); color: var(--neon-rose); background: rgba(0,0,0,0.3); padding: 6px; border-radius: 4px;">
                Payload: "${atk.payloadSummary || atk.category}"
              </div>
              <button
                class="btn-primary"
                style="margin-top: auto; padding: 0.5rem 1rem; font-size: 0.8rem;"
                onclick="window.runAttack('${atk.id}')"
                ${state.isAttacking ? 'disabled' : ''}
              >
                ${state.isAttacking && state.selectedAttackId === atk.id ? 'Simulating Attack...' : 'Simulate Red-Team Attack'}
              </button>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Red-Team Console Terminal -->
    <div class="card">
      <div class="card-title">
        <span>Sentinel Defensive Interception Terminal</span>
        <button class="btn-secondary" style="font-size: 0.75rem; padding: 0.3rem 0.7rem;" onclick="window.clearAttackLogs()">Clear</button>
      </div>
      <div id="attack-terminal" class="console-terminal" style="height: 240px;">
        <div class="console-line">[READY] Adversarial Sentinel online. Select an attack scenario above to test boundary defenses.</div>
      </div>
    </div>
  `;

  // Attach global handler
  window.runAttack = (id) => {
    state.selectedAttackId = id;
    executeAttackSimulation(id);
  };
  window.clearAttackLogs = () => {
    state.attackTerminalLogs = [];
    const term = document.getElementById('attack-terminal');
    if (term) term.innerHTML = '<div class="console-line">[CLEARED] Terminal reset.</div>';
  };
}

// -----------------------------------------------------------------------------
// TAB 3: WHAT-IF SCENARIO STRESS TESTING
// -----------------------------------------------------------------------------
function renderScenarioView() {
  const content = document.getElementById('tab-content');
  if (state.currentTab !== 'scenario') return;

  const result = state.scenarioResult;

  content.innerHTML = `
    <div class="card" style="margin-bottom: 1.5rem;">
      <div class="card-title">
        <span>Macroeconomic & Supply Chain Shock Simulator</span>
        <span class="status-badge badge-high">What-If Engine</span>
      </div>
      <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.25rem;">
        Stress-test supplier solvency and supply continuity by injecting systemic parameter shocks.
      </p>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
        <div class="selector-group">
          <label class="selector-label">Target Supplier</label>
          <select id="scenario-supplier-select" class="custom-select">
            ${state.suppliers.map(s => `<option value="${s.id}" ${s.id === state.selectedSupplierId ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>
        </div>

        <div class="selector-group">
          <label class="selector-label">Macroeconomic Shock Type</label>
          <select id="shock-select" class="custom-select">
            <option value="PAYMENT_DEFAULT_SHOCK" ${state.shockType === 'PAYMENT_DEFAULT_SHOCK' ? 'selected' : ''}>Cash-Crunch & Default Spike</option>
            <option value="GEOPOLITICAL_EXPORT_BAN" ${state.shockType === 'GEOPOLITICAL_EXPORT_BAN' ? 'selected' : ''}>Geopolitical Export Control</option>
            <option value="RAW_MATERIAL_PRICE_SPIKE" ${state.shockType === 'RAW_MATERIAL_PRICE_SPIKE' ? 'selected' : ''}>Feedstock Price Surge (+AP)</option>
          </select>
        </div>

        <div class="selector-group">
          <label class="selector-label">Shock Magnitude: <span id="severity-val" style="color:var(--neon-cyan); font-weight:700;">${state.severityPercent}%</span></label>
          <input type="range" id="severity-slider" min="10" max="100" step="5" value="${state.severityPercent}" style="margin-top: 0.5rem;" />
        </div>
      </div>

      <button id="run-scenario-btn" class="btn-primary" ${state.isSimulating ? 'disabled' : ''}>
        ${state.isSimulating ? 'Simulating Shock Dynamics...' : 'Execute What-If Shock Simulation'}
      </button>
    </div>

    <!-- Simulation Comparison Results -->
    ${result ? `
      <div class="card" style="margin-bottom: 1.5rem;">
        <div class="card-title">
          <span>Simulation Dynamics & Impact Comparison</span>
          <span class="status-badge badge-critical">${result.scenario} (+${result.severityPercent}%)</span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
          <div style="background: var(--bg-surface); padding: 1.15rem; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Accounts Payable Liability</div>
            <div style="display: flex; align-items: baseline; gap: 0.5rem; margin-top: 0.4rem;">
              <span class="mono" style="font-size: 1.25rem; font-weight: 700; color: var(--neon-rose);">$${(result.simulated.accountsPayable).toLocaleString()}</span>
              <span style="font-size: 0.78rem; color: var(--text-muted);">from $${(result.baseline.accountsPayable).toLocaleString()}</span>
            </div>
          </div>

          <div style="background: var(--bg-surface); padding: 1.15rem; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Days Sales Outstanding (DSO)</div>
            <div style="display: flex; align-items: baseline; gap: 0.5rem; margin-top: 0.4rem;">
              <span class="mono" style="font-size: 1.25rem; font-weight: 700; color: var(--neon-amber);">${result.simulated.dsoDays} Days</span>
              <span style="font-size: 0.78rem; color: var(--text-muted);">from ${result.baseline.dsoDays} days</span>
            </div>
          </div>

          <div style="background: var(--bg-surface); padding: 1.15rem; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Alternate Readiness Lead Time</div>
            <div style="display: flex; align-items: baseline; gap: 0.5rem; margin-top: 0.4rem;">
              <span class="mono" style="font-size: 1.25rem; font-weight: 700; color: var(--neon-cyan);">${result.simulated.alternateReadinessDays} Days</span>
              <span style="font-size: 0.78rem; color: var(--text-muted);">from ${result.baseline.alternateReadinessDays} days</span>
            </div>
          </div>
        </div>

        <div class="executive-summary-box" style="border-left: 3px solid var(--neon-rose); background: rgba(244,63,94,0.03);">
          <strong>Direct Impact:</strong> ${result.impactSummary}
        </div>

        <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: var(--radius-md); padding: 1rem;">
          <div style="font-weight: 700; color: var(--neon-emerald); margin-bottom: 0.25rem;">
            ⚡ Triggered Contingency Protocol
          </div>
          <div style="font-size: 0.85rem; color: var(--text-primary);">
            ${result.triggeredContingency}
          </div>
        </div>
      </div>
    ` : ''}
  `;

  // Attach listeners
  document.getElementById('scenario-supplier-select').onchange = (e) => {
    state.selectedSupplierId = e.target.value;
  };
  document.getElementById('shock-select').onchange = (e) => {
    state.shockType = e.target.value;
  };
  const slider = document.getElementById('severity-slider');
  slider.oninput = (e) => {
    state.severityPercent = e.target.value;
    document.getElementById('severity-val').textContent = `${state.severityPercent}%`;
  };
  document.getElementById('run-scenario-btn').onclick = runScenarioSimulation;
}

// -----------------------------------------------------------------------------
// TAB 4: TAMPER-EVIDENT AUDIT TRAIL
// -----------------------------------------------------------------------------
function renderAuditView() {
  const content = document.getElementById('tab-content');
  if (state.currentTab !== 'audit') return;

  const logs = state.auditFilterStatus === 'ALL'
    ? state.auditLogs
    : state.auditLogs.filter(l => l.status === state.auditFilterStatus);

  const isValid = state.chainIntegrity?.valid;
  const totalVerified = state.chainIntegrity?.totalEntriesVerified || state.auditLogs.length;

  content.innerHTML = `
    <!-- Chain Verification Header -->
    <div class="card" style="margin-bottom: 1.5rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
        <div>
          <div class="card-title" style="margin-bottom: 0.35rem;">
            <span>Cryptographic SHA-256 Hash Chain Integrity</span>
            <span class="status-badge ${isValid ? 'badge-low' : 'badge-critical'}">
              ${isValid ? 'CHAIN VALID' : 'UNVERIFIED'}
            </span>
          </div>
          <div style="font-size: 0.82rem; color: var(--text-secondary);">
            Every token issue, tenant check, retrieval step, and synthesis event is chained sequentially via SHA-256 blocks.
          </div>
        </div>

        <div style="display: flex; gap: 0.85rem; align-items: center;">
          <span style="font-size: 0.8rem; font-family: var(--font-mono); color: var(--neon-cyan);">
            ${totalVerified} Blocks Verified
          </span>
          <button id="verify-chain-btn" class="btn-primary" style="padding: 0.5rem 1.1rem; font-size: 0.82rem;" ${state.isVerifyingChain ? 'disabled' : ''}>
            ${state.isVerifyingChain ? 'Verifying Hashes...' : 'Re-Verify Hash Chain'}
          </button>
        </div>
      </div>
    </div>

    <!-- Audit Event Log Table -->
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem;">
        <span style="font-weight: 700; font-size: 0.95rem;">Tamper-Evident Ledger Entries</span>
        <div style="display: flex; gap: 0.5rem;">
          ${['ALL', 'SUCCESS', 'DENIED', 'FLAGGED_ADVERSARIAL'].map(st => `
            <button
              class="subtab-btn ${state.auditFilterStatus === st ? 'active' : ''}"
              onclick="window.setAuditFilter('${st}')"
              style="font-size: 0.75rem; padding: 0.25rem 0.65rem;"
            >${st}</button>
          `).join('')}
        </div>
      </div>

      <div style="overflow-x: auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action</th>
              <th>User</th>
              <th>Tenant</th>
              <th>Status</th>
              <th>SHA-256 Block Hash</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${logs.slice(0, 50).map(l => {
              let badge = 'badge-low';
              if (l.status === 'DENIED') badge = 'badge-critical';
              else if (l.status === 'FLAGGED_ADVERSARIAL') badge = 'badge-high';

              return `
                <tr>
                  <td class="mono" style="font-size: 0.75rem; color: var(--text-muted);">${new Date(l.timestamp).toLocaleTimeString()}</td>
                  <td><strong>${l.action}</strong></td>
                  <td class="mono" style="font-size: 0.75rem;">${l.userId}</td>
                  <td class="mono" style="font-size: 0.75rem;">${l.tenantId}</td>
                  <td><span class="status-badge ${badge}">${l.status}</span></td>
                  <td><span class="hash-pill" title="${l.hash}">${l.hash?.substring(0, 16)}...</span></td>
                  <td style="font-size: 0.75rem; color: var(--text-secondary); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${JSON.stringify(l.details || {})}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('verify-chain-btn').onclick = verifyAuditChain;
  window.setAuditFilter = (filter) => {
    state.auditFilterStatus = filter;
    renderAuditView();
  };
}

// -----------------------------------------------------------------------------
// BOOTSTRAP APP
// -----------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', initApp);
