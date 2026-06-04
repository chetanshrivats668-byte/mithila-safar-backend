import os
import json
import re

brain_dir = r"C:\Users\jigar\.gemini\antigravity\brain"

best_content = None
best_len = 0
best_log_file = None

for root, dirs, files in os.walk(brain_dir):
    for f in files:
        if f == 'transcript.jsonl':
            log_path = os.path.join(root, f)
            try:
                with open(log_path, 'r', encoding='utf-8') as file:
                    for i, line in enumerate(file):
                        try:
                            step = json.loads(line)
                            # Check output (which holds read file contents)
                            output = step.get('output', '')
                            if isinstance(output, str) and 'function handleLogin' in output and 'function switchTab' in output:
                                if len(output) > best_len:
                                    best_len = len(output)
                                    best_content = output
                                    best_log_file = log_path
                                    
                            # Check content
                            content = step.get('content', '')
                            if isinstance(content, str) and 'function handleLogin' in content and 'function switchTab' in content:
                                if len(content) > best_len:
                                    best_len = len(content)
                                    best_content = content
                                    best_log_file = log_path
                        except Exception:
                            pass
            except Exception as e:
                print(f"Error reading {log_path}: {e}")

if best_content:
    print(f"Found best content in {best_log_file} with length {best_len}")
    
    # Strip line numbers if present
    lines = best_content.split('\n')
    cleaned_lines = []
    has_line_numbers = False
    
    pattern = re.compile(r'^\s*\d+:\s(.*)$')
    for line in lines:
        match = pattern.match(line)
        if match:
            cleaned_lines.append(match.group(1))
            has_line_numbers = True
        else:
            cleaned_lines.append(line)
            
    restored_text = '\n'.join(cleaned_lines)
    
    # Locate config start to strip any wrapper headers
    start_idx = restored_text.find("// ========== CONFIGURATION ==========")
    if start_idx != -1:
        restored_text = restored_text[start_idx:]
        
    # Write to scratch/restored_app.js first
    restore_dest = r"c:\Users\jigar\OneDrive\Documents\BookNow\scratch\restored_app.js"
    os.makedirs(os.path.dirname(restore_dest), exist_ok=True)
    with open(restore_dest, 'w', encoding='utf-8') as out:
        out.write(restored_text)
    print(f"Saved restored text to {restore_dest} (Length: {len(restored_text)})")
else:
    print("Could not find any suitable backup in any conversation logs.")
