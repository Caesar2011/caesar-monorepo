/* eslint-disable no-undef */
import fs from 'fs'

// --- Configuration ---
// These values should be kept in sync with your team's conventions.
const ALLOWED_TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'revert']
const ALLOWED_BUMP_TYPES = ['major', 'minor', 'patch']
const COMMIT_REGEX = new RegExp(`^(${ALLOWED_TYPES.join('|')})\\/(${ALLOWED_BUMP_TYPES.join('|')}):\\s(.+)`)

// --- ANSI Colors for better logging ---
const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
}

// --- Main Validation Logic ---
function validateCommitMessage(message) {
  const trimmedMessage = message.trim()

  if (!trimmedMessage) {
    printError('The commit message cannot be empty.')
    return false
  }

  if (trimmedMessage === 'Version Packages' || trimmedMessage.startsWith('Merge')) {
    return true
  }

  const match = COMMIT_REGEX.exec(trimmedMessage)

  if (!match) {
    printError(
      'The commit message does not match the required format.',
      trimmedMessage,
      `Expected format: ${c.cyan}<type>/<level>: <message>${c.reset}`,
    )
    return false
  }

  const [, type, , subject] = match

  // The regex already validates type and level, but we can check again for clarity
  if (!ALLOWED_TYPES.includes(type)) {
    printError(`The <type> '${type}' is invalid.`, trimmedMessage, `The error is at the beginning of the message.`)
    return false
  }

  if (!subject || !subject.trim()) {
    printError(
      'The <message> part of the commit cannot be empty.',
      trimmedMessage,
      `The error occurs after the colon (:).`,
    )
    return false
  }

  return true // All checks passed
}

function printError(reason, message = '', details = '') {
  console.error(`\n${c.red}✖   COMMIT REJECTED   ✖${c.reset}`)
  console.error(`\n${c.yellow}Reason:${c.reset} ${reason}`)

  if (message) {
    console.error(`\n  Your message: "${c.red}${message}${c.reset}"`)
  }
  if (details) {
    console.error(`  ${details}`)
  }

  console.error(`\n${c.yellow}Allowed <type> values:${c.reset}`)
  console.error(`  ${c.cyan}${ALLOWED_TYPES.join(', ')}${c.reset}`)

  console.error(`\n${c.yellow}Allowed <level> values:${c.reset}`)
  console.error(`  ${c.cyan}${ALLOWED_BUMP_TYPES.join(', ')}${c.reset}\n`)
}

// --- Script Entry Point ---
const commitMessageFile = process.argv[2]
if (!commitMessageFile) {
  console.error('Error: Commit message file path not provided.')
  process.exit(1)
}

try {
  const message = fs.readFileSync(commitMessageFile, 'utf-8')
  if (!validateCommitMessage(message)) {
    process.exit(1)
  }
} catch (error) {
  console.error(`Error reading commit message file: ${commitMessageFile}`, error)
  process.exit(1)
}
