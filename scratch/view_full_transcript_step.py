import json

path = r"C:\Users\jigar\.gemini\antigravity\brain\172e1666-3fb2-4e28-9cc3-0246b23f5d03\.system_generated\logs\transcript.jsonl"

with open(path, 'r', encoding='utf-8') as f:
    for idx, line in enumerate(f):
        if idx == 177:
            data = json.loads(line)
            content = data.get('content', '')
            print(f"Content length: {len(content)}")
            print("--- Content preview ---")
            print(content[:500])
            print("...")
            print(content[-500:])
