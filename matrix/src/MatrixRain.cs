// Matrix Rain: a Windows screensaver that rains on every monitor.
//
// Build with the C# compiler that ships with Windows (no SDK needed):
//   powershell -File matrix/src/build.ps1
//
// Screensaver protocol: Windows runs "MatrixRain.scr /s" to start it, "/p <hwnd>" to draw a
// preview inside the settings dialog, and "/c" (or nothing) for settings. Any mouse movement
// or key press ends it.

using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.Runtime.InteropServices;
using System.Windows.Forms;

static class Program
{
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

    [STAThread]
    static void Main(string[] args)
    {
        // Real pixels on every monitor, whatever its scaling, so the glyphs stay crisp.
        try { if (!SetProcessDpiAwarenessContext((IntPtr)(-4))) SetProcessDPIAware(); } catch { try { SetProcessDPIAware(); } catch { } }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        string mode = args.Length > 0 ? args[0].Trim().ToLowerInvariant() : "/c";
        if (mode.StartsWith("/p"))
        {
            IntPtr parent = ParseHandle(args, mode);
            if (parent != IntPtr.Zero) Application.Run(new RainForm(parent));
            return;
        }
        if (mode.StartsWith("/s"))
        {
            var forms = new List<RainForm>();
            foreach (var screen in Screen.AllScreens) forms.Add(new RainForm(screen));
            Cursor.Hide();
            foreach (var f in forms) f.Show();
            forms[0].Activate();
            Application.Run();
            Cursor.Show();
            return;
        }
        MessageBox.Show(
            "Matrix Rain\n\nIt rains on every monitor. Move the mouse or press a key to stop it.\n\n" +
            "There is nothing to configure. To use it, right-click MatrixRain.scr and choose Install, " +
            "or pick it under Settings > Personalization > Lock screen > Screen saver.",
            "Matrix Rain", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    // "/p 12345" or "/p:12345" or "/c:12345"
    static IntPtr ParseHandle(string[] args, string mode)
    {
        string s = mode.Length > 2 && mode[2] == ':' ? mode.Substring(3) : (args.Length > 1 ? args[1] : "");
        long h;
        return long.TryParse(s, out h) ? new IntPtr(h) : IntPtr.Zero;
    }
}

class RainForm : Form
{
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] static extern IntPtr SetParent(IntPtr child, IntPtr parent);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hWnd, int index);
    [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr hWnd, int index, int value);
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
    const int GWL_STYLE = -16, WS_CHILD = 0x40000000, WS_POPUP = unchecked((int)0x80000000);

    readonly bool preview;
    Rain rain;
    Bitmap frame;
    int[] pixels;
    Timer timer;
    Point? mouseOrigin;
    DateTime armAt;
    long lastTick;

    public RainForm(Screen screen)
    {
        preview = false;
        Setup(screen.Bounds);
        TopMost = true;
    }

    // Preview: live inside the little monitor in the Screen Saver Settings dialog.
    public RainForm(IntPtr parentWindow)
    {
        preview = true;
        RECT r;
        GetClientRect(parentWindow, out r);
        Setup(new Rectangle(0, 0, Math.Max(1, r.Right - r.Left), Math.Max(1, r.Bottom - r.Top)));
        SetWindowLong(Handle, GWL_STYLE, (GetWindowLong(Handle, GWL_STYLE) & ~WS_POPUP) | WS_CHILD);
        SetParent(Handle, parentWindow);
        Location = Point.Empty;
    }

    void Setup(Rectangle bounds)
    {
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        ShowInTaskbar = false;
        AutoScaleMode = AutoScaleMode.None;
        BackColor = Color.Black;
        Bounds = bounds;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.Opaque, true);

        rain = new Rain(bounds.Width, bounds.Height, preview);
        frame = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format32bppRgb);
        pixels = new int[bounds.Width * bounds.Height];
        armAt = DateTime.UtcNow.AddMilliseconds(800);
        lastTick = Environment.TickCount;

        timer = new Timer { Interval = 16 };
        timer.Tick += (s, e) => Tick();
        timer.Start();
    }

    void Tick()
    {
        long now = Environment.TickCount;
        float dt = Math.Min(0.1f, (now - lastTick) / 1000f);
        lastTick = now;
        rain.Step(dt);
        rain.Render(pixels);
        var data = frame.LockBits(new Rectangle(0, 0, frame.Width, frame.Height), ImageLockMode.WriteOnly, PixelFormat.Format32bppRgb);
        Marshal.Copy(pixels, 0, data.Scan0, pixels.Length);
        frame.UnlockBits(data);
        Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.CompositingMode = CompositingMode.SourceCopy;
        e.Graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
        e.Graphics.DrawImageUnscaled(frame, 0, 0);
    }

    protected override void OnPaintBackground(PaintEventArgs e) { }

    // Windows nudges the cursor when a fullscreen window appears; ignore the first moment and tiny moves.
    protected override void OnMouseMove(MouseEventArgs e)
    {
        if (preview || DateTime.UtcNow < armAt) return;
        var p = Cursor.Position;
        if (mouseOrigin == null) { mouseOrigin = p; return; }
        if (Math.Abs(p.X - mouseOrigin.Value.X) > 6 || Math.Abs(p.Y - mouseOrigin.Value.Y) > 6) Quit();
    }
    protected override void OnMouseDown(MouseEventArgs e) { if (!preview) Quit(); }
    protected override void OnMouseWheel(MouseEventArgs e) { if (!preview) Quit(); }
    protected override void OnKeyDown(KeyEventArgs e) { if (!preview) Quit(); }

    void Quit() { if (DateTime.UtcNow >= armAt) Application.Exit(); }
}

