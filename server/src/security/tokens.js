import crypto from 'crypto';

// Secret key for HMAC token signing (in production, loaded from secure secret manager)
const JWT_SECRET = process.env.JWT_SECRET || 'agentic-supplier-risk-secure-jwt-hmac-sha256-key-9921';

/**
 * Creates a signed token mimicking enterprise OAuth/OIDC JWT
 */
export function createToken({ userId, name, tenantId, role, scopes, expiresInSec = 3600 }) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userId,
    name,
    tenant_id: tenantId,
    role,
    scopes: scopes || [],
    iat: now,
    exp: now + expiresInSec,
    iss: 'enterprise-auth-gateway'
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Verifies the cryptographic signature, expiration, and format of a token
 */
export function verifyToken(tokenStr) {
  if (!tokenStr || typeof tokenStr !== 'string') {
    return { valid: false, error: 'Token is missing or not a string' };
  }

  const parts = tokenStr.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'Malformed token structure (expected 3 dot-separated parts)' };
  }

  const [headerB64, payloadB64, signature] = parts;

  // Verify HMAC signature
  const expectedSig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  if (signature !== expectedSig) {
    return { valid: false, error: 'Cryptographic signature mismatch! Token has been tampered with.' };
  }

  try {
    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson);

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return { valid: false, error: `Token expired at ${new Date(payload.exp * 1000).toISOString()}` };
    }

    return { valid: true, payload };
  } catch (err) {
    return { valid: false, error: `Failed to decode token payload: ${err.message}` };
  }
}

/**
 * Pre-configured persona tokens for fast testing & evaluation
 */
export const PRESET_PERSONAS = {
  // Full executive access for Aerospace tenant
  AERO_CHIEF_RISK_OFFICER: {
    userId: 'usr_elena_cro',
    name: 'Elena Vance (Chief Risk Officer)',
    tenantId: 'TENANT_AERO_CORP',
    role: 'CHIEF_RISK_OFFICER',
    scopes: [
      'suppliers:read',
      'financial:read',
      'payment:read',
      'contracts:read',
      'alternates:read',
      'risk:assess',
      'admin:audit'
    ],
    description: 'Full enterprise privileges across all data sources.'
  },

  // Financial Analyst (has financial & payment access, but NO contract/legal access)
  AERO_FINANCIAL_ANALYST: {
    userId: 'usr_marcus_fin',
    name: 'Marcus Brody (Senior Financial Analyst)',
    tenantId: 'TENANT_AERO_CORP',
    role: 'FINANCIAL_ANALYST',
    scopes: [
      'suppliers:read',
      'financial:read',
      'payment:read',
      'risk:assess'
    ],
    description: 'Restricted: Lacks contracts:read and alternates:read scopes to test RBAC scope enforcement.'
  },

  // Legal Counsel (has contract access, but NO financial/payment access)
  AERO_LEGAL_COUNSEL: {
    userId: 'usr_sarah_legal',
    name: 'Sarah Connor (Corporate Legal Counsel)',
    tenantId: 'TENANT_AERO_CORP',
    role: 'LEGAL_COUNSEL',
    scopes: [
      'suppliers:read',
      'contracts:read',
      'risk:assess'
    ],
    description: 'Restricted: Lacks financial:read and payment:read to test partial evidence degradation.'
  },

  // Tenant Pharma User (tests cross-tenant boundary rejection)
  PHARMA_RISK_LEAD: {
    userId: 'usr_chen_pharma',
    name: 'Dr. David Chen (Pharma Supply Director)',
    tenantId: 'TENANT_PHARMA_LABS',
    role: 'CHIEF_RISK_OFFICER',
    scopes: [
      'suppliers:read',
      'financial:read',
      'payment:read',
      'contracts:read',
      'alternates:read',
      'risk:assess'
    ],
    description: 'Belongs to TENANT_PHARMA_LABS. Used to demonstrate cross-tenant isolation enforcement when querying Aero data.'
  },

  // External Auditor (Read only, audit logs only)
  EXTERNAL_AUDITOR: {
    userId: 'usr_audit_kpmg',
    name: 'Alex Rivera (Compliance Auditor)',
    tenantId: 'TENANT_AERO_CORP',
    role: 'COMPLIANCE_AUDITOR',
    scopes: [
      'suppliers:read',
      'admin:audit'
    ],
    description: 'Read-only audit scope; cannot execute new risk assessments.'
  }
};
