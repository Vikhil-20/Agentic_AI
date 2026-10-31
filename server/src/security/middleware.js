import { verifyToken } from './tokens.js';
import { auditTrail } from '../audit/auditTrail.js';
import { TENANTS_CONFIG } from '../data/mockEnterpriseData.js';

/**
 * Authentication Middleware:
 * Validates Bearer token cryptographic signature, issuer, and expiration.
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    auditTrail.logEvent({
      tenantId: req.headers['x-tenant-id'] || 'ANONYMOUS',
      userId: 'ANONYMOUS',
      action: 'AUTH_VERIFICATION_FAILED',
      targetResource: req.originalUrl,
      status: 'DENIED',
      details: { reason: 'Missing Authorization header' },
      securityContext: { clientIp: req.ip }
    });

    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Missing Bearer authentication token in Authorization header',
      code: 'AUTH_TOKEN_MISSING'
    });
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    auditTrail.logEvent({
      tenantId: req.headers['x-tenant-id'] || 'ANONYMOUS',
      userId: 'ANONYMOUS',
      action: 'AUTH_VERIFICATION_FAILED',
      targetResource: req.originalUrl,
      status: 'DENIED',
      details: { reason: 'Malformed Authorization header format (expected Bearer <token>)' },
      securityContext: { clientIp: req.ip }
    });

    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Invalid authorization format. Expected format: Bearer <token>',
      code: 'AUTH_SCHEME_INVALID'
    });
  }

  const verification = verifyToken(token);
  if (!verification.valid) {
    auditTrail.logEvent({
      tenantId: req.headers['x-tenant-id'] || 'ANONYMOUS',
      userId: 'UNAUTHENTICATED',
      action: 'AUTH_TOKEN_TAMPER_DETECTED',
      targetResource: req.originalUrl,
      status: 'DENIED',
      details: { error: verification.error, attemptedTokenSample: token.substring(0, 20) + '...' },
      securityContext: { clientIp: req.ip }
    });

    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: verification.error,
      code: 'AUTH_TOKEN_INVALID'
    });
  }

  // Token is cryptographically valid
  req.user = verification.payload;

  auditTrail.logEvent({
    tenantId: req.user.tenant_id,
    userId: req.user.sub,
    action: 'AUTH_TOKEN_VERIFIED',
    targetResource: req.originalUrl,
    status: 'SUCCESS',
    details: {
      role: req.user.role,
      scopes: req.user.scopes
    },
    securityContext: {
      clientIp: req.ip,
      verifiedScopes: req.user.scopes
    }
  });

  next();
}

/**
 * Tenant Isolation Guard:
 * Strictly ensures the user's authenticated tenant matches the target tenant being requested.
 * Prevents unauthorized cross-tenant data access.
 */
export function enforceTenantIsolation(req, res, next) {
  const targetTenantId =
    req.params.tenantId ||
    req.body.tenantId ||
    req.query.tenantId ||
    req.headers['x-tenant-id'];

  if (!targetTenantId) {
    return res.status(400).json({
      error: 'BAD_REQUEST',
      message: 'Tenant ID must be specified in request parameters, body, or X-Tenant-ID header',
      code: 'TENANT_ID_REQUIRED'
    });
  }

  // Validate tenant exists in directory
  if (!TENANTS_CONFIG[targetTenantId]) {
    return res.status(404).json({
      error: 'NOT_FOUND',
      message: `Target tenant '${targetTenantId}' is not registered in enterprise directory`,
      code: 'TENANT_UNKNOWN'
    });
  }

  // Verify tenant matching
  if (req.user && req.user.tenant_id !== targetTenantId) {
    // Critical cross-tenant boundary breach attempt!
    auditTrail.logEvent({
      tenantId: req.user.tenant_id,
      userId: req.user.sub,
      action: 'CROSS_TENANT_BREACH_PREVENTED',
      targetResource: targetTenantId,
      status: 'DENIED',
      details: {
        authenticatedTenant: req.user.tenant_id,
        attemptedTargetTenant: targetTenantId,
        userName: req.user.name,
        role: req.user.role,
        requestedEndpoint: req.originalUrl
      },
      securityContext: {
        clientIp: req.ip,
        verifiedScopes: req.user.scopes
      }
    });

    return res.status(403).json({
      error: 'FORBIDDEN',
      message: `Tenant Isolation Boundary Violation: User authenticated under tenant '${req.user.tenant_id}' cannot access records belonging to tenant '${targetTenantId}'`,
      code: 'TENANT_ISOLATION_VIOLATION',
      securityDetails: {
        yourTenant: req.user.tenant_id,
        targetTenant: targetTenantId,
        action: 'ACCESS_REJECTED_AND_LOGGED'
      }
    });
  }

  req.targetTenantId = targetTenantId;
  next();
}

/**
 * Scope-Based Access Control (RBAC/ABAC) Guard:
 * Verifies that the authenticated token possesses the necessary permission scope.
 */
export function requireScope(requiredScope) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    const hasScope = req.user.scopes && req.user.scopes.includes(requiredScope);
    if (!hasScope) {
      auditTrail.logEvent({
        tenantId: req.user.tenant_id,
        userId: req.user.sub,
        action: 'SCOPE_ACCESS_DENIED',
        targetResource: req.originalUrl,
        status: 'DENIED',
        details: {
          requiredScope,
          heldScopes: req.user.scopes,
          userRole: req.user.role
        },
        securityContext: {
          clientIp: req.ip,
          requiredScope,
          verifiedScopes: req.user.scopes
        }
      });

      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `Scope Permission Denied: Your role '${req.user.role}' lacks the required '${requiredScope}' scope for this operation`,
        code: 'SCOPE_DENIED',
        requiredScope,
        heldScopes: req.user.scopes
      });
    }

    next();
  };
}

/**
 * Input Schema & Sanitization Validator
 */
export function validateAssessmentInput(req, res, next) {
  const { supplierId, tenantId } = req.body;

  if (!supplierId || typeof supplierId !== 'string') {
    return res.status(400).json({
      error: 'BAD_REQUEST',
      message: 'Invalid or missing field: supplierId (string required)'
    });
  }

  if (!tenantId || typeof tenantId !== 'string') {
    return res.status(400).json({
      error: 'BAD_REQUEST',
      message: 'Invalid or missing field: tenantId (string required)'
    });
  }

  // Sanitize input strings against script injection or raw control chars
  const cleanSupplierId = supplierId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (cleanSupplierId !== supplierId.trim()) {
    auditTrail.logEvent({
      tenantId,
      userId: req.user ? req.user.sub : 'SYSTEM',
      action: 'INPUT_VALIDATION_SANITIZED',
      targetResource: supplierId,
      status: 'WARNING',
      details: { rawInput: supplierId, sanitized: cleanSupplierId }
    });
  }

  req.body.supplierId = cleanSupplierId;
  next();
}
