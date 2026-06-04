import os

search_dir = r"C:\Users\jigar\OneDrive"
print("Scanning OneDrive wide for app.js...")
found = []

for root, dirs, files in os.walk(search_dir):
    # Exclude node_modules, .git, and huge packages to make it fast
    if any(x in root for x in ['node_modules', '.git', 'AppData', 'build', 'dist', 'fusionai', 'lumina-ai', 'advanced-learning-platform']):
        continue
    for f in files:
        if f.endswith('.js') or f.endswith('.bak') or f.endswith('.tmp') or 'app' in f.lower() or 'restore' in f.lower() or 'backup' in f.lower():
            full_path = os.path.join(root, f)
            try:
                size = os.path.getsize(full_path)
                if 80000 <= size <= 150000:
                    try:
                        with open(full_path, 'r', encoding='utf-8', errors='ignore') as check_f:
                            content = check_f.read(4000)
                            if 'switchTab' in content or 'Yatri Point' in content or 'DOMContentLoaded' in content:
                                found.append((full_path, size))
                    except Exception:
                        pass
            except Exception:
                pass

print(f"\nOneDrive Wide Scan complete. Found {len(found)} candidate files:")
for path, size in found:
    print(f"- {path} ({size} bytes)")
