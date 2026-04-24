import { execSync } from 'child_process'

import { getChangedPackagesSinceRef } from '@changesets/git'
import { type Package } from '@manypkg/get-packages'

// --- ANSI Colors for better logging ---
const c = { reset: '\x1b[0m', yellow: '\x1b[33m', cyan: '\x1b[36m', red: '\x1b[31m' }

async function main() {
  const commandToRun = process.argv[2]
  const manualFlag = process.argv[3]
  const isManual = manualFlag === '--manual'

  if (!commandToRun) {
    console.error(`${c.red}Error: No yarn script command provided to run-on-changed.ts.${c.reset}`)
    console.error(`Usage: node scripts/run-on-changed.ts <command> [--manual]`)
    process.exit(1)
  }

  console.log(`${c.cyan}Running '${commandToRun}' for changed packages...${c.reset}`)

  const cwd = process.cwd()
  // Compare against HEAD to get staged changes
  const changedPackages = await getChangedPackagesSinceRef({ cwd, ref: 'HEAD' })

  const publicChangedPackages: Package[] = changedPackages.filter((pkg) => !pkg.packageJson.private)

  if (publicChangedPackages.length === 0) {
    console.log(`${c.yellow}No changed packages to process. Skipping.${c.reset}`)
    process.exit(0)
  }

  const changedPackageNames = publicChangedPackages.map((pkg) => pkg.packageJson.name)
  console.log('Found changes in:', changedPackageNames.join(', '))

  if (isManual) {
    console.log(`${c.yellow}Running in --manual mode.${c.reset}`)
    try {
      for (const pkg of publicChangedPackages) {
        const command = `yarn run ${commandToRun}`
        console.log(`\nExecuting in ${pkg.packageJson.name}: ${c.cyan}${command}${c.reset}`)
        // Execute command from the package's directory
        execSync(command, { cwd: pkg.dir, stdio: 'inherit' })
      }
      console.log(`\n${c.cyan}✓ Command '${commandToRun}' succeeded for all changed packages.${c.reset}`)
    } catch {
      console.error(`\n${c.red}✖ Command '${commandToRun}' failed in manual mode. Commit aborted.${c.reset}`)
      process.exit(1)
    }
  } else {
    // Construct the yarn command with --include flags for each changed package
    const includeFlags = changedPackageNames.map((name) => `--include ${name}`).join(' ')
    const command = `yarn workspaces foreach -A -p -t ${includeFlags} run ${commandToRun}`
    console.log(`Executing: ${c.cyan}${command}${c.reset}\n`)

    try {
      // Execute the command and inherit stdio to see output in real-time
      execSync(command, { stdio: 'inherit' })
      console.log(`\n${c.cyan}✓ Command '${commandToRun}' succeeded for all changed packages.${c.reset}`)
    } catch {
      console.error(`\n${c.red}✖ Command '${commandToRun}' failed. Commit aborted.${c.reset}`)
      // The error from execSync is enough, but we exit with 1 to be sure
      process.exit(1)
    }
  }
}

main().catch((err) => {
  console.error(`${c.red}Error during pre-commit script:${c.reset}`, err)
  process.exit(1)
})
