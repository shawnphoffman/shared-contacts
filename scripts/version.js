#!/usr/bin/env node

/**
 * Version management script for shared-contacts
 * Updates version in all package.json files and optionally creates a git tag
 * 
 * Usage:
 *   npm run version:patch   - Bump patch version (1.0.0 -> 1.0.1)
 *   npm run version:minor   - Bump minor version (1.0.0 -> 1.1.0)
 *   npm run version:major   - Bump major version (1.0.0 -> 2.0.0)
 *   npm run version:set -- 1.2.3  - Set specific version
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PACKAGE_FILES = [
  'package.json',
  'sync-service/package.json',
];

function readPackageJson(filePath) {
  const fullPath = path.join(process.cwd(), filePath);
  const content = fs.readFileSync(fullPath, 'utf8');
  return { path: fullPath, content: JSON.parse(content) };
}

function writePackageJson(filePath, data) {
  const fullPath = path.join(process.cwd(), filePath);
  const content = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(fullPath, content, 'utf8');
}

function parseVersion(version) {
  const parts = version.split('.').map(Number);
  return { major: parts[0], minor: parts[1], patch: parts[2] };
}

function incrementVersion(currentVersion, type) {
  const { major, minor, patch } = parseVersion(currentVersion);
  
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Unknown version type: ${type}`);
  }
}

function validateVersion(version) {
  const semverRegex = /^\d+\.\d+\.\d+$/;
  if (!semverRegex.test(version)) {
    throw new Error(`Invalid version format: ${version}. Must be in format X.Y.Z`);
  }
  return version;
}

function updateVersions(newVersion) {
  console.log(`\n📦 Updating version to ${newVersion}...\n`);
  
  const packages = PACKAGE_FILES.map(readPackageJson);
  
  // Check all versions match before updating
  const versions = packages.map(pkg => pkg.content.version);
  const uniqueVersions = [...new Set(versions)];
  
  if (uniqueVersions.length > 1) {
    console.warn('⚠️  Warning: Package versions are not synchronized:');
    packages.forEach((pkg, i) => {
      console.warn(`   ${PACKAGE_FILES[i]}: ${pkg.content.version}`);
    });
    console.warn('\n   All packages will be updated to the new version.\n');
  }
  
  // Update all package.json files
  packages.forEach((pkg, i) => {
    const oldVersion = pkg.content.version;
    pkg.content.version = newVersion;
    writePackageJson(PACKAGE_FILES[i], pkg.content);
    console.log(`✅ Updated ${PACKAGE_FILES[i]}: ${oldVersion} -> ${newVersion}`);
  });
  
  return newVersion;
}

function createGitTag(version, createTag = true) {
  if (!createTag) {
    console.log('\n⏭️  Skipping git tag creation (use --no-tag to suppress this message)');
    return;
  }
  
  const tagName = `v${version}`;
  
  try {
    // Check if we're in a git repository
    execSync('git rev-parse --git-dir', { stdio: 'ignore' });
    
    // Check if tag already exists
    try {
      execSync(`git rev-parse -q --verify "refs/tags/${tagName}"`, { stdio: 'ignore' });
      console.log(`\n⚠️  Tag ${tagName} already exists. Skipping tag creation.`);
      return;
    } catch (e) {
      // Tag doesn't exist, proceed
    }
    
    // Check if there are uncommitted changes
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    if (status.trim()) {
      console.log('\n⚠️  You have uncommitted changes. Commit them before creating a tag.');
      console.log('   Or run: git add . && git commit -m "chore: bump version to ' + version + '"');
      return;
    }
    
    // Create the tag
    execSync(`git tag -a ${tagName} -m "Release ${version}"`, { stdio: 'inherit' });
    console.log(`\n✅ Created git tag: ${tagName}`);
    console.log(`\n📤 To push the tag, run: git push origin ${tagName}`);
  } catch (error) {
    if (error.message.includes('not a git repository')) {
      console.log('\n⚠️  Not a git repository. Skipping tag creation.');
    } else {
      console.error('\n❌ Error creating git tag:', error.message);
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const createTag = !args.includes('--no-tag');
  
  // Read current version from root package.json
  const rootPackage = readPackageJson('package.json');
  const currentVersion = rootPackage.content.version;
  
  let newVersion;
  
  try {
    switch (command) {
      case 'patch':
        newVersion = incrementVersion(currentVersion, 'patch');
        break;
      case 'minor':
        newVersion = incrementVersion(currentVersion, 'minor');
        break;
      case 'major':
        newVersion = incrementVersion(currentVersion, 'major');
        break;
      case 'set':
        const versionArg = args[1];
        if (!versionArg) {
          throw new Error('Version required for "set" command. Usage: npm run version:set -- 1.2.3');
        }
        newVersion = validateVersion(versionArg);
        break;
      default:
        console.error('Usage:');
        console.error('  npm run version:patch   - Bump patch version');
        console.error('  npm run version:minor   - Bump minor version');
        console.error('  npm run version:major   - Bump major version');
        console.error('  npm run version:set -- <version>  - Set specific version');
        console.error('\nOptions:');
        console.error('  --no-tag  - Skip creating git tag');
        process.exit(1);
    }
    
    if (newVersion === currentVersion) {
      console.log(`\n⚠️  Version is already ${currentVersion}`);
      process.exit(0);
    }
    
    updateVersions(newVersion);
    createGitTag(newVersion, createTag);
    
    console.log(`\n✨ Version updated successfully to ${newVersion}!\n`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { updateVersions, incrementVersion, validateVersion };
