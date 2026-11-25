// Sends a notification to the native app on the booted simulator, like the server's push would.
//   npm run ios:push -- /b/bkg_123?t=abc "You’re booked" "Tue 6:30 PM"
// The app must have notifications turned on (Notifications screen > Turn on notifications).
// Tapping it opens the link through the app's router.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NATIVE_APP_ID } from './e2e-ios/xcode'

const [link = '/notifications', title = 'Vamoverse', body = 'Test notification'] = process.argv.slice(2)
const file = join(mkdtempSync(join(tmpdir(), 'vamo-push-')), 'push.apns')
writeFileSync(file, JSON.stringify({ aps: { alert: { title, body }, badge: 1, sound: 'default' }, link }))
try {
  execFileSync('xcrun', ['simctl', 'push', 'booted', NATIVE_APP_ID, file], { stdio: 'inherit' })
  console.log(`✓ Sent "${title}" → ${link}`)
} catch {
  console.error('✗ The simulator refused it. Open the app’s Notifications screen and tap “Turn on notifications” first.')
  process.exit(1)
}
