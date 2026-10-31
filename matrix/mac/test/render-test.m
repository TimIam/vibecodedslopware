// Loads MatrixRain.saver the way macOS does (NSBundle -> NSPrincipalClass -> initWithFrame:isPreview:),
// runs it for a moment, and saves what it drew as PNGs. Also times a Retina-sized frame.
//   test/run.sh
#import <AppKit/AppKit.h>
#import <ScreenSaver/ScreenSaver.h>

static void shoot(Class cls, CGFloat w, CGFloat h, BOOL preview, NSString *out) {
    ScreenSaverView *v = [[cls alloc] initWithFrame:NSMakeRect(0, 0, w, h) isPreview:preview];
    if (!v) { fprintf(stderr, "initWithFrame:isPreview: returned nil\n"); exit(1); }
    NSBitmapImageRep *rep = [[NSBitmapImageRep alloc] initWithBitmapDataPlanes:NULL
        pixelsWide:(NSInteger)(w * 2) pixelsHigh:(NSInteger)(h * 2) bitsPerSample:8 samplesPerPixel:4
        hasAlpha:YES isPlanar:NO colorSpaceName:NSDeviceRGBColorSpace bytesPerRow:0 bitsPerPixel:0];
    rep.size = NSMakeSize(w, h);   // 2 pixels per point, like a Retina screen
    [v startAnimation];
    for (int i = 0; i < 45; i++) { [v animateOneFrame]; usleep(33000); }
    [v cacheDisplayInRect:v.bounds toBitmapImageRep:rep];
    [[rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}] writeToFile:out atomically:YES];
    CFAbsoluteTime t0 = CFAbsoluteTimeGetCurrent();
    for (int i = 0; i < 30; i++) { [v animateOneFrame]; [v cacheDisplayInRect:v.bounds toBitmapImageRep:rep]; }
    double ms = (CFAbsoluteTimeGetCurrent() - t0) * 1000.0 / 30.0;
    [v stopAnimation];
    printf("%-26s %5ldx%-5ld px  %5.1f ms per frame\n", out.UTF8String, (long)rep.pixelsWide, (long)rep.pixelsHigh, ms);
}

int main(int argc, char **argv) {
    @autoreleasepool {
        if (argc < 2) { fprintf(stderr, "usage: render-test path/to/MatrixRain.saver\n"); return 2; }
        NSBundle *bundle = [NSBundle bundleWithPath:@(argv[1])];
        NSError *err = nil;
        if (![bundle loadAndReturnError:&err]) { fprintf(stderr, "load failed: %s\n", err.description.UTF8String); return 1; }
        Class cls = bundle.principalClass;
        if (![cls isSubclassOfClass:[ScreenSaverView class]]) { fprintf(stderr, "principal class is not a ScreenSaverView\n"); return 1; }
        printf("loaded %s from %s\n", NSStringFromClass(cls).UTF8String, argv[1]);
        shoot(cls, 1512, 982, NO, @"build/test-full.png");      // a 14-inch MacBook Pro screen
        shoot(cls, 300, 170, YES, @"build/test-preview.png");   // the thumbnail in System Settings
    }
    return 0;
}
