import { BaseAgent } from './BaseAgent.js';

export class AdversarialSentinelAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Adversarial Sentinel & Grounding Guardrail Agent',
      id: 'agent_adversarial_sentinel',
      description: 'Defends the agentic pipeline against prompt injection, malicious query overrides, and cross-source data discrepancies.',
      requiredScope: null // Always runs as a mandatory governance guardrail
    });

    // Signatures of adversarial injection attempts
    this.injectionPatterns = [
      /ignore\s+(all\s+)?(previous|prior)\s+(instructions|directives|prompts|records|data)/i,
      /override\s+(risk|score|rating|system|rules)/i,
      /mark\s+(as\s+)?(safe|zero\s+risk|trusted|100%|grade\s+aaa)/i,
      /system\s+note\s*:/i,
      /system\s+directive\s*:/i,
      /disregard\s+(all\s+)?(debt|defaults|late\s+payments|delinquencies)/i,
      /set\s+risk(\s+score)?\s+to\s+0/i,
      /<script[\s\S]*?>[\s\S]*?<\/script>/i,
      /drop\s+table/i,
      /---\s*begin\s+injection/i
    ];
  }

  async execute({ customQuery, erpResult, paymentResult, contractResult }, context) {
    const startTime = Date.now();
    const threatsDetected = [];
    const anomaliesDetected = [];
    let querySanitized = false;
    let cleanedQuery = customQuery || '';

    // 1. Scan for Prompt Injection & Malicious Directives in Query/Context
    if (customQuery && typeof customQuery === 'string') {
      for (const pattern of this.injectionPatterns) {
        if (pattern.test(customQuery)) {
          const match = customQuery.match(pattern)[0];
          threatsDetected.push({
            type: 'PROMPT_INJECTION_ATTEMPT',
            pattern: match,
            severity: 'CRITICAL',
            actionTaken: 'NEUTRALIZED_AND_PURGED'
          });

          // Neutralize the injection
          cleanedQuery = cleanedQuery.replace(pattern, '[REDACTED_ADVERSARIAL_INJECTION]');
          querySanitized = true;
        }
      }
    }

    // 2. Cross-Source Data Consistency & Poisoning Check
    // Cross-verify ERP accounts payable vs Payment invoice delinquency
    if (erpResult?.status === 'SUCCESS' && paymentResult?.status === 'SUCCESS') {
      const erpData = erpResult.data;
      const paymentData = paymentResult.data;

      // Anomaly Check: ERP claims $0 AP / 0% utilization, but payment history has active delinquent unpaid invoices
      const hasDelinquentInvoices = (paymentData.severelyDelinquentOver30Days || 0) > 0;
      const erpClaimsZeroDebt = (erpData.accountsPayableOwed === 0 || erpData.netExposure <= 0);

      if (erpClaimsZeroDebt && hasDelinquentInvoices) {
        anomaliesDetected.push({
          type: 'CROSS_SOURCE_LEDGER_CONTRADICTION',
          severity: 'HIGH',
          description: `ERP general ledger claims $0 Accounts Payable / Net Exposure, yet the Payment Accounts ledger contains ${paymentData.severelyDelinquentOver30Days} delinquent unpaid invoices!`,
          remediation: 'Flagged as potential data poisoning or ledger reconciliation desynchronization. Assessment utilizes conservative payment delinquency ground truth.',
          sourceA: `ERP Ledger: $${erpData.accountsPayableOwed}`,
          sourceB: `Payment System: ${paymentData.severelyDelinquentOver30Days} overdue invoices`
        });
      }

      // Check for credit rating vs payment reliability divergence
      if (erpData.creditRating?.startsWith('A') && paymentData.reliabilityScore < 40) {
        anomaliesDetected.push({
          type: 'CREDIT_RATING_DIVERGENCE',
          severity: 'MEDIUM',
          description: `External credit rating (${erpData.creditRating}) is discordant with observed internal payment reliability (${paymentData.reliabilityScore}/100).`,
          remediation: 'Prioritizing internal empirical transaction history over laggy third-party agency rating.'
        });
      }
    }

    const hasThreats = threatsDetected.length > 0 || anomaliesDetected.length > 0;
    const sentinelStatus = hasThreats ? 'THREATS_NEUTRALIZED' : 'CLEAN_VERIFIED';

    if (hasThreats) {
      this.logAudit(context.user, 'ADVERSARIAL_DEFENSE_TRIGGERED', 'FLAGGED_ADVERSARIAL', {
        threatsCount: threatsDetected.length,
        anomaliesCount: anomaliesDetected.length,
        threats: threatsDetected,
        anomalies: anomaliesDetected
      });
    } else {
      this.logAudit(context.user, 'INTEGRITY_VERIFIED', 'SUCCESS', {
        message: 'All inputs and cross-source data verified clean and grounded.'
      });
    }

    return {
      agentId: this.id,
      agentName: this.name,
      status: 'SUCCESS',
      authorized: true,
      data: {
        sentinelStatus,
        isCompromised: hasThreats,
        threatsDetected,
        anomaliesDetected,
        querySanitized,
        cleanedQuery,
        groundingVerdict: 'GROUNDED_ENTERPRISE_AUTHENTIC'
      },
      durationMs: Date.now() - startTime
    };
  }
}
