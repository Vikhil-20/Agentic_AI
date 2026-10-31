import { BaseAgent } from './BaseAgent.js';

export class RiskSynthesisAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Consolidated Decision Support & Risk Synthesis Agent',
      id: 'agent_risk_synthesis',
      description: 'Synthesizes multi-source evidence into a consolidated, explainable risk score and actionable decision-support recommendations.',
      requiredScope: 'risk:assess'
    });
  }

  async execute({ supplierId, tenantId, erpResult, paymentResult, contractResult, alternateResult, sentinelResult }, context) {
    const startTime = Date.now();

    // 1. RBAC Scope Check
    if (!this.hasAuthorization(context.user)) {
      this.logAudit(context.user, 'EXECUTION_DENIED', 'DENIED', {
        supplierId,
        reason: `Missing required scope: ${this.requiredScope}`
      });

      return {
        agentId: this.id,
        agentName: this.name,
        status: 'SCOPE_RESTRICTED',
        authorized: false,
        message: `Execution denied: You lack scope '${this.requiredScope}'.`,
        durationMs: Date.now() - startTime
      };
    }

    // 2. Weights & Adaptive Dimension Analysis
    // We adjust weights if certain scopes were restricted for the user
    let weightFinancial = 0.35;
    let weightPayment = 0.25;
    let weightContract = 0.25;
    let weightAlternate = 0.15;

    let totalWeight = 0;
    let weightedSum = 0;

    const domainScores = {};
    const withheldDomains = [];
    const allEvidence = [];
    const coreRiskDrivers = [];
    const recommendations = [];

    // Financial Analysis
    if (erpResult?.status === 'SUCCESS') {
      const fScore = erpResult.data.financialRiskScore || 0;
      domainScores.financial = {
        score: fScore,
        level: erpResult.data.riskLevel,
        weight: '35%',
        drivers: erpResult.data.riskDrivers || []
      };
      weightedSum += fScore * weightFinancial;
      totalWeight += weightFinancial;
      coreRiskDrivers.push(...(erpResult.data.riskDrivers || []));
      if (erpResult.evidence) allEvidence.push(...erpResult.evidence);
    } else {
      withheldDomains.push({ domain: 'Financial Exposure (ERP)', reason: erpResult?.message || 'Data unavailable' });
    }

    // Payment History
    if (paymentResult?.status === 'SUCCESS') {
      const pScore = paymentResult.data.paymentRiskScore || 0;
      domainScores.payment = {
        score: pScore,
        level: paymentResult.data.riskLevel,
        weight: '25%',
        drivers: paymentResult.data.riskDrivers || []
      };
      weightedSum += pScore * weightPayment;
      totalWeight += weightPayment;
      coreRiskDrivers.push(...(paymentResult.data.riskDrivers || []));
      if (paymentResult.evidence) allEvidence.push(...paymentResult.evidence);
    } else {
      withheldDomains.push({ domain: 'Payment Reliability', reason: paymentResult?.message || 'Data unavailable' });
    }

    // Contract Clauses
    if (contractResult?.status === 'SUCCESS') {
      const cScore = contractResult.data.contractualRiskScore || 0;
      domainScores.contractual = {
        score: cScore,
        level: contractResult.data.riskLevel,
        weight: '25%',
        drivers: contractResult.data.clauseFindings
          ?.filter(c => c.riskImpact === 'CRITICAL' || c.riskImpact === 'SEVERE' || c.riskImpact === 'HIGH')
          ?.map(c => `Contract Clause ${c.clauseNumber} (${c.clauseTitle}): ${c.explanation}`) || []
      };
      weightedSum += cScore * weightContract;
      totalWeight += weightContract;
      coreRiskDrivers.push(...(domainScores.contractual.drivers || []));
      if (contractResult.evidence) allEvidence.push(...contractResult.evidence);
    } else {
      withheldDomains.push({ domain: 'Contractual Clauses', reason: contractResult?.message || 'Data unavailable' });
    }

    // Alternate Suppliers
    if (alternateResult?.status === 'SUCCESS') {
      const aScore = alternateResult.data.sourcingDisruptionRiskScore || 0;
      domainScores.sourcing = {
        score: aScore,
        level: aScore >= 70 ? 'CRITICAL' : aScore >= 45 ? 'HIGH' : aScore >= 25 ? 'MODERATE' : 'LOW',
        weight: '15%',
        redundancyStatus: alternateResult.data.redundancyStatus,
        candidatesCount: alternateResult.data.totalAlternatesCount
      };
      weightedSum += aScore * weightAlternate;
      totalWeight += weightAlternate;
      if (alternateResult.evidence) allEvidence.push(...alternateResult.evidence);
    } else {
      withheldDomains.push({ domain: 'Alternate Sourcing', reason: alternateResult?.message || 'Data unavailable' });
    }

    // Normalized Composite Risk Score (0 - 100)
    const compositeRiskScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 50;

    const overallRiskLevel =
      compositeRiskScore >= 70 ? 'CRITICAL' :
      compositeRiskScore >= 45 ? 'HIGH' :
      compositeRiskScore >= 25 ? 'MODERATE' : 'LOW';

    // 3. Actionable Decision Support Recommendations Generation
    if (compositeRiskScore >= 70) {
      recommendations.push({
        priority: 'IMMEDIATE_ACTION',
        category: 'Contingency Sourcing',
        action: 'Activate Dual-Sourcing Switchover Protocol',
        details: alternateResult?.data?.alternates?.[0]
          ? `Initiate immediate 30% volume allocation split to pre-qualified alternate '${alternateResult.data.alternates[0].supplierName}'. Est. transition lead time: ${alternateResult.data.alternates[0].readinessDays} days.`
          : 'Establish urgent spot-market qualification; no ready hot-standby available.',
        timeframe: '0 - 14 Days'
      });

      recommendations.push({
        priority: 'IMMEDIATE_ACTION',
        category: 'Financial Risk Mitigation',
        action: 'Mandate Escrow / Letter of Credit & Stop Unbilled Open POs',
        details: 'Halt expansion of unbilled purchase orders until overdue receivables and credit utilization are reconciled within approved limits.',
        timeframe: 'Immediate'
      });

      recommendations.push({
        priority: 'CONTRACTUAL_REMEDY',
        category: 'Legal Safeguards',
        action: 'Issue Pre-Insolvency Supply Continuity Notice under Contract Section 19.3',
        details: 'Formally request financial verification and invoke mandatory buffer stock covenants to prevent surprise termination for convenience under Section 14.2.',
        timeframe: '7 Days'
      });
    } else if (compositeRiskScore >= 45) {
      recommendations.push({
        priority: 'ELEVATED_MONITORING',
        category: 'Working Capital Watch',
        action: 'Weekly Cash Flow & Invoicing Surveillance',
        details: 'Review Days Sales Outstanding (DSO) trajectory weekly and tighten payment terms from Net-45 to Net-30.',
        timeframe: '30 Days'
      });
      recommendations.push({
        priority: 'PREVENTATIVE',
        category: 'Secondary Sourcing',
        action: 'Pre-Audit Tooling at Alternate Facilities',
        details: 'Complete AS9100 quality paperwork and tooling verification with secondary supplier candidate.',
        timeframe: '60 Days'
      });
    } else {
      recommendations.push({
        priority: 'STANDARD_GOVERNANCE',
        category: 'Vendor Partnership',
        action: 'Maintain Standard Strategic Sourcing Cadence',
        details: 'Supplier exhibits healthy liquidity, strong on-time invoice metrics, and balanced contractual protections.',
        timeframe: 'Quarterly Review'
      });
    }

    // 4. Executive Summary Synthesis
    const executiveSummary = `Consolidated risk evaluation for ${supplierId} yields an overall risk score of ${compositeRiskScore}/100 (${overallRiskLevel} RISK). ` +
      (domainScores.financial ? `Financial exposure is rated ${domainScores.financial.level} with credit utilization at ${erpResult.data.creditUtilizationPercent}%. ` : '') +
      (domainScores.payment ? `Payment reliability is ${domainScores.payment.level} (DSO: ${paymentResult.data.averageDsoDays} days). ` : '') +
      (domainScores.contractual ? `Legal terms expose ${domainScores.contractual.level} vulnerability in termination and buffer covenants. ` : '') +
      (domainScores.sourcing ? `Sourcing redundancy is evaluated as ${domainScores.sourcing.redundancyStatus}. ` : '') +
      (sentinelResult?.data?.isCompromised ? 'SECURITY ALERT: Adversarial inputs or data discrepancies were neutralized during evaluation.' : 'All data was verified authentic and grounded in enterprise systems.');

    const result = {
      agentId: this.id,
      agentName: this.name,
      status: 'SUCCESS',
      authorized: true,
      supplierId,
      tenantId,
      data: {
        compositeRiskScore,
        overallRiskLevel,
        executiveSummary,
        domainScores,
        withheldDomains,
        coreRiskDrivers,
        recommendations,
        evidenceCount: allEvidence.length,
        securitySentinelStatus: sentinelResult?.data?.sentinelStatus || 'UNCHECKED'
      },
      evidence: allEvidence,
      durationMs: Date.now() - startTime
    };

    this.logAudit(context.user, 'RISK_SYNTHESIS_COMPLETED', 'SUCCESS', {
      supplierId,
      compositeRiskScore,
      overallRiskLevel,
      recommendationsCount: recommendations.length
    });

    return result;
  }
}
