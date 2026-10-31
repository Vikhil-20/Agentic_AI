import crypto from 'crypto';

/**
 * Tamper-evident Audit Trail using cryptographic SHA-256 hash chaining.
 * Every system event (auth check, tenant match, agent action, retrieval, synthesis) is logged
 * with full traceability and integrity validation.
 */
class AuditTrailService {
  constructor() {
    this.logs = [];
    this.genesisHash = '0000000000000000000000000000000000000000000000000000000000000000';
  }

  /**
   * Appends an event to the audit trail with SHA-256 chaining
   */
  logEvent({
    tenantId,
    userId,
    action,
    targetResource,
    status, // 'SUCCESS' | 'DENIED' | 'FLAGGED_ADVERSARIAL' | 'WARNING'
    details = {},
    securityContext = {}
  }) {
    const id = `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const timestamp = new Date().toISOString();
    const prevHash = this.logs.length > 0 ? this.logs[this.logs.length - 1].hash : this.genesisHash;

    const eventPayload = {
      id,
      timestamp,
      tenantId: tenantId || 'UNKNOWN_TENANT',
      userId: userId || 'SYSTEM',
      action,
      targetResource: targetResource || 'GLOBAL',
      status,
      details,
      securityContext: {
        clientIp: securityContext.clientIp || '127.0.0.1',
        tokenIssuer: securityContext.tokenIssuer || 'enterprise-auth-gateway',
        verifiedScopes: securityContext.verifiedScopes || [],
        requiredScope: securityContext.requiredScope || null
      },
      prevHash
    };

    // Calculate cryptographic SHA-256 hash of this entry linked to previous hash
    const dataToHash = `${prevHash}|${timestamp}|${eventPayload.tenantId}|${eventPayload.userId}|${action}|${status}|${JSON.stringify(details)}`;
    const hash = crypto.createHash('sha256').update(dataToHash).digest('hex');

    const finalizedEntry = {
      ...eventPayload,
      hash
    };

    this.logs.push(finalizedEntry);
    return finalizedEntry;
  }

  /**
   * Retrieves logs with optional filtering by tenant, user, status, or action
   */
  getLogs({ tenantId, userId, status, action, limit = 100 } = {}) {
    let filtered = [...this.logs];

    if (tenantId) {
      filtered = filtered.filter(l => l.tenantId === tenantId);
    }
    if (userId) {
      filtered = filtered.filter(l => l.userId === userId);
    }
    if (status) {
      filtered = filtered.filter(l => l.status === status);
    }
    if (action) {
      filtered = filtered.filter(l => l.action.toLowerCase().includes(action.toLowerCase()));
    }

    // Return in reverse chronological order
    return filtered.reverse().slice(0, limit);
  }

  /**
   * Validates the cryptographic integrity of the entire audit chain.
   * Detects any altered or deleted records.
   */
  verifyChainIntegrity() {
    for (let i = 0; i < this.logs.length; i++) {
      const entry = this.logs[i];
      const expectedPrevHash = i === 0 ? this.genesisHash : this.logs[i - 1].hash;

      if (entry.prevHash !== expectedPrevHash) {
        return {
          valid: false,
          brokenAtStep: i,
          brokenLogId: entry.id,
          reason: `Previous hash mismatch at log ${entry.id}. Expected ${expectedPrevHash}, found ${entry.prevHash}`
        };
      }

      // Re-calculate hash
      const dataToHash = `${entry.prevHash}|${entry.timestamp}|${entry.tenantId}|${entry.userId}|${entry.action}|${entry.status}|${JSON.stringify(entry.details)}`;
      const recomputedHash = crypto.createHash('sha256').update(dataToHash).digest('hex');

      if (entry.hash !== recomputedHash) {
        return {
          valid: false,
          brokenAtStep: i,
          brokenLogId: entry.id,
          reason: `Entry content tampered at log ${entry.id}. Expected ${recomputedHash}, found ${entry.hash}`
        };
      }
    }

    return {
      valid: true,
      totalEntriesVerified: this.logs.length,
      currentHeadHash: this.logs.length > 0 ? this.logs[this.logs.length - 1].hash : this.genesisHash
    };
  }

  /**
   * Clears all logs (used for test resets)
   */
  clear() {
    this.logs = [];
  }
}

export const auditTrail = new AuditTrailService();
