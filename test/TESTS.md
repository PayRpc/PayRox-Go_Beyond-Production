# Test Documentation

## Overview

This directory contains comprehensive test suites for the PayRox system.

## Test Structure

### Unit Tests
- Contract functionality tests
- Library function tests
- Utility function tests

### Integration Tests
- Cross-facet interaction tests
- End-to-end workflow tests
- Network integration tests

### Security Tests
- Access control tests
- Reentrancy protection tests
- Emergency mechanism tests

### Performance Tests
- Gas optimization tests
- Load testing
- Stress testing

## Running Tests

```bash
# Run all tests
npm test

# Run specific test suite
npx hardhat test test/unit/
npx hardhat test test/integration/
npx hardhat test test/security/

# Run with coverage
npm run test:coverage

# Run with gas reporting
npm run test:gas
```

## Test Requirements

- All tests must pass before deployment
- Minimum 95% code coverage required
- All security tests must pass
- Performance benchmarks must be met

## Continuous Integration

Tests are automatically run on:
- Every pull request
- Every push to main branch
- Nightly regression testing
- Pre-deployment validation
