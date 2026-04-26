"""PyInstaller entry wrapper — imports v5 package and runs main."""
import os
import sys

if getattr(sys, "frozen", False):
    base = sys._MEIPASS
    if base not in sys.path:
        sys.path.insert(0, base)

from v5.main import main

if __name__ == "__main__":
    main()
