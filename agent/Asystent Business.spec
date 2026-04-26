# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_all

# Zbierz wszystkie dane tkinter/tcl/tk (Tcl data directory, DLLs)
tk_datas, tk_binaries, tk_hidden = collect_all('tkinter')

a = Analysis(
    ['asystent_business.py'],
    pathex=[],
    binaries=tk_binaries,
    datas=[('ui', 'ui'), ('logo.png', '.'), ('tlo.png', '.'), ('remote_commands.py', '.')] + tk_datas,
    hiddenimports=['remote_commands', 'tkinter', 'tkinter.ttk', 'tkinter.messagebox', 'tkinter.filedialog'] + tk_hidden,
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
    name='InfraDesk Business',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[
        'tcl86t.dll', 'tk86t.dll', 'tcl86.dll', 'tk86.dll',
        '_tkinter.pyd', 'vcruntime140.dll', 'python3*.dll',
    ],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['icon.ico'],
)
