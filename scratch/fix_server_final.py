import os

file_path = r'c:\Users\jigar\OneDrive\Documents\BookNow\server.js'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Reconstruct the file. 
# We'll start from the first correctly structured part and remove the junk at the top.
# The mangled file starts with junk at 1-3, jumps at 4, has imports again at 47.

clean_lines = []
found_second_imports = False
start_index = 0

for i, line in enumerate(lines):
    if 'import \'dotenv/config\';' in line and i > 0:
        found_second_imports = True
        start_index = i
        break

if found_second_imports:
    clean_lines = lines[start_index:]
else:
    # If we didn't find duplicate imports, maybe it's just the top that's broken.
    # We'll try to find where the real code starts.
    clean_lines = lines

# Now clean up the credentials block in the reconstructed part.
# The user wants Login ID: "Yatri Point" and Password: "YatriPoint@123"
# And fallback values if .env is missing.

content = "".join(clean_lines)

# Fix Security Config
security_config_old = """// ========== SECURITY CONFIG (from .env) ==========
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY = '8h';

if (!ADMIN_USERNAME || !ADMIN_PASSWORD || !JWT_SECRET) {
    console.error('❌ FATAL: ADMIN_USERNAME, ADMIN_PASSWORD, and JWT_SECRET must be set in .env');
    process.exit(1);
}"""

security_config_new = """// ========== SECURITY CONFIG (from .env) ==========
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'Yatri Point';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'YatriPoint@123';
const JWT_SECRET = process.env.JWT_SECRET || 'yatripoint-fallback-secret-key-2026';
const TOKEN_EXPIRY = '8h';

if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    console.warn('⚠️ WARNING: Using default admin credentials from code. Configure .env for production.');
}"""

# Try to find and replace the block. If it's already modified but weirdly, we might need a regex.
import re
# Look for a pattern that resembles the security config
pattern = r"// ========== SECURITY CONFIG \(from .env\) ==========\s+const ADMIN_USERNAME = .*?;.*?process\.exit\(1\);\s+\}"
content = re.sub(pattern, security_config_new, content, flags=re.DOTALL)

# But wait, in the mangled file at line 101, there is ALREADY a partially correct block.
# Let's just make sure it's correct.

# Fix the Admin Login UI to use real emojis and "Login ID" placeholder
content = content.replace(r'\ud83d\udd10', '🔐')
content = content.replace(r'\u2014 Payment Verification', '— Secure Login')
content = content.replace('<input type="text" id="au" placeholder="Username">', 
                          '<div class="pw-wrap" style="margin-bottom:1rem"><input type="text" id="au" placeholder="Login ID" style="padding:.8rem 1rem"><span style="position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:.75rem;color:rgba(255,255,255,.35);pointer-events:none">ID</span></div>')
content = content.replace(r'\ud83d\udd12 Secure Login', '🔐 Secure Login')
content = content.replace(r'\ud83d\udd12 Yatri Point Admin', '🔐 Yatri Point Admin')
content = content.replace(r'\ud83d\udd04 Refresh', '🔄 Refresh')
content = content.replace(r'\ud83d\udeaa Logout', '🚪 Logout')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully cleaned and updated server.js")
