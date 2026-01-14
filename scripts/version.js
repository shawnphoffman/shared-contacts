#!/usr/bin/env node

/**
 * Version management script for shared-contacts
 * Updates version in all package.json files, commits changes, and creates a git tag
 *
 * Usage:
 *   npm run version:patch   - Bump patch version (1.0.0 -> 1.0.1)
 *   npm run version:minor   - Bump minor version (1.0.0 -> 1.1.0)
 *   npm run version:major   - Bump major version (1.0.0 -> 2.0.0)
 *   npm run version:set -- 1.2.3  - Set specific version
 *
 * Options:
 *   --no-tag  - Skip git commit and tag creation
 *   --force   - Proceed even with other uncommitted changes
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const PACKAGE_FILES = ['package.json', 'sync-service/package.json']

function readPackageJson(filePath) {
	const fullPath = path.join(process.cwd(), filePath)
	const content = fs.readFileSync(fullPath, 'utf8')
	return { path: fullPath, content: JSON.parse(content) }
}

function writePackageJson(filePath, data) {
	const fullPath = path.join(process.cwd(), filePath)
	const content = JSON.stringify(data, null, 2) + '\n'
	fs.writeFileSync(fullPath, content, 'utf8')
}

function parseVersion(version) {
	const parts = version.split('.').map(Number)
	return { major: parts[0], minor: parts[1], patch: parts[2] }
}

function incrementVersion(currentVersion, type) {
	const { major, minor, patch } = parseVersion(currentVersion)

	switch (type) {
		case 'major':
			return `${major + 1}.0.0`
		case 'minor':
			return `${major}.${minor + 1}.0`
		case 'patch':
			return `${major}.${minor}.${patch + 1}`
		default:
			throw new Error(`Unknown version type: ${type}`)
	}
}

function validateVersion(version) {
	const semverRegex = /^\d+\.\d+\.\d+$/
	if (!semverRegex.test(version)) {
		throw new Error(`Invalid version format: ${version}. Must be in format X.Y.Z`)
	}
	return version
}

function updateVersions(newVersion) {
	console.log(`\n📦 Updating version to ${newVersion}...\n`)

	const packages = PACKAGE_FILES.map(readPackageJson)

	// Check all versions match before updating
	const versions = packages.map(pkg => pkg.content.version)
	const uniqueVersions = [...new Set(versions)]

	if (uniqueVersions.length > 1) {
		console.warn('⚠️  Warning: Package versions are not synchronized:')
		packages.forEach((pkg, i) => {
			console.warn(`   ${PACKAGE_FILES[i]}: ${pkg.content.version}`)
		})
		console.warn('\n   All packages will be updated to the new version.\n')
	}

	// Update all package.json files
	packages.forEach((pkg, i) => {
		const oldVersion = pkg.content.version
		pkg.content.version = newVersion
		writePackageJson(PACKAGE_FILES[i], pkg.content)
		console.log(`✅ Updated ${PACKAGE_FILES[i]}: ${oldVersion} -> ${newVersion}`)
	})

	return newVersion
}

function checkGitStatus() {
	let gitAvailable = true
	let hasOtherUncommittedChanges = false
	let otherChanges = ''

	try {
		execSync('git --version', { stdio: 'ignore' })
	} catch {
		gitAvailable = false
		return { gitAvailable, hasOtherUncommittedChanges, otherChanges }
	}

	try {
		const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' }).trim()

		if (gitStatus) {
			// Filter out package.json files that will be updated by this script
			const lines = gitStatus.split('\n').filter(line => line.trim())
			const otherLines = lines.filter(line => {
				const file = line.substring(3).trim()
				return !PACKAGE_FILES.includes(file) && file !== 'package-lock.json'
			})
			hasOtherUncommittedChanges = otherLines.length > 0
			otherChanges = otherLines.join('\n')
		}
	} catch {
		// Not a git repo or other error
		gitAvailable = false
	}

	return { gitAvailable, hasOtherUncommittedChanges, otherChanges }
}

function commitAndTag(version, gitStatus, createTag = true, force = false) {
	if (!createTag) {
		console.log('\n⏭️  Skipping git operations (--no-tag flag)')
		return
	}

	const { gitAvailable, hasOtherUncommittedChanges, otherChanges } = gitStatus

	if (!gitAvailable) {
		console.log('\n⚠️  Not a git repository. Skipping git operations.')
		return
	}

	if (hasOtherUncommittedChanges && !force) {
		console.log('\n⚠️  Warning: You have uncommitted changes in other files:')
		console.log(otherChanges)
		console.log('\nOptions:')
		console.log('1. Commit or stash your changes first, then run this script again')
		console.log('2. Use --force flag to proceed anyway (will commit only package.json files)')
		console.log('3. Use --no-tag flag to update files only (no git commit/tag)')
		console.error('\n❌ Aborting. Please commit or stash your changes first.')
		process.exit(1)
	}

	if (hasOtherUncommittedChanges && force) {
		console.log('\n⚠️  Proceeding with --force flag (will commit only package.json files)...')
	}

	const tagName = `v${version}`

	try {
		// Check if tag already exists
		try {
			execSync(`git rev-parse -q --verify "refs/tags/${tagName}"`, { stdio: 'ignore' })
			console.log(`\n⚠️  Tag ${tagName} already exists. Skipping tag creation.`)
			return
		} catch (e) {
			// Tag doesn't exist, proceed
		}

		// Stage package.json files
		const filesToStage = PACKAGE_FILES.join(' ')
		execSync(`git add ${filesToStage}`, { stdio: 'inherit' })

		// Create commit
		const commitMessage = `chore: bump version to ${version}`
		execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' })
		console.log(`✅ Created git commit: ${commitMessage}`)

		// Create tag
		execSync(`git tag -a ${tagName} -m "Version ${version}"`, { stdio: 'inherit' })
		console.log(`✅ Created git tag: ${tagName}`)

		console.log(`\n📤 To push to remote:`)
		console.log(`  git push && git push --tags`)
	} catch (error) {
		console.error('\n❌ Error during git operations:', error.message)
		console.log('\nVersion was updated in package.json files, but git operations failed.')
		process.exit(1)
	}
}

function main() {
	const args = process.argv.slice(2)
	const command = args[0]
	const createTag = !args.includes('--no-tag')
	const force = args.includes('--force')

	// Read current version from root package.json
	const rootPackage = readPackageJson('package.json')
	const currentVersion = rootPackage.content.version

	let newVersion

	try {
		switch (command) {
			case 'patch':
				newVersion = incrementVersion(currentVersion, 'patch')
				break
			case 'minor':
				newVersion = incrementVersion(currentVersion, 'minor')
				break
			case 'major':
				newVersion = incrementVersion(currentVersion, 'major')
				break
			case 'set':
				const versionArg = args[1]
				if (!versionArg) {
					throw new Error('Version required for "set" command. Usage: npm run version:set -- 1.2.3')
				}
				newVersion = validateVersion(versionArg)
				break
			default:
				console.error('Usage:')
				console.error('  npm run version:patch   - Bump patch version')
				console.error('  npm run version:minor   - Bump minor version')
				console.error('  npm run version:major   - Bump major version')
				console.error('  npm run version:set -- <version>  - Set specific version')
				console.error('\nOptions:')
				console.error('  --no-tag  - Skip creating git commit/tag')
				console.error('  --force   - Proceed even with other uncommitted changes')
				process.exit(1)
		}

		if (newVersion === currentVersion) {
			console.log(`\n⚠️  Version is already ${currentVersion}`)
			process.exit(0)
		}

		console.log(`Current version: ${currentVersion}`)
		console.log(`New version: ${newVersion}`)

		// Check git status BEFORE updating files
		const gitStatus = checkGitStatus()

		// Update versions
		updateVersions(newVersion)

		// Commit and tag (using the git status from before updates)
		commitAndTag(newVersion, gitStatus, createTag, force)

		if (createTag) {
			console.log(`\n🎉 Version ${newVersion} released!`)
		} else {
			console.log(`\n✨ Version updated successfully to ${newVersion}!`)
		}
	} catch (error) {
		console.error('\n❌ Error:', error.message)
		process.exit(1)
	}
}

if (require.main === module) {
	main()
}

module.exports = { updateVersions, incrementVersion, validateVersion }
