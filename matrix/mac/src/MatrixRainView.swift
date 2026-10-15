// The screensaver entry point. macOS loads MatrixRain.saver, reads NSPrincipalClass from its
// Info.plist, and makes one of these views per display (plus a small one for the preview in
// System Settings). It then calls animateOneFrame on a timer until the user comes back.

import AppKit
import ScreenSaver

@objc(MatrixRainView)   // a fixed Objective-C name, so Info.plist can point at it
final class MatrixRainView: ScreenSaverView {
    private var rain: Rain?
    private var last = ProcessInfo.processInfo.systemUptime

    override init?(frame: NSRect, isPreview: Bool) {
        super.init(frame: frame, isPreview: isPreview)
        animationTimeInterval = 1.0 / 30.0
        if !isPreview {
            // Since macOS 14 the screensaver host keeps old instances running after it stops,
            // so each wake would leave another copy animating in the background. Quitting the
            // host when the screensaver stops is the widely used fix; macOS restarts it next time.
            DistributedNotificationCenter.default().addObserver(
                forName: Notification.Name("com.apple.screensaver.willstop"), object: nil, queue: nil
            ) { _ in exit(0) }
        }
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
    }

    override var hasConfigureSheet: Bool { false }
    override var configureSheet: NSWindow? { nil }

    override func startAnimation() {
        super.startAnimation()
        last = ProcessInfo.processInfo.systemUptime
    }

    // Built lazily: the view only knows its screen's pixel density once it's in a window.
    private func currentRain() -> Rain {
        let scale = window?.backingScaleFactor ?? NSScreen.main?.backingScaleFactor ?? 2
        if let rain, rain.width == bounds.width, rain.height == bounds.height, rain.scale == scale { return rain }
        let fresh = Rain(width: bounds.width, height: bounds.height, scale: scale, preview: isPreview)
        rain = fresh
        return fresh
    }

    override func animateOneFrame() {
        let now = ProcessInfo.processInfo.systemUptime
        currentRain().step(min(0.1, now - last))
        last = now
        needsDisplay = true
    }

    override func draw(_ rect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        currentRain().render(in: ctx)
    }
}
