# Security Policy

## Reporting Security Vulnerabilities

If you discover a security vulnerability in HaloGuard, please **DO NOT** open a public GitHub issue. Instead, please report it responsibly:

### Private Disclosure

Email: **security@haloguard.dev** (or use GitHub Security Advisory form: "Report a vulnerability" button on Security tab)

Include:
- Description of the vulnerability
- Step-by-step reproduction instructions
- Affected versions
- Impact assessment
- Proposed fix (if available)

### Response Timeline

- **24 hours**: Initial acknowledgment
- **72 hours**: Assessment and reproduction
- **7 days**: Security patch development
- **14 days**: Public disclosure after patched release

## Security Best Practices

### For Users

1. **Keep Extensions Updated**
   - Enable automatic updates in VS Code and Chrome
   - Manually check for updates monthly if auto-update disabled

2. **Environment Variables**
   - Never commit `.env` files to repositories
   - Use `.env.local` for local development
   - Rotate API keys regularly

3. **API Keys & Tokens**
   - Store in environment variables only
   - Rotate Stripe tokens quarterly
   - Revoke compromised keys immediately

4. **Database Security**
   - Use strong PostgreSQL passwords
   - Enable SSL for database connections
   - Restrict database access by IP
   - Regular backups with encryption

### For Contributors

1. **Code Review**
   - All changes require code review
   - Security-focused review for privilege escalation changes
   - Automated security scanning via GitHub Actions

2. **Dependency Management**
   - Regular `npm audit` checks
   - Update dependencies monthly
   - Lockfile committed to prevent supply chain attacks
   - Monitor for deprecations

3. **Input Validation**
   - Validate all user inputs
   - Sanitize HTML/script content
   - Use parameterized queries (Prisma ORM handles this)
   - Implement rate limiting on APIs

4. **Secrets Management**
   - Never log sensitive data
   - Use GitHub Secrets for CI/CD
   - Implement secret masking in logs
   - Regular rotation of deployment credentials

## Vulnerability Categories

### Critical
- Remote code execution
- SQL injection
- Authentication bypass
- Privilege escalation
- Data exfiltration

**Response**: Immediate 24-hour patched release

### High
- XSS vulnerabilities
- CSRF attacks
- Sensitive data exposure
- Authorization bypass

**Response**: 7-day patched release

### Medium
- Configuration weaknesses
- Insecure dependencies
- Weak cryptography

**Response**: Next scheduled release (within 30 days)

### Low
- Information disclosure
- Missing security headers
- Deprecated libraries

**Response**: Next major/minor release

## Infrastructure Security

### Deployment Security (Railway/Docker)

1. **Secrets Management**
   - Store all secrets in Railway environment variables
   - Never copy secrets to `.env` files
   - Rotate monthly

2. **Network Security**
   - Enable HTTPS/TLS only
   - Implement firewall rules
   - Use VPC for database access
   - Enable DDoS protection

3. **Access Control**
   - Minimal IAM permissions
   - SSH key-based authentication
   - 2FA on deployment platforms

4. **Monitoring**
   - Enable audit logging
   - Monitor suspicious activity
   - Set up security alerts
   - Regular penetration testing

### Database Security

1. **PostgreSQL Hardening**
   - Enable SSL connections
   - Use strong authentication
   - Regular automated backups
   - Point-in-time recovery setup

2. **Data Protection**
   - Encrypt sensitive fields (Prisma encryption plugin)
   - Mask PII in logs
   - Implement data minimization
   - Regular data confidentiality audits

### API Security

1. **Authentication**
   - JWT tokens with 24-hour expiry
   - Refresh token rotation
   - API key management for service-to-service

2. **Authorization**
   - Role-based access control (RBAC)
   - Scope validation per endpoint
   - User data isolation

3. **Rate Limiting**
   ```
   - 100 requests/minute per IP (anonymous)
   - 1000 requests/minute per user (authenticated)
   - 10000 requests/minute per service account
   ```

4. **CORS Policy**
   - Whitelist known extensions
   - Reject unreognized origins
   - Validate preflight requests

## Extension Security

### VS Code Extension
- Permissions declared in manifest
- No external code execution (no eval)
- Secure storage for sensitive data
- Updated TypeScript strict mode

### Chrome Extension
- Manifest V3 compliant
- Content Script Isolation (CSP)
- No inline scripts
- Regular security reviews

## Testing & Validation

### Automated Security Scanning

```bash
# Dependency auditing
npm audit

# SAST (Static Application Security Testing)
npm run lint

# DAST (Dynamic testing)
npm run test:security
```

### Manual Security Testing

1. **Penetration Testing**: Annual third-party audit
2. **Code Review**: Security-focused reviews for sensitive code
3. **Threat Modeling**: Regular threat reviews
4. **Incident Response**: Document and learn from incidents

## Compliance

HaloGuard aims to comply with:

- **OWASP Top 10**: Web application security risks
- **CWE/SANS**: Most dangerous software errors
- **GDPR**: Data protection regulations
- **CCPA**: California consumer privacy

## Known Limitations

1. **Client-side Processing**: Extensions run locally; data isn't sent by default but can be configured for cloud analysis
2. **API Calls**: Fact-checking requires external API calls (Wikipedia, DBpedia) - data briefly stored for caching
3. **Model Limitations**: Detectors have confidence thresholds; edge cases may need manual review

## Responsible Disclosure Timeline

We follow the 90-day responsible disclosure standard:
- Day 0: Vulnerability reported privately
- Day 30: Internal review and patch development
- Day 60: Security patch released
- Day 90: Public disclosure

## Security Contacts

| Role | Contact |
|------|---------|
| **Security Team** | security@haloguard.dev |
| **GitHub** | Use Security Advisory on GitHub |
| **Bug Bounty** | Not currently active |

## References

- [OWASP Security Best Practices](https://owasp.org/)
- [Node.js Security Checklist](https://blog.risingstack.com/node-js-security-checklist/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [CWE Top 25](https://cwe.mitre.org/top25/)

---

*Last updated: April 8, 2026*
