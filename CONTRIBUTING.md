# 🤝 Contributing to UltraZend

## 📋 Table of Contents
- [Git Workflow](#git-workflow)
- [Development Setup](#development-setup)
- [Code Standards](#code-standards)
- [Testing Requirements](#testing-requirements)
- [Pull Request Process](#pull-request-process)
- [Branch Naming Convention](#branch-naming-convention)

## 🔄 Git Workflow

We use **Git Flow** for managing branches and releases:

### Main Branches
- **`main`**: Production-ready code
- **`develop`**: Integration branch for features

### Supporting Branches
- **`feature/*`**: New features (branch from `develop`)
- **`release/*`**: Release preparation (branch from `develop`)
- **`hotfix/*`**: Critical fixes (branch from `main`)
- **`bugfix/*`**: Bug fixes (branch from `develop`)

### Workflow Steps

#### 1. Starting a New Feature
```bash
git checkout develop
git pull origin develop
git flow feature start feature-name
```

#### 2. Working on Feature
```bash
# Make your changes
git add .
git commit -m "feat: implement feature functionality"
git push origin feature/feature-name
```

#### 3. Finishing Feature
```bash
git flow feature finish feature-name
```

#### 4. Creating a Release
```bash
git flow release start 1.2.0
# Update version numbers, changelog
git flow release finish 1.2.0
```

#### 5. Hotfix for Production
```bash
git flow hotfix start 1.2.1
# Fix critical issue
git flow hotfix finish 1.2.1
```

## 🛠️ Development Setup

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- Git
- Redis (via Docker)

### Quick Start
```bash
# Clone repository
git clone https://github.com/your-org/ultrazend.git
cd ultrazend

# Setup development environment
docker-compose -f docker-compose.dev.yml up -d

# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Start development servers
npm run dev:all
```

### Environment Variables
Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

Required variables:
- `JWT_SECRET`: JWT signing secret
- `REDIS_HOST`: Redis host (default: localhost)
- `SMTP_HOSTNAME`: SMTP server hostname
- `DATABASE_URL`: SQLite database path

## 📝 Code Standards

### TypeScript/JavaScript
- Use **TypeScript** for all new code
- Follow **ESLint** configuration
- Use **Prettier** for formatting
- Write **JSDoc** comments for public APIs

### Coding Conventions
```typescript
// ✅ Good
interface UserData {
  id: number;
  email: string;
  isVerified: boolean;
}

const createUser = async (userData: UserData): Promise<User> => {
  // Implementation
};

// ❌ Bad
const createuser = (data: any) => {
  // Implementation
};
```

### Commit Message Format
Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

#### Types
- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes
- **refactor**: Code refactoring
- **perf**: Performance improvements
- **test**: Adding tests
- **chore**: Maintenance tasks

#### Examples
```bash
feat(auth): implement email verification system
fix(smtp): resolve delivery timeout issues  
docs(api): update authentication endpoints
test(email): add integration tests for SMTP server
```

## 🧪 Testing Requirements

### Test Coverage
- Maintain **>80%** test coverage
- Write unit tests for all business logic
- Write integration tests for APIs
- Write E2E tests for critical user flows

### Test Commands
```bash
# Unit tests
npm run test

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# Test coverage
npm run test:coverage
```

### Test Structure
```typescript
// unit test example
describe('EmailService', () => {
  describe('sendVerificationEmail', () => {
    it('should send verification email successfully', async () => {
      // Arrange
      const emailData = { /* test data */ };
      
      // Act
      const result = await emailService.sendVerificationEmail(emailData);
      
      // Assert
      expect(result.success).toBe(true);
    });
  });
});
```

## 🔍 Pull Request Process

### Before Creating PR
1. **Rebase** your branch on latest `develop`
2. **Run tests** and ensure they pass
3. **Run linting** and fix all issues
4. **Update documentation** if needed
5. **Test manually** in development environment

### PR Requirements
- [ ] **Descriptive title** and description
- [ ] **Link to issue** (if applicable)
- [ ] **Screenshots** (for UI changes)
- [ ] **Test coverage** maintained/improved
- [ ] **No merge conflicts**
- [ ] **All checks passing**

### PR Template
```markdown
## 📝 Description
Brief description of changes

## 🔗 Related Issue
Fixes #123

## 🧪 Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated  
- [ ] Manual testing completed

## 📸 Screenshots (if applicable)
[Add screenshots for UI changes]

## ✅ Checklist
- [ ] Code follows project conventions
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests pass locally
```

### Code Review Guidelines

#### For Authors
- Keep PRs **small and focused**
- **Self-review** before requesting review
- **Respond promptly** to feedback
- **Test thoroughly** before marking ready

#### For Reviewers
- Review for **functionality**, not just style
- **Test the changes** locally if possible
- **Be constructive** in feedback
- **Approve** when ready for merge

### Branch Naming Convention

#### Feature Branches
```
feature/short-description
feature/auth-email-verification
feature/smtp-delivery-system
feature/user-dashboard
```

#### Bug Fix Branches
```
bugfix/short-description
bugfix/email-token-validation
bugfix/smtp-connection-timeout
```

#### Release Branches
```
release/1.2.0
release/2.0.0-beta.1
```

#### Hotfix Branches
```
hotfix/1.2.1
hotfix/critical-security-patch
```

## 📋 Definition of Done

A feature is considered "Done" when:

### Development ✅
- [ ] **Code implemented** and follows standards
- [ ] **Code reviewed** and approved
- [ ] **No linting errors** or warnings
- [ ] **TypeScript compilation** successful

### Testing ✅
- [ ] **Unit tests** written and passing
- [ ] **Integration tests** written and passing
- [ ] **E2E tests** updated (if applicable)
- [ ] **Manual testing** completed

### Documentation ✅
- [ ] **Code documented** with JSDoc
- [ ] **API documentation** updated
- [ ] **README updated** (if applicable)
- [ ] **Changelog updated**

### Deployment ✅
- [ ] **Builds successfully** in CI/CD
- [ ] **Deployed to staging** and tested
- [ ] **Performance impact** assessed
- [ ] **Security review** completed (for sensitive changes)

## 🚀 Release Process

### Version Numbering
We follow [Semantic Versioning](https://semver.org/):
- **MAJOR**: Breaking changes
- **MINOR**: New features (backwards compatible)
- **PATCH**: Bug fixes (backwards compatible)

### Release Checklist
1. Create release branch from `develop`
2. Update version numbers
3. Update CHANGELOG.md
4. Test release candidate
5. Merge to `main` and tag
6. Deploy to production
7. Merge back to `develop`

## 🆘 Getting Help

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and ideas
- **Discord**: Real-time development chat
- **Documentation**: Check README and docs/ folder

## 📄 License

By contributing to UltraZend, you agree that your contributions will be licensed under the same license as the project.