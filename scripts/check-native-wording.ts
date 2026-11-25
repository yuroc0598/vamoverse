// Lists user-visible text on the web pages that doesn't appear anywhere in the native app's
// Swift code: a quick check for wording drift between the two (docs/ios-native-parity.md lists
// the expected, justified differences).
//
//   npm run ios:wording
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(__dirname, '..')

function files(dir: string, keep: (path: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path, keep) : keep(path) ? [path] : []
  })
}

const swift = [join(ROOT, 'ios-native/Vamoverse'), join(ROOT, 'ios-native/VamoKit/Sources/VamoKit')]
  .flatMap((dir) => files(dir, (p) => p.endsWith('.swift')))
  .map((p) => readFileSync(p, 'utf8'))
  .join('\n')

/** Web-only pages and generic UI kit components. */
const SKIP = [/\/admin\//, /\/components\/ui\//, /layout\.tsx$/, /\/dev\/simulate\//, /\/privacy\//, /\/terms\//, /src\/app\/page\.tsx$/, /error\.tsx$/]
const web = [...files(join(ROOT, 'src/app'), (p) => p.endsWith('.tsx')), ...files(join(ROOT, 'src/components'), (p) => p.endsWith('.tsx'))]
  .filter((p) => !SKIP.some((re) => re.test(p)))

let total = 0
for (const file of web.sort()) {
  const source = readFileSync(file, 'utf8')
  const texts = new Set<string>()
  for (const m of source.matchAll(/>\s*([A-Z][^<>{}\n]{3,}?)\s*</g)) texts.add(m[1].trim())
  for (const m of source.matchAll(/(?:label|title|description|placeholder|hint|success)=["']([^"']{4,})["']/g)) texts.add(m[1].trim())
  for (const m of source.matchAll(/(?:success|label|title):\s*'([A-Z][^']{3,})'/g)) texts.add(m[1].trim())
  const missing = [...texts].filter((t) => !swift.includes(t)).sort()
  if (missing.length) {
    total += missing.length
    console.log(`${relative(ROOT, file)}\n  ${missing.map((t) => `“${t}”`).join('\n  ')}`)
  }
}
console.log(total ? `\n${total} web strings not in the app (compare with docs/ios-native-parity.md).` : 'Every web string checked appears in the app.')
