import Foundation
import Capacitor
import QuickLook
import ARKit

/// Shows the tree the web builder exported (a USDZ file) in AR Quick Look: plane detection,
/// placement, people occlusion and grounding shadows all come from iOS. The tree is locked to
/// real size, which is the point of the app.
@objc(ARViewerPlugin)
public class ARViewerPlugin: CAPPlugin, CAPBridgedPlugin, QLPreviewControllerDataSource, QLPreviewControllerDelegate {
    public let identifier = "ARViewerPlugin"
    public let jsName = "ARViewer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
    ]

    private var fileURL: URL?
    private var title = "Christmas tree"

    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve(["ar": ARWorldTrackingConfiguration.isSupported])
    }

    @objc func open(_ call: CAPPluginCall) {
        guard let b64 = call.getString("data"), let data = Data(base64Encoded: b64) else {
            call.reject("No model data")
            return
        }
        title = call.getString("title") ?? "Christmas tree"
        // Quick Look caches by URL, so every tree gets its own file name.
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("trees", isDirectory: true)
        try? FileManager.default.removeItem(at: dir)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent("tree-\(Int(Date().timeIntervalSince1970)).usdz")
        do {
            try data.write(to: url, options: .atomic)
        } catch {
            call.reject("Couldn't save the tree: \(error.localizedDescription)")
            return
        }
        fileURL = url
        DispatchQueue.main.async {
            guard let host = self.bridge?.viewController else {
                call.reject("No view controller")
                return
            }
            let ql = QLPreviewController()
            ql.dataSource = self
            ql.delegate = self
            ql.modalPresentationStyle = .fullScreen
            host.present(ql, animated: true) {
                call.resolve()
            }
        }
    }

    public func numberOfPreviewItems(in controller: QLPreviewController) -> Int {
        return fileURL == nil ? 0 : 1
    }

    public func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
        let item = ARQuickLookPreviewItem(fileAt: fileURL!)
        item.allowsContentScaling = false
        item.canonicalWebPageURL = URL(string: "https://vibecodedslopware.com/augmented-treality/")
        return item
    }

    public func previewControllerDidDismiss(_ controller: QLPreviewController) {
        notifyListeners("closed", data: [:])
    }
}
