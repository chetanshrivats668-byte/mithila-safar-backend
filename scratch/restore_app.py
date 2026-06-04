import json
import os
import re

log_path = r"C:\Users\jigar\.gemini\antigravity\brain\33c59019-d01d-4fc1-a3a4-95c46b4605b2\.system_generated\logs\transcript.jsonl"
app_js_path = r"c:\Users\jigar\OneDrive\Documents\BookNow\app.js"

best_content = None
best_len = 0

with open(log_path, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        try:
            step = json.loads(line)
            # Check step content
            content = step.get('content', '')
            if 'function handleLogin' in content and 'function switchTab' in content:
                if len(content) > best_len:
                    best_len = len(content)
                    best_content = content
                    
            # Check step tool calls and response outputs
            output = step.get('output', '')
            if isinstance(output, str) and 'function handleLogin' in output and 'function switchTab' in output:
                if len(output) > best_len:
                    best_len = len(output)
                    best_content = output
                    
            for tc in step.get('tool_calls', []):
                # Check tool response in some log formats
                pass
                
        except Exception as e:
            pass

if best_content:
    print(f"Found best content with length {best_len}")
    
    # The output from view_file has line numbers added like "1: // ========== CONFIGURATION ==========" or similar.
    # Let's check if the lines start with line numbers and strip them.
    lines = best_content.split('\n')
    cleaned_lines = []
    has_line_numbers = False
    
    # Check if lines have "<number>: <content>" format
    pattern = re.compile(r'^\s*\d+:\s(.*)$')
    for line in lines:
        match = pattern.match(line)
        if match:
            cleaned_lines.append(match.group(1))
            has_line_numbers = True
        else:
            cleaned_lines.append(line)
            
    restored_text = '\n'.join(cleaned_lines)
    
    # If the output had a header or footer like "File Path: ...", let's clean it up.
    # We can detect the start of Yatri Point config or imports.
    # The original file starts with "// ========== CONFIGURATION =========="
    start_idx = restored_text.find("// ========== CONFIGURATION ==========")
    if start_idx != -1:
        restored_text = restored_text[start_idx:]
    
    # Let's look for the end of the file. The original ends with "renderBookings();\n}" or similar.
    # Let's check where the last line is
    
    with open(app_js_path, 'w', encoding='utf-8') as out:
        out.write(restored_text)
    print(f"Restored app.js. Strip line numbers: {has_line_numbers}. Start index found: {start_idx != -1}")
else:
    print("Could not find any suitable app.js backup in logs.")
