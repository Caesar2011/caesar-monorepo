/* eslint-disable no-undef */
/**
 * This script is a temporary solution for a common issue with monorepos, `changeset`, and `yarn workspaces`.
 * When publishing packages, workspace-protocol dependencies (e.g., "workspace:*") in `package.json`
 * files need to be replaced with the specific version number being published. While `changeset`
 * attempts to do this, this script provides an explicit override to ensure correctness.
 *
 * It's designed to be run AFTER `changeset version` and BEFORE `changeset publish`.
 *
 * --- How it works ---
 * 1.  It uses `yarn workspaces list` to get all packages in the monorepo.
 * 2.  For each package, it reads its `package.json` to find its current version.
 *     (This is why it must run after `changeset version` has bumped the versions).
 * 3.  It builds a map of all workspace package names to their new versions (e.g., `{ "@sebse-tools/shared": "1.1.1" }`).
 * 4.  It then re-iterates through each package's `package.json`.
 * 5.  It inspects `dependencies`, `devDependencies`, and `peerDependencies`.
 * 6.  If it finds a dependency that is another package in the workspace, it overwrites
 *     its version with the exact version from the map created in step 3.
 * 7.  The updated `package.json` content is written back to the file.
 *
 * --- CI/Workflow Integration ---
 * In a CI pipeline (like GitHub Actions), this script would be part of the publishing command.
 * For example, you could add the following scripts to your root `package.json`:
 *
 * "scripts": {
 *   ...
 *   "cs:prepare-publish": "node scripts/update-workspace-versions.js",
 *   "cs:publish": "yarn cs:prepare-publish && changeset publish"
 * }
 *
 * The `changesets/action` would then use `publish: yarn cs:publish`.
 *
 * The file modifications are temporary for the publish process. In a CI environment,
 * they are discarded when the runner is destroyed. For local publishing, you might
 * want to revert the changes afterwards using `git checkout -- "packages/_**_/package.json"`.
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'

console.log('🔄 Updating workspace dependency versions for publishing...')

const wsOutput = execSync('yarn workspaces list --json', {
  encoding: 'utf-8',
})

// We will only try to update dependencies in these package file types
const DEP_TYPES_TO_UPDATE = ['dependencies', 'devDependencies', 'peerDependencies']

// Used to look up the current package.json version at a location
const getPackageFile = (location) => JSON.parse(readFileSync(`${location}/package.json`, 'utf-8'))

// Object map of entries to make version replacement easier when we publish
const workspaceVersionMap = Object.fromEntries(
  wsOutput
    // Create an array from the command response
    .split('\n')
    // Filter out any empty strings (last newline from split)
    .filter((string) => Boolean(string))
    // Parse JSON strings
    .map((string) => JSON.parse(string))
    // Create [key, value] and lookup version
    .map(({ location, name }) => [name, { location, version: getPackageFile(location).version }]),
)

console.log('Found workspace packages and their versions:', workspaceVersionMap)

// Go replace versions in each package.json file
for (const pkgName in workspaceVersionMap) {
  const { location } = workspaceVersionMap[pkgName]
  const packageFile = getPackageFile(location)
  let updated = false

  const mutateDeps = (depType) => {
    if (!packageFile[depType]) {
      return
    }

    for (const dep in packageFile[depType]) {
      // if a dependency is one of our workspace packages
      if (workspaceVersionMap[dep]) {
        const newVersion = workspaceVersionMap[dep].version
        if (packageFile[depType][dep] !== newVersion) {
          packageFile[depType][dep] = newVersion
          updated = true
        }
      }
    }
  }

  DEP_TYPES_TO_UPDATE.forEach(mutateDeps)

  if (updated) {
    console.log(`  Writing updated package.json for ${packageFile.name}`)
    writeFileSync(`${location}/package.json`, `${JSON.stringify(packageFile, undefined, 2)}\n`, 'utf-8')
  }
}

console.log('✅ Workspace versions in package.json files are ready for publishing.')
