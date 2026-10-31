import assert from 'assert';
import { createToken, verifyToken, PRESET_PERSONAS } from '../src/security/tokens.js';
import { auditTrail } from '../src/audit/auditTrail.js';
import { orchestrator } from '../src/agents/OrchestratorAgent.js';
import { ADVERSARIAL_TEST_PAYLOADS } from '../src/data/mockEnterpriseData.js';

async function runTestSuite() {
  console.log('====================================================');
  console.log('RUNNING AUTOMATED TEST SUITE: SECURITY & AGENTS');
  console.log('====================================================');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}:`, err.message);
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}:`, err.message);
    }
  }

  // TEST 1: Cryptographic Token Issuance & Tamper Detection
  test('Token: Valid token verifies successfully', () => {
    const token = createToken(PRESET_PERSONAS.AERO_CHIEF_RISK_OFFICER);
    const result = verifyToken(token);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.payload.tenant_id, 'TENANT_AERO_CORP');
    assert.strictEqual(result.payload.role, 'CHIEF_RISK_OFFICER');
  });

  test('Token: Tampered signature is detected and rejected', () => {
    const token = createToken(PRESET_PERSONAS.AERO_CHIEF_RISK_OFFICER);
    const tampered = token.slice(0, -6) + 'ABCDEF';
    const result = verifyToken(tampered);
    assert.strictEqual(result.valid, false);
    assert.match(result.error, /Cryptographic signature mismatch/i);
  });

  // TEST 2: Tamper-Evident SHA-256 Audit Trail
  test('Audit: Hash chaining remains cryptographically valid', () => {
    auditTrail.logEvent({
      tenantId: 'TENANT_AERO_CORP',
      userId: 'usr_test',
      action: 'SYSTEM_BOOTSTRAP',
      status: 'SUCCESS',
      details: { test: true }
    });

    const verification = auditTrail.verifyChainIntegrity();
    assert.strictEqual(verification.valid, true);
    assert.ok(verification.totalEntriesVerified > 0);
  });

  // TEST 3: Full Multi-Agent Orchestrator Execution
  await testAsync('Orchestrator: Executes full concurrent pipeline for SUP-AERO-001', async () => {
    const token = createToken(PRESET_PERSONAS.AERO_CHIEF_RISK_OFFICER);
    const user = verifyToken(token).payload;

    const result = await orchestrator.runAssessment(
      { supplierId: 'SUP-AERO-001', tenantId: 'TENANT_AERO_CORP' },
      { user }
    );

    assert.ok(result.orchestratorSummary.compositeScore > 65, 'Titanium Forgings should evaluate to high/critical risk');
    assert.strictEqual(result.orchestratorSummary.riskLevel, 'CRITICAL');
    assert.strictEqual(result.detailedFindings.financial.status, 'SUCCESS');
    assert.strictEqual(result.detailedFindings.contractual.status, 'SUCCESS');
    assert.strictEqual(result.detailedFindings.sourcing.status, 'SUCCESS');
    assert.ok(result.groundedEvidence.length > 5, 'Must provide grounded evidence items');
    assert.ok(result.orchestratorSummary.executiveSummary.length > 30);
  });

  // TEST 4: RBAC Scope Restriction Graceful Handling
  await testAsync('RBAC: Financial Analyst lacking contracts:read has legal data withheld', async () => {
    const token = createToken(PRESET_PERSONAS.AERO_FINANCIAL_ANALYST);
    const user = verifyToken(token).payload;

    const result = await orchestrator.runAssessment(
      { supplierId: 'SUP-AERO-001', tenantId: 'TENANT_AERO_CORP' },
      { user }
    );

    assert.strictEqual(result.detailedFindings.contractual.status, 'SCOPE_RESTRICTED');
    assert.strictEqual(result.detailedFindings.financial.status, 'SUCCESS');
    assert.ok(
      result.detailedFindings.synthesis.data.withheldDomains.some(d => d.domain.includes('Contractual')),
      'Synthesis must note withheld domain'
    );
  });

  // TEST 5: Adversarial Sentinel Neutralizes Prompt Injection
  await testAsync('Adversarial Sentinel: Neutralizes prompt injection payload', async () => {
    const token = createToken(PRESET_PERSONAS.AERO_CHIEF_RISK_OFFICER);
    const user = verifyToken(token).payload;
    const injectionAttack = ADVERSARIAL_TEST_PAYLOADS[0];

    const result = await orchestrator.runAssessment(
      {
        supplierId: 'SUP-AERO-001',
        tenantId: 'TENANT_AERO_CORP',
        customQuery: injectionAttack.payload.customQuery
      },
      { user }
    );

    const sentinel = result.detailedFindings.securitySentinel.data;
    assert.strictEqual(sentinel.isCompromised, true);
    assert.strictEqual(sentinel.sentinelStatus, 'THREATS_NEUTRALIZED');
    assert.ok(sentinel.threatsDetected.length > 0);
    // Verified that despite prompt injection asking for risk 0, composite score is still critical!
    assert.ok(result.orchestratorSummary.compositeScore > 60);
  });

  // TEST 6: Audit Chain Integrity Post-Execution
  test('Audit: Hash chain verification succeeds after multi-agent actions', () => {
    const verification = auditTrail.verifyChainIntegrity();
    assert.strictEqual(verification.valid, true);
    console.log(`Verified ${verification.totalEntriesVerified} consecutive audit log blocks.`);
  });

  console.log('====================================================');
  console.log(`TEST SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log('====================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runTestSuite();