// The simulation and a software renderer: glyphs are pre-rendered once at every brightness,
// then each frame is just integer copies into a pixel buffer.
class Rain
{
    const int LEVELS = 28;                  // trail brightness steps; LEVELS itself is the white-hot head
    static readonly float[][] STOPS = {     // position, r, g, b
        new float[] { 0f, 0, 12, 3 }, new float[] { .2f, 0, 72, 20 }, new float[] { .5f, 0, 165, 44 },
        new float[] { .8f, 0, 255, 65 }, new float[] { 1f, 160, 255, 180 } };

    class Drop { public int Col, Last, Len; public float Y, Speed, Gain; }

    readonly int width, height, cw, ch, cols, rows;
    readonly byte[] grid;
    readonly List<Drop> drops = new List<Drop>();
    readonly int[][][] sprites;      // [glyph][level] -> cw*ch pixels, already lit
    readonly int glyphCount;
    readonly Random rnd = new Random(Guid.NewGuid().GetHashCode());

    public Rain(int w, int h, bool small)
    {
        width = w; height = h;
        int fontPx = (int)Math.Round(Math.Max(small ? 9 : 14, Math.Min(24, h / 60.0)));
        cw = (int)Math.Round(fontPx * 0.64); ch = (int)Math.Round(fontPx * 1.1);
        cols = (w + cw - 1) / cw; rows = (h + ch - 1) / ch;

        var glyphs = new List<KeyValuePair<char, bool>>();                       // char, mirrored?
        for (int c = 0xFF71; c <= 0xFF9D; c++) glyphs.Add(new KeyValuePair<char, bool>((char)c, true));   // half-width katakana
        foreach (char c in "ｦｰ") glyphs.Add(new KeyValuePair<char, bool>(c, true));
        foreach (char c in "0123456789Z:.\"=*+-<>|¦") glyphs.Add(new KeyValuePair<char, bool>(c, false));
        glyphCount = glyphs.Count;

        sprites = new int[glyphCount][][];
        using (var font = new Font("MS Gothic", fontPx, FontStyle.Regular, GraphicsUnit.Pixel))
        {
            for (int g = 0; g < glyphCount; g++)
            {
                byte[] mask = RenderMask(glyphs[g].Key, glyphs[g].Value, font);
                sprites[g] = new int[LEVELS + 1][];
                for (int l = 0; l <= LEVELS; l++) sprites[g][l] = Light(mask, l);
            }
        }

        grid = new byte[cols * rows];
        for (int i = 0; i < grid.Length; i++) grid[i] = (byte)rnd.Next(glyphCount);
        for (int c = 0; c < cols; c++)
        {
            drops.Add(NewDrop(c, -(float)rnd.NextDouble() * rows * 1.2f));
            drops.Add(NewDrop(c, -rows * 1.5f - (float)rnd.NextDouble() * rows * 3f));
        }
        for (int i = 0; i < 150; i++) Step(1f / 30f);   // start mid-storm, not with an empty sky
    }

