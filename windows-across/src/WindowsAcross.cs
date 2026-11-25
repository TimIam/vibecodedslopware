// Windows Across the Street for Windows: hosts windows.html in the WebView2 runtime that ships with Windows 10/11.
//
// Build with the C# compiler that ships with Windows (no SDK, no NuGet):
//   powershell -File windows-across/src/build.ps1
//
// Screensaver protocol: Windows runs "WindowsAcrossTheStreet.scr /s" to start it fullscreen across
// every monitor, "/p <hwnd>" to paint the miniature preview in Screen Saver Settings, and "/c" for
// interactive settings/preview. Right-click the .scr file and choose Install.

using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Win32;

static class Program
{
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

    [STAThread]
    static void Main(string[] args)
    {
        try { if (!SetProcessDpiAwarenessContext((IntPtr)(-4))) SetProcessDPIAware(); } catch { try { SetProcessDPIAware(); } catch { } }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        string mode = args.Length > 0 ? args[0].Trim().ToLowerInvariant() : "";
        bool isScr = Path.GetExtension(Application.ExecutablePath).Equals(".scr", StringComparison.OrdinalIgnoreCase);
        int autoExit = 0;
        foreach (var a in args) if (a.StartsWith("/autoexit:", StringComparison.OrdinalIgnoreCase)) int.TryParse(a.Substring(10), out autoExit);

        if (mode.StartsWith("/p"))
        {
            string s = mode.Length > 2 && mode[2] == ':' ? mode.Substring(3) : (args.Length > 1 ? args[1] : "");
            long h;
            if (long.TryParse(s, out h)) Application.Run(new PreviewForm(new IntPtr(h)));
            return;
        }
        string host = "app";
        bool windowed = false;
        if (mode.StartsWith("/s")) host = "saver";
        else if (mode.StartsWith("/c") || (mode == "" && isScr)) { host = "config"; windowed = true; }
        else if (mode.StartsWith("/w")) windowed = true;
        Application.Run(new SaverForm(host, windowed, autoExit));
    }
}

