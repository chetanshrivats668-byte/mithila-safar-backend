import os

paths_to_search = [
    r"c:\Users\jigar\OneDrive\Documents\BookNow",
    r"C:\Users\jigar\.gemini\antigravity"
]

found = []
for p in paths_to_search:
    for root, dirs, files in os.walk(p):
        for f in files:
            if 'app.js' in f or 'app' in f and f.endswith('.js'):
                full_path = os.path.join(root, f)
                try:
                    size = os.path.getsize(full_path)
                    found.append((full_path, size))
                except Exception as e:
                    pass

print(f"Found {len(found)} app.js candidates:")
for f, s in found:
    print(f"- {f} (Size: {s} bytes)")