    // Draw one glyph in white, keep its coverage, centre the ink in the cell, mirror the katakana.
    byte[] RenderMask(char c, bool mirror, Font font)
    {
        int bw = cw * 3, bh = ch * 3;
        var mask = new byte[cw * ch];
        using (var bmp = new Bitmap(bw, bh, PixelFormat.Format32bppArgb))
        {
            using (var g = Graphics.FromImage(bmp))
            {
                g.Clear(Color.Transparent);
                g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
                g.DrawString(c.ToString(), font, Brushes.White, cw, ch, StringFormat.GenericTypographic);
            }
            var data = bmp.LockBits(new Rectangle(0, 0, bw, bh), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            var px = new int[bw * bh];
            Marshal.Copy(data.Scan0, px, 0, px.Length);
            bmp.UnlockBits(data);

            int minX = bw, minY = bh, maxX = -1, maxY = -1;
            for (int y = 0; y < bh; y++) for (int x = 0; x < bw; x++)
                if (((px[y * bw + x] >> 24) & 255) > 8) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
            if (maxX < 0) return mask;
            int iw = maxX - minX + 1, ih = maxY - minY + 1;
            int ox = (cw - iw) / 2, oy = (ch - ih) / 2;
            for (int y = 0; y < ih; y++) for (int x = 0; x < iw; x++)
            {
                int dx = ox + (mirror ? iw - 1 - x : x), dy = oy + y;
                if (dx < 0 || dx >= cw || dy < 0 || dy >= ch) continue;
                mask[dy * cw + dx] = (byte)((px[(minY + y) * bw + minX + x] >> 24) & 255);
            }
        }
        return mask;
    }

    static int[] Ramp(float t)
    {
        int i = 1; while (i < STOPS.Length - 1 && STOPS[i][0] < t) i++;
        float[] a = STOPS[i - 1], b = STOPS[i];
        float k = Math.Max(0f, Math.Min(1f, (t - a[0]) / (b[0] - a[0])));
        return new[] { (int)Math.Round(a[1] + (b[1] - a[1]) * k), (int)Math.Round(a[2] + (b[2] - a[2]) * k), (int)Math.Round(a[3] + (b[3] - a[3]) * k) };
    }

    // Tint a coverage mask: the colour for this brightness, scaled by coverage, over black.
    // The head also gets a soft halo so it reads as the bright, leading glyph.
    int[] Light(byte[] mask, int level)
    {
        int[] rgb = level == LEVELS ? new[] { 225, 255, 235 } : Ramp(level / (float)(LEVELS - 1));
        var outp = new int[mask.Length];
        for (int i = 0; i < mask.Length; i++)
        {
            int a = mask[i];
            if (a == 0) continue;
            outp[i] = (255 << 24) | ((rgb[0] * a / 255) << 16) | ((rgb[1] * a / 255) << 8) | (rgb[2] * a / 255);
        }
        if (level == LEVELS)
        {
            for (int y = 0; y < ch; y++) for (int x = 0; x < cw; x++)
            {
                if (mask[y * cw + x] != 0) continue;
                int m = 0;
                for (int dy = -2; dy <= 2; dy++) for (int dx = -2; dx <= 2; dx++)
                {
                    int sx = x + dx, sy = y + dy;
                    if (sx < 0 || sx >= cw || sy < 0 || sy >= ch) continue;
                    int v = mask[sy * cw + sx] * (3 - Math.Max(Math.Abs(dx), Math.Abs(dy))) / 3;
                    if (v > m) m = v;
                }
                if (m == 0) continue;
                m = m * 45 / 255;
                outp[y * cw + x] = (255 << 24) | ((40 * m / 255) << 16) | ((255 * m / 255) << 8) | (80 * m / 255);
            }
        }
        return outp;
    }

    Drop NewDrop(int col, float y)
    {
        return new Drop
        {
            Col = col, Y = y, Last = (int)Math.Floor(y),
            Speed = 6f + (float)rnd.NextDouble() * 12f,
            Len = 10 + rnd.Next(22),
            Gain = rnd.NextDouble() < 0.3 ? 0.4f + (float)rnd.NextDouble() * 0.3f : 0.75f + (float)rnd.NextDouble() * 0.25f,
        };
    }

    public void Step(float dt)
    {
        foreach (var d in drops)
        {
            d.Y += d.Speed * dt;
            int h = (int)Math.Floor(d.Y);
            if (h != d.Last)
            {
                for (int r = d.Last + 1; r <= h; r++) if (r >= 0 && r < rows) grid[d.Col * rows + r] = (byte)rnd.Next(glyphCount);
                d.Last = h;
            }
            if (h - d.Len > rows)
            {
                var n = NewDrop(d.Col, -(float)rnd.NextDouble() * rows * 2f - 2f);
                d.Y = n.Y; d.Last = n.Last; d.Speed = n.Speed; d.Len = n.Len; d.Gain = n.Gain;
            }
        }
        for (int i = (grid.Length * 3 + 999) / 1000; i > 0; i--) grid[rnd.Next(grid.Length)] = (byte)rnd.Next(glyphCount);
    }

    public void Render(int[] px)
    {
        Array.Clear(px, 0, px.Length);
        foreach (var d in drops)
        {
            int h = (int)Math.Floor(d.Y), x0 = d.Col * cw;
            for (int k = 0; k < d.Len; k++)
            {
                int r = h - k;
                if (r < 0) break;
                if (r >= rows) continue;
                int l;
                if (k == 0) l = d.Gain > 0.7f ? LEVELS : LEVELS - 2;
                else { l = (int)Math.Round(Math.Pow(1 - k / (double)d.Len, 1.4) * d.Gain * (LEVELS - 1)); if (l < 1) continue; }
                Blit(px, sprites[grid[d.Col * rows + r]][l], x0, r * ch);
            }
        }
    }

    void Blit(int[] px, int[] sprite, int x0, int y0)
    {
        int w = Math.Min(cw, width - x0), hh = Math.Min(ch, height - y0);
        if (w <= 0 || hh <= 0) return;
        for (int y = 0; y < hh; y++) Array.Copy(sprite, y * cw, px, (y0 + y) * width + x0, w);
    }
}
