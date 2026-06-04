import json
import os

log_path = r"C:\Users\jigar\.gemini\antigravity\brain\33c59019-d01d-4fc1-a3a4-95c46b4605b2\.system_generated\logs\transcript.jsonl"
output_path = r"c:\Users\jigar\OneDrive\Documents\BookNow\scratch\app_restore_candidates.txt"

os.makedirs(os.path.dirname(output_path), exist_ok=True)

candidates = []

with open(log_path, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        try:
            step = json.loads(line)
            # Look for app.js in content or tool calls
            content = step.get('content', '')
            if 'app.js' in content and ('function handleLogin' in content or 'function switchTab' in content):
                candidates.append((i, 'content', len(content)))
            
            # Look in tool calls / outputs
            for tc in step.get('tool_calls', []):
                tc_args = tc.get('args', {})
                if 'AbsolutePath' in tc_args and 'app.js' in tc_args.get('AbsolutePath', ''):
                    candidates.append((i, 'tool_call_args', str(tc_args)))
            
            # Let's check response / output if this step was a tool output
            output = step.get('output', '')
            if isinstance(output, str) and 'app.js' in output and ('function handleLogin' in output or 'function switchTab' in output):
                candidates.append((i, 'output', len(output)))
                
        except Exception as e:
            print(f"Error parsing line {i}: {e}")

print(f"Found {len(candidates)} candidates.")
with open(output_path, 'w', encoding='utf-8') as out:
    for c in candidates:
        out.write(f"Line {c[0]} (Type: {c[1]}):\n")
        out.write(str(c[2])[:1000] + "\n\n")
