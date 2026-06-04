import json
import os

path = r"C:\Users\jigar\.gemini\antigravity\brain\172e1666-3fb2-4e28-9cc3-0246b23f5d03\.system_generated\logs\transcript.jsonl"
if not os.path.exists(path):
    print("Previous transcript not found.")
    exit(0)

print(f"Analyzing {path}...")
with open(path, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        try:
            step = json.loads(line)
            # check content
            content = step.get('content', '')
            if 'app.js' in content:
                print(f"Line {i} content contains 'app.js', len={len(content)}")
                if 'switchTab' in content:
                    print(f"  -> contains switchTab!")
            # check output
            output = step.get('output', '')
            if isinstance(output, str) and 'app.js' in output:
                print(f"Line {i} output contains 'app.js', len={len(output)}")
                if 'switchTab' in output:
                    print(f"  -> contains switchTab!")
            # check tool_calls
            for tc in step.get('tool_calls', []):
                args = str(tc.get('args', {}))
                if 'app.js' in args:
                    print(f"Line {i} tool_call contains 'app.js': {tc.get('name')} - {args[:200]}")
        except Exception as e:
            pass
