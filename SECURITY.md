# Security Considerations

## Current Status

This document tracks known security vulnerabilities in dependencies and the rationale for decisions made regarding them.

## Fixed Vulnerabilities

### brace-expansion (Fixed in latest commit)
- **Severity**: Low
- **Issue**: Regular Expression Denial of Service vulnerability
- **Resolution**: Updated from 1.1.11 to 1.1.12 and 2.0.1 to 2.0.2
- **Impact**: No breaking changes

## Known Vulnerabilities (Requires Breaking Changes)

### fast-xml-parser
- **Severity**: Moderate
- **Issue**: Prototype Pollution through tag or attribute name
- **Dependency Chain**: `fints` package (direct dependency)
- **Mitigation**: Would require updating `fints` from 0.5.0 to 0.2.0 (breaking change)
- **Status**: Not fixed - waiting for upstream fix in `fints` package

### form-data
- **Severity**: Critical
- **Issue**: Uses unsafe random function for choosing boundary
- **Dependency Chain**: `n8n-workflow` (peer dependency)
- **Mitigation**: Would require updating `n8n-workflow` to 1.17.0 (breaking change)
- **Status**: Not fixed - managed by n8n platform, users should ensure they use compatible n8n versions

### node-fetch
- **Severity**: High
- **Issue**: Forwards secure headers to untrusted sites
- **Dependency Chain**: `fints` package via `isomorphic-fetch`
- **Mitigation**: Would require updating `fints` from 0.5.0 to 0.2.0 (breaking change)
- **Status**: Not fixed - waiting for upstream fix in `fints` package

## Recommendations for Users

1. **Keep n8n updated**: Many of these vulnerabilities are in peer dependencies managed by the n8n platform. Keeping n8n updated will help address these issues.

2. **Network security**: The node-fetch vulnerability relates to header forwarding. Ensure your n8n instance is properly firewalled and uses secure network configurations.

3. **Monitor for updates**: Watch for updates to the `fints` package that may address the fast-xml-parser and node-fetch vulnerabilities.

## Future Actions

- Monitor the `fints` package repository for security updates
- When `fints` releases a version that addresses these vulnerabilities without breaking the API, update accordingly
- Re-evaluate breaking changes in future major version releases

Last Updated: 2025-11-05
