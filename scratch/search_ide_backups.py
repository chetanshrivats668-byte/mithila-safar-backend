import os

search_dirs = [
    r"C:\Users\jigar\AppData\Roaming\Code\Backups",
    r"C:\Users\jigar\AppData\Roaming\Cursor\User\Backups",
    r"C:\Users\jigar\AppData\Roaming\Cursor\Backups",
    r"C:\Users\jigar\AppData\Roaming\VSCodium\Backups",
    r"C:\Users\jigar\AppData\Roaming\Code - Insiders\Backups"
]

print("Searching editor backup folders...")
found = []

for sdir in search_dirs:
    if not os.path.exists(sdir):
        continue
    print(f"Scanning: {sdir}")
    for root, dirs, files in os.walk(sdir):
        for f in files:
            full_path = os.path.join(root, f)
            try:
                size = os.path.getsize(full_path)
                if size > 50000:  # Original app.js is ~107KB
                    try:
                        with open(full_path, 'r', encoding='utf-8', errors='ignore') as check_f:
                            content = check_f.read(5000)
                            if 'switchTab' in content or 'Yatri Point' in content or 'DOMContentLoaded' in content:
                                found.append((full_path, size))
                    except Exception:
                        pass
            except Exception:
                pass

print(f"\nFound {len(found)} candidate backups:")
for path, size in found:
    print(f"- {path} ({size} bytes)")
