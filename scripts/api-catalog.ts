// Writes the API contract for the native app to docs/api/ (commands, shared strings, routes),
// plus VamoKit's bundled copy of strings.json.
//   npm run api:catalog
// tests/server/api-catalog.test.ts fails when these files are stale.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { apiDocs } from '../src/server/api-catalog'

const root = resolve(__dirname, '..')
for (const [file, contents] of Object.entries(apiDocs())) {
  mkdirSync(dirname(resolve(root, file)), { recursive: true })
  writeFileSync(resolve(root, file), contents)
  console.log(`wrote ${file}`)
}
