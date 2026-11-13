# python fxc.py file.hlsl [flags]
# compile ANGLE's translated HLSL with the system d3dcompiler_47 to see the real error
import ctypes, sys, re, time
from ctypes import wintypes
src = open(sys.argv[1], encoding='utf8').read()
src = src.replace('@@ PIXEL OUTPUT @@', 'struct PS_OUTPUT { float4 o0 : SV_TARGET0; float4 o1 : SV_TARGET1; };\nPS_OUTPUT generateOutput(){PS_OUTPUT o; o.o0 = out_o0; o.o1 = out_o1; return o;}')
src = src.replace('@@ PIXEL MAIN PARAMETERS @@', 'float4 fcIn : SV_Position').replace('@@ MAIN PROLOGUE @@', 'gl_FragCoord = fcIn;')
src = re.sub(r'@@[^@]*@@', '', src)
flags = int(sys.argv[2], 0) if len(sys.argv) > 2 else (1 << 14) | (1 << 11)  # OPTIMIZATION_LEVEL0? default: IEEE_STRICTNESS|...
d3d = ctypes.WinDLL('d3dcompiler_47.dll')
class Blob(ctypes.Structure): pass
PB = ctypes.POINTER(ctypes.c_void_p)
D3DCompile = d3d.D3DCompile
D3DCompile.argtypes = [ctypes.c_char_p, ctypes.c_size_t, ctypes.c_char_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint, ctypes.c_uint, ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(ctypes.c_void_p)]
D3DCompile.restype = ctypes.c_long
code = ctypes.c_void_p(); err = ctypes.c_void_p()
b = src.encode()
t0 = time.time()
hr = D3DCompile(b, len(b), b'bush.hlsl', None, None, b'main', b'ps_5_0', flags, 0, ctypes.byref(code), ctypes.byref(err))
print('hr=%08x  %.2fs' % (hr & 0xffffffff, time.time() - t0))
def blobstr(p):
    if not p: return ''
    vt = ctypes.cast(p, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))).contents
    GetPtr = ctypes.WINFUNCTYPE(ctypes.c_void_p, ctypes.c_void_p)(vt[3]); GetSize = ctypes.WINFUNCTYPE(ctypes.c_size_t, ctypes.c_void_p)(vt[4])
    return ctypes.string_at(GetPtr(p), GetSize(p)).decode(errors='replace')
print(blobstr(err.value)[:3000])
if code.value:
    vt = ctypes.cast(code.value, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))).contents
    print('bytecode', ctypes.WINFUNCTYPE(ctypes.c_size_t, ctypes.c_void_p)(vt[4])(code.value))
