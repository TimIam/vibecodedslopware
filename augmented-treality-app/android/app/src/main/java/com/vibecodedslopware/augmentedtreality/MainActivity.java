package com.vibecodedslopware.augmentedtreality;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugin has to be registered before the bridge starts.
        registerPlugin(ARViewerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
