// The Matrix rain itself: a grid of glyphs, falling "drops" that light them up, and a renderer.
// Same simulation as the web and Windows versions. Every glyph is drawn once per brightness
// level into a small image, so a frame is just a few thousand image copies.

import CoreGraphics
import CoreText
import Foundation

final class Rain {
    static let levels = 28   // trail brightness steps; `levels` itself is the white-hot head

    private static let stops: [(t: CGFloat, r: CGFloat, g: CGFloat, b: CGFloat)] = [
        (0, 0, 12, 3), (0.2, 0, 72, 20), (0.5, 0, 165, 44), (0.8, 0, 255, 65), (1, 160, 255, 180),
    ]

    // Half-width katakana (mirrored, like the film), digits, a few symbols.
    private static let glyphs: [(text: String, mirrored: Bool)] = {
        var list: [(text: String, mirrored: Bool)] = []
        for code in 0xFF71...0xFF9D { list.append((String(Character(UnicodeScalar(code)!)), true)) }
        for ch in "ｦｰ" { list.append((String(ch), true)) }
        for ch in "0123456789Z:.\"=*+-<>|¦" { list.append((String(ch), false)) }
        return list
    }()

    private struct Drop {
        var col: Int, y: Double, last: Int, speed: Double, length: Int, gain: Double
    }

    let width: CGFloat, height: CGFloat, scale: CGFloat   // points, and pixels per point
    private let cw: CGFloat, ch: CGFloat                  // cell size in points
    private let cols: Int, rows: Int
    private var grid: [UInt8]
    private var drops: [Drop] = []
    private var sprites: [[CGImage]] = []                 // [glyph][level]
    private var glow: CGImage?

    init(width: CGFloat, height: CGFloat, scale: CGFloat, preview: Bool) {
        self.width = width; self.height = height; self.scale = scale
        let font = max(preview ? 7 : 14, min(24, (height / 60).rounded()))
        cw = (font * 0.64).rounded(); ch = (font * 1.1).rounded()
        cols = max(1, Int((width / cw).rounded(.up))); rows = max(1, Int((height / ch).rounded(.up)))
        let n = UInt8(Rain.glyphs.count)
        grid = (0..<(cols * rows)).map { _ in UInt8.random(in: 0..<n) }
        sprites = Rain.makeSprites(fontSize: font, cw: cw, ch: ch, scale: scale)
        glow = Rain.makeGlow(radius: ch * 1.4, scale: scale)
        for c in 0..<cols {
            drops.append(newDrop(c, -Double.random(in: 0..<1) * Double(rows) * 1.2))
            drops.append(newDrop(c, -Double(rows) * 1.5 - Double.random(in: 0..<1) * Double(rows) * 3))
        }
        for _ in 0..<150 { step(1.0 / 30) }   // start mid-storm, not with an empty sky
    }

    private func newDrop(_ col: Int, _ y: Double) -> Drop {
        Drop(col: col, y: y, last: Int(y.rounded(.down)),
             speed: 6 + Double.random(in: 0..<12),
             length: 10 + Int.random(in: 0..<22),
             gain: Double.random(in: 0..<1) < 0.3 ? 0.4 + Double.random(in: 0..<0.3) : 0.75 + Double.random(in: 0..<0.25))
    }

    func step(_ dt: Double) {
        let n = UInt8(Rain.glyphs.count)
        for i in drops.indices {
            drops[i].y += drops[i].speed * dt
            let head = Int(drops[i].y.rounded(.down))
            if head > drops[i].last {   // the head reveals a fresh glyph in each row it enters
                for r in (drops[i].last + 1)...head where r >= 0 && r < rows {
                    grid[drops[i].col * rows + r] = UInt8.random(in: 0..<n)
                }
                drops[i].last = head
            }
            if head - drops[i].length > rows {
                drops[i] = newDrop(drops[i].col, -Double.random(in: 0..<1) * Double(rows) * 2 - 2)
            }
        }
        for _ in 0..<((grid.count * 3 + 999) / 1000) {   // shimmer
            grid[Int.random(in: 0..<grid.count)] = UInt8.random(in: 0..<n)
        }
    }

