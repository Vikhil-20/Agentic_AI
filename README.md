# AegisRisk AI 🛡️
### Autonomous Multi-Agent Supplier Risk Assessment & Decision Support Platform

AegisRisk AI is an enterprise-grade agentic intelligence platform engineered to autonomously evaluate supplier solvency, supply chain continuity, contract compliance, and geopolitical vulnerabilities. It features zero-trust tenant isolation, cryptographic SHA-256 audit trails, real-time Server-Sent Events (SSE) streaming, and an adversarial red-team defense sentinel.

---

## 🌟 Key Architecture & Capabilities

### 1. 🤖 Multi-Agent Orchestration Mesh
The platform coordinates specialized autonomous agents:
- **Autonomous Risk Orchestrator**: Plans workflow execution, validates RBAC scopes, coordinates concurrent subtasks, and streams live telemetry.
- **ERP Exposure Agent**: Analyzes Accounts Payable liabilities, open purchase orders, credit ratings, and DPO metrics.
- **Payment History Agent**: Detects payment delinquency patterns, DSO volatility, and cash-flow default risks.
- **Contract Clause Agent**: Analyzes master supplier agreements for insolvency rights, SLA covenants, and liability provisions.
- **Alternate Supplier Agent**: Identifies pre-vetted failover suppliers and switchover lead times.
- **Adversarial Sentinel Agent**: Purges prompt injections and detects fraudulent cross-ledger record contradictions.
- **Risk Synthesis Agent**: Synthesizes multi-source telemetry into weighted composite risk scores (0–100) and actionable contingency plans.

### 2. 🔐 Zero-Trust Security & RBAC
- **HMAC-SHA256 Token Issuance**: Enterprise personas (CRO, Financial Analyst, Legal Counsel, Procurement Specialist, Cross-Tenant Intruder).
- **Tenant Boundary Enforcement**: Strict isolation between Aerospace, Pharma, and Automotive corporate data.
- **Scope-Based Data Withholding**: Restricts sensitive contract and legal data when scopes like `contracts:read` are absent.

### 3. ⛓️ Tamper-Evident SHA-256 Audit Trail
- Sequential cryptographic hash chaining across every authentication, tenant check, retrieval step, and synthesis event.
- Built-in verification engine verifying block integrity and detecting hash corruption.

### 4. 🎯 Adversarial Red-Team Playground
- Interactive test suite covering:
  - Prompt injection and system override attacks.
  - Cross-tenant lateral exfiltration attempts.
  - Cryptographic token signature tampering.
  - Fraudulent contradictory ERP ledger record injections.

### 5. ⚡ What-If Macroeconomic Shock Simulator
- Stress-test supplier solvency against Cash-Crunch Default spikes, Geopolitical Export Controls, and Raw Material Price Surges with variable severity (10%–100%).

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js (v18+ recommended)
- npm

### 1. Start Backend Server
```bash
cd server
npm install
npm run start
# Server runs on http://localhost:4000
```

### 2. Run Automated Test Suite
```bash
cd server
npm test
# Runs automated security and agent tests (7/7 pass)
```

### 3. Start Frontend Client
```bash
cd client
npm install
npm run dev
# Client runs on http://localhost:5173
```

---

## 🧪 Automated Test Coverage
The platform includes tests covering:
- Cryptographic token validation and tamper rejection.
- SHA-256 audit hash-chain integrity.
- Full multi-agent concurrent orchestrator execution.
- Scope-based RBAC data withholding.
- Adversarial prompt injection neutralization.
- Post-execution chain verification.