class SaverForm : Form
{
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }

    readonly string host;
    readonly bool windowed;
    ICoreWebView2Controller controller;
    ICoreWebView2 webview;
    EnvDone envDone; CtlDone ctlDone; MsgHandler msgHandler;
    Timer inputTimer, showTimer;
    POINT origin; DateTime armAt; bool armed;

    public SaverForm(string host, bool windowed, int autoExit)
    {
        this.host = host; this.windowed = windowed;
        Text = "Windows Across the Street";
        BackColor = Color.FromArgb(4, 6, 12);
        AutoScaleMode = AutoScaleMode.None;
        StartPosition = FormStartPosition.Manual;
        if (windowed)
        {
            var wa = Screen.PrimaryScreen.WorkingArea;
            int w = Math.Min(1440, wa.Width - 60), h = Math.Min(860, wa.Height - 60);
            Bounds = new Rectangle(wa.X + (wa.Width - w) / 2, wa.Y + (wa.Height - h) / 2, w, h);
        }
        else
        {
            FormBorderStyle = FormBorderStyle.None;
            var all = Screen.AllScreens;
            int minX = int.MaxValue, minY = int.MaxValue, maxX = int.MinValue, maxY = int.MinValue;
            foreach (var s in all) { minX = Math.Min(minX, s.Bounds.Left); minY = Math.Min(minY, s.Bounds.Top); maxX = Math.Max(maxX, s.Bounds.Right); maxY = Math.Max(maxY, s.Bounds.Bottom); }
            Bounds = new Rectangle(minX, minY, maxX - minX, maxY - minY);
            ShowInTaskbar = host != "saver";
            if (host == "saver") TopMost = true;
        }
        if (autoExit > 0) { var t = new Timer { Interval = autoExit * 1000 }; t.Tick += (s, e) => Quit(); t.Start(); }
    }

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        if (host == "saver") { Cursor.Hide(); StartInputWatch(); }
        try { StartWebView(); }
        catch (Exception ex) { Fail(ex.Message); }
    }

    void StartInputWatch()
    {
        GetCursorPos(out origin);
        armAt = DateTime.UtcNow.AddMilliseconds(1400);
        inputTimer = new Timer { Interval = 50 };
        inputTimer.Tick += (s, e) =>
        {
            if (DateTime.UtcNow < armAt) return;
            POINT p; GetCursorPos(out p);
            if (!armed) { armed = true; origin = p; for (int k = 1; k < 255; k++) GetAsyncKeyState(k); return; }
            if (Math.Abs(p.X - origin.X) > 8 || Math.Abs(p.Y - origin.Y) > 8) { Quit(); return; }
            for (int k = 1; k < 255; k++) if ((GetAsyncKeyState(k) & 0x8000) != 0) { Quit(); return; }
        };
        inputTimer.Start();
    }

    static string FindRuntimeDll()
    {
        const string id = @"Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
        var roots = new List<string>();
        string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), lad = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var vers = new List<string>();
        foreach (var key in new[] { @"HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\" + id, @"HKEY_LOCAL_MACHINE\SOFTWARE\" + id, @"HKEY_CURRENT_USER\Software\" + id })
        {
            var v = Registry.GetValue(key, "pv", null) as string;
            if (!string.IsNullOrEmpty(v) && v != "0.0.0.0") vers.Add(v);
        }
        foreach (var r in new[] { pf86, pf, lad })
        {
            if (string.IsNullOrEmpty(r)) continue;
            string app = Path.Combine(r, @"Microsoft\EdgeWebView\Application");
            foreach (var v in vers) roots.Add(Path.Combine(app, v));
            if (Directory.Exists(app))
            {
                var dirs = Directory.GetDirectories(app); Array.Sort(dirs); Array.Reverse(dirs);
                foreach (var d in dirs) if (char.IsDigit(Path.GetFileName(d)[0])) roots.Add(d);
            }
        }
        string arch = IntPtr.Size == 8 ? "x64" : "x86";
        foreach (var r in roots)
        {
            foreach (var a in new[] { arch, "arm64" })
            {
                string dll = Path.Combine(r, "EBWebView", a, "EmbeddedBrowserWebView.dll");
                if (File.Exists(dll)) return dll;
            }
        }
        return null;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr LoadLibraryEx(string path, IntPtr file, uint flags);
    [DllImport("kernel32.dll", CharSet = CharSet.Ansi)] static extern IntPtr GetProcAddress(IntPtr mod, string name);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int CreateEnv(int checkRunning, int runtimeType, [MarshalAs(UnmanagedType.LPWStr)] string userData, IntPtr options, [MarshalAs(UnmanagedType.Interface)] IEnvDone handler);

    string pageUrl;
    void StartWebView()
    {
        string home = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"VibeCodedSlopware\WindowsAcross");
        Directory.CreateDirectory(home);
        string page = Path.Combine(home, "windows.html");
        using (var res = Assembly.GetExecutingAssembly().GetManifestResourceStream("windows.html"))
        {
            var bytes = new byte[res.Length]; res.Read(bytes, 0, bytes.Length);
            try { File.WriteAllBytes(page, bytes); } catch (IOException) { }
        }
        pageUrl = new Uri(page).AbsoluteUri + "#host=" + host;

        string dll = FindRuntimeDll();
        if (dll == null) { Fail("This needs the Microsoft Edge WebView2 Runtime, which is normally already on Windows 10 and 11."); return; }
        Environment.SetEnvironmentVariable("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--disable-background-timer-throttling --disable-renderer-backgrounding --disable-features=CalculateNativeWinOcclusion --ignore-gpu-blocklist");
        IntPtr mod = LoadLibraryEx(dll, IntPtr.Zero, 0x8);
        if (mod == IntPtr.Zero) { Fail("Could not load the WebView2 runtime (" + Marshal.GetLastWin32Error() + ")."); return; }
        IntPtr fn = GetProcAddress(mod, "CreateWebViewEnvironmentWithOptionsInternal");
        if (fn == IntPtr.Zero) { Fail("This version of the WebView2 runtime isn't supported."); return; }
        var create = (CreateEnv)Marshal.GetDelegateForFunctionPointer(fn, typeof(CreateEnv));
        envDone = new EnvDone(OnEnv);
        int hr = create(1, 0, Path.Combine(home, "WebView"), IntPtr.Zero, envDone);
        if (hr != 0) Fail("WebView2 would not start (0x" + hr.ToString("X8") + ").");
    }

    void OnEnv(int hr, IntPtr envPtr)
    {
        if (hr != 0 || envPtr == IntPtr.Zero) { Fail("WebView2 would not start (0x" + hr.ToString("X8") + ")."); return; }
        var env = (ICoreWebView2Environment)Marshal.GetObjectForIUnknown(envPtr);
        ctlDone = new CtlDone(OnController);
        env.CreateCoreWebView2Controller(Handle, ctlDone);
    }

    void OnController(int hr, IntPtr ctlPtr)
    {
        if (hr != 0 || ctlPtr == IntPtr.Zero) { Fail("WebView2 would not create a view (0x" + hr.ToString("X8") + ")."); return; }
        controller = (ICoreWebView2Controller)Marshal.GetObjectForIUnknown(ctlPtr);
        controller.put_IsVisible(0);
        Fit();
        webview = controller.get_CoreWebView2();
        msgHandler = new MsgHandler(OnMessage);
        long token;
        webview.add_WebMessageReceived(msgHandler, out token);
        webview.Navigate(pageUrl);
        showTimer = new Timer { Interval = 10000 };
        showTimer.Tick += (s, e) => Reveal();
        showTimer.Start();
    }

    void Reveal()
    {
        if (showTimer != null) { showTimer.Stop(); showTimer = null; }
        if (controller == null) return;
        controller.put_IsVisible(1);
        controller.MoveFocus(0);
    }

    void OnMessage(string m)
    {
        if (m == "ready") Reveal();
        else if (m == "exit") Quit();
    }

    void Fit()
    {
        if (controller == null) return;
        var c = ClientRectangle;
        controller.put_Bounds(new RECT { Left = 0, Top = 0, Right = c.Width, Bottom = c.Height });
    }

    protected override void OnResize(EventArgs e) { base.OnResize(e); Fit(); }
    protected override void OnMove(EventArgs e) { base.OnMove(e); if (controller != null) try { controller.NotifyParentWindowPositionChanged(); } catch { } }

    void Fail(string msg)
    {
        if (host != "saver")
            MessageBox.Show(msg + "\n\nThe browser version works too: vibecodedslopware.com/windows-across", "Windows Across the Street", MessageBoxButtons.OK, MessageBoxIcon.Information);
        Application.Exit();
    }

    void Quit()
    {
        if (inputTimer != null) inputTimer.Stop();
        Cursor.Show();
        try { if (controller != null) controller.Close(); } catch { }
        Application.Exit();
    }
}

