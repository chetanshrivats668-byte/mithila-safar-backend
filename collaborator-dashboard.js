// ========== GLOBAL STATE ==========
const state = {
  token: localStorage.getItem('collabToken') || null,
  collaborator: JSON.parse(localStorage.getItem('collabData')) || null,
  currentPage: 'overview',
  buses: [],
  bookings: [],
  earnings: []
};

const API_BASE = '/api/collaborator';

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
  if (state.token && state.collaborator) {
    showDashboard();
    loadDashboardData();
  } else {
    showLoginForm();
  }
});

// ========== AUTH FUNCTIONS ==========
function switchAuthTab(tab) {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const tabs = document.querySelectorAll('.auth-tab');

  tabs.forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');

  if (tab === 'login') {
    loginForm.classList.add('active');
    registerForm.classList.remove('active');
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
  } else {
    registerForm.classList.add('active');
    loginForm.classList.remove('active');
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
  }
}

let pendingLoginEmail = null;
let phoneVerified = false;

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');
  const errorDiv = document.getElementById('loginError');

  btn.disabled = true;
  btn.textContent = 'Signing in...';
  errorDiv.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (data.success) {
      state.token = data.token;
      state.collaborator = data.collaborator;
      localStorage.setItem('collabToken', data.token);
      localStorage.setItem('collabData', JSON.stringify(data.collaborator));
      showToast('Login successful!', 'success');
      showDashboard();
      loadDashboardData();
    } else if (data.otpRequired) {
      pendingLoginEmail = data.email || email;
      document.getElementById('loginPassword').parentElement.style.display = 'none';
      document.getElementById('loginBtn').style.display = 'none';
      document.getElementById('loginOtpSection').style.display = 'block';
      document.getElementById('backToLoginBtn').style.display = 'block';
      errorDiv.style.display = 'none';
      showToast('Wrong password. Verification code sent to your email.', 'warning');
    } else {
      errorDiv.textContent = data.message || 'Login failed';
      errorDiv.style.display = 'block';
    }
  } catch (err) {
    console.error('Login error:', err);
    errorDiv.textContent = 'Network error. Please try again.';
    errorDiv.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

async function handleLoginOTP() {
  const otp = document.getElementById('loginOtp').value;
  if (!otp || otp.length !== 6) {
    showToast('Please enter the 6-digit verification code', 'error');
    return;
  }

  const btn = document.getElementById('verifyLoginOtpBtn');
  btn.disabled = true;
  btn.textContent = 'Verifying...';

  try {
    const res = await fetch(`${API_BASE}/login-with-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingLoginEmail, otp })
    });
    const data = await res.json();

    if (data.success) {
      state.token = data.token;
      state.collaborator = data.collaborator;
      localStorage.setItem('collabToken', data.token);
      localStorage.setItem('collabData', JSON.stringify(data.collaborator));
      showToast('Login successful!', 'success');
      showDashboard();
      loadDashboardData();
    } else {
      showToast(data.message || 'Invalid code', 'error');
    }
  } catch (err) {
    console.error('Login OTP error:', err);
    showToast('Error verifying code', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Verify';
  }
}

function resetLoginForm() {
  pendingLoginEmail = null;
  document.getElementById('loginPassword').parentElement.style.display = 'block';
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginOtpSection').style.display = 'none';
  document.getElementById('loginOtp').value = '';
  document.getElementById('loginBtn').style.display = 'block';
  document.getElementById('backToLoginBtn').style.display = 'none';
  document.getElementById('loginError').style.display = 'none';
}

async function sendOTP() {
  const phone = document.getElementById('regPhone').value;
  if (!phone || phone.length !== 10) {
    showToast('Please enter a valid 10-digit phone number', 'error');
    return;
  }

  const btn = document.getElementById('sendOtpBtn');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const res = await fetch(`${API_BASE}/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const data = await res.json();

    if (data.success) {
      document.getElementById('otpSection').style.display = 'block';
      showToast('OTP sent to your phone!', 'success');
      btn.textContent = 'Resend OTP';
    } else {
      showToast(data.message || 'Failed to send OTP', 'error');
      btn.textContent = 'Send OTP';
    }
  } catch (err) {
    console.error('Send OTP error:', err);
    showToast('Error sending OTP', 'error');
    btn.textContent = 'Send OTP';
  } finally {
    btn.disabled = false;
  }
}

async function verifyOTP() {
  const phone = document.getElementById('regPhone').value;
  const otp = document.getElementById('regOtp').value;

  if (!otp || otp.length !== 6) {
    showToast('Please enter valid 6-digit OTP', 'error');
    return;
  }

  const btn = document.getElementById('verifyOtpBtn');
  btn.disabled = true;
  btn.textContent = 'Verifying...';

  try {
    const res = await fetch(`${API_BASE}/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otp })
    });
    const data = await res.json();

    if (data.success) {
      phoneVerified = true;
      document.getElementById('otpMessage').textContent = '✓ Phone verified!';
      document.getElementById('otpMessage').style.color = 'green';
      document.getElementById('verifyOtpBtn').textContent = 'Verified';
      document.getElementById('verifyOtpBtn').disabled = true;
      document.getElementById('sendOtpBtn').style.display = 'none';
      showToast('Phone verified successfully!', 'success');
    } else {
      showToast(data.message || 'Invalid OTP', 'error');
      document.getElementById('otpMessage').textContent = data.message || 'Invalid OTP';
      document.getElementById('otpMessage').style.color = 'red';
      btn.textContent = 'Verify';
    }
  } catch (err) {
    console.error('Verify OTP error:', err);
    showToast('Error verifying OTP', 'error');
    btn.textContent = 'Verify';
  } finally {
    btn.disabled = false;
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('regName').value;
  const email = document.getElementById('regEmail').value;
  const phone = document.getElementById('regPhone').value;
  const password = document.getElementById('regPassword').value;
  const businessName = document.getElementById('regBusinessName').value;
  const city = document.getElementById('regCity').value;
  const state_val = document.getElementById('regState').value;
  const address = document.getElementById('regAddress').value;
  const businessDesc = document.getElementById('regBusinessDesc').value;
  const upiId = document.getElementById('regUpiId').value;
  const bankHolder = document.getElementById('regBankHolder').value;

  const serviceCategories = Array.from(
    document.querySelectorAll('#serviceCategories input[type="checkbox"]:checked')
  ).map(cb => cb.value);

  if (serviceCategories.length === 0) {
    showToast('Please select at least one service category', 'error');
    return;
  }

  if (!phoneVerified) {
    showToast('Please verify your phone number with OTP', 'error');
    return;
  }

  const btn = document.getElementById('registerBtn');
  const errorDiv = document.getElementById('registerError');

  btn.disabled = true;
  btn.textContent = 'Creating Account...';
  errorDiv.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, email, phone, password, businessName,
        serviceCategories, city, state: state_val, address, businessDesc,
        upiId, bankHolder
      })
    });
    const data = await res.json();

    if (data.success) {
      showToast('Account created! Please login.', 'success');
      document.getElementById('loginEmail').value = email;
      document.getElementById('loginPassword').value = '';
      document.querySelectorAll('.auth-tab')[0].click();
    } else {
      errorDiv.textContent = Array.isArray(data.errors)
        ? data.errors.join(', ')
        : (data.message || 'Registration failed');
      errorDiv.style.display = 'block';
    }
  } catch (err) {
    console.error('Register error:', err);
    errorDiv.textContent = 'Network error. Please try again.';
    errorDiv.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
}

function handleLogout() {
  if (!confirm('Are you sure you want to logout?')) return;
  state.token = null;
  state.collaborator = null;
  localStorage.removeItem('collabToken');
  localStorage.removeItem('collabData');
  showLoginForm();
  showToast('Logged out successfully', 'success');
}

// ========== UI DISPLAY FUNCTIONS ==========
function showLoginForm() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('dashboardScreen').style.display = 'none';
}

function showDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('dashboardScreen').style.display = 'flex';
  updateSidebarUser();
}

function updateSidebarUser() {
  if (!state.collaborator) return;
  const avatar = state.collaborator.name.charAt(0).toUpperCase();
  document.getElementById('sidebarAvatar').textContent = avatar;
  document.getElementById('sidebarUserName').textContent = state.collaborator.businessName || state.collaborator.name;
  
  const statusEl = document.getElementById('sidebarUserStatus');
  statusEl.className = 'status-badge ' + (state.collaborator.verification_status || 'pending');
  statusEl.textContent = (state.collaborator.verification_status || 'pending').replace('_', ' ');

  if (state.collaborator.verification_status === 'verified') {
    document.getElementById('topbarVerifiedBadge').style.display = 'flex';
  }
}

function switchPage(pageName) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  
  // Show selected page
  const page = document.getElementById(`page-${pageName}`);
  if (page) {
    page.classList.add('active');
    state.currentPage = pageName;
  }

  // Update sidebar nav
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    if (link.dataset.page === pageName) {
      link.classList.add('active');
    }
  });

  // Update page title
  const titles = {
    overview: 'Dashboard Overview',
    buses: 'My Buses',
    seats: 'Seat Management',
    bookings: 'All Bookings',
    earnings: 'Earnings',
    profile: 'Business Profile',
    verification: 'Verification Status'
  };
  document.getElementById('pageTitle').textContent = titles[pageName] || 'Dashboard';

  // Load page-specific data
  if (pageName === 'buses') loadBuses();
  if (pageName === 'bookings') loadBookings();
  if (pageName === 'earnings') loadEarnings();
  if (pageName === 'profile') loadProfile();
  if (pageName === 'verification') loadVerificationStatus();
  if (pageName === 'seats') loadBusesForSeatMap();
}

// ========== DATA LOADING FUNCTIONS ==========
async function loadDashboardData() {
  try {
    // Load overview stats
    const overviewRes = await fetch(`${API_BASE}/dashboard/overview`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const overviewData = await overviewRes.json();

    if (overviewData.success) {
      const data = overviewData.data;
      document.getElementById('statTotalBookings').textContent = data.totalBookings || 0;
      document.getElementById('statConfirmedBookings').textContent = data.confirmedBookings || 0;
      document.getElementById('statPendingBookings').textContent = data.pendingBookings || 0;
      document.getElementById('statEarnings').textContent = '₹' + (data.totalEarnings || 0).toLocaleString('en-IN');
      document.getElementById('statActiveBuses').textContent = data.activeBuses || 0;
      document.getElementById('statTotalBuses').textContent = data.totalBuses || 0;

      // Load recent bookings
      const bookingsRes = await fetch(`${API_BASE}/dashboard/bookings`, {
        headers: { 'Authorization': `Bearer ${state.token}` }
      });
      const bookingsData = await bookingsRes.json();
      if (bookingsData.success) {
        state.bookings = bookingsData.bookings || [];
        renderRecentBookings();
      }
    }
  } catch (err) {
    console.error('Load dashboard data error:', err);
  }
}

function renderRecentBookings() {
  const container = document.getElementById('recentBookingsList');
  if (state.bookings.length === 0) {
    container.innerHTML = '<div class="empty-state">No bookings yet</div>';
    return;
  }

  container.innerHTML = state.bookings.slice(0, 5).map(booking => `
    <div class="list-item">
      <div class="list-item-main">
        <span class="list-item-title">Booking #${booking.id?.slice(-6) || 'N/A'}</span>
        <span class="list-item-subtitle">${booking.bus_name || 'Unknown Bus'} • ${booking.travel_date || 'N/A'}</span>
      </div>
      <div class="list-item-meta">
        <div class="list-item-value">₹${booking.totalAmount || 0}</div>
        <div class="list-item-status">${booking.status || 'pending'}</div>
      </div>
    </div>
  `).join('');
}

async function loadBuses() {
  try {
    const res = await fetch(`${API_BASE}/bus`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();

    if (data.success) {
      state.buses = data.buses || [];
      renderBuses();
    }
  } catch (err) {
    console.error('Load buses error:', err);
    showToast('Failed to load buses', 'error');
  }
}

function renderBuses() {
  const container = document.getElementById('busesList');
  if (state.buses.length === 0) {
    container.innerHTML = '<div class="empty-state">No buses added yet. Click "Add New Bus" to get started.</div>';
    return;
  }

  container.innerHTML = state.buses.map(bus => `
    <div class="card">
      <div style="padding: 1.5rem;">
        <h3 style="margin-bottom: 0.5rem; font-size: 1.1rem; font-weight: 700;">${bus.name}</h3>
        <p style="font-size: 0.9rem; color: #6b7280; margin-bottom: 1rem;">
          <strong>Number Plate:</strong> ${bus.number_plate}
        </p>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; margin-bottom: 1rem; font-size: 0.85rem;">
          <div><strong>Type:</strong> ${bus.type}</div>
          <div><strong>Seats:</strong> ${bus.total_seats}</div>
          <div><strong>Status:</strong> <span class="status-badge ${bus.status}">${bus.status}</span></div>
          <div><strong>Price/Km:</strong> ₹${bus.price_per_km}</div>
        </div>
        ${bus.route_cities ? `<p style="font-size: 0.85rem; color: #6b7280;"><strong>Route:</strong> ${bus.route_cities}</p>` : ''}
        <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
          <button class="btn-secondary" onclick="editBus('${bus.id}')">Edit</button>
          <button class="btn-secondary" onclick="deleteBus('${bus.id}')">Delete</button>
        </div>
      </div>
    </div>
  `).join('');

  // Populate seat management select
  const select = document.getElementById('seatBusSelect');
  select.innerHTML = '<option value="">Choose a bus...</option>' + state.buses.map(bus => 
    `<option value="${bus.id}">${bus.name} (${bus.number_plate})</option>`
  ).join('');
}

function editBus(busId) {
  const bus = state.buses.find(b => b.id === busId);
  if (!bus) return;

  document.getElementById('busName').value = bus.name;
  document.getElementById('busType').value = bus.type;
  document.getElementById('busNumberPlate').value = bus.number_plate;
  document.getElementById('busTotalSeats').value = bus.total_seats;
  document.getElementById('busPricePerKm').value = bus.price_per_km;
  document.getElementById('busDriverName').value = bus.driver_name || '';
  document.getElementById('busRouteCities').value = bus.route_cities || '';

  document.getElementById('addBusForm').dataset.busId = busId;
  document.getElementById('addBusModal').style.display = 'flex';
}

async function deleteBus(busId) {
  if (!confirm('Are you sure you want to delete this bus?')) return;

  try {
    const res = await fetch(`${API_BASE}/bus/${busId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();

    if (data.success) {
      showToast('Bus deleted successfully', 'success');
      loadBuses();
    } else {
      showToast(data.message || 'Failed to delete bus', 'error');
    }
  } catch (err) {
    console.error('Delete bus error:', err);
    showToast('Error deleting bus', 'error');
  }
}

async function loadBookings() {
  try {
    const res = await fetch(`${API_BASE}/dashboard/bookings`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();

    if (data.success) {
      state.bookings = data.bookings || [];
      renderAllBookings();
    }
  } catch (err) {
    console.error('Load bookings error:', err);
  }
}

function renderAllBookings() {
  const container = document.getElementById('bookingsList');
  if (state.bookings.length === 0) {
    container.innerHTML = '<div class="empty-state">No bookings found</div>';
    return;
  }

  container.innerHTML = state.bookings.map(booking => `
    <div class="list-item">
      <div class="list-item-main">
        <span class="list-item-title">#${booking.id?.slice(-6) || 'N/A'} - ${booking.bus_name || 'Unknown Bus'}</span>
        <span class="list-item-subtitle">${booking.travel_date} • ${booking.passenger_name} (${booking.passenger_phone})</span>
      </div>
      <div class="list-item-meta">
        <div class="list-item-value">₹${booking.totalAmount || 0}</div>
        <div class="list-item-status">${booking.status || 'pending'}</div>
      </div>
    </div>
  `).join('');

  document.getElementById('bookingBadge').textContent = state.bookings.filter(b => b.status === 'pending').length;
  document.getElementById('bookingBadge').style.display = state.bookings.filter(b => b.status === 'pending').length > 0 ? 'inline' : 'none';
}

async function loadEarnings() {
  try {
    const res = await fetch(`${API_BASE}/dashboard/earnings`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();

    if (data.success) {
      state.earnings = data.earnings || {};
      const total = Object.values(state.earnings).reduce((sum, val) => sum + val, 0);
      document.getElementById('totalEarningsValue').textContent = '₹' + total.toLocaleString('en-IN');
      renderEarnings();
    }
  } catch (err) {
    console.error('Load earnings error:', err);
  }
}

function renderEarnings() {
  const monthlyContainer = document.getElementById('monthlyEarnings');
  const breakdownContainer = document.getElementById('earningsBreakdown');

  if (Object.keys(state.earnings).length === 0) {
    monthlyContainer.innerHTML = '<div class="empty-state">No earnings data yet</div>';
    breakdownContainer.innerHTML = '<div class="empty-state">No transactions yet</div>';
    return;
  }

  const monthlyHTML = Object.entries(state.earnings).map(([month, amount]) => `
    <div class="list-item">
      <div class="list-item-main">
        <span class="list-item-title">${month}</span>
      </div>
      <div class="list-item-meta">
        <div class="list-item-value">₹${amount.toLocaleString('en-IN')}</div>
      </div>
    </div>
  `).join('');

  monthlyContainer.innerHTML = monthlyHTML;
  breakdownContainer.innerHTML = monthlyHTML;
}

async function loadProfile() {
  try {
    const res = await fetch(`${API_BASE}/profile`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();

    if (data.success) {
      const collab = data.collaborator;
      document.getElementById('profileName').value = collab.name || '';
      document.getElementById('profilePhone').value = collab.phone || '';
      document.getElementById('profileCity').value = collab.city || '';
      document.getElementById('profileState').value = collab.state || '';
      document.getElementById('profileAddress').value = collab.address || '';
      document.getElementById('profileBusinessName').value = collab.businessName || '';
      document.getElementById('profileBusinessType').value = collab.businessType || '';
      document.getElementById('profileBusinessDesc').value = collab.businessDesc || '';
      document.getElementById('profileUpiId').value = collab.upiId || '';
      document.getElementById('profileAadhaar').value = collab.aadhaar || '';
      document.getElementById('profilePan').value = collab.pan || '';
      document.getElementById('profileDL').value = collab.dl || '';
      document.getElementById('profileRC').value = collab.rc || '';
      document.getElementById('profilePermit').value = collab.permit || '';
      document.getElementById('profileGST').value = collab.gst || '';
    }
  } catch (err) {
    console.error('Load profile error:', err);
  }
}

async function saveProfile() {
  try {
    const res = await fetch(`${API_BASE}/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({
        name: document.getElementById('profileName').value,
        city: document.getElementById('profileCity').value,
        state: document.getElementById('profileState').value,
        address: document.getElementById('profileAddress').value,
        businessName: document.getElementById('profileBusinessName').value,
        businessDesc: document.getElementById('profileBusinessDesc').value,
        upiId: document.getElementById('profileUpiId').value,
        aadhaar: document.getElementById('profileAadhaar').value,
        pan: document.getElementById('profilePan').value,
        dl: document.getElementById('profileDL').value,
        rc: document.getElementById('profileRC').value,
        permit: document.getElementById('profilePermit').value,
        gst: document.getElementById('profileGST').value
      })
    });
    const data = await res.json();

    if (data.success) {
      state.collaborator = data.collaborator;
      localStorage.setItem('collabData', JSON.stringify(state.collaborator));
      showToast('Profile updated successfully', 'success');
    } else {
      showToast(data.message || 'Failed to update profile', 'error');
    }
  } catch (err) {
    console.error('Save profile error:', err);
    showToast('Error saving profile', 'error');
  }
}

async function loadVerificationStatus() {
  try {
    const res = await fetch(`${API_BASE}/verification/status`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();

    if (data.success) {
      const status = data.verificationStatus || {};
      const statusHTML = `
        <div class="verification-item">
          <div class="verification-item-main">
            <span class="verification-item-title">Account Status</span>
            <span class="verification-item-subtitle">Current verification status of your account</span>
          </div>
          <span class="status-badge ${status.status}">${(status.status || 'pending').replace('_', ' ')}</span>
        </div>
        ${status.rejectionReason ? `
          <div class="verification-item" style="border-color: #ef4444; background: rgba(239, 68, 68, 0.05);">
            <div class="verification-item-main">
              <span class="verification-item-title" style="color: #ef4444;">Rejection Reason</span>
              <span class="verification-item-subtitle">${status.rejectionReason}</span>
            </div>
          </div>
        ` : ''}
      `;
      document.getElementById('verificationStatus').innerHTML = statusHTML;
    }
  } catch (err) {
    console.error('Load verification status error:', err);
  }
}

async function requestVerification() {
  try {
    const res = await fetch(`${API_BASE}/verification/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({
        aadhaar: document.getElementById('profileAadhaar').value,
        pan: document.getElementById('profilePan').value,
        dl: document.getElementById('profileDL').value,
        rc: document.getElementById('profileRC').value,
        permit: document.getElementById('profilePermit').value,
        gst: document.getElementById('profileGST').value
      })
    });
    const data = await res.json();

    if (data.success) {
      showToast('Verification request submitted!', 'success');
      loadVerificationStatus();
    } else {
      const msg = Array.isArray(data.errors) ? data.errors.join(', ') : data.message;
      showToast(msg || 'Failed to submit verification', 'error');
    }
  } catch (err) {
    console.error('Request verification error:', err);
    showToast('Error submitting verification', 'error');
  }
}

// ========== BUS MANAGEMENT ==========
function openAddBusModal() {
  document.getElementById('addBusForm').reset();
  delete document.getElementById('addBusForm').dataset.busId;
  document.getElementById('addBusModal').style.display = 'flex';
}

function closeAddBusModal() {
  document.getElementById('addBusModal').style.display = 'none';
}

async function handleAddBus(e) {
  e.preventDefault();
  const busId = document.getElementById('addBusForm').dataset.busId;
  const busData = {
    name: document.getElementById('busName').value,
    type: document.getElementById('busType').value,
    number_plate: document.getElementById('busNumberPlate').value,
    total_seats: parseInt(document.getElementById('busTotalSeats').value),
    seat_layout: document.getElementById('busSeatLayout').value,
    price_per_km: parseFloat(document.getElementById('busPricePerKm').value),
    driver_name: document.getElementById('busDriverName').value,
    route_cities: document.getElementById('busRouteCities').value
  };

  try {
    const method = busId ? 'PUT' : 'POST';
    const url = busId ? `${API_BASE}/bus/${busId}` : `${API_BASE}/bus`;

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify(busData)
    });
    const data = await res.json();

    if (data.success) {
      showToast(busId ? 'Bus updated successfully' : 'Bus created successfully', 'success');
      closeAddBusModal();
      loadBuses();
    } else {
      const msg = Array.isArray(data.errors) ? data.errors.join(', ') : data.message;
      showToast(msg || 'Failed to save bus', 'error');
    }
  } catch (err) {
    console.error('Add bus error:', err);
    showToast('Error saving bus', 'error');
  }
}

// ========== SEAT MANAGEMENT ==========
async function loadBusesForSeatMap() {
  if (state.buses.length === 0) {
    await loadBuses();
  }
}

async function loadSeatMap() {
  const busId = document.getElementById('seatBusSelect').value;
  const date = document.getElementById('seatDate').value;

  if (!busId || !date) {
    showToast('Please select a bus and date', 'warning');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/bus/${busId}/seats?date=${date}`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();

    if (data.success) {
      renderSeatMap(data.seats, data.stats);
      document.getElementById('seatMapContainer').style.display = 'block';
    } else {
      showToast(data.message || 'Failed to load seats', 'error');
    }
  } catch (err) {
    console.error('Load seat map error:', err);
    showToast('Error loading seat map', 'error');
  }
}

function renderSeatMap(seats, stats) {
  const seatStatsEl = document.getElementById('seatStats');
  seatStatsEl.innerHTML = `
    <div class="seat-stat">
      <div class="seat-stat-value">${stats.total}</div>
      <div class="seat-stat-label">Total Seats</div>
    </div>
    <div class="seat-stat">
      <div class="seat-stat-value" style="color: #10b981;">${stats.available}</div>
      <div class="seat-stat-label">Available</div>
    </div>
    <div class="seat-stat">
      <div class="seat-stat-value" style="color: #ef4444;">${stats.booked}</div>
      <div class="seat-stat-label">Booked</div>
    </div>
    <div class="seat-stat">
      <div class="seat-stat-value" style="color: #f59e0b;">${stats.blocked}</div>
      <div class="seat-stat-label">Blocked</div>
    </div>
    <div class="seat-stat">
      <div class="seat-stat-value">${Math.round((stats.booked / stats.total) * 100)}%</div>
      <div class="seat-stat-label">Occupancy</div>
    </div>
  `;

  const seatGridEl = document.getElementById('seatGrid');
  seatGridEl.innerHTML = seats.map(seat => `
    <div class="seat ${seat.status}" title="${seat.seatId} - ${seat.status}" onclick="toggleSeat(this, '${seat.seatId}')">
      ${seat.seatNumber}
    </div>
  `).join('');
}

async function toggleSeat(element, seatId) {
  const busId = document.getElementById('seatBusSelect').value;
  const date = document.getElementById('seatDate').value;
  const currentStatus = element.classList[1];

  if (currentStatus === 'booked' || currentStatus === 'blocked') {
    showToast('Cannot change this seat status', 'warning');
    return;
  }

  const newStatus = currentStatus === 'available' ? 'blocked' : 'available';

  try {
    const res = await fetch(`${API_BASE}/bus/${busId}/seat/${seatId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ status: newStatus, date })
    });
    const data = await res.json();

    if (data.success) {
      element.classList.remove(currentStatus);
      element.classList.add(newStatus);
      showToast(`Seat marked as ${newStatus}`, 'success');
    } else {
      showToast(data.message || 'Failed to update seat', 'error');
    }
  } catch (err) {
    console.error('Toggle seat error:', err);
    showToast('Error updating seat', 'error');
  }
}

// ========== UTILITY FUNCTIONS ==========
function refreshData() {
  const pageToRefresh = state.currentPage;
  switchPage(pageToRefresh);
  showToast('Data refreshed', 'success');
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.style.display = 'block';

  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

// ========== CLICK OUTSIDE MODAL ==========
document.addEventListener('click', (e) => {
  const modal = document.getElementById('addBusModal');
  if (e.target === modal) {
    closeAddBusModal();
  }
});
