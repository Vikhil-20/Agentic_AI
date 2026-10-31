import { ErpExposureAgent } from './ErpExposureAgent.js';
import { PaymentHistoryAgent } from './PaymentHistoryAgent.js';
import { ContractClauseAgent } from './ContractClauseAgent.js';
import { AlternateSupplierAgent } from './AlternateSupplierAgent.js';
import { AdversarialSentinelAgent } from './AdversarialSentinelAgent.js';
import { RiskSynthesisAgent } from './RiskSynthesisAgent.js';
import { auditTrail } from '../audit/auditTrail.js';

export class OrchestratorAgent {
  constructor() {
    this.name = 'Autonomous Risk Orchestrator';
    this.erpAgent = new ErpExposureAgent();
    this.paymentAgent = new PaymentHistoryAgent();
    this.contractAgent = new ContractClauseAgent();
    this.alternateAgent = new AlternateSupplierAgent();
    this.sentinelAgent = new AdversarialSentinelAgent();
    this.synthesisAgent = new RiskSynthesisAgent();
  }

  /**
   * Coordinates the multi-agent risk assessment pipeline.
   * Supports an optional onStepUpdate callback for real-time frontend streaming.
   */
  async runAssessment({ supplierId, tenantId, customQuery, simulatedPoisonedErp }, context, onStepUpdate = null) {
    const pipelineStartTime = Date.now();
    const executionTrace = [];

    const emitStep = (step) => {
      const entry = {
        ...step,
        timestamp: new Date().toISOString(),
        elapsedMs: Date.now() - pipelineStartTime
      };
      executionTrace.push(entry);
      if (typeof onStepUpdate === 'function') {
        onStepUpdate(entry);
      }
    };

    // -------------------------------------------------------------
    // PHASE 1: PLANNING & AUTHORIZATION SCOPE AUDIT
    // -------------------------------------------------------------
    emitStep({
      stepId: 'ORCHESTRATOR_PLANNING',
      phase: 'PLANNING',
      title: 'Workflow Planning & Authorization Verification',
      agent: this.name,
      status: 'IN_PROGRESS',
      message: `Analyzing user token permissions for tenant ${tenantId} and planning concurrent subtasks for supplier ${supplierId}...`
    });

    const userScopes = context.user?.scopes || [];
    const plannedTasks = [
      { agentId: this.erpAgent.id, name: this.erpAgent.name, requiredScope: this.erpAgent.requiredScope, authorized: this.erpAgent.hasAuthorization(context.user) },
      { agentId: this.paymentAgent.id, name: this.paymentAgent.name, requiredScope: this.paymentAgent.requiredScope, authorized: this.paymentAgent.hasAuthorization(context.user) },
      { agentId: this.contractAgent.id, name: this.contractAgent.name, requiredScope: this.contractAgent.requiredScope, authorized: this.contractAgent.hasAuthorization(context.user) },
      { agentId: this.alternateAgent.id, name: this.alternateAgent.name, requiredScope: this.alternateAgent.requiredScope, authorized: this.alternateAgent.hasAuthorization(context.user) }
    ];

    auditTrail.logEvent({
      tenantId,
      userId: context.user?.sub || 'SYSTEM',
      action: 'ORCHESTRATOR_PLAN_FORMULATED',
      targetResource: supplierId,
      status: 'SUCCESS',
      details: {
        plannedTasksCount: plannedTasks.length,
        authorizedCount: plannedTasks.filter(t => t.authorized).length,
        heldScopes: userScopes
      }
    });

    emitStep({
      stepId: 'ORCHESTRATOR_PLANNING',
      phase: 'PLANNING',
      title: 'Workflow Plan Finalized',
      agent: this.name,
      status: 'COMPLETED',
      data: { plannedTasks }
    });

    // -------------------------------------------------------------
    // PHASE 2: CONCURRENT ENTERPRISE INFORMATION RETRIEVAL
    // -------------------------------------------------------------
    emitStep({
      stepId: 'CONCURRENT_RETRIEVAL_DISPATCH',
      phase: 'RETRIEVAL',
      title: 'Dispatching Concurrent Worker Agents',
      agent: this.name,
      status: 'IN_PROGRESS',
      message: 'Launching ERP Exposure, Payment History, Contract Analysis, and Alternate Sourcing agents concurrently...'
    });

    const [erpSettled, paymentSettled, contractSettled, alternateSettled] = await Promise.allSettled([
      this.erpAgent.execute({ supplierId, tenantId, simulatedPoisonedErp }, context),
      this.paymentAgent.execute({ supplierId, tenantId }, context),
      this.contractAgent.execute({ supplierId, tenantId }, context),
      this.alternateAgent.execute({ supplierId, tenantId }, context)
    ]);

    const erpResult = erpSettled.status === 'fulfilled' ? erpSettled.value : { status: 'ERROR', error: erpSettled.reason?.message };
    const paymentResult = paymentSettled.status === 'fulfilled' ? paymentSettled.value : { status: 'ERROR', error: paymentSettled.reason?.message };
    const contractResult = contractSettled.status === 'fulfilled' ? contractSettled.value : { status: 'ERROR', error: contractSettled.reason?.message };
    const alternateResult = alternateSettled.status === 'fulfilled' ? alternateSettled.value : { status: 'ERROR', error: alternateSettled.reason?.message };

    // Emit retrieval progress for each agent
    emitStep({
      stepId: 'ERP_RETRIEVAL_STEP',
      phase: 'RETRIEVAL',
      title: 'ERP Financial Exposure Analyzed',
      agent: this.erpAgent.name,
      status: erpResult.status === 'SUCCESS' ? 'COMPLETED' : 'RESTRICTED',
      data: erpResult.data || { reason: erpResult.message }
    });

    emitStep({
      stepId: 'PAYMENT_RETRIEVAL_STEP',
      phase: 'RETRIEVAL',
      title: 'Payment Records & Delinquency Analyzed',
      agent: this.paymentAgent.name,
      status: paymentResult.status === 'SUCCESS' ? 'COMPLETED' : 'RESTRICTED',
      data: paymentResult.data || { reason: paymentResult.message }
    });

    emitStep({
      stepId: 'CONTRACT_RETRIEVAL_STEP',
      phase: 'RETRIEVAL',
      title: 'Contract Clauses & Legal Terms Extracted',
      agent: this.contractAgent.name,
      status: contractResult.status === 'SUCCESS' ? 'COMPLETED' : 'RESTRICTED',
      data: contractResult.data || { reason: contractResult.message }
    });

    emitStep({
      stepId: 'ALTERNATE_RETRIEVAL_STEP',
      phase: 'RETRIEVAL',
      title: 'Alternative Sourcing Candidates Evaluated',
      agent: this.alternateAgent.name,
      status: alternateResult.status === 'SUCCESS' ? 'COMPLETED' : 'RESTRICTED',
      data: alternateResult.data || { reason: alternateResult.message }
    });

    // -------------------------------------------------------------
    // PHASE 3: ADVERSARIAL DEFENSE & GROUNDING VERIFICATION
    // -------------------------------------------------------------
    emitStep({
      stepId: 'ADVERSARIAL_SENTINEL_STEP',
      phase: 'VALIDATION',
      title: 'Executing Adversarial Sentinel & Cross-Source Guardrail',
      agent: this.sentinelAgent.name,
      status: 'IN_PROGRESS',
      message: 'Inspecting queries for prompt injections and cross-verifying ERP balances against payment delinquency records...'
    });

    const sentinelResult = await this.sentinelAgent.execute({
      customQuery,
      erpResult,
      paymentResult,
      contractResult
    }, context);

    emitStep({
      stepId: 'ADVERSARIAL_SENTINEL_STEP',
      phase: 'VALIDATION',
      title: 'Sentinel Verification Complete',
      agent: this.sentinelAgent.name,
      status: sentinelResult.data.isCompromised ? 'FLAGGED_ADVERSARIAL' : 'COMPLETED',
      data: sentinelResult.data
    });

    // -------------------------------------------------------------
    // PHASE 4: MULTI-CRITERIA SYNTHESIS & DECISION SUPPORT
    // -------------------------------------------------------------
    emitStep({
      stepId: 'RISK_SYNTHESIS_STEP',
      phase: 'SYNTHESIS',
      title: 'Synthesizing Consolidated Decision Support',
      agent: this.synthesisAgent.name,
      status: 'IN_PROGRESS',
      message: 'Calculating weighted multi-criteria risk index and generating actionable mitigation recommendations...'
    });

    const synthesisResult = await this.synthesisAgent.execute({
      supplierId,
      tenantId,
      erpResult,
      paymentResult,
      contractResult,
      alternateResult,
      sentinelResult
    }, context);

    emitStep({
      stepId: 'RISK_SYNTHESIS_STEP',
      phase: 'SYNTHESIS',
      title: 'Consolidated Risk Assessment Completed',
      agent: this.synthesisAgent.name,
      status: 'COMPLETED',
      data: synthesisResult.data
    });

    // Final response packaging
    return {
      supplierId,
      tenantId,
      assessedAt: new Date().toISOString(),
      totalDurationMs: Date.now() - pipelineStartTime,
      orchestratorSummary: {
        compositeScore: synthesisResult.data.compositeRiskScore,
        riskLevel: synthesisResult.data.overallRiskLevel,
        executiveSummary: synthesisResult.data.executiveSummary,
        securitySentinelStatus: sentinelResult.data.sentinelStatus
      },
      detailedFindings: {
        financial: erpResult,
        payment: paymentResult,
        contractual: contractResult,
        sourcing: alternateResult,
        securitySentinel: sentinelResult,
        synthesis: synthesisResult
      },
      groundedEvidence: synthesisResult.evidence || [],
      executionTrace
    };
  }
}

export const orchestrator = new OrchestratorAgent();
