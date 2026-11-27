package com.vibecodedslopware.augmentedtreality;

import android.content.Intent;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.ar.core.ArCoreApk;

import java.io.File;
import java.io.FileOutputStream;

/**
 * The web builder hands over the tree as a GLB file; this saves it and opens ArViewerActivity,
 * where ARCore finds the floor and the tree stands on it at real size.
 */
@CapacitorPlugin(name = "ARViewer")
public class ARViewerPlugin extends Plugin {

    @PluginMethod
    public void isSupported(PluginCall call) {
        ArCoreApk.Availability a = ArCoreApk.getInstance().checkAvailability(getContext());
        JSObject ret = new JSObject();
        ret.put("ar", a.isSupported() || a.isTransient());
        ret.put("status", a.name());
        call.resolve(ret);
    }

    @PluginMethod
    public void open(PluginCall call) {
        String data = call.getString("data");
        if (data == null) { call.reject("No model data"); return; }
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            File dir = new File(getContext().getCacheDir(), "trees");
            dir.mkdirs();
            File[] old = dir.listFiles();
            if (old != null) for (File f : old) f.delete();
            File file = new File(dir, "tree-" + System.currentTimeMillis() + ".glb");
            try (FileOutputStream out = new FileOutputStream(file)) { out.write(bytes); }
            Intent intent = new Intent(getContext(), ArViewerActivity.class);
            intent.putExtra(ArViewerActivity.EXTRA_PATH, file.getAbsolutePath());
            intent.putExtra(ArViewerActivity.EXTRA_TITLE, call.getString("title", "Christmas tree"));
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't open the tree: " + e.getMessage(), e);
        }
    }
}
