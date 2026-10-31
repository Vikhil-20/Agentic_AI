import { BaseAgent } from './BaseAgent.js';
import { ENTERPRISE_DATABASE } from '../data/mockEnterpriseData.js';

export class PaymentHistoryAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Payment Records & Reliability Agent',
      id: 'agent_payment_history',
      description: 'Analyzes invoice settlement history, payment delinquency trends, and Days Sales Outstanding (DSO).',
      requiredScope: 'payment:read'
    });
  }

  async execute({ supplierId, tenantId }, context) {
    const startTime = Date.now();

    // 1. RBAC Scope Verification
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
        message: `Access to payment reliability records withheld. Required scope '${this.requiredScope}' not held by caller.`,
        durationMs: Date.now() - startTime
      };
    }

    // 2. Data Retrieval from Tenant Store
    const tenantData = ENTERPRISE_DATABASE[tenantId];
    if (!tenantData) {
      throw new Error(`Tenant '${tenantId}' does not exist.`);
    }

    const supplier = tenantData.suppliers.find(s => s.id === supplierId);
    if (!supplier || !supplier.payments) {
      return {
        agentId: this.id,
        agentName: this.name,
        status: 'NOT_FOUND',
        authorized: true,
        message: `No payment ledger records found for supplier ${supplierId}`,
        durationMs: Date.now() - startTime
      };
    }

    const pay = supplier.payments;

    // 3. Payment Reliability & Delinquency Analysis
    const totalInvoices = pay.totalInvoices24m;
    const delinquentPercent = totalInvoices > 0
      ? ((pay.delayed1to30Days + pay.severelyDelinquentOver30Days) / totalInvoices) * 100
      : 0;

    const dsoRatio = pay.averageDsoDays / (pay.industryBenchmarkDsoDays || 35);

    // Compute Payment Delinquency Risk Score (0-100, higher is riskier)
    let paymentRiskScore = 100 - pay.reliabilityScore;
    const riskDrivers = [];

    if (pay.severelyDelinquentOver30Days > 5) {
      riskDrivers.push(`High chronic delinquency: ${pay.severelyDelinquentOver30Days} invoices delayed >30-60 days`);
    }

    if (dsoRatio > 1.8) {
      riskDrivers.push(`Severe DSO elongation: ${pay.averageDsoDays} days vs ${pay.industryBenchmarkDsoDays} days benchmark (+${((dsoRatio - 1) * 100).toFixed(0)}%)`);
    }

    if (pay.activeDisputesCount > 0) {
      riskDrivers.push(`${pay.activeDisputesCount} active invoice disputes totaling $${pay.activeDisputesAmount.toLocaleString()}`);
    }

    const riskLevel =
      paymentRiskScore >= 70 ? 'CRITICAL' :
      paymentRiskScore >= 45 ? 'HIGH' :
      paymentRiskScore >= 25 ? 'MODERATE' : 'LOW';

    // 4. Grounded Evidence Extraction
    const evidence = [
      {
        source: 'PAYMENT_ACCOUNTS_SYSTEM',
        referenceId: `HIST-24M-${supplierId}`,
        field: 'Payment Reliability Score',
        value: `${pay.reliabilityScore}/100 (${pay.defaultRiskRating} Default Risk)`,
        weight: 'HIGH'
      },
      {
        source: 'PAYMENT_ACCOUNTS_SYSTEM',
        referenceId: `DSO-METRIC-${supplierId}`,
        field: 'Days Sales Outstanding (DSO)',
        value: `${pay.averageDsoDays} Days (Industry benchmark: ${pay.industryBenchmarkDsoDays} Days)`,
        weight: 'HIGH'
      },
      {
        source: 'PAYMENT_ACCOUNTS_SYSTEM',
        referenceId: `DELINQUENCY-SUMMARY-${supplierId}`,
        field: 'Delinquent Invoice Ratio',
        value: `${delinquentPercent.toFixed(1)}% (${pay.severelyDelinquentOver30Days} severe >30d, ${pay.delayed1to30Days} late 1-30d)`,
        weight: 'CRITICAL'
      }
    ];

    // Add specific delinquent invoice citations
    if (pay.recentInvoices && pay.recentInvoices.length > 0) {
      pay.recentInvoices.slice(0, 3).forEach(inv => {
        evidence.push({
          source: 'INVOICE_LEDGER',
          referenceId: inv.invoiceId,
          field: `Invoice ${inv.invoiceId} Status`,
          value: `$${inv.amount.toLocaleString()} - Due: ${inv.dueDate} [${inv.status}] (${inv.notes})`,
          weight: inv.status.includes('DELINQUENT') ? 'CRITICAL' : 'MEDIUM'
        });
      });
    }

    const result = {
      agentId: this.id,
      agentName: this.name,
      status: 'SUCCESS',
      authorized: true,
      supplierId,
      tenantId,
      data: {
        reliabilityScore: pay.reliabilityScore,
        paymentRiskScore,
        riskLevel,
        defaultRiskRating: pay.defaultRiskRating,
        totalInvoices24m: pay.totalInvoices24m,
        onTimeInvoices: pay.onTimeInvoices,
        delayed1to30Days: pay.delayed1to30Days,
        severelyDelinquentOver30Days: pay.severelyDelinquentOver30Days,
        delinquentPercent: parseFloat(delinquentPercent.toFixed(1)),
        averageDsoDays: pay.averageDsoDays,
        industryBenchmarkDsoDays: pay.industryBenchmarkDsoDays,
        activeDisputesCount: pay.activeDisputesCount,
        activeDisputesAmount: pay.activeDisputesAmount,
        recentInvoices: pay.recentInvoices,
        riskDrivers
      },
      evidence,
      durationMs: Date.now() - startTime
    };

    this.logAudit(context.user, 'EXECUTION_COMPLETED', 'SUCCESS', {
      supplierId,
      paymentRiskScore,
      reliabilityScore: pay.reliabilityScore
    });

    return result;
  }
}