    // Draws one frame. `ctx` uses AppKit's usual coordinates: points, origin at the bottom left.
    func render(in ctx: CGContext) {
        ctx.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1))
        ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
        ctx.interpolationQuality = .none
        if let glow {
            let radius = ch * 1.4
            for d in drops where d.gain >= 0.7 {
                let h = Int(d.y.rounded(.down))
                guard h >= 0, h < rows else { continue }
                ctx.setAlpha(d.gain)
                ctx.draw(glow, in: CGRect(x: (CGFloat(d.col) + 0.5) * cw - radius, y: height - (CGFloat(h) + 0.5) * ch - radius,
                                          width: radius * 2, height: radius * 2))
            }
            ctx.setAlpha(1)
        }
        for d in drops {
            let h = Int(d.y.rounded(.down)), base = d.col * rows, x = CGFloat(d.col) * cw
            for k in 0..<d.length {
                let r = h - k
                if r < 0 { break }
                if r >= rows { continue }
                let level: Int
                if k == 0 {
                    level = d.gain > 0.7 ? Rain.levels : Rain.levels - 2
                } else {
                    level = Int((pow(1 - Double(k) / Double(d.length), 1.4) * d.gain * Double(Rain.levels - 1)).rounded())
                    if level < 1 { continue }
                }
                ctx.draw(sprites[Int(grid[base + r])][level], in: CGRect(x: x, y: height - CGFloat(r + 1) * ch, width: cw, height: ch))
            }
        }
    }

    // MARK: - pre-rendering

    private static func color(_ level: Int) -> (CGFloat, CGFloat, CGFloat) {
        if level == levels { return (225, 255, 235) }
        let t = CGFloat(level) / CGFloat(levels - 1)
        var i = 1
        while i < stops.count - 1 && stops[i].t < t { i += 1 }
        let a = stops[i - 1], b = stops[i]
        let k = max(0, min(1, (t - a.t) / (b.t - a.t)))
        return (a.r + (b.r - a.r) * k, a.g + (b.g - a.g) * k, a.b + (b.b - a.b) * k)
    }

    private static func makeSprites(fontSize: CGFloat, cw: CGFloat, ch: CGFloat, scale: CGFloat) -> [[CGImage]] {
        let pw = max(1, Int(cw * scale)), ph = max(1, Int(ch * scale))
        let full = CGRect(x: 0, y: 0, width: pw, height: ph)
        let gray = CGColorSpaceCreateDeviceGray()
        let rgb = CGColorSpace(name: CGColorSpace.sRGB)!
        let font = CTFontCreateWithName("HiraginoSans-W3" as CFString, fontSize * scale, nil)
        let white = CGColor(gray: 1, alpha: 1)
        return glyphs.map { glyph in
            // 1. The glyph's shape, white on black, its ink centred in the cell.
            let m = CGContext(data: nil, width: pw, height: ph, bitsPerComponent: 8, bytesPerRow: 0,
                              space: gray, bitmapInfo: CGImageAlphaInfo.none.rawValue)!
            m.setFillColor(gray: 0, alpha: 1)
            m.fill(full)
            let text = NSAttributedString(string: glyph.text, attributes: [
                NSAttributedString.Key(kCTFontAttributeName as String): font,
                NSAttributedString.Key(kCTForegroundColorAttributeName as String): white,
            ])
            let line = CTLineCreateWithAttributedString(text)
            let ink = CTLineGetBoundsWithOptions(line, .useGlyphPathBounds)
            m.translateBy(x: CGFloat(pw) / 2, y: CGFloat(ph) / 2)
            if glyph.mirrored { m.scaleBy(x: -1, y: 1) }
            m.textMatrix = .identity
            m.textPosition = CGPoint(x: -ink.midX, y: -ink.midY)
            CTLineDraw(line, m)
            let mask = m.makeImage()!
            // 2. That shape filled with each brightness level's colour, transparent around it.
            return (0...levels).map { level in
                let (r, g, b) = color(level)
                let c = CGContext(data: nil, width: pw, height: ph, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: rgb, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
                c.clip(to: full, mask: mask)
                c.setFillColor(red: r / 255, green: g / 255, blue: b / 255, alpha: 1)
                c.fill(full)
                return c.makeImage()!
            }
        }
    }

    // A soft green halo drawn under each bright head: a square exactly as wide as the gradient,
    // so it fades to nothing before the edges.
    private static func makeGlow(radius: CGFloat, scale: CGFloat) -> CGImage? {
        let pw = max(1, Int(radius * 2 * scale)), ph = pw
        let rgb = CGColorSpace(name: CGColorSpace.sRGB)!
        let colors = [CGColor(srgbRed: 120 / 255, green: 1, blue: 160 / 255, alpha: 0.4),
                      CGColor(srgbRed: 0, green: 1, blue: 65 / 255, alpha: 0)] as CFArray
        guard let c = CGContext(data: nil, width: pw, height: ph, bitsPerComponent: 8, bytesPerRow: 0,
                                space: rgb, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
              let gradient = CGGradient(colorsSpace: rgb, colors: colors, locations: [0, 1]) else { return nil }
        let center = CGPoint(x: CGFloat(pw) / 2, y: CGFloat(ph) / 2)
        c.drawRadialGradient(gradient, startCenter: center, startRadius: 0, endCenter: center,
                             endRadius: radius * scale, options: [])
        return c.makeImage()
    }
}
