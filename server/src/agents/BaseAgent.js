import { auditTrail } from '../audit/auditTrail.js';

/**
 * Base Agent Class providing standard lifecycle hooks, security validation,
 * execution telemetry, and audit logging.
 */
export class BaseAgent {
  constructor({ name, id, description, requiredScope }) {
    this.name = name;
    this.id = id;
    this.description = description;
    this.requiredScope = requiredScope;
  }

  /**
   * Validates if the execution context holds the necessary RBAC scope.
   */
  hasAuthorization(userContext) {
    if (!this.requiredScope) return true;
    if (!userContext || !Array.isArray(userContext.scopes)) return false;
    return userContext.scopes.includes(this.requiredScope);
  }

  /**
   * Logs an agent lifecycle event into the tamper-evident audit trail.
   */
  logAudit(userContext, action, status, details = {}) {
    return auditTrail.logEvent({
      tenantId: userContext?.tenant_id || 'UNKNOWN_TENANT',
      userId: userContext?.sub || 'SYSTEM_AGENT',
      action: `${this.id.toUpperCase()}_${action}`,
      targetResource: details.targetResource || this.id,
      status,
      details: {
        agentId: this.id,
        agentName: this.name,
        ...details
      },
      securityContext: {
        verifiedScopes: userContext?.scopes || [],
        requiredScope: this.requiredScope
      }
    });
  }

  /**
   * Subclasses must implement the actual execution logic.
   */
  async execute(params, context) {
    throw new Error(`execute() not implemented on agent ${this.name}`);
  }
}
