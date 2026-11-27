# Augmented Treality: the iPhone and Android apps

The apps are the web builder in `../augmented-treality` running inside Capacitor 8, plus one native
plugin per platform that shows the tree in AR:

| | AR | Native code |
|---|---|---|
| iPhone / iPad | AR Quick Look (ARKit): plane detection, placement, people occlusion, real size | `ios/App/App/ARViewerPlugin.swift`, registered in `MainViewController.swift` (Main.storyboard points at it) |
| Android | ARCore through SceneView 2.3.0 (Filament): tap the floor to place, turn, move | `android/.../ARViewerPlugin.java` opens `ArViewerActivity.kt` |

The web page calls `Capacitor.Plugins.ARViewer.open({ format, data, title })`: it builds a USDZ on iOS and
a GLB on Android (`js/ar.js` → `openNative`), base64-encoded. The file is in metres, so the tree is its real size.

On the website the same builder uses WebXR on Android Chrome and AR Quick Look on iPhone Safari, so the
apps are optional. They work offline, though, and are what goes in the stores.

## Build

```
npm install
npm run stage        # copy ../augmented-treality into www/, vendor three.js, drop the site nav bar
npx cap sync         # copy www/ into both native projects
```

**Android** (on Windows: Android Studio's JDK and SDK):

```
npm run apk          # → android/app/build/outputs/apk/debug/app-debug.apk
```

or `npm run android` to open it in Android Studio. AR needs a phone with Google Play Services for AR
(ARCore). The app installs on phones without it (`com.google.ar.core` is `optional`) and the builder
still works; the AR screen says what's missing. In the emulator, AR needs the
"Google Play Services for AR" emulator APK from the ARCore SDK releases and the virtual scene camera
(`emulator -avd <name> -camera-back virtualscene`).

**iPhone** (on a Mac with Xcode 16+):

```
npm run ios          # stage, sync, open Xcode
```

In Xcode, pick your team under Signing & Capabilities for the App target, then run on a device. AR
Quick Look needs a real iPhone or iPad with an A9 chip or later; the simulator opens the 3D view only.
The bundle id is `com.vibecodedslopware.augmentedtreality`.

## Icons and splash screens

`node augmented-treality/tools/icons.mjs` (from the repo root, with `npm run dev` on port 3191 or pass the
base URL) renders the real tree and writes the web icons, the Android mipmaps and splash drawables, and the
iOS AppIcon and Splash sets.

## Store release, not done yet

- Android: a release keystore and `assembleRelease` / `bundleRelease` signing config, then the Play Console listing.
- iOS: an Apple Developer team, archive in Xcode, App Store Connect listing. `NSCameraUsageDescription` is already in Info.plist.
