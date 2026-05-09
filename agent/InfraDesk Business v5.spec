# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_all, collect_submodules

# Bundle the whole v5 package so all submodules resolve at runtime.
v5_hidden = collect_submodules("v5")
wv_datas, wv_binaries, wv_hidden = collect_all("webview")
tk_datas, tk_binaries, tk_hidden = collect_all("tkinter")
# certifi must include cacert.pem — without it requests/urllib raises
# "Could not find a suitable TLS CA certificate bundle" on every HTTPS call.
cf_datas, cf_binaries, cf_hidden = collect_all("certifi")

a = Analysis(
    ["_v5_bootstrap.py"],
    pathex=["."],
    binaries=wv_binaries + tk_binaries + cf_binaries,
    datas=[
        ("ui", "ui"),
        ("icon.ico", "."),
        ("logo.png", "."),
        ("ikona.png", "."),
        ("ikona_nazwa.png", "."),
        ("tlo.png", "."),
    ] + wv_datas + tk_datas + cf_datas,
    hiddenimports=[
        "v5", "v5.main", "v5.variants", "v5.variants.business",
        "v5.core", "v5.core.config", "v5.core.api", "v5.core.ws",
        "v5.core.backup", "v5.core.diagnostics", "v5.core.install",
        "v5.core.metrics", "v5.core.remote", "v5.core.system",
        "v5.core.update", "v5.core.utils",
        "v5.ui", "v5.ui.theme", "v5.ui.widgets", "v5.ui.login",
        "v5.ui.ticket", "v5.ui.dialogs", "v5.ui.tray", "v5.ui.dysk",
        "psutil", "requests", "websocket", "pystray", "PIL",
        "PIL.Image", "PIL.ImageGrab", "cryptography", "win32crypt",
        "winreg", "certifi",
        "tkinter", "tkinter.ttk", "tkinter.messagebox",
        "tkinter.filedialog", "tkinter.simpledialog",
    ] + v5_hidden + wv_hidden + tk_hidden + cf_hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="InfraDesk Business",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=["icon.ico"],
    version="v5_version.txt",
)