// Miniature night-facade preview inside Windows Screen Saver Settings (/p <hwnd>)
class PreviewForm : Form
{
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] static extern IntPtr SetParent(IntPtr child, IntPtr parent);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hWnd, int index);
    [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr hWnd, int index, int value);
    const int GWL_STYLE = -16, WS_CHILD = 0x40000000, WS_POPUP = unchecked((int)0x80000000);

    public PreviewForm(IntPtr parent)
    {
        RECT r; GetClientRect(parent, out r);
        FormBorderStyle = FormBorderStyle.None; StartPosition = FormStartPosition.Manual; ShowInTaskbar = false;
        AutoScaleMode = AutoScaleMode.None;
        Bounds = new Rectangle(0, 0, Math.Max(1, r.Right - r.Left), Math.Max(1, r.Bottom - r.Top));
        SetWindowLong(Handle, GWL_STYLE, (GetWindowLong(Handle, GWL_STYLE) & ~WS_POPUP) | WS_CHILD);
        SetParent(Handle, parent);
        Location = Point.Empty;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics; int w = ClientSize.Width, h = ClientSize.Height;
        g.Clear(Color.FromArgb(8, 14, 28));
        int bx = w / 6, by = h / 7, bw = w * 2 / 3, bh = h * 5 / 7;
        using (var brick = new SolidBrush(Color.FromArgb(44, 32, 36))) g.FillRectangle(brick, bx, by, bw, bh);
        using (var street = new SolidBrush(Color.FromArgb(14, 18, 28))) g.FillRectangle(street, 0, by + bh, w, h - (by + bh));
        int cols = 6, rows = 5;
        int cw = Math.Max(4, (bw - 12) / cols), ch = Math.Max(4, (bh - 10) / rows);
        var rnd = new Random(418);
        for (int r = 0; r < rows; r++)
        {
            for (int c = 0; c < cols; c++)
            {
                int wx = bx + 6 + c * cw, wy = by + 5 + r * ch;
                double v = rnd.NextDouble();
                Color col = v < 0.35 ? Color.FromArgb(245, 198, 120) : v < 0.48 ? Color.FromArgb(115, 200, 245) : Color.FromArgb(16, 22, 34);
                using (var b = new SolidBrush(col)) g.FillRectangle(b, wx, wy, Math.Max(2, cw - 3), Math.Max(2, ch - 4));
            }
        }
    }
}

[StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }

[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("4E8A3389-C9D8-4BD2-B6B5-124FEE6CC14D")]
public interface IEnvDone { [PreserveSig] int Invoke(int hr, IntPtr env); }

[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("6C4819F3-C9B7-4260-8127-C9F5BDE7F68C")]
public interface ICtlDone { [PreserveSig] int Invoke(int hr, IntPtr controller); }

[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("57213F19-00E6-49FA-8E07-898EA01ECBD2")]
public interface IMsgHandler { [PreserveSig] int Invoke(IntPtr sender, ICoreWebView2WebMessageReceivedEventArgs args); }

[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("0F99A40C-E962-4207-9E92-E3D542EFF849")]
public interface ICoreWebView2WebMessageReceivedEventArgs
{
    void _source();
    void _json();
    void TryGetWebMessageAsString([MarshalAs(UnmanagedType.LPWStr)] out string value);
}

[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("B96D755E-0319-4E92-A296-23436F46A1FC")]
public interface ICoreWebView2Environment
{
    void CreateCoreWebView2Controller(IntPtr parentWindow, ICtlDone handler);
}

[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("4D00C0D1-9434-4EB6-8078-8697A560334F")]
public interface ICoreWebView2Controller
{
    void _get_IsVisible();
    void put_IsVisible(int visible);
    void _get_Bounds();
    void put_Bounds(RECT bounds);
    void _get_Zoom(); void _put_Zoom(); void _addZoom(); void _remZoom(); void _setBoundsZoom();
    void MoveFocus(int reason);
    void _addMoveFocus(); void _remMoveFocus(); void _addGot(); void _remGot(); void _addLost(); void _remLost(); void _addAccel(); void _remAccel();
    void _get_Parent(); void _put_Parent();
    void NotifyParentWindowPositionChanged();
    void Close();
    ICoreWebView2 get_CoreWebView2();
}

[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("76ECEACB-0462-4D94-AC83-423A6793775E")]
public interface ICoreWebView2
{
    void _settings(); void _source();
    void Navigate([MarshalAs(UnmanagedType.LPWStr)] string uri);
    void _navString();
    void _a1(); void _r1(); void _a2(); void _r2(); void _a3(); void _r3(); void _a4(); void _r4(); void _a5(); void _r5();
    void _a6(); void _r6(); void _a7(); void _r7(); void _a8(); void _r8(); void _a9(); void _r9(); void _a10(); void _r10();
    void _addScript(); void _remScript(); void _exec(); void _capture(); void _reload(); void _postJson(); void _postString();
    void add_WebMessageReceived(IMsgHandler handler, out long token);
}

[ComVisible(true), ClassInterface(ClassInterfaceType.None)]
public class EnvDone : IEnvDone
{
    readonly Action<int, IntPtr> f; public EnvDone(Action<int, IntPtr> f) { this.f = f; }
    public int Invoke(int hr, IntPtr p) { f(hr, p); return 0; }
}
[ComVisible(true), ClassInterface(ClassInterfaceType.None)]
public class CtlDone : ICtlDone
{
    readonly Action<int, IntPtr> f; public CtlDone(Action<int, IntPtr> f) { this.f = f; }
    public int Invoke(int hr, IntPtr p) { f(hr, p); return 0; }
}
[ComVisible(true), ClassInterface(ClassInterfaceType.None)]
public class MsgHandler : IMsgHandler
{
    readonly Action<string> f; public MsgHandler(Action<string> f) { this.f = f; }
    public int Invoke(IntPtr sender, ICoreWebView2WebMessageReceivedEventArgs args)
    {
        string s; try { args.TryGetWebMessageAsString(out s); f(s); } catch { }
        return 0;
    }
}
