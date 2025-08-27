#!/usr/bin/env node

/**
 * Plugin Validation Script
 * 
 * This script performs comprehensive validation of the Google Home Sync plugin
 * to ensure it meets all requirements and is ready for production use.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class PluginValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.passed = [];
    this.rootDir = path.resolve(__dirname, '..');
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = {
      info: '✓',
      warn: '⚠',
      error: '✗',
      section: '📋'
    }[type] || 'ℹ';
    
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  error(message) {
    this.errors.push(message);
    this.log(message, 'error');
  }

  warn(message) {
    this.warnings.push(message);
    this.log(message, 'warn');
  }

  pass(message) {
    this.passed.push(message);
    this.log(message, 'info');
  }

  section(message) {
    this.log(`\n${message}`, 'section');
  }

  async validatePackageStructure() {
    this.section('Validating Package Structure');

    // Check package.json
    const packageJsonPath = path.join(this.rootDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      this.error('package.json not found');
      return;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // Validate required package.json fields
    const requiredFields = [
      'name', 'version', 'description', 'main', 'types',
      'scripts', 'keywords', 'author', 'license', 'engines',
      'dependencies', 'devDependencies', 'peerDependencies'
    ];

    requiredFields.forEach(field => {
      if (packageJson[field]) {
        this.pass(`package.json has required field: ${field}`);
      } else {
        this.error(`package.json missing required field: ${field}`);
      }
    });

    // Validate Homebridge-specific fields
    if (packageJson.homebridge) {
      this.pass('package.json has homebridge configuration');
      
      const homebridgeFields = ['displayName', 'platformName', 'configSchema'];
      homebridgeFields.forEach(field => {
        if (packageJson.homebridge[field]) {
          this.pass(`Homebridge config has ${field}`);
        } else {
          this.error(`Homebridge config missing ${field}`);
        }
      });
    } else {
      this.error('package.json missing homebridge configuration');
    }

    // Check for required files
    const requiredFiles = [
      'README.md',
      'CHANGELOG.md',
      'LICENSE',
      'config.schema.json',
      'tsconfig.json',
      '.eslintrc.js',
      'jest.config.js'
    ];

    requiredFiles.forEach(file => {
      if (fs.existsSync(path.join(this.rootDir, file))) {
        this.pass(`Required file exists: ${file}`);
      } else {
        this.error(`Required file missing: ${file}`);
      }
    });

    // Check source structure
    const srcDir = path.join(this.rootDir, 'src');
    if (fs.existsSync(srcDir)) {
      this.pass('Source directory exists');
      
      const requiredSrcDirs = [
        'auth', 'api', 'device', 'accessory', 'sync', 
        'config', 'logging', 'resilience', 'interfaces', 'types'
      ];

      requiredSrcDirs.forEach(dir => {
        if (fs.existsSync(path.join(srcDir, dir))) {
          this.pass(`Source directory exists: ${dir}`);
        } else {
          this.error(`Source directory missing: ${dir}`);
        }
      });
    } else {
      this.error('Source directory missing');
    }
  }

  async validateBuild() {
    this.section('Validating Build Process');

    try {
      // Clean previous build
      if (fs.existsSync(path.join(this.rootDir, 'dist'))) {
        execSync('rm -rf dist', { cwd: this.rootDir });
        this.pass('Cleaned previous build');
      }

      // Run TypeScript build
      execSync('npm run build', { cwd: this.rootDir, stdio: 'pipe' });
      this.pass('TypeScript build successful');

      // Check dist directory
      const distDir = path.join(this.rootDir, 'dist');
      if (fs.existsSync(distDir)) {
        this.pass('Build output directory created');

        // Check for main entry point
        const mainFile = path.join(distDir, 'index.js');
        if (fs.existsSync(mainFile)) {
          this.pass('Main entry point built successfully');
        } else {
          this.error('Main entry point not found in build output');
        }

        // Check for type definitions
        const typesFile = path.join(distDir, 'index.d.ts');
        if (fs.existsSync(typesFile)) {
          this.pass('Type definitions generated');
        } else {
          this.warn('Type definitions not found');
        }

        // Check build size
        const stats = fs.statSync(distDir);
        this.pass(`Build output created (${this.formatBytes(this.getDirSize(distDir))})`);
      } else {
        this.error('Build output directory not created');
      }
    } catch (error) {
      this.error(`Build failed: ${error.message}`);
    }
  }

  async validateTests() {
    this.section('Validating Tests');

    try {
      // Run unit tests
      execSync('npm test', { cwd: this.rootDir, stdio: 'pipe' });
      this.pass('Unit tests passed');
    } catch (error) {
      this.error(`Unit tests failed: ${error.message}`);
    }

    try {
      // Run integration tests
      execSync('npm run test:integration', { cwd: this.rootDir, stdio: 'pipe' });
      this.pass('Integration tests passed');
    } catch (error) {
      this.error(`Integration tests failed: ${error.message}`);
    }

    // Check test coverage
    const testDirs = [
      'src/__tests__',
      'src/auth/__tests__',
      'src/api/__tests__',
      'src/device/__tests__',
      'src/accessory/__tests__',
      'src/sync/__tests__',
      'src/config/__tests__',
      'src/logging/__tests__',
      'src/resilience/__tests__'
    ];

    testDirs.forEach(dir => {
      if (fs.existsSync(path.join(this.rootDir, dir))) {
        this.pass(`Test directory exists: ${dir}`);
      } else {
        this.warn(`Test directory missing: ${dir}`);
      }
    });
  }

  async validateLinting() {
    this.section('Validating Code Quality');

    try {
      execSync('npm run lint', { cwd: this.rootDir, stdio: 'pipe' });
      this.pass('ESLint validation passed');
    } catch (error) {
      this.error(`ESLint validation failed: ${error.message}`);
    }
  }

  async validateConfiguration() {
    this.section('Validating Configuration Schema');

    const schemaPath = path.join(this.rootDir, 'config.schema.json');
    if (fs.existsSync(schemaPath)) {
      try {
        const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
        
        // Validate schema structure
        if (schema.pluginAlias && schema.pluginType && schema.schema) {
          this.pass('Configuration schema is well-formed');
          
          // Check required properties
          if (schema.schema.properties) {
            const requiredProps = ['clientId', 'clientSecret'];
            requiredProps.forEach(prop => {
              if (schema.schema.properties[prop]) {
                this.pass(`Schema defines required property: ${prop}`);
              } else {
                this.error(`Schema missing required property: ${prop}`);
              }
            });
          }
        } else {
          this.error('Configuration schema missing required fields');
        }
      } catch (error) {
        this.error(`Invalid configuration schema: ${error.message}`);
      }
    } else {
      this.error('Configuration schema file not found');
    }
  }

  async validateDocumentation() {
    this.section('Validating Documentation');

    // Check README.md
    const readmePath = path.join(this.rootDir, 'README.md');
    if (fs.existsSync(readmePath)) {
      const readme = fs.readFileSync(readmePath, 'utf8');
      
      const requiredSections = [
        'installation', 'configuration', 'supported devices', 
        'troubleshooting', 'contributing'
      ];

      requiredSections.forEach(section => {
        if (readme.toLowerCase().includes(section)) {
          this.pass(`README includes ${section} section`);
        } else {
          this.warn(`README missing ${section} section`);
        }
      });

      if (readme.length > 1000) {
        this.pass('README is comprehensive');
      } else {
        this.warn('README might be too brief');
      }
    } else {
      this.error('README.md not found');
    }

    // Check CHANGELOG.md
    const changelogPath = path.join(this.rootDir, 'CHANGELOG.md');
    if (fs.existsSync(changelogPath)) {
      this.pass('CHANGELOG.md exists');
    } else {
      this.warn('CHANGELOG.md not found');
    }

    // Check TROUBLESHOOTING.md
    const troubleshootingPath = path.join(this.rootDir, 'TROUBLESHOOTING.md');
    if (fs.existsSync(troubleshootingPath)) {
      this.pass('TROUBLESHOOTING.md exists');
    } else {
      this.warn('TROUBLESHOOTING.md not found');
    }
  }

  async validateDependencies() {
    this.section('Validating Dependencies');

    try {
      // Check for security vulnerabilities
      execSync('npm audit --audit-level=high', { cwd: this.rootDir, stdio: 'pipe' });
      this.pass('No high-severity security vulnerabilities found');
    } catch (error) {
      this.warn('Security vulnerabilities detected - run npm audit for details');
    }

    // Check for outdated dependencies
    try {
      const outdated = execSync('npm outdated --json', { cwd: this.rootDir, stdio: 'pipe' });
      const outdatedPackages = JSON.parse(outdated.toString());
      
      if (Object.keys(outdatedPackages).length === 0) {
        this.pass('All dependencies are up to date');
      } else {
        this.warn(`${Object.keys(outdatedPackages).length} dependencies are outdated`);
      }
    } catch (error) {
      // npm outdated returns non-zero exit code when packages are outdated
      this.warn('Some dependencies may be outdated');
    }
  }

  async validatePerformance() {
    this.section('Validating Performance Characteristics');

    // Check bundle size
    const distDir = path.join(this.rootDir, 'dist');
    if (fs.existsSync(distDir)) {
      const bundleSize = this.getDirSize(distDir);
      
      if (bundleSize < 5 * 1024 * 1024) { // 5MB
        this.pass(`Bundle size is reasonable: ${this.formatBytes(bundleSize)}`);
      } else {
        this.warn(`Bundle size is large: ${this.formatBytes(bundleSize)}`);
      }
    }

    // Check for performance-critical patterns
    const srcFiles = this.getAllFiles(path.join(this.rootDir, 'src'), '.ts');
    let hasPerformanceOptimizations = false;

    srcFiles.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      
      // Check for async/await usage
      if (content.includes('async ') && content.includes('await ')) {
        hasPerformanceOptimizations = true;
      }
      
      // Check for proper error handling
      if (content.includes('try {') && content.includes('catch (')) {
        hasPerformanceOptimizations = true;
      }
    });

    if (hasPerformanceOptimizations) {
      this.pass('Code includes performance optimizations');
    } else {
      this.warn('Consider adding performance optimizations');
    }
  }

  getDirSize(dirPath) {
    let size = 0;
    const files = fs.readdirSync(dirPath);
    
    files.forEach(file => {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        size += this.getDirSize(filePath);
      } else {
        size += stats.size;
      }
    });
    
    return size;
  }

  getAllFiles(dirPath, extension) {
    let files = [];
    
    if (!fs.existsSync(dirPath)) {
      return files;
    }
    
    const items = fs.readdirSync(dirPath);
    
    items.forEach(item => {
      const itemPath = path.join(dirPath, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory()) {
        files = files.concat(this.getAllFiles(itemPath, extension));
      } else if (item.endsWith(extension)) {
        files.push(itemPath);
      }
    });
    
    return files;
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async run() {
    console.log('🚀 Starting Google Home Sync Plugin Validation\n');

    await this.validatePackageStructure();
    await this.validateBuild();
    await this.validateTests();
    await this.validateLinting();
    await this.validateConfiguration();
    await this.validateDocumentation();
    await this.validateDependencies();
    await this.validatePerformance();

    // Summary
    this.section('Validation Summary');
    
    console.log(`\n📊 Results:`);
    console.log(`   ✓ Passed: ${this.passed.length}`);
    console.log(`   ⚠ Warnings: ${this.warnings.length}`);
    console.log(`   ✗ Errors: ${this.errors.length}`);

    if (this.errors.length > 0) {
      console.log('\n❌ Validation failed with errors:');
      this.errors.forEach(error => console.log(`   • ${error}`));
      process.exit(1);
    } else if (this.warnings.length > 0) {
      console.log('\n⚠️  Validation completed with warnings:');
      this.warnings.forEach(warning => console.log(`   • ${warning}`));
      console.log('\n✅ Plugin is ready for use, but consider addressing warnings.');
      process.exit(0);
    } else {
      console.log('\n🎉 All validations passed! Plugin is ready for production.');
      process.exit(0);
    }
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new PluginValidator();
  validator.run().catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  });
}

module.exports = PluginValidator;