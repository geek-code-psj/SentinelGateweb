# Contributing to HaloGuard

Thank you for your interest in contributing to HaloGuard! This document outlines guidelines for contributing code, reporting issues, and improving documentation.

## Code of Conduct

We are committed to providing a welcoming and inspiring community for all. Please read and adhere to our [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting Started

### Prerequisites

- Node.js 18+ and npm 9+
- PostgreSQL 14+ (for local development)
- Redis 6+ (for caching)
- Docker & Docker Compose (optional, for containerized development)
- Git

### Local Development Setup

```bash
# 1. Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/haloguard.git
cd haloguard

# 2. Install dependencies (monorepo)
npm install

# 3. Start Docker services
docker-compose up -d

# 4. Copy environment template
cp .env.example .env.local

# 5. Run database migrations
cd shared-core
npm run migrate

# 6. Start development server
npm run dev

# 7. Run tests
npm test
```

## Development Workflow

### Branch Naming

Follow this naming convention for branches:

```
feature/description     # New features
fix/bug-description     # Bug fixes
docs/improvement        # Documentation updates
refactor/code-area      # Code refactoring
perf/optimization       # Performance improvements
test/coverage-area      # Test additions
chore/maintenance       # Maintenance tasks
```

Example: `feature/tier1-optimization`, `fix/redis-connection`

### Commit Messages

Use descriptive commit messages following this format:

```
type(scope): subject

body

footer
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style (no logic changes)
- `refactor`: Code refactoring
- `perf`: Performance improvement
- `test`: Test additions
- `chore`: Maintenance

Example:
```
feat(detectors): add tier2 fact-checking via WikiData API

Add new Tier 2 detector for fact verification against WikiData.
Implements fuzzy matching and caching for improved performance.

Fixes #123
```

### Pull Request Process

1. **Create a feature branch** from `main`
   ```bash
   git checkout -b feature/your-feature
   ```

2. **Make your changes** with well-organized commits

3. **Run tests locally**
   ```bash
   npm run test
   npm run lint
   npm run type-check
   ```

4. **Update documentation** if needed
   - Code comments for complex logic
   - README.md for new features
   - DEPLOYMENT_GUIDE.md for deployment changes

5. **Push to your fork**
   ```bash
   git push origin feature/your-feature
   ```

6. **Open a Pull Request** on GitHub with:
   - Clear title describing the change
   - Description of what changed and why
   - Reference to related issues (`Fixes #123`)
   - Screenshots if UI changes

7. **Respond to review feedback**
   - Code review will happen automatically
   - Address suggestions in new commits
   - Re-request review when ready

### Testing Requirements

All code contributions must include:

- **Unit tests** for new functions (>80% coverage)
- **Integration tests** for feature interactions
- **E2E tests** for cross-platform features

```bash
# Run all tests
npm run test

# Run specific test file
npm run test -- detectors.test.ts

# Run with coverage
npm run test:coverage
```

### Code Style

This project uses:
- **Linter**: ESLint
- **Formatter**: Prettier
- **Type Checker**: TypeScript strict mode

Before committing:
```bash
npm run lint                # Check lint issues
npm run format              # Auto-format code
npm run type-check          # Check TypeScript
```

## Architecture Guidelines

### Monorepo Structure

Always place code in the appropriate package:

- `shared-core/` → Backend logic, detectors, licensing
- `shared-ui/` → React components
- `shared-client-sdk/` → SDK for extensions
- `vscode-extension/` → VS Code-specific code
- `chrome-extension/` → Chrome-specific code
- `python-workers/` → Python services

### Detection Tier Development

The detector architecture follows a 5-tier pipeline:

```
Tier 0 (<10ms)  → Regex patterns, hedging detection
Tier 1 (<50ms)  → Heuristics, token analysis
Tier 2 (<400ms) → Fact-checking (async)
Tier 3 (<600ms) → NLI scoring (async)
Tier 4 (async)  → Semantic memory analysis
```

When adding new detection logic:

1. Start with Tier 0 (fastest, regex-based)
2. Only escalate to higher tiers if needed
3. Maintain strict latency budgets
4. Add comprehensive tests

### Type Safety

- Use TypeScript strict mode
- Define types in `shared-core/src/types/`
- Export types from `detector.ts` for reuse
- Avoid `any` type (use `unknown` if needed)

```typescript
// Good
interface DetectionResult {
  category: DetectorType;
  confidence: number;
  evidence: string[];
}

// Avoid
const result: any = detector.analyze(content);
```

## Reporting Issues

### Bug Reports

Create an issue with:

```markdown
## Description
Clear description of the bug

## Steps to Reproduce
1. Step one
2. Step two
3. Expected vs actual result

## Environment
- Node version: 18.x
- OS: Windows/macOS/Linux
- Extension version: 1.0.0

## Logs
Relevant error messages or logs (use code blocks)
```

### Feature Requests

```markdown
## Feature Description
What should the feature do?

## Use Case
Why is this feature needed?

## Proposed Solution
How might this be implemented?

## Alternatives
Other approaches considered
```

## Documentation

### Code Comments

Write comments for "why", not "what":

```typescript
// Bad
// Increment counter
counter++;

// Good
// Increase counter to track consecutive hallucinations
// used for confidence scoring in Tier 3
counter++;
```

### README & Docs

- Update related documentation when changing functionality
- Include examples for new APIs
- Keep installation instructions current
- Link to relevant files and sections

## Performance Considerations

### Latency Budgets

| Tier | Budget | Notes |
|------|--------|-------|
| 0    | < 10ms | Synchronous only |
| 1    | < 50ms | Synchronous only |
| 2    | < 400ms | Async allowed |
| 3    | < 600ms | Async, cached results |
| 4    | Unbounded | Fully async |

### Memory Usage

- Keep detector memory footprint < 50MB
- Cache large datasets (word lists, models)
- Use Redis for cross-instance caching

### Network Requests

- Batch external API calls
- Implement request timeouts (5s default)
- Cache API responses
- Implement exponential backoff for retries

## Security Considerations

When contributing:

- Never commit secrets (API keys, tokens)
- Use `.env.example` for templates
- Validate all user input
- Sanitize output before rendering
- Review SECURITY.md before handling sensitive data
- Report security issues privately (see SECURITY.md)

## Licensing

By contributing, you agree that your contributions will be licensed under the project's MIT License.

## Questions?

- **Documentation**: See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) and [docs/](docs/)
- **Issues**: Open a GitHub issue with `question` label
- **Discussions**: Use GitHub Discussions

## Helpful Commands

```bash
# Development
npm run dev              # Start development server

# Testing
npm run test            # Run all tests
npm run test:watch     # Watch mode
npm run test:coverage  # Generate coverage report

# Quality
npm run lint           # Check code style
npm run format         # Auto-format code
npm run type-check     # TypeScript type checking

# Building
npm run build          # Build all packages
npm run build:core    # Build shared-core only
npm run build:vscode  # Build VS Code extension

# Deployment
npm run docker:build  # Build Docker images
npm run docker:up     # Start Docker services
```

---

**Thank you for contributing to HaloGuard!** 🎉

*Last updated: April 8, 2026*
