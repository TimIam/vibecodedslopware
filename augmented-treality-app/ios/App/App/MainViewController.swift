import UIKit
import Capacitor

/// The app's bridge view controller. It exists to register the app's own AR plugin
/// (Capacitor only finds npm plugins by itself); Main.storyboard points at this class.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(ARViewerPlugin())
    }
}
