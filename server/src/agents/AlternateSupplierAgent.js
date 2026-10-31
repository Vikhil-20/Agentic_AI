import { BaseAgent } from './BaseAgent.js';
import { ENTERPRISE_DATABASE } from '../data/mockEnterpriseData.js';

export class AlternateSupplierAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Alternative Sourcing & Contingency Agent',
      id: 'agent_alternate_sourcing',
      description: 'Identifies and evaluates qualified substitute suppliers, transition lead times, and capacity readiness.',
      requiredScope: 'alternates:read'
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
        message: `Access to alternate supplier database withheld. Required scope '${this.requiredScope}' not held by caller.`,
        durationMs: Date.now() - startTime
      };
    }

    // 2. Data Retrieval from Tenant Store
    const tenantData = ENTERPRISE_DATABASE[tenantId];
    if (!tenantData) {
      throw new Error(`Tenant '${tenantId}' does not exist.`);
    }

    const supplier = tenantData.suppliers.find(s => s.id === supplierId);
    if (!supplier) {
      return {
        agentId: this.id,
        agentName: this.name,
        status: 'NOT_FOUND',
        authorized: true,
        message: `Supplier ${supplierId} not found`,
        durationMs: Date.now() - startTime
      };
    }

    const alternates = supplier.alternates || [];

    // 3. Redundancy & Transition Analysis
    // Sourcing Risk Score: Higher if no alternates exist or lead times are long (0-100)
    let sourcingDisruptionRiskScore = 100;
    let redundancyStatus = 'NO_QUALIFIED_BACKUP (Single-Source Extreme Risk)';
    const recommendations = [];

    if (alternates.length >= 2) {
      const best = alternates[0];
      if (best.qualificationStatus === 'TIER_1_PREQUALIFIED' && best.readinessDays <= 30) {
        sourcingDisruptionRiskScore = 25;
        redundancyStatus = 'HIGH_REDUNDANCY (Immediate Hot-Standby Available)';
        recommendations.push(`Primary qualified substitute: ${best.supplierName} (${best.readinessDays} days transition, ${best.availableCapacityHeadroomPercent}% headroom).`);
        recommendations.push(`Recommended Contingency Action: ${best.dualSourceRecommendation}`);
      } else {
        sourcingDisruptionRiskScore = 55;
        redundancyStatus = 'MODERATE_REDUNDANCY (Extended Ramp Lead Time)';
        recommendations.push(`Available alternates require tooling and qualification ramp (${best.readinessDays} days).`);
      }
    } else if (alternates.length === 1) {
      sourcingDisruptionRiskScore = 65;
      redundancyStatus = 'LIMITED_REDUNDANCY (Single Alternative Candidate)';
      recommendations.push(`Only 1 alternative qualified: ${alternates[0].supplierName}. High dependency risk remains.`);
    } else {
      sourcingDisruptionRiskScore = 95;
      redundancyStatus = 'ZERO_REDUNDANCY (Critical Single-Source Monopoly)';
      recommendations.push('URGENT: Initiate supplier discovery sprint immediately. No qualified backup components exist.');
    }

    // 4. Grounded Evidence Extraction
    const evidence = alternates.map(alt => ({
      source: 'QUALIFIED_ALTERNATE_REGISTRY',
      referenceId: alt.alternateId,
      field: `Alternative Candidate: ${alt.supplierName}`,
      value: `Status: ${alt.qualificationStatus} | Readiness: ${alt.readinessDays} Days | Headroom: ${alt.availableCapacityHeadroomPercent}% | Cost Delta: ${alt.unitCostDifferentialPercent > 0 ? '+' : ''}${alt.unitCostDifferentialPercent}% | Tooling: $${alt.toolingReplicationCost.toLocaleString()}`,
      weight: 'HIGH'
    }));

    const result = {
      agentId: this.id,
      agentName: this.name,
      status: 'SUCCESS',
      authorized: true,
      supplierId,
      tenantId,
      data: {
        totalAlternatesCount: alternates.length,
        sourcingDisruptionRiskScore,
        redundancyStatus,
        alternates,
        recommendations
      },
      evidence,
      durationMs: Date.now() - startTime
    };

    this.logAudit(context.user, 'EXECUTION_COMPLETED', 'SUCCESS', {
      supplierId,
      alternatesCount: alternates.length,
      sourcingDisruptionRiskScore
    });

    return result;
  }
}
