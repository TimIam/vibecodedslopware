package com.vibecodedslopware.augmentedtreality

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import com.google.ar.core.Config
import com.google.ar.core.Plane
import com.google.ar.core.TrackingFailureReason
import com.google.ar.core.TrackingState
import io.github.sceneview.ar.ARSceneView
import io.github.sceneview.ar.arcore.getUpdatedPlanes
import io.github.sceneview.ar.node.AnchorNode
import io.github.sceneview.math.Rotation
import io.github.sceneview.model.ModelInstance
import io.github.sceneview.node.ModelNode
import java.io.File
import kotlin.math.atan2

/**
 * The Android AR view: ARCore finds the floor, a tap stands the tree on it at real size
 * (the GLB is in metres), and it stays anchored while you walk around it.
 */
class ArViewerActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_PATH = "path"
        const val EXTRA_TITLE = "title"
        private const val CAMERA_REQUEST = 41
    }

    private lateinit var root: FrameLayout
    private lateinit var hint: TextView
    private lateinit var tools: LinearLayout
    private var sceneView: ARSceneView? = null
    private var model: ModelInstance? = null
    private var treeNode: ModelNode? = null
    private var anchorNode: AnchorNode? = null
    private var placing = true
    private var sawFloor = false
    private var yaw = 0f

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        setContentView(root)

        hint = TextView(this).apply {
            setTextColor(Color.WHITE)
            textSize = 16f
            gravity = Gravity.CENTER
            setPadding(dp(16), dp(12), dp(16), dp(12))
            background = pill(0xB3140D08.toInt(), 14)
            text = "Starting the camera…"
        }
        root.addView(hint, FrameLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT, Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply {
            topMargin = dp(72); leftMargin = dp(24); rightMargin = dp(24)
        })

        val done = button("✕ Done") { finish() }
        root.addView(done, FrameLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT, Gravity.TOP or Gravity.END).apply {
            topMargin = dp(12); rightMargin = dp(12)
        })

        tools = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            visibility = View.GONE
            addView(button("⟲") { turn(20f) }, toolParams())
            addView(button("↔ Move") { startMoving() }, toolParams())
            addView(button("⟳") { turn(-20f) }, toolParams())
        }
        root.addView(tools, FrameLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply {
            bottomMargin = dp(28)
        })

        // Keep the buttons clear of the status bar and gesture bar.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.updatePadding(top = bars.top, bottom = bars.bottom)
            insets
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) startAr()
        else ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), CAMERA_REQUEST)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != CAMERA_REQUEST) return
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) startAr()
        else {
            Toast.makeText(this, "The camera is how the tree gets into your room.", Toast.LENGTH_LONG).show()
            finish()
        }
    }

    private fun startAr() {
        val path = intent.getStringExtra(EXTRA_PATH)
        if (path == null || !File(path).exists()) {
            Toast.makeText(this, "No tree to show.", Toast.LENGTH_LONG).show()
            finish(); return
        }
        val view = ARSceneView(
            context = this,
            sharedLifecycle = lifecycle,
            sessionConfiguration = { session, config ->
                config.planeFindingMode = Config.PlaneFindingMode.HORIZONTAL
                config.lightEstimationMode = Config.LightEstimationMode.ENVIRONMENTAL_HDR
                config.instantPlacementMode = Config.InstantPlacementMode.DISABLED
                config.focusMode = Config.FocusMode.AUTO
                config.depthMode = if (session.isDepthModeSupported(Config.DepthMode.AUTOMATIC)) Config.DepthMode.AUTOMATIC else Config.DepthMode.DISABLED
            },
        )
        sceneView = view
        root.addView(view, 0, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        view.planeRenderer.isEnabled = true
        view.planeRenderer.isShadowReceiver = true

        try {
            model = view.modelLoader.createModelInstance(File(path))
        } catch (e: Exception) {
            Toast.makeText(this, "Couldn't load the tree: ${e.message}", Toast.LENGTH_LONG).show()
            finish(); return
        }

        view.onSessionFailed = { e ->
            runOnUiThread {
                hint.text = "AR couldn't start on this phone. It needs Google Play Services for AR." + (e.message?.let { "\n($it)" } ?: "")
            }
        }
        view.onTrackingFailureChanged = { reason ->
            if (placing) hint.text = when (reason) {
                TrackingFailureReason.INSUFFICIENT_LIGHT -> "It's too dark to see the floor. Turn a light on."
                TrackingFailureReason.EXCESSIVE_MOTION -> "Slow down a little."
                TrackingFailureReason.INSUFFICIENT_FEATURES -> "Point at a floor with a bit of texture: a rug or floorboards."
                TrackingFailureReason.CAMERA_UNAVAILABLE -> "Another app is using the camera."
                else -> hintForPlacing()
            }
        }
        view.onSessionUpdated = { _, frame ->
            if (placing && !sawFloor && frame.getUpdatedPlanes().any { it.trackingState == TrackingState.TRACKING && it.type == Plane.Type.HORIZONTAL_UPWARD_FACING }) {
                sawFloor = true
                hint.text = hintForPlacing()
            }
        }
        view.setOnGestureListener(onSingleTapConfirmed = { e, _ -> if (placing) place(e) })
        hint.text = hintForPlacing()
    }

    private fun hintForPlacing() =
        if (sawFloor) "Found the floor. Tap where the tree should go." else "Point your phone at the floor and sweep it slowly side to side."

    private fun place(e: MotionEvent) {
        val view = sceneView ?: return
        val instance = model ?: return
        val hit = view.hitTestAR(e.x, e.y, planeTypes = setOf(Plane.Type.HORIZONTAL_UPWARD_FACING))
        if (hit == null) {
            hint.text = if (sawFloor) "Tap on the floor (where the dots are)." else hintForPlacing()
            return
        }
        anchorNode?.let { old ->
            treeNode?.let { old.removeChildNode(it) }
            view.removeChildNode(old)
            old.anchor.detach()
            old.destroy()
        }
        val anchor = hit.createAnchor()
        val node = AnchorNode(view.engine, anchor)
        val tree = treeNode ?: ModelNode(instance, autoAnimate = false, scaleToUnits = null, centerOrigin = null).apply {
            isShadowCaster = true
            isShadowReceiver = false
        }
        // Turn the tree's best side toward you.
        val cam = view.cameraNode.worldPosition
        val p = anchor.pose
        yaw = Math.toDegrees(atan2((cam.x - p.tx()).toDouble(), (cam.z - p.tz()).toDouble())).toFloat()
        tree.rotation = Rotation(0f, yaw, 0f)
        node.addChildNode(tree)
        view.addChildNode(node)
        anchorNode = node
        treeNode = tree
        placing = false
        view.planeRenderer.isVisible = false
        hint.visibility = View.GONE
        tools.visibility = View.VISIBLE
    }

    private fun startMoving() {
        placing = true
        sceneView?.planeRenderer?.isVisible = true
        hint.visibility = View.VISIBLE
        hint.text = "Tap the floor where it should go."
    }

    private fun turn(deg: Float) {
        yaw += deg
        treeNode?.rotation = Rotation(0f, yaw, 0f)
    }

    override fun onDestroy() {
        sceneView?.destroy()
        super.onDestroy()
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun pill(color: Int, radiusDp: Int) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(radiusDp).toFloat()
    }

    private fun button(label: String, onClick: () -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        setTextColor(Color.WHITE)
        textSize = 16f
        typeface = Typeface.DEFAULT_BOLD
        minWidth = dp(52); minimumWidth = dp(52)
        minHeight = dp(48); minimumHeight = dp(48)
        setPadding(dp(16), 0, dp(16), 0)
        background = GradientDrawable().apply {
            setColor(0xB8140D08.toInt())
            cornerRadius = dp(26).toFloat()
            setStroke(dp(1), 0x40FFFFFF)
        }
        stateListAnimator = null
        setOnClickListener { onClick() }
    }

    private fun toolParams() = LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply {
        leftMargin = dp(6); rightMargin = dp(6)
    }
}
