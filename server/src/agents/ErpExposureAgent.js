import { BaseAgent } from './BaseAgent.js';
import { ENTERPRISE_DATABASE } from '../data/mockEnterpriseData.js';

export class ErpExposureAgent extends BaseAgent {
  constructor() {
    super({
      name: 'ERP Financial Exposure Agent',
      id: 'agent_erp_exposure',
      description: 'Retrieves general ledger balances, accounts payable/receivable, and credit limit utilization.',
      requiredScope: 'financial:read'
    });
  }

  async execute({ supplierId, tenantId, simulatedPoisonedErp }, context) {
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
        message: `Access to ERP financial records withheld. Required scope '${this.requiredScope}' not held by caller.`,
        durationMs: Date.now() - startTime
      };
    }

    // 2. Data Retrieval from Isolated Enterprise Tenant Store
    const tenantData = ENTERPRISE_DATABASE[tenantId];
    if (!tenantData) {
      throw new Error(`Tenant '${tenantId}' does not exist in enterprise ERP store.`);
    }

    const supplier = tenantData.suppliers.find(s => s.id === supplierId);
    if (!supplier || !supplier.erp) {
      return {
        agentId: this.id,
        agentName: this.name,
        status: 'NOT_FOUND',
        authorized: true,
        message: `No ERP financial ledger record found for supplier ${supplierId}`,
        durationMs: Date.now() - startTime
      };
    }

    // Use simulated poisoned data if an adversarial attack test is running
    const erp = simulatedPoisonedErp ? { ...supplier.erp, ...simulatedPoisonedErp } : supplier.erp;

    // 3. Financial Exposure Analysis & Risk Scoring
    const ap = erp.accountsPayableOwed;
    const ar = erp.accountsReceivableOwed;
    const netExposure = ap - ar;
    const creditLimit = erp.approvedCreditLimit;
    const utilizationPct = creditLimit > 0 ? (netExposure / creditLimit) * 100 : 100;
    const totalCommitment = netExposure + (erp.unbilledOpenPurchaseOrders || 0);

    // Score calculation (0 to 100, where higher is riskier)
    let financialRiskScore = 0;
    const riskDrivers = [];

    if (utilizationPct > 150) {
      financialRiskScore += 45;
      riskDrivers.push(`Severe credit utilization breach: ${utilizationPct.toFixed(1)}% of approved limit ($${creditLimit.toLocaleString()})`);
    } else if (utilizationPct > 100) {
      financialRiskScore += 30;
      riskDrivers.push(`Credit limit exceeded: ${utilizationPct.toFixed(1)}%`);
    } else if (utilizationPct > 75) {
      financialRiskScore += 15;
      riskDrivers.push(`Elevated credit utilization: ${utilizationPct.toFixed(1)}%`);
    }

    if (erp.workingCapitalDeficit) {
      financialRiskScore += 25;
      riskDrivers.push('Supplier working capital deficit and negative cash flow flagged');
    }

    if (erp.creditRating && (erp.creditRating.startsWith('B') || erp.creditRating.startsWith('C'))) {
      financialRiskScore += 20;
      riskDrivers.push(`Vulnerable credit rating: ${erp.creditRating}`);
    }

    if (netExposure > 2000000) {
      financialRiskScore += 10;
      riskDrivers.push(`Substantial net dollar exposure: $${netExposure.toLocaleString()} ${erp.currency}`);
    }

    financialRiskScore = Math.min(100, Math.max(0, financialRiskScore));

    const riskLevel =
      financialRiskScore >= 75 ? 'CRITICAL' :
      financialRiskScore >= 50 ? 'HIGH' :
      financialRiskScore >= 25 ? 'MODERATE' : 'LOW';

    // 4. Grounded Evidence Extraction
    const evidence = [
      {
        source: 'ENTERPRISE_ERP_LEDGER',
        referenceId: erp.ledgerId,
        field: 'Accounts Payable (Owed to Supplier)',
        value: `$${ap.toLocaleString()} ${erp.currency}`,
        weight: 'HIGH'
      },
      {
        source: 'ENTERPRISE_ERP_LEDGER',
        referenceId: erp.ledgerId,
        field: 'Accounts Receivable (Owed by Supplier)',
        value: `$${ar.toLocaleString()} ${erp.currency}`,
        weight: 'MEDIUM'
      },
      {
        source: 'ENTERPRISE_ERP_LEDGER',
        referenceId: erp.ledgerId,
        field: 'Net Exposure / Credit Limit',
        value: `$${netExposure.toLocaleString()} / $${creditLimit.toLocaleString()} (${utilizationPct.toFixed(1)}%)`,
        weight: 'CRITICAL'
      },
      {
        source: 'ENTERPRISE_ERP_LEDGER',
        referenceId: erp.ledgerId,
        field: 'Total Financial Commitment (Net + Open POs)',
        value: `$${totalCommitment.toLocaleString()} ${erp.currency}`,
        weight: 'HIGH'
      },
      {
        source: 'ENTERPRISE_ERP_LEDGER',
        referenceId: erp.ledgerId,
        field: 'Credit Agency Rating',
        value: erp.creditRating || 'N/A',
        weight: 'HIGH'
      }
    ];

    const result = {
      agentId: this.id,
      agentName: this.name,
      status: 'SUCCESS',
      authorized: true,
      supplierId,
      tenantId,
      data: {
        ledgerId: erp.ledgerId,
        accountsPayableOwed: ap,
        accountsReceivableOwed: ar,
        netExposure,
        approvedCreditLimit: creditLimit,
        creditUtilizationPercent: parseFloat(utilizationPct.toFixed(1)),
        unbilledOpenPurchaseOrders: erp.unbilledOpenPurchaseOrders,
        totalFinancialCommitment: totalCommitment,
        currency: erp.currency,
        paymentTerms: erp.paymentTerms,
        creditRating: erp.creditRating,
        workingCapitalDeficit: erp.workingCapitalDeficit,
        financialRiskScore,
        riskLevel,
        riskDrivers
      },
      evidence,
      durationMs: Date.now() - startTime
    };

    this.logAudit(context.user, 'EXECUTION_COMPLETED', 'SUCCESS', {
      supplierId,
      financialRiskScore,
      netExposure
    });

    return result;
  }
}
