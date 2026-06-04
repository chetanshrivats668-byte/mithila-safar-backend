import os

search_dir = r"C:\Users\jigar"
target_size_min = 90000
target_size_max = 120000

found = []

print("Scanning C:\\Users\\jigar for app.js backups...")

for root, dirs, files in os.walk(search_dir):
    # Exclude node_modules, .git, AppData\Local\Microsoft, etc. to make it fast
    if any(x in root for x in ['node_modules', '.git', 'AppData\\Local\\Microsoft', 'AppData\\Local\\Google', 'AppData\\Local\\Package Cache', 'AppData\\Local\\Temp']):
        continue
    for f in files:
        if f.endswith('.js') and ('app' in f.lower() or 'restore' in f.lower() or 'backup' in f.lower()):
            full_path = os.path.join(root, f)
            try:
                size = os.path.getsize(full_path)
                if target_size_min <= size <= target_size_max:
                    found.append((full_path, size))
            except Exception:
                pass

print(f"Scan complete. Found {len(found)} candidate files:")
for path, size in found:
    print(f"- {path} ({size} bytes)")
