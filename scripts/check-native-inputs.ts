// Contract check between the native app and the server: every input VamoKit encodes (samples
// from InputSamplesTests.swift) must pass the command's real zod schema.
//
//   npm run ios:check-inputs
//
// Also runs inside test:ios-native. Inside sandboxed shells set VAMO_XCODE_SANDBOX=off.
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getCommand } from '../src/server/commands/run'
import { swiftTest } from './e2e-ios/xcode'

/** Validates every sample in `dir`; returns failures as "file: message". */
export function validateSamples(dir: string): { checked: number; failures: string[] } {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
  const failures: string[] = []
  for (const file of files) {
    const name = file.split('.').slice(0, 2).join('.')
    const command = getCommand(name)
    if (!command) { failures.push(`${file}: no command named ${name}`); continue }
    const parsed = command.input.safeParse(JSON.parse(readFileSync(join(dir, file), 'utf8')))
    if (!parsed.success) failures.push(`${file}: ${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`)
  }
  return { checked: files.length, failures }
}

/** Encodes the samples with `swift test` and validates them. */
export async function checkNativeInputs(): Promise<{ checked: number; failures: string[] }> {
  const dir = mkdtempSync(join(tmpdir(), 'vamo-inputs-'))
  await swiftTest({ VAMO_INPUT_SAMPLES: dir }, 'InputSamplesTests')
  return validateSamples(dir)
}

if (require.main === module) {
  checkNativeInputs().then(({ checked, failures }) => {
    if (failures.length) {
      console.error(`✗ ${failures.length} of ${checked} native inputs rejected by the server's schemas:\n  ${failures.join('\n  ')}`)
      process.exit(1)
    }
    console.log(`✓ ${checked} native inputs match the server's command schemas`)
    process.exit(0)
  }, (error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
