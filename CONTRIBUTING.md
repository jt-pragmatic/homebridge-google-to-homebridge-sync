# Contributing to Google Home to Homebridge Sync

Thank you for your interest in contributing to Google Home to Homebridge Sync! This document provides guidelines and information for contributors.

## Code of Conduct

This project adheres to a code of conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## How to Contribute

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When creating a bug report, include:

- **Clear title and description**
- **Steps to reproduce** the issue
- **Expected vs actual behavior**
- **Environment details** (Node.js version, Homebridge version, OS)
- **Log output** (with sensitive information redacted)
- **Configuration** (with credentials removed)

### Suggesting Features

Feature requests are welcome! Please provide:

- **Clear description** of the feature
- **Use case** explaining why it would be useful
- **Possible implementation** approach if you have ideas

### Pull Requests

1. **Fork** the repository
2. **Create a branch** for your feature/fix
3. **Make your changes** following the coding standards
4. **Add tests** for new functionality
5. **Update documentation** as needed
6. **Submit a pull request**

#### Pull Request Guidelines

- Use clear, descriptive commit messages
- Include tests for new features
- Update documentation for API changes
- Ensure all tests pass
- Follow the existing code style

## Development Setup

### Prerequisites

- Node.js 18.0.0 or later
- npm or yarn
- Git

### Setup Steps

1. **Clone your fork**:
   ```bash
   git clone https://github.com/amitrathiesh/homebridge-google-to-homebridge-sync.git
   cd homebridge-google-to-homebridge-sync
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the project**:
   ```bash
   npm run build
   ```

4. **Run tests**:
   ```bash
   npm test
   ```

### Development Workflow

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** and test them

3. **Run the test suite**:
   ```bash
   npm test
   npm run test:integration
   ```

4. **Lint your code**:
   ```bash
   npm run lint
   npm run lint:fix
   ```

5. **Commit your changes**:
   ```bash
   git commit -m "feat: add your feature description"
   ```

6. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

## Coding Standards

### TypeScript Guidelines

- Use TypeScript strict mode
- Provide type annotations for public APIs
- Use interfaces for object shapes
- Prefer `const` over `let` when possible
- Use meaningful variable and function names

### Code Style

- Use 2 spaces for indentation
- Use single quotes for strings
- Add trailing commas in multi-line objects/arrays
- Keep line length under 100 characters
- Use ESLint configuration provided

### Testing

- Write unit tests for all new functionality
- Use Jest for testing framework
- Mock external dependencies
- Aim for high test coverage
- Write integration tests for complex flows

### Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for public APIs
- Update configuration schema if needed
- Include examples for new features

## Project Structure

```
src/
├── auth/           # Authentication management
├── api/            # Google Home API client
├── device/         # Device discovery and management
├── accessory/      # HomeKit accessory factory
├── sync/           # State synchronization
├── resilience/     # Connection resilience
├── config/         # Configuration validation
├── logging/        # Structured logging
├── interfaces/     # TypeScript interfaces
├── types/          # Type definitions
└── __tests__/      # Test files
```

## Release Process

Releases are handled by maintainers:

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create release tag
4. Publish to npm
5. Create GitHub release

## Getting Help

- **Issues**: Use GitHub Issues for bugs and feature requests
- **Discussions**: Use GitHub Discussions for questions
- **Discord**: Join the Homebridge Discord server

## Recognition

Contributors will be recognized in:
- GitHub contributors list
- Release notes for significant contributions
- README acknowledgments

Thank you for contributing to Google Home to Homebridge Sync!