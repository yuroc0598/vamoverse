# iOS Build Guide - Real iPhone Testing

Build Vamoverse as native iOS app using Capacitor. Requires Mac + Xcode + iPhone + cable.

## Requirements

- **Mac** with Xcode installed (App Store, ~12GB)
- **iPhone** with iOS 16+ and Developer Mode enabled
- **Apple ID** - free works for 7-day sideload (paid $99/yr for TestFlight/distribution)
- **Cable** - Lightning/USB-C to Mac
- Node 20+, npm
- Mac and iPhone on same WiFi for livereload

## 1. Enable Developer Mode on iPhone

1. iPhone → Settings → Privacy & Security → Developer Mode → ON → Reboot
2. After reboot, confirm Developer Mode
3. Connect iPhone to Mac via cable → Trust this computer on iPhone

## 2. Setup Project (first time only)

```bash
cd /Users/yuroc/repos/swe-bench-yuroc/vamoverse

# Install deps (includes Capacitor)
env -u npm_config_registry npm install

# Init Capacitor (already done in repo, but if starting fresh)
npm run ios:init   # creates capacitor.config.ts
npm run ios:add    # adds ios/ folder with Xcode project
```

This creates `ios/App/` Xcode project.

## 3. Build & Run on Real iPhone (Recommended: Live Reload)

**Why livereload?** Vamoverse uses Next.js dynamic routes (`/events/[id]`) which require `generateStaticParams()` for static export (`output: export`). Live reload avoids this by running dev server on Mac and iOS app loads from it - perfect for real device testing.

```bash
# Get your Mac IP
ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}'

# Edit capacitor.config.ts - uncomment server.url and set to your IP:
# server: { url: 'http://192.168.1.XX:3000', cleartext: true }

# Start dev server
npm run dev &
# In another terminal, run iOS with livereload
npm run ios:livereload
# Or manually:
# npx cap run ios --external --livereload --host=YOUR_IP
```

Alternatively, build without static export and sync:

```bash
# Regular Next.js build (server mode, not static)
npm run ios:build

# Sync to iOS
npm run ios:sync
```

For full static export (requires adding `generateStaticParams()` to dynamic routes):
```bash
npm run ios:build:static  # CAPACITOR_EXPORT=true next build → out/
npm run ios:sync
```
Note: `out/` static export will fail until you add `generateStaticParams()` to `app/(dashboard)/events/[id]/page.tsx` and other dynamic routes.

## 4. Open in Xcode

```bash
npm run ios:open
```

Xcode opens `ios/App/App.xcworkspace` (use .xcworkspace not .xcodeproj).

## 5. Configure Signing in Xcode

1. In Xcode left sidebar, select **App** project (blue icon)
2. Select **App** target → **Signing & Capabilities**
3. Team → Add Account → Sign in with your Apple ID (Xcode → Settings → Accounts → +)
4. Select your Personal Team
5. Bundle Identifier: `com.vamoverse.app` - must be unique, change to `com.yourname.vamoverse` if taken
6. Xcode will auto-create provisioning profile. If error "Failed to create provisioning profile", change bundle ID.

**Free account limits:** 7-day cert expiry (re-run), 3 apps max, no TestFlight. Paid dev account removes limits.

## 6. Run on Real iPhone

1. Top bar in Xcode → Select your iPhone as destination (not simulator)
2. If iPhone shows "Developer Mode required", enable in Settings and reboot
3. Product → Run (Cmd+R)
4. First run: iPhone → Settings → General → VPN & Device Management → Apple Development → Trust
5. App launches on iPhone

## 7. Live Reload (Optional Dev Mode)

For fast iteration without rebuilding:

```bash
# Get your Mac IP
ifconfig | grep "inet " | grep -v 127.0.0.1

# Edit capacitor.config.ts server.url to http://YOUR_IP:3000
# Then:
npm run dev -p 3000 &
npx cap run ios --external --livereload --host=YOUR_IP
```

This runs web server on Mac and iOS app loads it - changes reflect instantly.

## 8. Troubleshooting

**"Untrusted Developer":** iPhone Settings → General → VPN & Device Management → Trust your Apple ID

**"Developer Mode required":** Settings → Privacy & Security → Developer Mode ON → Reboot

**"Failed to create provisioning profile":** Bundle ID taken - change to unique like `com.yuroc.vamoverse`

**"No Team":** Xcode → Settings → Accounts → Add Apple ID

**Build error "output: export not compatible with serverActions":** Our `next.config.js` handles this via `CAPACITOR=true` env - we set `output: export` only when Capacitor builds. If you see this, ensure you run `npm run ios:build` not `npm run build`

**White screen on launch:** Check `out/` exists and `capacitor.config.ts` webDir is `out`. Run `npm run ios:build && npm run ios:sync` again.

**API calls fail in iOS app:** Static export has no server - app uses mock mode (localStorage). Ensure `.env` has mock Supabase URLs, not real. For real backend, keep `server.url` in capacitor.config.ts pointing to deployed backend.

**Node modules permission error (Operation not permitted):** On this Mac, `/tmp` builds fail with xattr permission - build from repo dir, not `/tmp`

## 9. Production Build (Paid Account)

```bash
# Archive for TestFlight/App Store
# In Xcode: Product → Archive
# Then Window → Organizer → Distribute App → TestFlight
```

## 10. Quick Commands Reference

```bash
npm run ios:build   # Build static web to out/
npm run ios:sync    # Copy out/ to ios/App/public
npm run ios:open    # Open Xcode
npm run ios:dev     # Build + sync + open (all in one)
npm run ios:run     # Run with livereload (needs IP in config)
```

## Architecture Note

iOS app is thin Capacitor wrapper around static Next.js export:
- No server in iOS - uses mock mode (localStorage) by default
- For real backend, set `server.url` to your deployed Vercel URL in `capacitor.config.ts`
- Payments mock, Supabase mock, Vamos mock all work offline in iOS
- Camera, push notifications, geolocation can be added via Capacitor plugins later
