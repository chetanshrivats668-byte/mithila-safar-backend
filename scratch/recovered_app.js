Created At: 2026-05-22T09:13:30Z
Completed At: 2026-05-22T09:13:30Z
File Path: `file:///c:/Users/jigar/OneDrive/Documents/BookNow/app.js`
Total Lines: 2408
Total Bytes: 107869
Showing lines 480 to 770
The following code has been modified to include a line number before every line, in the format: <line_number>: <original_line>. Please note that any changes targeting the original code should remove the line number, colon, and leading space.
    if (!currentUser || !authToken) {
        notify('Please login first', 'error');
        openModal('loginModal');
        return false;
    }
    if (callback) callback();
    return true;
}

function authHeaders() {
  return authToken ? { 'Authorization': 'Bearer ' + authToken, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPassword').value;
    if (!email || !pass) return notify('Please fill all fields', 'error');
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass })
      });
      const data = await res.json();
      
      // Intercept unverified email login state
      if (data.unverified) {
        pendingVerificationEmail = data.email || email;
        closeModal('loginModal');
        openModal('emailOtpModal');
        document.getElementById('emailOtpSubtitle').innerText = `Enter the 6-digit verification code sent to ${pendingVerificationEmail}`;
        document.getElementById('emailOtpInput').value = '';
        document.getElementById('emailOtpError').style.display = 'none';
        notify(data.message || 'Please v
<truncated 10059 bytes>
mailOtpTimerInterval = setInterval(() => {
        emailOtpCooldownTime--;
        if (emailOtpCooldownTime <= 0) {
            clearInterval(emailOtpTimerInterval);
            link.style.pointerEvents = '';
            link.style.opacity = '';
            link.innerText = 'Resend Code';
        } else {
            link.innerText = `Resend in ${emailOtpCooldownTime}s`;
        }
    }, 1000);
}

function logout() {
    currentUser = null;
    authToken = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    updateUILoggedOut();
    document.getElementById('dropdownMenu')?.classList.remove('active');
    notify('Logged out successfully', 'info');
    navigateTo('home');
}

// ========== TAB SWITCHING ==========
function switchTab(type, btn) {
    document.querySelectorAll('.booking-form').forEach(f => f.classList.remove('active'));
    document.querySelectorAll('.booking-tabs button').forEach(b => b.classList.remove('active'));
    const form = document.getElementById(type + 'Form');
    if (form) form.classList.add('active');
    btn.classList.add('active');
}

// ========== BUS SEARCH ==========
async function searchBuses(e) {
e.preventDefault();
if (!requireAuth()) return;
const from = document.getElementById('busFrom').value;
const to = document.getElementById('busTo').value;
const date = document.getElementById('busDate').value;
const passengers = parseInt(document.getElementById('busPassengers').value);
if (from === to) return notify('From and To cannot be same', 'error');

const dist = DISTANCES[from + '-' + to] || 200;

The above content does NOT show the entire file contents. If you need to view any lines of the file which were not shown to complete your task, call this tool again to view those lines.
