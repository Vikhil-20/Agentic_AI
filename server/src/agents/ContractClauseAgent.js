import { BaseAgent } from './BaseAgent.js';
import { ENTERPRISE_DATABASE } from '../data/mockEnterpriseData.js';

export class ContractClauseAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Contractual Clauses & Legal Intelligence Agent',
      id: 'agent_contract_clauses',
      description: 'Extracts and evaluates critical legal clauses (Termination, Insolvency, Supply Continuity, Liability Caps) from contract documents.',
      requiredScope: 'contracts:read'
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
        message: `Access to confidential contract documents withheld. Required scope '${this.requiredScope}' not held by caller.`,
        durationMs: Date.now() - startTime
      };
    }

    // 2. Data Retrieval from Isolated Enterprise Tenant Store
    const tenantData = ENTERPRISE_DATABASE[tenantId];
    if (!tenantData) {
      throw new Error(`Tenant '${tenantId}' does not exist.`);
    }

    const supplier = tenantData.suppliers.find(s => s.id === supplierId);
    if (!supplier || !supplier.contracts) {
      return {
        agentId: this.id,
        agentName: this.name,
        status: 'NOT_FOUND',
        authorized: true,
        message: `No active contracts on file for supplier ${supplierId}`,
        durationMs: Date.now() - startTime
      };
    }

    const contract = supplier.contracts;

    // 3. Clause Risk Assessment & Grounded Extraction
    let contractualRiskScore = 0;
    const clauseFindings = [];
    const evidence = [];

    contract.clauses.forEach(clause => {
      let clauseRiskScore = 20;

      if (clause.riskImpact === 'CRITICAL' || clause.riskImpact === 'SEVERE') {
        clauseRiskScore = 85;
        contractualRiskScore += 35;
      } else if (clause.riskImpact === 'HIGH') {
        clauseRiskScore = 65;
        contractualRiskScore += 20;
      } else if (clause.riskImpact === 'MODERATE') {
        clauseRiskScore = 40;
        contractualRiskScore += 10;
      } else if (clause.riskImpact === 'FAVORABLE' || clause.riskImpact === 'HIGH_PROTECTIVE') {
        clauseRiskScore = 15;
        // Protective clauses reduce overall contractual vulnerability
        contractualRiskScore -= 10;
      }

      clauseFindings.push({
        clauseNumber: clause.clauseNumber,
        clauseTitle: clause.clauseTitle,
        verbatimSnippet: clause.fullText,
        riskImpact: clause.riskImpact,
        clauseRiskScore,
        explanation: clause.explanation
      });

      evidence.push({
        source: `LEGAL_CONTRACT_${contract.documentId}`,
        referenceId: `${contract.documentId}::${clause.clauseNumber}`,
        field: clause.clauseTitle,
        value: `"${clause.fullText.substring(0, 160)}..."`,
        weight: clause.riskImpact.includes('CRITICAL') || clause.riskImpact.includes('SEVERE') ? 'CRITICAL' : 'HIGH'
      });
    });

    contractualRiskScore = Math.min(100, Math.max(10, contractualRiskScore));

    const riskLevel =
      contractualRiskScore >= 70 ? 'CRITICAL' :
      contractualRiskScore >= 50 ? 'HIGH' :
      contractualRiskScore >= 30 ? 'MODERATE' : 'LOW';

    const result = {
      agentId: this.id,
      agentName: this.name,
      status: 'SUCCESS',
      authorized: true,
      supplierId,
      tenantId,
      data: {
        documentId: contract.documentId,
        title: contract.title,
        effectiveDate: contract.effectiveDate,
        expirationDate: contract.expirationDate,
        governingLaw: contract.governingLaw,
        contractualRiskScore,
        riskLevel,
        clauseFindings,
        keyAlert: clauseFindings.find(c => c.riskImpact === 'CRITICAL' || c.riskImpact === 'SEVERE')
          ? 'Contract contains hostile or asymmetric clauses that expose enterprise to immediate line stoppage or unrecoverable liability.'
          : 'Contract terms provide standard or adequate enterprise protections.'
      },
      evidence,
      durationMs: Date.now() - startTime
    };

    this.logAudit(context.user, 'EXECUTION_COMPLETED', 'SUCCESS', {
      supplierId,
      documentId: contract.documentId,
      contractualRiskScore
    });

    return result;
  }
}
