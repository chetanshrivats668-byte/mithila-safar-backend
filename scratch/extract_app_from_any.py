import json
import os
import re

transcripts = [
    r"C:\Users\jigar\.gemini\antigravity\brain\172e1666-3fb2-4e28-9cc3-0246b23f5d03\.system_generated\logs\transcript.jsonl",
    r"C:\Users\jigar\.gemini\antigravity\brain\33c59019-d01d-4fc1-a3a4-95c46b4605b2\.system_generated\logs\transcript.jsonl"
]

print("Scanning transcript logs for app.js content...")

best_content = None
best_len = 0
best_source = None

for log_path in transcripts:
    if not os.path.exists(log_path):
        print(f"File not found: {log_path}")
        continue
        
    print(f"Scanning: {log_path}")
    with open(log_path, 'r', encoding='utf-8') as f:
        for i, line in enumerate(f):
            try:
                step = json.loads(line)
                
                # Check output field (tool output)
                output = step.get('output', '')
                if isinstance(output, str):
                    if 'function switchTab' in output or 'const API_URL' in output:
                        # Clean line numbers from the output and verify if it's the large original file
                        cleaned_output = output
                        # Check size
                        if len(output) > best_len:
                            best_len = len(output)
                            best_content = output
                            best_source = f"{log_path} line {i} (output, len={len(output)})"
                            
                # Check tool_calls args/responses or system inputs
                content = step.get('content', '')
                if isinstance(content, str):
                    if 'function switchTab' in content or 'const API_URL' in content:
                        if len(content) > best_len:
                            best_len = len(content)
                            best_content = content
                            best_source = f"{log_path} line {i} (content, len={len(content)})"
                            
            except Exception as e:
                pass

if best_content:
    print(f"\nBest match found from {best_source}!")
    print(f"Match raw length: {len(best_content)} characters.")
    
    # Let's clean the line numbers and formatting
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
            # Handle empty numbered lines like "123:"
            empty_match = re.compile(r'^\s*\d+:$').match(line)
            if empty_match:
                cleaned_lines.append('')
                has_line_numbers = True
            else:
                cleaned_lines.append(line)
                
    restored_text = '\n'.join(cleaned_lines)
    
    # Find start of configuration
    start_indicators = [
        "// ========== CONFIGURATION ==========",
        "const API_URL =",
        "let activeTab ="
    ]
    
    start_idx = -1
    for ind in start_indicators:
        start_idx = restored_text.find(ind)
        if start_idx != -1:
            print(f"Found starting indicator '{ind}' at index {start_idx}")
            restored_text = restored_text[start_idx:]
            break
            
    # Remove any markdown code block closing backticks or trailing metadata
    if restored_text.endswith("```"):
        restored_text = restored_text[:-3]
    elif restored_text.endswith("```\n"):
        restored_text = restored_text[:-4]
        
    out_path = r"c:\Users\jigar\OneDrive\Documents\BookNow\scratch\recovered_app.js"
    with open(out_path, 'w', encoding='utf-8') as out:
        out.write(restored_text)
        
    print(f"Successfully wrote restored file to {out_path} ({len(restored_text)} bytes)")
    print(f"First 200 chars:\n{restored_text[:200]}")
    print(f"Last 200 chars:\n{restored_text[-200:]}")
else:
    print("\nNo suitable app.js candidate found in any transcripts.")
