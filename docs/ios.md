# iOS build guide (Capacitor wrapper, disabled)

> The native SwiftUI app (`ios-native/`) replaces this wrapper. Its commands are off by default;
> run them with `IOS_WRAPPER_DISABLED=false`. See `docs/ios-native-spec.md` §11.

Vamoverse uses Capacitor as a hosted HTTPS shell. The production Next.js application and its authenticated API routes are deployed together; they are not misrepresented as an offline static export.

## Requirements

- Node 20.9 or newer
- Xcode and CocoaPods
- An Apple signing team
- A deployed HTTPS Vamoverse origin

## Release build

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run ios:sync
npm run ios:open
```

`ios:sync` performs a production Next build and then runs Capacitor with:

```text
CAPACITOR_SERVER_URL=https://vamoverse.app
```

Override that origin for staging or another deployment:

```bash
CAPACITOR_SERVER_URL=https://staging.vamoverse.example npm run ios:sync
```

Release configuration rejects cleartext `http://` server URLs. `mobile-shell/index.html` is only the offline error fallback; application pages and APIs come from the HTTPS deployment.

Open `ios/App/App.xcworkspace`, choose the App target, configure Signing & Capabilities, select a physical device, and run or archive.

## Local device development

Connect and unlock an iPhone with Developer Mode enabled, start the Next development server, and use:

```bash
npm run ios:go
```

The helper detects the Mac LAN address and passes a temporary `CAPACITOR_DEV_URL` to Capacitor. It does not write a developer IP into tracked release configuration.

Useful commands:

```bash
npm run ios:ip
npm run ios:device
npm run ios:logs
npm run ios:open
```

Local cleartext networking is limited to the iOS local-network transport exception. Global arbitrary transport loads are disabled.

## Release checks

- Test the deployed HTTPS origin before archiving.
- Confirm the generated native config contains the intended HTTPS server URL.
- Test login, event registration, payments, and Vamos on a device away from the developer LAN.
- Never archive with a local `CAPACITOR_DEV_URL`.
