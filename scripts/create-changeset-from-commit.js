/* eslint-disable no-undef */
import { execSync } from 'child_process'
import path from 'path'

import { getChangedPackagesSinceRef } from '@changesets/git'
import writeChangeset from '@changesets/write'

// --- ANSI Colors for better logging ---
const c = { reset: '\x1b[0m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m' }

async function main() {
  if (process.env.IS_AMENDING_FOR_CHANGESET) {
    process.exit(0)
  }

  // 1. Get the last commit message
  const lastCommitMessage = execSync('git log -1 --pretty=%B').toString().trim()

  // 2. Parse the message to see if it's one we care about
  const match = lastCommitMessage.match(/^(\w+)\/(major|minor|patch):\s(.*)$/)

  // If the message doesn't match our format, do nothing.
  // This is important for merges, reverts, etc.
  if (!match) {
    console.log(
      `${c.yellow}Note:${c.reset} Commit message does not match changeset format. Skipping changeset creation.`,
    )
    return
  }

  const [, , bumpType, summary] = match

  console.log('✓ Commit message matches format. Creating changeset...')

  // 3. Find packages changed IN THE LAST COMMIT
  const cwd = process.cwd()
  // We compare HEAD to the commit before it (HEAD~1)
  console.log(`✓ Changeset added and commit amended successfully.`)
  const changedPackages = await getChangedPackagesSinceRef({ cwd, ref: 'HEAD~1' })
  console.log('Changed packages: ', changedPackages)

  const changedPackageNames = changedPackages
    .filter((pkg) => !pkg.packageJson.private)
    .map((pkg) => pkg.packageJson.name)

  if (changedPackageNames.length === 0) {
    console.log(`${c.yellow}No changed packages found in the last commit. Skipping changeset.${c.reset}`)
    return
  }

  // 4. Create and write the changeset file
  const changeset = {
    summary,
    releases: changedPackageNames.map((name) => ({ name, type: bumpType })),
  }
  const changesetId = await writeChangeset(changeset, cwd)
  const changesetPath = path.join(cwd, '.changeset', changesetId + '.md')

  // 5. Add the new changeset file to staging
  execSync(`git add ${changesetPath}`)

  // 6. Amend the previous commit to include the new file
  // --no-edit prevents the editor from opening
  // This is the magic that adds the file to the commit you just made
  execSync('git commit --amend --no-edit --no-verify', {
    env: {
      ...process.env,
      IS_AMENDING_FOR_CHANGESET: '1',
    },
    stdio: 'ignore',
  })

  console.log(`✓ Changeset added and commit amended successfully.`)
}

main().catch((err) => {
  console.error(`${c.red}Error during post-commit hook:${c.reset}`, err)
  // Don't exit(1) in post-commit, as the initial commit has already been made.
})
