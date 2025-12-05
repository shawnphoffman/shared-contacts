# Critical Build Issue - TanStack Start Compatibility

## Problem

The UI build is failing due to a compatibility issue between `@tanstack/start-config` and `@tanstack/router-generator`.

**Error:**
```
SyntaxError: The requested module '@tanstack/router-generator' does not provide an export named 'CONSTANTS'
```

The `@tanstack/start-config` package (dependency of `@tanstack/start`) is trying to import `CONSTANTS` from `@tanstack/router-generator`, but this export doesn't exist in any available version.

## Attempted Solutions

1. ✅ Updated Node version from 20 to 22 (required by TanStack Start)
2. ✅ Regenerated package-lock.json files
3. ✅ Updated to latest versions of all TanStack packages
4. ✅ Tried pinning to specific version combinations (1.120.20)
5. ❌ All attempts still result in the same CONSTANTS import error

## Current Status

- **Sync Service**: ✅ Builds successfully
- **UI Service**: ❌ Fails to build due to TanStack Start compatibility issue
- **PostgreSQL**: ✅ Uses official image, no build needed
- **Radicale**: ✅ Uses official image, no build needed

## Recommended Solutions

### Option 1: Switch to a Different Framework (Recommended)

Replace TanStack Start with a more stable framework:

**Next.js Alternative:**
- More mature and stable
- Better documentation
- Easier Docker deployment
- Similar React-based architecture

**Remix Alternative:**
- Modern full-stack framework
- Good TypeScript support
- Similar routing concepts

### Option 2: Wait for TanStack Fix

This appears to be a bug in the TanStack Start ecosystem. Monitor:
- https://github.com/TanStack/start/issues
- https://github.com/TanStack/router/issues

### Option 3: Manual Patch

Create a patch file to fix the import issue:
```bash
npm install patch-package --save-dev
# Manually fix the import in node_modules
npx patch-package @tanstack/start-config
```

### Option 4: Use TanStack Router Without Start

Use `@tanstack/react-router` directly without the Start framework, building a custom server setup.

## Immediate Workaround

For now, the application can run with:
- ✅ PostgreSQL database
- ✅ Radicale CardDAV server
- ✅ Sync service
- ❌ UI (blocked by build issue)

The sync service will still work to keep data in sync between Radicale and PostgreSQL, but the web UI won't be available until this is resolved.

## Next Steps

1. Decide on framework alternative (Next.js recommended)
2. Migrate UI code to chosen framework
3. Update Dockerfile accordingly
4. Test and deploy

