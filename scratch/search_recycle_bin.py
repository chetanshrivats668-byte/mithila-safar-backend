import os
import re

search_dirs = [
    r"C:\$Recycle.Bin",
    r"C:\Users\jigar\AppData\Local\Temp",
    r"C:\Users\jigar\OneDrive\Documents\BookNow"
]

print("Searching Recycle Bin and Temp directories for app.js backups...")

found = []

for sdir in search_dirs:
    if not os.path.exists(sdir):
        continue
    print(f"Scanning: {sdir}")
    for root, dirs, files in os.walk(sdir):
        for f in files:
            # Look for app.js, or files with size between 80KB and 130KB
            full_path = os.path.join(root, f)
            try:
                size = os.path.getsize(full_path)
                if 80000 <= size <= 130000:
                    # Let's inspect the file for Yatri Point or switchTab
                    try:
                        with open(full_path, 'r', encoding='utf-8', errors='ignore') as check_f:
                            head = check_f.read(2000)
                            if 'switchTab' in head or 'Yatri Point' in head or 'DOMContentLoaded' in head:
                                found.append((full_path, size))
                    except Exception:
                        pass
            except Exception:
                pass

print(f"\nFound {len(found)} candidate files:")
for path, size in found:
    print(f"- {path} ({size} bytes)")
