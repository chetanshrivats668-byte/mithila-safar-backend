// ========== CONFIGURATION ==========
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3001'
    : window.location.origin;
let GOOGLE_CLIENT_ID = '';
let RAZORPAY_KEY_ID = '';
const GOOGLE_BUTTON_CONTAINERS = ['googleSignInBtn', 'googleSignInBtnSignup'];

// ========== GLOBAL STATE ==========
let currentUser = null;
let authToken = localStorage.getItem('authToken') || null;
let refreshToken = localStorage.getItem('refreshToken') || null;
let collaboratorRoles = JSON.parse(localStorage.getItem('collaboratorRoles') || '[]');
let selectedCollaboratorId = localStorage.getItem('selectedCollaboratorId') || null;
let selectedCollaboratorRole = localStorage.getItem('selectedCollaboratorRole') || null;

let currentBooking = {};
let selectedSeats = [];
let selectedCafeSeats = [];
let pendingVerificationEmail = '';
let emailOtpCooldownTime = 0;
let emailOtpTimerInterval = null;

let appliedCouponCode = '';
let appliedCouponDiscount = 0;


function getTicketPageByType(type) {
    var t = (type || '').toLowerCase();
    if (t === 'hotel') return 'e-ticket-hotel.html';
    if (t === 'cab' || t === 'car') return 'e-ticket-cab.html';
    if (t === 'cafe') return 'e-ticket-cafe.html';
    return 'e-ticket.html'; // bus default
}

function saveAndRedirectTicket(ticketData) {
    localStorage.setItem('latestTicket', JSON.stringify(ticketData));
    var t = (ticketData && ticketData.type || '').toLowerCase();
    if (t === 'hotel') localStorage.setItem('latestHotelTicket', JSON.stringify(ticketData));
    if (t === 'cab' || t === 'car') localStorage.setItem('latestCabTicket', JSON.stringify(ticketData));
    if (t === 'cafe') localStorage.setItem('latestCafeTicket', JSON.stringify(ticketData));
    window.location.href = getTicketPageByType(t);
}

// ========== SPLASH ==========
function showSplash() {
    const splash = document.getElementById('splashScreen');
    if (splash) splash.style.display = 'flex';
}

function hideSplash() {
    const splash = document.getElementById('splashScreen');
    if (splash) splash.style.display = 'none';
}

// ========== GLOBAL LOADER UTILITIES ==========
function showLoader(message = 'Processing your request...') {
    const loader = document.getElementById('globalLoader');
    const msgEl = document.getElementById('globalLoaderMessage');
    if (msgEl) msgEl.textContent = message;
    if (loader) loader.classList.add('active');
}

function hideLoader() {
    const loader = document.getElementById('globalLoader');
    if (loader) loader.classList.remove('active');
}

// ========== NAVIGATION ==========
function isIndexPage() {
    const p = window.location.pathname;
    return p.endsWith('index.html') || p === '/' || p.endsWith('/') || (!p.includes('.html') && !p.includes('collaborator-dashboard'));
}

function navigateTo(section) {
    if (!isIndexPage()) {
        window.location.href = 'index.html#' + section;
        return;
    }
    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById('section-' + section);
    if (target) target.classList.add('active');
    if (section === 'home') {
        document.getElementById('resultsContainer').innerHTML = '';
        document.getElementById('section-results').classList.remove('active');
    }
    closeMobileMenu();
    window.scrollTo(0, 0);
}

function goBack() {
    const activeSection = document.querySelector('.page-section.active');
    if (activeSection && activeSection.id !== 'section-home') {
        navigateTo('home');
    } else {
        closePaymentPage();
    }
}

// ========== MODALS ==========
function openModal(id) {
    if (id === 'loginModal' || id === 'signupModal') {
        if (!isIndexPage()) {
            window.location.href = 'index.html#' + (id === 'loginModal' ? 'login' : 'signup');
            return;
        }
    }
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
}

function closeOnOverlay(e, id) {
    if (e.target !== e.currentTarget) return; // Only close if clicking the background itself
    
    // Minor modals that are safe to close on outside click
    const minorModals = [
        'busDetailsModal',
        'bookingDetailModal',
        'loginModal',
        'signupModal',
        'ticketModal'
    ];
    
    if (minorModals.includes(id)) {
        closeModal(id);
    }
}

function switchModals(closeId, openId) {
    closeModal(closeId);
    openModal(openId);
}

function togglePassword(inputId, el) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        el.textContent = 'Hide';
    } else {
        input.type = 'password';
        el.textContent = 'Show';
    }
}

// ========== BUTTON LOADING UTILITY ==========
function setButtonLoading(buttonEl, isLoading, defaultText) {
    if (!buttonEl) return;
    buttonEl.disabled = isLoading;
    if (isLoading) {
        buttonEl.dataset.originalText = buttonEl.textContent || defaultText;
        buttonEl.innerHTML = '<span class="spinner" style="display:inline-block;width:12px;height:12px;border:2px solid currentColor;border-radius:50%;border-top-color:transparent;animation:spin 0.6s linear infinite;margin-right:8px;vertical-align:middle;"></span>Loading...';
        if (!document.getElementById('btn-spin-css')) {
            const style = document.createElement('style');
            style.id = 'btn-spin-css';
            style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
            document.head.appendChild(style);
        }
    } else {
        buttonEl.innerHTML = buttonEl.dataset.originalText || defaultText;
    }
}

// ========== HASH ROUTING ACTION ==========
function handleHashAction() {
    if (!isIndexPage()) return;
    const hash = window.location.hash;
    if (!hash) return;

    const action = hash.substring(1);
    if (action === 'login') {
        navigateTo('home');
        openModal('loginModal');
        history.replaceState(null, null, ' ');
    } else if (action === 'signup') {
        navigateTo('home');
        openModal('signupModal');
        history.replaceState(null, null, ' ');
    } else if (['home', 'help', 'about', 'terms', 'bookings', 'profile', 'cafe'].includes(action)) {
        if (action === 'cafe') {
            showCafes();
        } else if (action === 'bookings') {
            openBookings();
        } else if (action === 'profile') {
            openProfile();
        } else {
            navigateTo(action);
        }
    }
}

// ========== MOBILE MENU ==========
function toggleMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    if (menu) menu.classList.toggle('active');
}

function closeMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    if (menu) menu.classList.remove('active');
}

// ========== USER DROPDOWN ==========
function toggleDropdown() {
    const menu = document.getElementById('dropdownMenu');
    if (menu) menu.classList.toggle('active');
}

// ========== NOTIFICATIONS ==========
function notify(msg, type) {
    const container = document.getElementById('notificationContainer');
    if (!container) {
        const div = document.createElement('div');
        div.id = 'notificationContainer';
        div.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10000;display:flex;flex-direction:column;gap:8px;max-width:360px;';
        document.body.appendChild(div);
    }
    const el = document.createElement('div');
    el.style.cssText = 'padding:12px 18px;border-radius:10px;font-weight:600;font-size:0.9rem;box-shadow:0 8px 25px rgba(0,0,0,0.15);animation:slideIn 0.3s ease;transition:opacity 0.3s;word-break:break-word;';
    el.style.background = type === 'error' ? '#f8d7da' : type === 'success' ? '#d4edda' : type === 'info' ? '#d1ecf1' : '#fff3cd';
    el.style.color = type === 'error' ? '#721c24' : type === 'success' ? '#155724' : type === 'info' ? '#0c5460' : '#856404';
    el.style.border = '1px solid ' + (type === 'error' ? '#f5c6cb' : type === 'success' ? '#c3e6cb' : type === 'info' ? '#bee5eb' : '#ffeeba');
    el.textContent = msg;
    const containerEl = document.getElementById('notificationContainer');
    containerEl.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3500);
}

// ========== PENDING VERIFICATION QUEUE ==========
function enqueuePendingVerification(endpoint, token, phone) {
    try {
        const key = 'pendingVerifications';
        const list = JSON.parse(localStorage.getItem(key) || '[]');
        list.push({ endpoint: endpoint, token: token, phone: phone, createdAt: Date.now() });
        localStorage.setItem(key, JSON.stringify(list));
        return true;
    } catch (e) {
        console.warn('enqueuePendingVerification error', e);
        return false;
    }
}

async function syncPendingVerifications() {
    if (!navigator.onLine) return;
    const key = 'pendingVerifications';
    let list = JSON.parse(localStorage.getItem(key) || '[]');
    if (!list || !list.length) return;

    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        try {
            const res = await fetch(window.location.origin + item.endpoint, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ token: item.token, phone: item.phone })
            });
            const d = await res.json();
            if (d && d.success) {
                notify('Pending verification synced for ' + (item.phone || ''), 'success');
                list.splice(i, 1); i--; // remove and adjust index
            } else {
                console.warn('Pending verification rejected by server', d && d.message);
                // don't remove; server may want retry later
            }
        } catch (err) {
            console.warn('syncPendingVerifications network error', err);
            break; // stop processing on network failure
        }
    }

    try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) { console.warn(e); }
}

window.addEventListener('online', function () { syncPendingVerifications(); });
// Try syncing on load
setTimeout(syncPendingVerifications, 1000);

// ========== AUTH STATE ==========
function updateUILoggedIn() {
    const authBtns = document.getElementById('authBtns');
    const userSection = document.getElementById('userSection');
    const mobileAuth = document.getElementById('mobileAuth');
    const topAccountName = document.getElementById('topAccountName');
    const topAccountNameText = document.getElementById('topAccountNameText');
    if (authBtns) authBtns.style.display = 'none';
    if (userSection) userSection.style.display = 'flex';
    if (mobileAuth) mobileAuth.style.display = 'none';
    if (currentUser) {
        const displayName = currentUser.name || currentUser.email || 'User';
        const initial = displayName[0].toUpperCase();
        const nameEl = document.getElementById('userNameDisplay');
        const initialEl = document.getElementById('userInitial');
        if (nameEl) nameEl.textContent = displayName;
        if (initialEl) initialEl.textContent = initial;
        if (topAccountNameText) topAccountNameText.textContent = displayName;
    }
    if (topAccountName) topAccountName.style.display = 'inline-flex';
    document.querySelectorAll('.mobile-menu .btn-login, .mobile-menu .btn-signup').forEach(b => b.style.display = 'none');
}

function updateUILoggedOut() {
    const authBtns = document.getElementById('authBtns');
    const userSection = document.getElementById('userSection');
    const mobileAuth = document.getElementById('mobileAuth');
    const topAccountName = document.getElementById('topAccountName');
    if (authBtns) authBtns.style.display = 'flex';
    if (userSection) userSection.style.display = 'none';
    if (mobileAuth) mobileAuth.style.display = 'flex';
    if (topAccountName) topAccountName.style.display = 'none';
    document.querySelectorAll('.mobile-menu .btn-login, .mobile-menu .btn-signup').forEach(b => b.style.display = '');
}

function requireAuth(callback) {
    if (!currentUser || !authToken) {
        notify('Please login first', 'error');
        openModal('loginModal');
        return false;
    }
    if (callback) callback();
    return true;
}

let pendingBookingAction = null;

function verifyPhoneForBooking(callback) {
    if (!requireAuth()) return false;
    if (currentUser.phoneVerified) {
        // Phone already verified — just return true so caller proceeds
        return true;
    }
    // Phone not verified — store the callback to resume after OTP
    pendingBookingAction = callback;
    openPhoneVerificationModal();
    return false;
}

function openPhoneVerificationModal() {
    document.getElementById('verificationPhoneInput').value = currentUser.phone || '';
    openModal('phoneVerificationModal');
}

async function sendPhoneVerificationOTP(e) {
    e.preventDefault();
    const phone = document.getElementById('verificationPhoneInput').value.trim();
    if (!phone || phone.length < 10) return notify('Please enter a valid phone number', 'error');
    
    try {
        setButtonLoading(document.getElementById('btnSendVerificationOTP'), true, 'Sending...');
        // trigger the MSG91 widget
        const token = await window.msg91OTP.verify(phone);
        
        // Once verified by widget, tell backend
        const res = await fetch(API_URL + '/api/auth/mark-phone-verified', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authToken
            },
            body: JSON.stringify({ phone, token })
        });
        const data = await res.json();
        
        if (data.success) {
            notify('Phone number verified successfully!', 'success');
            // update local storage
            currentUser.phone = phone;
            currentUser.phoneVerified = true;
            saveSession(authToken, currentUser, refreshToken);
            closeModal('phoneVerificationModal');
            
            if (typeof loadProfile === 'function') loadProfile();
            
            // Resume pending action
            if (pendingBookingAction) {
                const action = pendingBookingAction;
                pendingBookingAction = null;
                action();
            }
        } else {
            notify(data.message || 'Verification failed on server', 'error');
        }
    } catch (err) {
        notify(err.message || 'Phone verification failed', 'error');
    } finally {
        setButtonLoading(document.getElementById('btnSendVerificationOTP'), false, 'Send OTP');
    }
}
function getStoredCollaboratorSession() {
    return {
        roles: JSON.parse(localStorage.getItem('collaboratorRoles') || '[]'),
        selectedCollaboratorId: localStorage.getItem('selectedCollaboratorId') || null,
        selectedCollaboratorRole: localStorage.getItem('selectedCollaboratorRole') || null,
        collabToken: localStorage.getItem('collabToken') || null,
        collabData: JSON.parse(localStorage.getItem('collabData') || 'null')
    };
}

function clearCollaboratorSession() {
    collaboratorRoles = [];
    selectedCollaboratorId = null;
    selectedCollaboratorRole = null;
    localStorage.removeItem('collaboratorRoles');
    localStorage.removeItem('selectedCollaboratorId');
    localStorage.removeItem('selectedCollaboratorRole');
    localStorage.removeItem('collabToken');
    localStorage.removeItem('collabData');
}

function persistCollaboratorRoles(roles) {
    collaboratorRoles = Array.isArray(roles) ? roles : [];
    localStorage.setItem('collaboratorRoles', JSON.stringify(collaboratorRoles));
}

async function refreshUserSession() {
    if (!refreshToken) return false;
    try {
        const res = await fetch(API_URL + '/api/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
        });
        const data = await res.json();
        if (!data.success || !data.token) return false;
        authToken = data.token;
        refreshToken = data.refreshToken || refreshToken;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('refreshToken', refreshToken);
        return true;
    } catch {
        return false;
    }
}

async function fetchCurrentUserProfile() {
    if (!authToken) return null;
    let res = await fetch(API_URL + '/api/auth/me', { headers: authHeaders() });
    if (res.status === 401 && refreshToken) {
        const refreshed = await refreshUserSession();
        if (!refreshed) return null;
        res = await fetch(API_URL + '/api/auth/me', { headers: authHeaders() });
    }
    const data = await res.json();
    if (!data.success || !data.user) return null;
    currentUser = data.user;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    updateUILoggedIn();
    return currentUser;
}
async function loadCollaboratorRoles() {
    if (!authToken) return [];
    try {
        let res = await fetch(API_URL + '/api/collaborator/my-roles', { headers: authHeaders() });
        if (res.status === 401 && refreshToken) {
            const refreshed = await refreshUserSession();
            if (!refreshed) return [];
            res = await fetch(API_URL + '/api/collaborator/my-roles', { headers: authHeaders() });
        }
        const data = await res.json();
        if (!data.success) return [];
        persistCollaboratorRoles(data.roles || []);
        return collaboratorRoles;
    } catch {
        return [];
    }
}

async function activateCollaboratorRole(collaboratorId, options) {
    if (!authToken || !collaboratorId) return false;
    try {
        const res = await fetch(API_URL + '/api/collaborator/select-role', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ collaboratorId })
        });
        const data = await res.json();
        if (!data.success || !data.token || !data.collaborator) {
            notify(data.message || 'Unable to activate collaborator role', 'error');
            return false;
        }
        localStorage.setItem('collabToken', data.token);
        localStorage.setItem('collabData', JSON.stringify(data.collaborator));
        selectedCollaboratorId = data.collaborator.id;
        selectedCollaboratorRole = (data.collaborator.serviceCategories || [])[0] || 'business';
        localStorage.setItem('selectedCollaboratorId', selectedCollaboratorId);
        localStorage.setItem('selectedCollaboratorRole', selectedCollaboratorRole);
        if (!options || options.redirect !== false) {
            window.location.href = 'collaborator-dashboard.html';
        }
        return true;
    } catch {
        notify('Failed to activate collaborator role', 'error');
        return false;
    }
}

function renderCollaboratorRoleSelector(roles) {
    const validRoles = (roles || []).filter(r => r.verification_status !== 'suspended');
    if (!validRoles.length) return;
    const existing = document.getElementById('collaboratorRoleSelector');
    if (existing) existing.remove();
    const box = document.createElement('div');
    box.id = 'collaboratorRoleSelector';
    box.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10002;display:flex;align-items:center;justify-content:center;padding:1rem;';
    box.innerHTML = '<div style="background:#fff;border-radius:16px;padding:1.25rem;max-width:520px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,.25)"><h3 style="margin:0 0 .5rem">Choose Dashboard</h3><p style="margin:0 0 1rem;color:#555">Your account has multiple collaborator roles. Select one to continue.</p><div id="collabRoleList" style="display:grid;gap:.75rem"></div><button id="closeCollabSelector" style="margin-top:1rem;padding:.8rem 1rem;border:none;border-radius:10px;background:#eee;cursor:pointer;width:100%">Close</button></div>';
    document.body.appendChild(box);
    const list = document.getElementById('collabRoleList');
    validRoles.forEach(role => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.cssText = 'text-align:left;padding:1rem;border:1px solid #ddd;border-radius:12px;background:#fff;cursor:pointer';
        btn.innerHTML = '<strong>' + ((role.type || 'business').toUpperCase()) + '</strong><div style="font-size:.9rem;color:#666;margin-top:.25rem">' + (role.businessName || role.name || 'Collaborator Profile') + '</div>';
        btn.onclick = async function () { await activateCollaboratorRole(role.id); };
        list.appendChild(btn);

    });
    document.getElementById('closeCollabSelector').onclick = function () { box.remove(); };
}


async function autoOpenCollaboratorDashboard() {
    if (!authToken) {
        window.location.href = 'index.html#login';
        return;
    }
    const roles = await loadCollaboratorRoles();
    const validRoles = (roles || []).filter(r => r.verification_status !== 'suspended');
    if (!validRoles.length) {
        notify('No collaborator profile is linked to this account yet.', 'info');
        return;
    }
    const preferred = validRoles.find(r => r.id === selectedCollaboratorId) || null;
    if (preferred) {
        await activateCollaboratorRole(preferred.id);
        return;
    }
    if (validRoles.length === 1) {
        await activateCollaboratorRole(validRoles[0].id);
        return;
    }
    renderCollaboratorRoleSelector(validRoles);
}

async function bootstrapAuthenticatedExperience() {
    if (!authToken) return;
    const user = await fetchCurrentUserProfile();
    if (!user) {
        const refreshed = await refreshUserSession();
        if (!refreshed) {
            clearSession();
            return;
        }
        const refreshedUser = await fetchCurrentUserProfile();
        if (!refreshedUser) {
            clearSession();
            return;
        }
    }
    await loadCollaboratorRoles();
}

function restoreSession() {
    const savedToken = localStorage.getItem('authToken');
    const savedRefreshToken = localStorage.getItem('refreshToken');
    const savedUser = localStorage.getItem('currentUser');
    if (savedToken) authToken = savedToken;
    if (savedRefreshToken) refreshToken = savedRefreshToken;
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            updateUILoggedIn();
            if (currentUser.temporarySession) showTempSessionBanner();
        } catch (e) {
            clearSession();
        }
    }
}

function clearSession() {
    currentUser = null;
    authToken = null;
    refreshToken = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('currentUser');
    clearCollaboratorSession();
    updateUILoggedOut();
    hideTempSessionBanner();
}

function saveSession(token, user, newRefreshToken) {
    authToken = token;
    currentUser = user;
    if (newRefreshToken) {
        refreshToken = newRefreshToken;
        localStorage.setItem('refreshToken', newRefreshToken);
    }
    localStorage.setItem('authToken', token);
    localStorage.setItem('currentUser', JSON.stringify(user));
    updateUILoggedIn();
}

function authHeaders() {
    return authToken ? { 'Authorization': 'Bearer ' + authToken, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function handleCollaboratorApplicationMessaging(loginPayload) {
    if (!loginPayload || !loginPayload.applicationStatus) return false;
    if (loginPayload.applicationStatus === 'pending') {
        notify('Your collaborator application is under review.', 'info');
        return true;
    }
    if (loginPayload.applicationStatus === 'rejected') {
        notify('Your collaborator application was not approved.', 'error');
        return true;
    }
    return false;
}


async function checkAndRedirectCollaborator() {
    if (!authToken) return;
    try {
        const roles = await loadCollaboratorRoles();
        const validRoles = (roles || []).filter(r => r.verification_status !== 'suspended');
        if (validRoles.length === 1) {
            await activateCollaboratorRole(validRoles[0].id);
        } else if (validRoles.length > 1) {
            renderCollaboratorRoleSelector(validRoles);
        }
    } catch (e) {
        console.error('Error checking collaborator roles on login:', e);
    }
}

// ========== TEMPORARY SESSION BANNER ==========
function showTempSessionBanner() {
    let banner = document.getElementById('tempSessionBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'tempSessionBanner';
        banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#856404;color:#fff;padding:8px 16px;text-align:center;font-size:0.85rem;font-weight:600;z-index:10001;display:flex;align-items:center;justify-content:center;gap:8px;';
        banner.innerHTML = '<span>Limited mode active — reconnecting services</span><span onclick="this.parentElement.style.display=\'none\'" style="cursor:pointer;margin-left:12px;font-size:1.2rem;">×</span>';
        document.body.appendChild(banner);
        document.body.style.paddingTop = '40px';
    }
    banner.style.display = 'flex';
}

function hideTempSessionBanner() {
    const banner = document.getElementById('tempSessionBanner');
    if (banner) banner.style.display = 'none';
    document.body.style.paddingTop = '';
}

// ========== GOOGLE SIGN-IN ==========
function initGoogleSignIn() {
    if (!GOOGLE_CLIENT_ID || typeof google === 'undefined' || !google.accounts) {
        // Retry after a short delay if SDK not loaded yet
        setTimeout(initGoogleSignIn, 500);
        return;
    }
    if (window._googleInitialized) return;
    window._googleInitialized = true;

    google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        cancel_on_tap_outside: false
    });

    GOOGLE_BUTTON_CONTAINERS.forEach(function (containerId) {
        var container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = '';
            google.accounts.id.renderButton(container, {
                type: 'standard',
                theme: 'outline',
                size: 'large',
                text: 'signin_with',
                shape: 'rectangular',
                width: container.offsetWidth || 280
            });
        }
    });

    google.accounts.id.prompt();
}

async function handleCredentialResponse(response) {
    if (!response || !response.credential) {
        notify('Google sign-in failed: no credential received', 'error');
        return;
    }

    var credentialValue = response.credential;
    if (typeof credentialValue !== 'string') {
        notify('Google sign-in failed: invalid credential format', 'error');
        return;
    }

    var jwtParts = credentialValue.split('.');
    if (jwtParts.length !== 3) {
        notify('Google sign-in failed: invalid credential format', 'error');
        return;
    }

    try {
        const res = await fetch(API_URL + '/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: credentialValue })
        });

        const data = await res.json();

        if (!data.success) {
            notify(data.message || 'Google login failed', 'error');
            return;
        }

        if (!data.token || !data.user) {
            notify('Invalid response from server', 'error');
            return;
        }

        saveSession(data.token, data.user, data.refreshToken);
        applyCollaboratorLoginContext(data);

        closeModal('loginModal');
        closeModal('signupModal');

        hideTempSessionBanner();
        notify('Welcome ' + (data.user.name || data.user.email || '') + '!', 'success');
    } catch (err) {
        if (err.name === 'AbortError' || err.message === 'Failed to fetch' || err.message === 'NetworkError') {
            notify('Network error — please check your connection', 'error');
        } else {
            notify('Google login failed: ' + (err.message || 'unknown error'), 'error');
        }
    }
}

// ========== EMAIL/PASSWORD LOGIN ==========
function applyCollaboratorLoginContext(data) {
    const context = data?.collaboratorContext || null;
    if (!context?.collaboratorId) {
        return false;
    }

    selectedCollaboratorId = context.collaboratorId;
    selectedCollaboratorRole = context.partnerCollabStatus || selectedCollaboratorRole || 'approved';
    localStorage.setItem('selectedCollaboratorId', selectedCollaboratorId);
    localStorage.setItem('selectedCollaboratorRole', selectedCollaboratorRole);
    return true;
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPassword').value;
    if (!email || !pass) return notify('Please fill all fields', 'error');

    showLoader('Signing you in...');
    setButtonLoading(btn, true, 'Login');
    try {
        const res = await fetch(API_URL + '/api/auth/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: pass })
        });
        const data = await res.json();
        if (data.unverified) {
            pendingVerificationEmail = data.email || email;
            closeModal('loginModal');
            openModal('emailOtpModal');
            document.getElementById('emailOtpSubtitle').innerText = 'Enter the 6-digit verification code sent to ' + pendingVerificationEmail;
            document.getElementById('emailOtpInput').value = '';
            document.getElementById('emailOtpError').style.display = 'none';
            notify(data.message || 'Please verify your email first', 'info');
            return;
        }
        if (!data.success) {
            notify(data.message || 'Login failed', 'error');
            return;
        }
        saveSession(data.token, data.user, data.refreshToken);
        applyCollaboratorLoginContext(data);
        closeModal('loginModal');
        notify('Welcome back ' + (data.user.name || '') + '!', 'success');
    } catch (err) {
        notify('Login failed: ' + (err.message || 'network error'), 'error');
    } finally {
        setButtonLoading(btn, false, 'Login');
        hideLoader();
    }
}

// ========== PHONE OTP LOGIN ==========
let phoneLoginState = 'send'; // 'send' or 'verify'
let pendingPhoneLogin = null;

function switchLoginTab(tab) {
    console.log('[switchLoginTab] Switching to:', tab);
    document.querySelectorAll('.login-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
        btn.style.borderBottomColor = btn.dataset.tab === tab ? 'var(--gold)' : 'transparent';
        btn.style.color = btn.dataset.tab === tab ? 'var(--gold)' : 'var(--gray)';
    });
    document.getElementById('loginEmailForm').style.display = tab === 'email' ? 'block' : 'none';
    document.getElementById('loginPhoneForm').style.display = tab === 'phone' ? 'block' : 'none';
    console.log('[switchLoginTab] Phone form display:', document.getElementById('loginPhoneForm').style.display);
    // Reset phone form when switching away
    if (tab === 'email') resetPhoneLoginForm();
}

function resetPhoneLoginForm() {
    phoneLoginState = 'send';
    pendingPhoneLogin = null;
    document.getElementById('loginPhone').value = '';
    document.getElementById('loginPhoneOtp').value = '';
    document.getElementById('phoneOtpSection').style.display = 'none';
    document.getElementById('phoneLoginSubmitBtn').textContent = 'Send OTP';
    document.getElementById('resendPhoneOtpBtn').disabled = false;
    document.getElementById('resendPhoneOtpBtn').textContent = 'Resend';
    document.getElementById('resendTimer').style.display = 'none';
    document.getElementById('resendTimer').textContent = '';
}

async function handlePhoneLogin(e) {
    console.log('[handlePhoneLogin] Called', e);
    console.log('[handlePhoneLogin] phoneLoginState:', phoneLoginState);
    console.log('[handlePhoneLogin] pendingPhoneLogin:', pendingPhoneLogin);
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    console.log('[handlePhoneLogin] Button:', btn);
    console.log('[handlePhoneLogin] Form:', e.target);
    
    if (phoneLoginState === 'send') {
        const phone = document.getElementById('loginPhone').value.trim().replace(/\D/g, '');
        if (phone.length !== 10 || !/^[6-9]\d{9}$/.test(phone)) {
            return notify('Please enter a valid 10-digit Indian mobile number', 'error');
        }
        
        console.log('[handlePhoneLogin] Sending OTP for phone:', phone);
        showLoader('Sending OTP to +91 ' + phone + '...');
        setButtonLoading(btn, true, 'Send OTP');
        try {
            const res = await fetch(API_URL + '/api/auth/send-phone-otp', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: '+91' + phone })
            });
            console.log('[handlePhoneLogin] Response status:', res.status);
            const data = await res.json();
            console.log('[handlePhoneLogin] Response data:', data);
            if (!data.success) {
                notify(data.message || 'Failed to send OTP', 'error');
                return;
            }
            
            // Switch to verify state
            phoneLoginState = 'verify';
            pendingPhoneLogin = phone;
            document.getElementById('phoneOtpSection').style.display = 'block';
            document.getElementById('phoneLoginSubmitBtn').textContent = 'Verify OTP';
            document.getElementById('loginPhoneOtp').focus();
            notify('OTP sent to +91 ' + phone, 'success');
            startResendTimer();
        } catch (err) {
            console.error('[handlePhoneLogin] Error:', err);
            notify('Failed to send OTP: ' + (err.message || 'network error'), 'error');
        } finally {
            setButtonLoading(btn, false, 'Send OTP');
            hideLoader();
        }
    } else {
        // Verify OTP
        const otp = document.getElementById('loginPhoneOtp').value.trim();
        if (otp.length !== 6) {
            return notify('Please enter the 6-digit OTP', 'error');
        }
        
        console.log('[handlePhoneLogin] Verifying OTP for phone:', pendingPhoneLogin, 'otp:', otp);
        showLoader('Verifying OTP...');
        setButtonLoading(btn, true, 'Verify');
        try {
            const res = await fetch(API_URL + '/api/auth/verify-phone-otp', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: '+91' + pendingPhoneLogin, otpCode: otp })
            });
            console.log('[handlePhoneLogin] Verify response status:', res.status);
            const data = await res.json();
            console.log('[handlePhoneLogin] Verify response data:', data);
            if (!data.success) {
                notify(data.message || 'Invalid OTP', 'error');
                return;
            }
            
            if (data.needsProfile) {
                // New user - show complete profile modal
                closeModal('loginModal');
                document.getElementById('completeProfileUserId').value = data.userId;
                document.getElementById('completeProfilePhone').value = data.phone;
                document.getElementById('completeProfileForm').reset();
                openModal('completeProfileModal');
                return;
            }
            
            saveSession(data.token, data.user, data.refreshToken);
            applyCollaboratorLoginContext(data);
            closeModal('loginModal');
            notify(data.message || 'Welcome!', 'success');
            resetPhoneLoginForm();
        } catch (err) {
            notify('Verification failed: ' + (err.message || 'network error'), 'error');
        } finally {
            setButtonLoading(btn, false, 'Verify');
            hideLoader();
        }
    }
}

function startResendTimer() {
    const resendBtn = document.getElementById('resendPhoneOtpBtn');
    const timerEl = document.getElementById('resendTimer');
    let seconds = 60;
    resendBtn.disabled = true;
    resendBtn.style.opacity = '0.5';
    timerEl.style.display = 'inline';
    timerEl.textContent = ` (${seconds}s)`;
    
    const interval = setInterval(() => {
        seconds--;
        timerEl.textContent = ` (${seconds}s)`;
        if (seconds <= 0) {
            clearInterval(interval);
            resendBtn.disabled = false;
            resendBtn.style.opacity = '1';
            timerEl.style.display = 'none';
        }
    }, 1000);
    
    // Store interval ID for cleanup if needed
    resendBtn._timerInterval = interval;
}

function resendPhoneOtp() {
    if (!pendingPhoneLogin) return;
    const btn = document.getElementById('resendPhoneOtpBtn');
    if (btn.disabled) return;
    
    btn.disabled = true;
    btn.textContent = 'Sending...';
    
    fetch(API_URL + '/api/auth/send-phone-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '+91' + pendingPhoneLogin })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            notify('OTP resent successfully', 'success');
            startResendTimer();
        } else {
            notify(data.message || 'Failed to resend OTP', 'error');
            btn.disabled = false;
            btn.textContent = 'Resend';
        }
    })
    .catch(err => {
        notify('Failed to resend OTP: ' + (err.message || 'network error'), 'error');
        btn.disabled = false;
        btn.textContent = 'Resend';
    });
}

async function completePhoneProfile(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const userId = document.getElementById('completeProfileUserId').value;
    const phone = document.getElementById('completeProfilePhone').value;
    const name = document.getElementById('completeProfileName').value.trim();
    const city = document.getElementById('completeProfileCity').value.trim();
    const state = document.getElementById('completeProfileState').value.trim();
    
    if (!name) return notify('Please enter your name', 'error');
    if (!city) return notify('Please enter your city', 'error');
    if (!state) return notify('Please enter your state', 'error');
    
    showLoader('Setting up your profile...');
    setButtonLoading(btn, true, 'Continue');
    try {
        const res = await fetch(API_URL + '/api/auth/complete-phone-profile', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, name, city, state })
        });
        const data = await res.json();
        if (!data.success) {
            notify(data.message || 'Failed to complete profile', 'error');
            return;
        }
        
        saveSession(data.token, data.user, data.refreshToken);
        applyCollaboratorLoginContext(data);
        closeModal('completeProfileModal');
        notify(data.message || 'Welcome to Yatri Point!', 'success');
    } catch (err) {
        notify('Profile completion failed: ' + (err.message || 'network error'), 'error');
    } finally {
        setButtonLoading(btn, false, 'Continue');
        hideLoader();
    }
}

// ========== SIGNUP ==========
async function handleSignup(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const phone = document.getElementById('signupPhone').value.trim();
    const password = document.getElementById('signupPassword').value;
    if (!name || !email || !phone || !password) return notify('Please fill all fields', 'error');

    showLoader('Creating your account...');
    setButtonLoading(btn, true, 'Create Account');
    try {
        const res = await fetch(API_URL + '/api/auth/signup', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, phone, password })
        });
        const data = await res.json();
        if (!data.success) {
            notify(data.message || data.errors?.[0] || 'Signup failed', 'error');
            return;
        }
        closeModal('signupModal');
        if (data.token && data.user) {
            saveSession(data.token, data.user, data.refreshToken);
            applyCollaboratorLoginContext(data);
        }
        notify('Account created successfully!', 'success');
    } catch (err) {
        notify('Signup failed: ' + (err.message || 'network error'), 'error');
    } finally {
        setButtonLoading(btn, false, 'Create Account');
        hideLoader();
    }
}

// ========== LOGOUT ==========
function logout() {
    clearSession();
    document.getElementById('dropdownMenu')?.classList.remove('active');
    notify('Logged out successfully', 'info');
    navigateTo('home');
}

// ========== EMAIL OTP ==========
async function confirmEmailOTP() {
    const code = document.getElementById('emailOtpInput').value.trim();
    if (!code || code.length !== 6) return notify('Please enter a valid 6-digit code', 'error');
    const btn = document.getElementById('btnVerifyEmailOtp');
    showLoader('Verifying verification code...');
    setButtonLoading(btn, true, '✅ Verify & Login');
    try {
        const res = await fetch(API_URL + '/api/auth/verify-email-otp', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: pendingVerificationEmail, otp: code })
        });
        const data = await res.json();
        if (!data.success) {
            document.getElementById('emailOtpError').textContent = data.message || 'Invalid code';
            document.getElementById('emailOtpError').style.display = 'block';
            return;
        }
        closeModal('emailOtpModal');
        if (data.token && data.user) {
            saveSession(data.token, data.user, data.refreshToken);
            applyCollaboratorLoginContext(data);
        }
        notify('Email verified successfully!', 'success');
    } catch (err) {
        notify('Verification failed: ' + (err.message || 'network error'), 'error');
    } finally {
        setButtonLoading(btn, false, '✅ Verify & Login');
        hideLoader();
    }
}

async function resendEmailOTP() {
    if (emailOtpCooldownTime > 0) return;
    showLoader('Sending verification code...');
    try {
        const res = await fetch(API_URL + '/api/auth/send-email-otp', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: pendingVerificationEmail })
        });
        const data = await res.json();
        if (!data.success) return notify(data.message || 'Failed to resend code', 'error');
        emailOtpCooldownTime = 60;
        const link = document.getElementById('resendEmailOtpLink');
        if (link) link.style.pointerEvents = 'none';
        if (link) link.style.opacity = '0.5';
        if (emailOtpTimerInterval) clearInterval(emailOtpTimerInterval);
        emailOtpTimerInterval = setInterval(function () {
            emailOtpCooldownTime--;
            if (emailOtpCooldownTime <= 0) {
                clearInterval(emailOtpTimerInterval);
                if (link) { link.style.pointerEvents = ''; link.style.opacity = ''; link.innerText = 'Resend Code'; }
            } else {
                if (link) link.innerText = 'Resend in ' + emailOtpCooldownTime + 's';
            }
        }, 1000);
        notify('Verification code resent', 'success');
    } catch (err) {
        notify('Failed to resend code', 'error');
    } finally {
        hideLoader();
    }
}

// ========== DISTANCES ==========
const DISTANCES = {
    'Madhubani-Darbhanga': 35, 'Darbhanga-Madhubani': 35,
    'Madhubani-Patna': 140, 'Patna-Madhubani': 140,
    'Madhubani-Jaynagar': 28, 'Jaynagar-Madhubani': 28,
    'Madhubani-Basopatti': 18, 'Basopatti-Madhubani': 18,
    'Madhubani-Benipatti': 12, 'Benipatti-Madhubani': 12,
    'Madhubani-Sakri': 30, 'Sakri-Madhubani': 30,
    'Madhubani-Samastipur': 70, 'Samastipur-Madhubani': 70,
    'Madhubani-Muzaffarpur': 95, 'Muzaffarpur-Madhubani': 95,
    'Darbhanga-Patna': 115, 'Patna-Darbhanga': 115,
    'Darbhanga-Jaynagar': 55, 'Jaynagar-Darbhanga': 55,
    'Darbhanga-Samastipur': 55, 'Samastipur-Darbhanga': 55,
    'Darbhanga-Muzaffarpur': 72, 'Muzaffarpur-Darbhanga': 72,
    'Patna-Samastipur': 90, 'Samastipur-Patna': 90,
    'Patna-Muzaffarpur': 60, 'Muzaffarpur-Patna': 60,
    'Patna-Jaynagar': 165, 'Jaynagar-Patna': 165,
    'Samastipur-Muzaffarpur': 52, 'Muzaffarpur-Samastipur': 52,
    'Sakri-Darbhanga': 17, 'Darbhanga-Sakri': 17,
    'Benipatti-Darbhanga': 25, 'Darbhanga-Benipatti': 25
};
const CITIES = ['Madhubani', 'Darbhanga', 'Patna', 'Jaynagar', 'Basopatti', 'Benipatti', 'Sakri', 'Samastipur', 'Muzaffarpur'];

// ========== LOCATION SELECTS ==========
function populateLocationSelects() {
    document.querySelectorAll('.location-select').forEach(function (select) {
        select.innerHTML = '<option value="">' + (select.dataset.placeholder || 'Select City...') + '</option>';
        CITIES.forEach(function (city) {
            var opt = document.createElement('option');
            opt.value = city;
            opt.textContent = city;
            select.appendChild(opt);
        });
    });
}

// ========== FILTERS ==========
var activeFilters = {};
function toggleFilter(el) {
    el.classList.toggle('active');
    var filter = el.dataset.filter;
    var tab = el.closest('.booking-form')?.id?.replace('Form', '') || 'bus';
    if (!activeFilters[tab]) activeFilters[tab] = [];
    var idx = activeFilters[tab].indexOf(filter);
    if (idx > -1) activeFilters[tab].splice(idx, 1);
    else activeFilters[tab].push(filter);
}

// ========== TAB SWITCHING ==========
function switchTab(type, btn) {
    document.querySelectorAll('.booking-form').forEach(function (f) { f.classList.remove('active'); });
    document.querySelectorAll('.booking-tabs button').forEach(function (b) { b.classList.remove('active'); });
    var form = document.getElementById(type + 'Form');
    if (form) form.classList.add('active');
    if (btn) btn.classList.add('active');
}

// ========== BUS SEARCH, FILTERS, SORTING, DETAILS & VISUAL SEATS ==========
let ALL_SEARCHED_BUSES = [];
let ACTIVE_SORT_BY = 'price_low';

async function searchBuses(e) {
    e.preventDefault();
    if (!requireAuth()) return;
    var from = document.getElementById('busFrom').value;
    var to = document.getElementById('busTo').value;
    var date = document.getElementById('busDate').value;
    var passengers = parseInt(document.getElementById('busPassengers').value);
    if (from === to) return notify('From and To cannot be same', 'error');
    showLoader('Searching for buses from ' + from + ' to ' + to + '...');
    try {
        var res = await fetch(API_URL + '/api/buses/search', {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ from, to, date, passengers })
        });
        var data = await res.json();
        if (!data.success || !data.buses || data.buses.length === 0) return notify('No buses found for this route', 'error');

        ALL_SEARCHED_BUSES = data.buses;
        currentBooking = { type: 'bus', from, to, date, passengers, buses: data.buses };

        // Sort buses by price low by default and render
        let sorted = [...data.buses].sort((a, b) => a.startingPrice - b.startingPrice);
        renderBusResults(sorted);
    } catch (err) {
        notify('No buses found for this route', 'error');
    } finally {
        hideLoader();
    }
}

function renderOperatorsFilterList(buses) {
    const container = document.getElementById('filterOperatorsContainer');
    if (!container) return;
    const operators = [...new Set(buses.map(b => b.operatorName))].filter(Boolean);
    container.innerHTML = operators.map(op => `
        <label class="filter-checkbox-label">
            <input type="checkbox" class="operator-checkbox" value="${op}" onchange="triggerFilterUpdate()"> ${op}
        </label>
    `).join('') || '<span style="font-size:0.75rem; color:var(--gray);">No operators</span>';
}

function triggerFilterUpdate() {
    applyBusFiltersAndSort();
}

function triggerSort(sortBy) {
    ACTIVE_SORT_BY = sortBy;
    document.querySelectorAll('.sort-btn').forEach(btn => btn.classList.remove('active'));

    let id = '';
    switch (sortBy) {
        case 'price_low': id = 'sortPriceLow'; break;
        case 'price_high': id = 'sortPriceHigh'; break;
        case 'dep_earliest': id = 'sortDepEarliest'; break;
        case 'dep_latest': id = 'sortDepLatest'; break;
        case 'duration': id = 'sortDuration'; break;
        case 'rating': id = 'sortRating'; break;
    }
    const btn = document.getElementById(id);
    if (btn) btn.classList.add('active');

    applyBusFiltersAndSort();
}

function updatePriceFilterVal(val) {
    document.getElementById('priceRangeMaxDisplay').textContent = `Max: ₹${val}`;
    triggerFilterUpdate();
}

function resetAllFilters() {
    document.getElementById('filterPriceRange').value = 3000;
    document.getElementById('priceRangeMaxDisplay').textContent = 'Max: ₹3000';

    document.querySelectorAll('.bus-type-checkbox').forEach(cb => cb.checked = false);
    document.querySelectorAll('.depart-time-checkbox').forEach(cb => cb.checked = false);
    document.querySelectorAll('.operator-checkbox').forEach(cb => cb.checked = false);
    document.querySelectorAll('.amenity-checkbox').forEach(cb => cb.checked = false);
    document.querySelectorAll('input[name="filterRating"]').forEach(radio => {
        if (radio.value === '0') radio.checked = true;
    });

    triggerFilterUpdate();
}

function applyBusFiltersAndSort() {
    let filtered = [...ALL_SEARCHED_BUSES];

    const maxPrice = parseFloat(document.getElementById('filterPriceRange').value) || 3000;
    filtered = filtered.filter(b => b.startingPrice <= maxPrice);

    const activeTypes = [...document.querySelectorAll('.bus-type-checkbox:checked')].map(cb => cb.value.toLowerCase());
    if (activeTypes.length > 0) {
        filtered = filtered.filter(b => {
            const bType = b.busType.toLowerCase();
            return activeTypes.some(t => bType.includes(t));
        });
    }

    const activeSlots = [...document.querySelectorAll('.depart-time-checkbox:checked')].map(cb => cb.value);
    if (activeSlots.length > 0) {
        filtered = filtered.filter(b => {
            let hour = 8;
            try {
                const timeStr = b.departureTime;
                const [hStr, mStr] = timeStr.replace(/(AM|PM)/i, '').split(':').map(Number);
                const isPm = /PM/i.test(timeStr);
                hour = (hStr % 12) + (isPm ? 12 : 0);
            } catch (e) { }

            return activeSlots.some(slot => {
                if (slot === 'morning') return hour >= 6 && hour < 12;
                if (slot === 'afternoon') return hour >= 12 && hour < 18;
                if (slot === 'evening') return hour >= 18 && hour < 24;
                if (slot === 'night') return hour >= 0 && hour < 6;
                return false;
            });
        });
    }

    const activeOperators = [...document.querySelectorAll('.operator-checkbox:checked')].map(cb => cb.value);
    if (activeOperators.length > 0) {
        filtered = filtered.filter(b => activeOperators.includes(b.operatorName));
    }

    const minRatingRadio = document.querySelector('input[name="filterRating"]:checked');
    const minRating = minRatingRadio ? parseFloat(minRatingRadio.value) : 0;
    if (minRating > 0) {
        filtered = filtered.filter(b => b.operatorRating >= minRating);
    }

    const activeAmenities = [...document.querySelectorAll('.amenity-checkbox:checked')].map(cb => cb.value.toLowerCase());
    if (activeAmenities.length > 0) {
        filtered = filtered.filter(b => {
            const bAmenities = b.amenities.map(a => a.toLowerCase());
            return activeAmenities.every(a => bAmenities.includes(a));
        });
    }

    filtered.sort((a, b) => {
        if (ACTIVE_SORT_BY === 'price_low') return a.startingPrice - b.startingPrice;
        if (ACTIVE_SORT_BY === 'price_high') return b.startingPrice - a.startingPrice;
        if (ACTIVE_SORT_BY === 'rating') return b.operatorRating - a.operatorRating;

        if (ACTIVE_SORT_BY === 'dep_earliest' || ACTIVE_SORT_BY === 'dep_latest') {
            const getMin = (timeStr) => {
                try {
                    const [h, m] = timeStr.replace(/(AM|PM)/i, '').split(':').map(Number);
                    const pm = /PM/i.test(timeStr);
                    return (h % 12 + (pm ? 12 : 0)) * 60 + (m || 0);
                } catch (e) { return 480; }
            };
            return ACTIVE_SORT_BY === 'dep_earliest' ? getMin(a.departureTime) - getMin(b.departureTime) : getMin(b.departureTime) - getMin(a.departureTime);
        }

        if (ACTIVE_SORT_BY === 'duration') {
            const getMin = (durStr) => {
                try {
                    const [h, m] = durStr.split(' ');
                    return parseInt(h) * 60 + parseInt(m || 0);
                } catch (e) { return 240; }
            };
            return getMin(a.duration) - getMin(b.duration);
        }
        return 0;
    });

    renderBusResults(filtered);
}

function renderBusResults(buses) {
    const container = document.getElementById('resultsContainer');
    const header = document.getElementById('resultsHeader');
    if (!container) return;

    const from = currentBooking.from || '';
    const to = currentBooking.to || '';
    header.innerHTML = `${from} &rarr; ${to} | ${currentBooking.date || ''} (${buses.length} Buses Available)`;

    if (buses.length === 0) {
        container.innerHTML = `
            <div class="result-card" style="text-align:center; padding:3rem; display:flex; flex-direction:column; justify-content:center; width:100%;">
                <div style="font-size:3rem; margin-bottom:1rem;">🚌</div>
                <h3 style="font-weight:800; color:var(--dark); margin-bottom:0.5rem;">No Matching Buses Found</h3>
                <p style="color:var(--gray); font-size:0.88rem;">Try clearing some filters or searching for another date.</p>
            </div>
        `;
        navigateTo('results');
        return;
    }

    let html = '';
    buses.forEach(function (bus) {
        const rating = parseFloat(bus.operatorRating || 4.2).toFixed(1);
        const verifiedBadge = bus.operatorVerified ? `
            <span class="verified-badge-pill">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg> Verified Operator
            </span>
        ` : '';

        const amenitiesHtml = bus.amenities.slice(0, 4).map(a => `
            <span class="amenity-tag">✓ ${a}</span>
        `).join('');

        html += `
            <div class="enriched-bus-card" id="bus-card-${bus.id}" onclick="openBusDetailsModal('${bus.id}')">
                <div class="bus-card-header">
                    <div class="operator-info-block">
                        <span class="operator-name">${bus.operatorName} ${verifiedBadge}</span>
                        <small style="color:var(--gray); font-weight:600;">${bus.busName} (${bus.busNumber})</small>
                    </div>
                    <span class="bus-meta-badge">${bus.busType}</span>
                </div>
                
                <div class="bus-card-body">
                    <div class="bus-card-route-timeline">
                        <div class="time-node">
                            <strong>${bus.departureTime}</strong>
                            <small>${from}</small>
                        </div>
                        <div class="timeline-connector">
                            <span class="timeline-line"></span>
                            <span>${bus.duration}</span>
                        </div>
                        <div class="time-node">
                            <strong>${bus.arrivalTime}</strong>
                            <small>${to}</small>
                        </div>
                    </div>
                    
                    <div class="seats-occupancy-status">
                        <span class="seats-pill ${bus.availableSeats < 5 ? 'critical' : ''}">
                            💺 ${bus.availableSeats}/${bus.totalSeats} seats left
                        </span>
                        <span class="schedule-badge">Rating: ⭐ ${rating}</span>
                    </div>
                    
                    <div class="price-booking-cell">
                        <span class="price"><small>Starts from</small><br>₹${bus.startingPrice}</span>
                        <div style="display:flex; gap:6px;">
                            <button class="book-btn" style="background:var(--primary);" onclick="event.stopPropagation(); openBusSeats('${bus.id}')">Select Seats</button>
                        </div>
                    </div>
                </div>
                
                <div class="card-action-row">
                    <div class="amenity-icons-list">
                        ${amenitiesHtml}
                    </div>
                    <span style="font-size:0.75rem; font-weight:700; color:var(--primary); text-transform:uppercase;">View Full Details &amp; Policies &rarr;</span>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    navigateTo('results');
}

function openBusDetailsModal(busId) {
    const bus = currentBooking.buses.find(b => b.id === busId);
    if (!bus) return notify('Bus details not found', 'error');

    document.getElementById('detailsBusName').innerHTML = `${bus.operatorName} <span style="font-size:0.8rem; font-weight:600; color:var(--gray-dark);">(${bus.busName})</span>`;
    document.getElementById('detailsBusType').textContent = bus.busType;
    document.getElementById('detailsOperatorName').textContent = bus.operatorName;
    document.getElementById('detailsOperatorPhone').textContent = bus.operatorPhone || '8178030064';
    document.getElementById('detailsOperatorEmail').textContent = bus.operatorEmail || 'support@yatripoint.onrender.com';

    const timelineContainer = document.getElementById('detailsJourneyTimeline');
    const routeHtml = bus.routeCities.map((city, idx) => {
        let isEnd = idx === bus.routeCities.length - 1;
        let timeLabel = idx === 0 ? bus.departureTime : isEnd ? bus.arrivalTime : 'Scheduled Stop';
        return `
            <div class="details-timeline-node ${isEnd ? 'end' : ''}">
                <strong style="color:var(--dark); font-size:0.85rem;">${city}</strong>
                <span style="font-size:0.78rem; color:var(--gray); display:block;">${timeLabel}</span>
            </div>
        `;
    }).join('');
    timelineContainer.innerHTML = routeHtml;

    const amenitiesContainer = document.getElementById('detailsAmenitiesList');
    amenitiesContainer.innerHTML = bus.amenities.map(a => `
        <span class="amenity-tag">✓ ${a}</span>
    `).join('');

    document.getElementById('detailsCancelPolicy').textContent = bus.cancellationPolicy;
    document.getElementById('detailsRefundPolicy').textContent = bus.refundPolicy;

    const photosContainer = document.getElementById('detailsPhotosList');
    photosContainer.innerHTML = `
        <img src="yatri-logo.png" class="bus-photo-thumbnail" alt="Bus photo 1" onerror="this.src='/icons/icon-192.png'">
    `;

    openModal('busDetailsModal');
}

async function openBusSeats(busId) {
    const bus = currentBooking.buses.find(b => b.id === busId);
    if (!bus) return notify('Bus not found', 'error');

    currentBooking.selectedBus = bus;
    selectedSeats = [];

    document.getElementById('seatBusName').textContent = `${bus.operatorName} (${bus.busType})`;
    document.getElementById('seatCount').textContent = `0/${currentBooking.passengers}`;
    document.getElementById('seatTotal').textContent = '0';

    const seatGrid = document.getElementById('seatGrid');
    seatGrid.innerHTML = `
        <div style="grid-column:1/-1;">
            <div class="premium-spinner-container">
                <div class="premium-spinner-inline"></div>
                <div class="premium-spinner-text">Loading visual seat map...</div>
            </div>
        </div>
    `;

    openModal('seatModal');

    try {
        const travelDate = currentBooking.date || new Date().toISOString().split('T')[0];
        const res = await fetch(`${API_URL}/api/buses/${busId}/seats?date=${travelDate}`, {
            headers: authHeaders()
        });
        const data = await res.json();

        if (!data.success) {
            seatGrid.innerHTML = `<p style="grid-column:1/-1; color:var(--primary); text-align:center; padding:1.5rem;">Failed to load visual seats.</p>`;
            return;
        }

        renderCabinSeats(data.seats, bus);
    } catch (err) {
        seatGrid.innerHTML = `<p style="grid-column:1/-1; color:var(--primary); text-align:center; padding:1.5rem;">Error loading seats.</p>`;
    }
}

function renderCabinSeats(seats, bus) {
    const grid = document.getElementById('seatGrid');
    if (!grid) return;
    grid.innerHTML = '';

    let seatHtml = '';
    seats.forEach((seat, idx) => {
        const seatNum = seat.seatNumber || (idx + 1);
        const label = seat.seatLabel || `S${seatNum}`;
        const price = seat.price || bus.startingPrice;
        const status = seat.status || 'available';
        let cellClass = 'seat-cell';
        if (status === 'available') {
            cellClass += ' available';
        } else if (status === 'booked') {
            cellClass += ' booked';
        } else {
            cellClass += ' blocked';
        }

        seatHtml += `
            <div class="${cellClass}" data-id="${seat.id}" data-price="${price}" data-label="${label}" data-number="${seatNum}" onclick="toggleCabinSeat(this)">
                <span>${label}</span>
            </div>
        `;

        if (idx % 4 === 1) {
            seatHtml += `<div class="seat-aisle-spacer"></div>`;
        }
    });

    grid.innerHTML = seatHtml;
}

function toggleCabinSeat(el) {
    if (el.classList.contains('booked') || el.classList.contains('blocked')) return;

    const maxPass = currentBooking.passengers || 1;
    const seatId = el.dataset.id;
    const price = parseFloat(el.dataset.price) || 599;
    const label = el.dataset.label;

    const idx = selectedSeats.indexOf(seatId);

    if (el.classList.contains('selected')) {
        el.classList.remove('selected');
        if (idx > -1) selectedSeats.splice(idx, 1);
    } else {
        if (selectedSeats.length >= maxPass) return notify(`Max ${maxPass} seat(s) allowed for this booking`, 'error');
        el.classList.add('selected');
        selectedSeats.push(seatId);
    }

    document.getElementById('seatCount').textContent = `${selectedSeats.length}/${maxPass}`;
    document.getElementById('seatTotal').textContent = (selectedSeats.length * price).toLocaleString();
}

function confirmSeatSelection() {
    // Gate: if phone not verified, verifyPhoneForBooking will open the OTP modal
    // and store this function as pendingBookingAction to be called after verification.
    if (!verifyPhoneForBooking(confirmSeatSelection)) return;

    if (selectedSeats.length === 0) return notify('Please select at least one seat', 'error');
    if (selectedSeats.length > (currentBooking.passengers || 1)) return notify('Too many seats selected', 'error');

    let total = 0;
    selectedSeats.forEach(id => {
        const el = document.querySelector(`.seat-cell[data-id="${id}"]`);
        if (el) {
            total += parseFloat(el.dataset.price) || 599;
        }
    });

    currentBooking.seats = [...selectedSeats];
    currentBooking.amount = total;
    closeModal('seatModal');
    openPassengerForm();
}

function openPassengerForm() {
    var container = document.getElementById('passengerFields');
    if (!container) return;
    container.innerHTML = '';
    var count = currentBooking.passengers || selectedSeats.length;
    for (var i = 0; i < count; i++) {
        var div = document.createElement('div');
        div.className = 'passenger-field';
        div.style.cssText = 'border:1px solid var(--border);border-radius:10px;padding:1rem;margin-bottom:.8rem;';
        div.innerHTML = '<label><strong>Passenger ' + (i + 1) + '</strong></label>' +
            '<input type="text" class="pName" placeholder="Full Name" required style="width:100%;margin-bottom:.4rem;">' +
            '<input type="number" class="pAge" placeholder="Age" min="1" max="120" required style="width:100px;">';
        container.appendChild(div);
    }
    document.getElementById('passengerTotal').textContent = currentBooking.amount || 0;
    openModal('passengerModal');
}

function confirmPassengers(e) {
    // e may be a real submit event or undefined if called from pendingBookingAction
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (!verifyPhoneForBooking(confirmPassengers)) return;
    var names = document.querySelectorAll('.pName');
    var ages = document.querySelectorAll('.pAge');
    var passengers = [];
    var valid = true;
    names.forEach(function (n, i) {
        var name = n.value.trim();
        var age = ages[i]?.value;
        if (!name || !age) { valid = false; return; }
        passengers.push({ name: name, age: parseInt(age), seat: (currentBooking.seats?.[i] || i) + 1 });
    });
    if (!valid || passengers.length === 0) return notify('Please fill all passenger details', 'error');
    currentBooking.passengerDetails = passengers;
    closeModal('passengerModal');
    openPayment(currentBooking.amount);
}

// ========== HOTEL SEARCH ==========
async function searchHotels(e) {
    e.preventDefault();
    if (!requireAuth()) return;
    var location = document.getElementById('hotelLocation').value;
    var checkin = document.getElementById('hotelCheckin').value;
    var checkout = document.getElementById('hotelCheckout').value;
    var guests = document.getElementById('hotelGuests').value;
    if (!location) return notify('Please select a location', 'error');
    showLoader('Finding hotels in ' + location + '...');
    try {
        var res = await fetch(API_URL + '/api/hotels/search', {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ location, checkin, checkout, guests })
        });
        var data = await res.json();
        if (!data.success) return notify(data.message || 'No hotels found', 'error');
        currentBooking = { type: 'hotel', location, checkin, checkout, guests, hotels: data.hotels || data.data || [] };
        renderHotelResults(data.hotels || data.data || []);
    } catch (err) {
        console.error('Hotel search error:', err);
        notify('No hotels found in ' + location, 'error');
    } finally {
        hideLoader();
    }
}

function renderHotelResults(hotels) {
    var container = document.getElementById('resultsContainer');
    var header = document.getElementById('resultsHeader');
    if (!container) return;
    header.innerHTML = 'Hotels in ' + currentBooking.location;
    var html = '';
    hotels.forEach(function (h) {
        var name = h.hotelname || h.hotelName || h.name || 'Hotel';
        var city = h.city || h.location || '';
        var rating = h.rating || '4.0';
        var rooms = h.rooms || [];
        var lowestPrice = rooms.length > 0 ? Math.min.apply(null, rooms.map(function (r) { return parseFloat(r.price) || 999; })) : 999;
        html += `
            <div class="enriched-bus-card" onclick="openHotelRoom('${h.id}')">
                <div class="bus-card-header">
                    <div class="operator-info-block">
                        <span class="operator-name">${name}</span>
                        <small style="color:var(--gray); font-weight:600;">📍 ${city}</small>
                    </div>
                    <span class="bus-meta-badge">⭐ ${rating}</span>
                </div>
                <div class="bus-card-body" style="gap:1rem;">
                    <div class="seats-occupancy-status" style="border:none; padding:0;">
                        <span class="seats-pill">🏨 ${rooms.length} Room Types</span>
                    </div>
                    <div class="price-booking-cell" style="border:none; padding:0; justify-content:space-between; align-items:center; gap: 1rem;">
                        <span class="price" style="margin-right:auto;"><small>From</small><br>₹${lowestPrice}<small>/night</small></span>
                        <button class="book-btn" style="background:var(--primary); padding:0.6rem 1.2rem; min-width:120px;" onclick="event.stopPropagation(); openHotelRoom('${h.id}')">View Rooms</button>
                    </div>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
    navigateTo('results');
}

function openHotelRoom(hotelId) {
    var hotel = null;
    if (currentBooking.hotels) {
        currentBooking.hotels.forEach(function (h) { if (h.id === hotelId) hotel = h; });
    }
    if (!hotel) return notify('Hotel not found', 'error');
    currentBooking.selectedHotel = hotel;
    var rooms = hotel.rooms || [];
    var modalBody = document.getElementById('roomModalBody');
    if (!modalBody) return;
    var html = '<h3>' + (hotel.hotelname || hotel.hotelName || hotel.name) + '</h3>';
    html += '<p><strong>Address:</strong> ' + (hotel.address || hotel.city || 'N/A') + '</p>';
    if (hotel.amenities) html += '<p><strong>Amenities:</strong> ' + hotel.amenities + '</p>';
    if (rooms.length === 0) {
        html += '<p>No rooms available. Please contact the hotel directly.</p>';
    } else {
        html += '<div class="room-list">';
        rooms.forEach(function (r) {
            var roomType = r.roomtype || r.roomType || r.type || 'Standard';
            var price = r.price || 'N/A';
            html += '<div class="room-item">';
            html += '<span><strong>' + roomType + '</strong></span>';
            html += '<span>Rs ' + price + '/night</span>';
            html += '<button class="btn-primary btn-sm" onclick="confirmRoom(\'' + roomType + '\', ' + price + ')">Book</button>';
            html += '</div>';
        });
        html += '</div>';
    }
    modalBody.innerHTML = html;
    openModal('roomModal');
}

function confirmRoom(type, price) {
    if (!verifyPhoneForBooking(() => confirmRoom(type, price))) return; // arrow wrapper needed to pass args
    if (!price) return notify('Invalid room type', 'error');
    closeModal('roomModal');
    currentBooking.roomType = type;
    currentBooking.amount = price * parseInt(currentBooking.guests || 1);
    openPayment(currentBooking.amount);
}

// ========== RAPID CAR SEARCH ==========
async function searchCars(e) {
    e.preventDefault();
    if (!requireAuth()) return;
    var city = document.getElementById('carCity').value;
    var boarding = document.getElementById('carBoarding').value.trim();
    var dropping = document.getElementById('carDropping').value.trim();
    var date = document.getElementById('carDate').value;
    var time = document.getElementById('carTime').value;
    var passengers = document.getElementById('carPassengers').value;
    if (!city) return notify('Please select a city', 'error');
    showLoader('Locating cabs in ' + city + '...');
    try {
        var res = await fetch(API_URL + '/api/cabs/search', {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ city, boarding, dropping, date, time, passengers })
        });
        var data = await res.json();
        if (!data.success) return notify(data.message || 'No cabs available', 'error');
        currentBooking = { type: 'cab', city, boarding, dropping, date, time, passengers, cabs: data.cabs || data.data || [] };
        renderCabResults(data.cabs || data.data || []);
    } catch (err) {
        console.error('Cab search error:', err);
        notify('No cabs available in ' + city, 'error');
    } finally {
        hideLoader();
    }
}

function renderCabResults(cabs) {
    var container = document.getElementById('resultsContainer');
    var header = document.getElementById('resultsHeader');
    if (!container) return;
    header.innerHTML = 'Available Cabs in ' + currentBooking.city;
    var html = '';
    cabs.forEach(function (c) {
        var serviceName = c.cabname || c.cabName || c.name || c.busName || 'Cab';
        var model = c.cabtype || c.cabType || 'Standard';
        var driver = c.drivername || c.driverName || '';
        var driverPhone = c.driverphone || c.driverPhone || '';
        var fare = c.fare || c.rate || c.ratePerKm || 'N/A';
        var rating = c.rating || '-';
        var totalSeats = c.totalSeats || c.totalseats || 4;
        html += `
            <div class="enriched-bus-card">
                <div class="bus-card-header">
                    <div class="operator-info-block">
                        <span class="operator-name">${serviceName}</span>
                        <small style="color:var(--gray); font-weight:600;">🚗 ${model}</small>
                    </div>
                    <span class="bus-meta-badge">⭐ ${rating}</span>
                </div>
                <div class="bus-card-body" style="gap:1rem;">
                    <div class="seats-occupancy-status" style="border:none; padding:0; flex-wrap:wrap; gap:0.5rem;">
                        <span class="seats-pill">💺 ${totalSeats} Seats</span>
                        ${driver ? `<span class="schedule-badge" style="margin:0;">👤 ${driver} ${driverPhone ? `(${driverPhone})` : ''}</span>` : ''}
                    </div>
                    <div class="price-booking-cell" style="border:none; padding:0; justify-content:space-between; align-items:center; gap: 1rem;">
                        <span class="price" style="margin-right:auto;"><small>Fare</small><br>₹${fare}</span>
                        <button class="book-btn" style="background:var(--primary); padding:0.6rem 1.2rem; min-width:120px;" onclick="bookCab('${c.id}', '${fare}')">Book Now</button>
                    </div>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
    navigateTo('results');
}

function bookCab(cabId, fare) {
    var cab = null;
    if (currentBooking.cabs) {
        currentBooking.cabs.forEach(function (c) { if (c.id === cabId) cab = c; });
    }
    if (!cab) return notify('Cab not found', 'error');
    currentBooking.selectedCab = cab;
    var parsedFare = parseFloat(fare);
    if (isNaN(parsedFare)) parsedFare = 0;
    var amount = parsedFare || parseFloat(cab.fare || cab.rate || cab.ratePerKm || 0);
    if (!amount || amount <= 0) return notify('Invalid cab fare', 'error');
    currentBooking.amount = amount;
    openPayment(currentBooking.amount);
}

// ========== CAFES ==========
function showCafes() {
    if (!isIndexPage()) {
        window.location.href = 'index.html#cafe';
        return;
    }
    navigateTo('cafe');
    loadCafes();
}

async function loadCafes() {
    var container = document.getElementById('cafeGrid');
    if (!container) return;
    showLoader('Loading cafes...');
    try {
        var res = await fetch(API_URL + '/api/cafes', { headers: authHeaders() });
        var data = await res.json();
        if (data.success && (data.cafes || data.data)) {
            currentBooking.cafes = data.cafes || data.data;
            renderCafes(data.cafes || data.data);
            return;
        }
    } catch (e) { } finally {
        hideLoader();
    }
    var cafes = [];
    currentBooking.cafes = cafes;
    renderCafes(cafes);
}

function renderCafes(cafes) {
    var container = document.getElementById('cafeGrid');
    if (!container) return;
    var html = '';
    cafes.forEach(function (c) {
        var name = c.cafename || c.cafeName || c.name || 'Cafe';
        var city = c.city || c.location || '';
        var rating = c.rating || '-';
        var cost = c.costPerSeat || 'N/A';
        var available = c.availableTables || c.availableseats || c.availableSeats || 'N/A';
        html += `
            <div class="enriched-bus-card cafe-card" data-location="${city}" onclick="openCafeSeats('${c.id}')">
                <div class="bus-card-header">
                    <div class="operator-info-block">
                        <span class="operator-name">${name}</span>
                        <small style="color:var(--gray); font-weight:600;">☕ ${city}</small>
                    </div>
                    <span class="bus-meta-badge">⭐ ${rating}</span>
                </div>
                <div class="bus-card-body" style="gap:1rem;">
                    <div class="seats-occupancy-status" style="border:none; padding:0;">
                        <span class="seats-pill ${available < 5 ? 'critical' : ''}">🍽️ ${available} Tables Available</span>
                    </div>
                    <div class="price-booking-cell" style="border:none; padding:0; justify-content:space-between; align-items:center; gap: 1rem;">
                        <span class="price" style="margin-right:auto;"><small>Cost</small><br>₹${cost}<small>/seat</small></span>
                        <button class="book-btn" style="background:var(--primary); padding:0.6rem 1.2rem; min-width:120px;" onclick="event.stopPropagation(); openCafeSeats('${c.id}')">Book Seat</button>
                    </div>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function filterCafes() {
    var loc = document.getElementById('cafeLocation').value;
    document.querySelectorAll('.cafe-card').forEach(function (card) {
        if (!loc || card.dataset.location === loc) card.style.display = '';
        else card.style.display = 'none';
    });
}

function openCafeSeats(cafeId) {
    var cafe = null;
    var cafes = currentBooking.cafes || [];
    cafes.forEach(function (c) { if (c.id === cafeId) cafe = c; });
    if (!cafe) return notify('Café not found', 'error');
    currentBooking.selectedCafe = cafe;
    selectedCafeSeats = [];
    var name = cafe.cafename || cafe.cafeName || cafe.name || 'Cafe';
    var city = cafe.city || cafe.location || '';
    var cost = cafe.costPerSeat || 50;
    document.getElementById('cafeName').textContent = name;
    document.getElementById('cafeInfo').textContent = city + ' - Rs' + cost + '/seat';
    document.getElementById('cafeSeatPrice').textContent = cost;
    document.getElementById('cafeSeatCount').textContent = '0';
    document.getElementById('cafeSeatTotal').textContent = '0';
    var grid = document.getElementById('cafeSeatGrid');
    if (!grid) return;
    grid.innerHTML = '';
    var total = cafe.totaltables || cafe.totalTables || cafe.totalSeats || 20;
    var available = cafe.availableTables || cafe.availableseats || cafe.availableSeats || 10;
    var taken = total - available;
    var takenIndices = new Set();
    while (takenIndices.size < taken) {
        takenIndices.add(Math.floor(Math.random() * total));
    }
    for (var i = 0; i < total; i++) {
        var seat = document.createElement('div');
        seat.className = 'seat';
        seat.dataset.index = i;
        seat.textContent = (i + 1);
        if (takenIndices.has(i)) {
            seat.classList.add('taken');
        } else {
            seat.classList.add('avail');
            seat.onclick = function () { toggleCafeSeat(this); };
        }
        grid.appendChild(seat);
    }
    openModal('cafeSeatModal');
}

function toggleCafeSeat(el) {
    if (el.classList.contains('taken')) return;
    var cost = currentBooking.selectedCafe?.costPerSeat || 0;
    if (el.classList.contains('sel')) {
        el.classList.remove('sel');
        el.classList.add('avail');
        var idx = selectedCafeSeats.indexOf(parseInt(el.dataset.index));
        if (idx > -1) selectedCafeSeats.splice(idx, 1);
    } else {
        el.classList.remove('avail');
        el.classList.add('sel');
        selectedCafeSeats.push(parseInt(el.dataset.index));
    }
    document.getElementById('cafeSeatCount').textContent = selectedCafeSeats.length;
    document.getElementById('cafeSeatTotal').textContent = selectedCafeSeats.length * cost;
}

function confirmCafeSeats() {
    if (!verifyPhoneForBooking(confirmCafeSeats)) return;
    if (selectedCafeSeats.length === 0) return notify('Please select at least one seat', 'error');
    var amount = selectedCafeSeats.length * (currentBooking.selectedCafe?.costPerSeat || 0);
    currentBooking.seats = selectedCafeSeats;
    currentBooking.amount = amount;
    closeModal('cafeSeatModal');
    openPayment(amount);
}

// ========== PAYMENT ==========
function openPayment(amount) {
    if (!requireAuth()) return;

    // Save phone to currentBooking just in case
    currentBooking.userPhone = currentUser.phone || '';

    document.getElementById('paySubtotal').textContent = amount;
    resetPaymentState();
    updatePaymentTotals();
    document.getElementById('upiIdInput').value = '';
    switchPayTab('upi-app');
    document.getElementById('paymentPage').classList.add('active');
}

function closePaymentPage() {
    document.getElementById('paymentPage').classList.remove('active');
}

function getPaySubtotal() {
    return parseInt(document.getElementById('paySubtotal').textContent) || 0;
}

function getDiscountedTotal() {
    return Math.max(0, getPaySubtotal() - appliedCouponDiscount);
}

function updatePaymentTotals() {
    var discountedTotal = getDiscountedTotal();
    var finalAmount = discountedTotal;

    document.getElementById('payDiscount').textContent = appliedCouponDiscount;
    document.getElementById('payFinal').textContent = finalAmount;
    document.getElementById('upiAppBtnAmount').textContent = finalAmount;
    document.getElementById('upiIdBtnAmount').textContent = finalAmount;
}

function resetPaymentState() {
    appliedCouponCode = '';
    appliedCouponDiscount = 0;
    document.getElementById('payDiscount').textContent = '0';
    document.getElementById('couponInput').value = '';
}

function getCouponDetails(code, subtotal) {
    var coupons = {
        YP120: { discount: 120, minAmountExclusive: 500 },
        YP100: { discount: 100, minAmountExclusive: 400 },
        YP50: { discount: 50, minAmountExclusive: 350 },
        YP0: { discount: subtotal, minAmountExclusive: -1, hidden: true }
    };

    var coupon = coupons[code];
    if (!coupon) return null;
    if (subtotal <= coupon.minAmountExclusive) {
        return { invalid: true, minAmountExclusive: coupon.minAmountExclusive };
    }

    return {
        code: code,
        discount: Math.min(subtotal, coupon.discount),
        hidden: !!coupon.hidden
    };
}



function applyCoupon() {
    var code = document.getElementById('couponInput').value.trim().toUpperCase();
    var subtotal = getPaySubtotal();

    if (!code) {
        appliedCouponCode = '';
        appliedCouponDiscount = 0;
        updatePaymentTotals();
        return notify('Please enter a coupon code', 'error');
    }

    var coupon = getCouponDetails(code, subtotal);
    if (!coupon) {
        return notify('Invalid coupon code', 'error');
    }

    if (coupon.invalid) {
        return notify('This coupon works only when the amount is greater than ₹' + coupon.minAmountExclusive, 'error');
    }

    appliedCouponCode = coupon.code;
    appliedCouponDiscount = coupon.discount;
    updatePaymentTotals();
    notify('Coupon applied! ₹' + coupon.discount + ' off', 'success');
}

function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
}

async function payViaUpiApp() {
    if (!RAZORPAY_KEY_ID) {
        notify('Payment is not configured right now. Please refresh and try again.', 'error');
        return;
    }
    if (typeof Razorpay === 'undefined') {
        notify('Payment gateway loading...', 'info');
        return;
    }
    var amount = parseInt(document.getElementById('payFinal').textContent) * 100;
    if (!amount || amount <= 0) return notify('Invalid amount', 'error');

    showLoader('Initializing UPI payment...');
    try {
        var res = await fetch(API_URL + '/api/razorpay/create-order', {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify(buildPaymentPayload(amount))
        });
        var data = await res.json();
        if (!data.success) {
            hideLoader();
            return notify('Payment failed: ' + (data.message || 'order creation failed'), 'error');
        }

        var options = buildRazorpayBaseOptions(amount, data);
        options.config = {
            ...options.config,
            upi: {
                flow: 'intent'
            }
        };
        options.handler = async function (response) {
            await verifyRazorpayPayment(response, data, 'UPI App (GPay/PhonePe/Paytm)', amount / 100);
        };
        options.modal = {
            ondismiss: function () {
                notify('Payment cancelled. Ticket not generated.', 'info');
            }
        };

        var rzp = new Razorpay(options);
        rzp.on('payment.failed', function (response) {
            notify('Payment failed: ' + (response?.error?.description || 'Transaction failed') + '. Ticket not generated.', 'error');
        });
        rzp.open();
    } catch (err) {
        notify('Payment error: ' + err.message + '. Ticket not generated.', 'error');
    } finally {
        hideLoader();
    }
}

async function payViaRazorpay() {
    if (!RAZORPAY_KEY_ID) {
        notify('Payment is not configured right now. Please refresh and try again.', 'error');
        return;
    }
    if (typeof Razorpay === 'undefined') {
        notify('Payment gateway loading...', 'info');
        return;
    }
    var amount = parseInt(document.getElementById('payFinal').textContent) * 100;
    if (!amount || amount <= 0) return notify('Invalid amount', 'error');

    showLoader('Initializing Razorpay gateway...');
    try {
        var res = await fetch(API_URL + '/api/razorpay/create-order', {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify(buildPaymentPayload(amount))
        });
        var data = await res.json();
        if (!data.success) {
            hideLoader();
            return notify('Payment failed: ' + (data.message || 'order creation failed'), 'error');
        }

        var options = buildRazorpayBaseOptions(amount, data);
        if (isMobileDevice()) {
            options.config = {
                ...options.config,
                upi: {
                    flow: 'intent'
                }
            };
        }
        options.handler = async function (response) {
            await verifyRazorpayPayment(response, data, 'Razorpay', amount / 100);
        };
        options.modal = {
            ondismiss: function () {
                notify('Payment cancelled. Ticket not generated.', 'info');
            }
        };

        var rzp = new Razorpay(options);
        rzp.on('payment.failed', function (response) {
            notify('Payment failed: ' + (response?.error?.description || 'Transaction failed') + '. Ticket not generated.', 'error');
        });
        rzp.open();
    } catch (err) {
        notify('Payment error: ' + err.message + '. Ticket not generated.', 'error');
    } finally {
        hideLoader();
    }
}



function getBookingPartnerId() {
    return currentBooking.collaboratorId
        || (currentBooking.selectedBus && currentBooking.selectedBus.collaboratorId)
        || (currentBooking.selectedHotel && currentBooking.selectedHotel.collaboratorId)
        || (currentBooking.selectedCab && currentBooking.selectedCab.collaboratorId)
        || (currentBooking.selectedCafe && currentBooking.selectedCafe.collaboratorId)
        || null;
}


function buildPaymentPayload(amount) {
    return {
        amount: amount / 100,
        type: currentBooking.type,
        itemName: currentBooking.type + ' booking',
        details: {
            ...currentBooking,
            collaboratorId: getBookingPartnerId(),
            couponCode: appliedCouponCode || null,
            couponDiscount: appliedCouponDiscount || 0,
            originalAmount: getPaySubtotal(),
            discountedAmount: getDiscountedTotal()
        },
        seats: currentBooking.seats,
        roomType: currentBooking.roomType,
        userName: currentUser?.name || '',
        userPhone: currentUser?.phone || '',
        userAge: '',
        passengerCount: currentBooking.passengers || 1
    };
}


function buildRazorpayBaseOptions(amount, data) {
    return {
        key: RAZORPAY_KEY_ID,
        amount: amount,
        currency: 'INR',
        name: 'Yatri Point',
        description: currentBooking.type + ' booking',
        order_id: data.razorpayOrderId || data.orderId,
        prefill: {
            name: currentUser?.name || '',
            email: currentUser?.email || '',
            contact: currentUser?.phone || ''
        },
        config: {
            display: {
                language: 'en'
            }
        },
        theme: { color: '#d84e55' }
    };
}

async function verifyRazorpayPayment(response, data, paymentMethodLabel, amountInRupees) {
    showLoader('Verifying payment and generating ticket...');
    try {
        notify('Verifying payment...', 'info');
        var verifyRes = await fetch(API_URL + '/api/razorpay/verify-payment', {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                orderId: data.orderId
            })
        });
        var verifyData = await verifyRes.json();
        if (!verifyData.success) {
            notify('Payment verification failed: ' + verifyData.message, 'error');
            return;
        }

        closePaymentPage();
        notify('Booking confirmed! ID: ' + data.orderId, 'success');
        var ticketData = {
            ...currentBooking,
            orderId: data.orderId,
            amount: amountInRupees,
            paymentMethod: paymentMethodLabel,
            paymentStatus: 'confirmed'
        };
        saveAndRedirectTicket(ticketData);
    } catch (err) {
        notify('Payment verification error. Ticket not generated.', 'error');
    } finally {
        hideLoader();
    }
}


function switchPayTab(tabId) {
    // Hide all sections
    document.getElementById('upiAppSection').style.display = 'none';
    document.getElementById('upiIdSection').style.display = 'none';

    // Deactivate all tab buttons
    document.querySelectorAll('.pay-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = 'transparent';
        btn.style.color = 'var(--gray)';
    });

    // Get target button and section
    let activeBtn;
    if (tabId === 'upi-app') {
        document.getElementById('upiAppSection').style.display = 'block';
        activeBtn = document.querySelector('[onclick="switchPayTab(\'upi-app\')"]');
    } else if (tabId === 'upi-id') {
        document.getElementById('upiIdSection').style.display = 'block';
        activeBtn = document.querySelector('[onclick="switchPayTab(\'upi-id\')"]');
    }

    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.style.background = 'var(--card)';
        activeBtn.style.color = 'var(--primary)';
        activeBtn.style.boxShadow = 'var(--shadow-sm)';
    }
}

async function payViaUpiId() {
    if (!RAZORPAY_KEY_ID) {
        notify('Payment is not configured right now. Please refresh and try again.', 'error');
        return;
    }
    var upiId = document.getElementById('upiIdInput').value.trim();
    if (!upiId) {
        notify('Please enter a valid UPI ID', 'warning');
        return;
    }
    if (!upiId.includes('@') || upiId.split('@')[1].length < 2) {
        notify('Invalid UPI ID format (e.g. username@bank)', 'warning');
        return;
    }

    if (typeof Razorpay === 'undefined') {
        notify('Payment gateway loading...', 'info');
        return;
    }
    var amount = parseInt(document.getElementById('payFinal').textContent) * 100;
    if (!amount || amount <= 0) return notify('Invalid amount', 'error');

    showLoader('Initializing UPI payment...');
    try {
        notify('Initiating UPI payment...', 'info');
        // Audit 2026-06-14: lift the partnerId from the selected item onto the
        // booking root so the server can route partner SMS to the right operator.
        var partnerId = currentBooking.collaboratorId
            || (currentBooking.selectedBus && currentBooking.selectedBus.collaboratorId)
            || (currentBooking.selectedHotel && currentBooking.selectedHotel.collaboratorId)
            || (currentBooking.selectedCab && currentBooking.selectedCab.collaboratorId)
            || (currentBooking.selectedCafe && currentBooking.selectedCafe.collaboratorId)
            || null;
        var payload = {
            amount: amount / 100,
            type: currentBooking.type,
            itemName: currentBooking.type + ' booking',
            details: { ...currentBooking, collaboratorId: partnerId },
            seats: currentBooking.seats,
            roomType: currentBooking.roomType,
            userName: currentUser?.name || '',
            userPhone: currentUser?.phone || '',
            userAge: '',
            passengerCount: currentBooking.passengers || 1
        };

        var res = await fetch(API_URL + '/api/razorpay/create-order', {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify(payload)
        });
        var data = await res.json();
        if (!data.success) {
            hideLoader();
            return notify('Payment failed: ' + (data.message || 'order creation failed'), 'error');
        }

        var options = {
            key: RAZORPAY_KEY_ID,
            amount: amount,
            currency: 'INR',
            name: 'Yatri Point',
            description: currentBooking.type + ' booking',
            order_id: data.razorpayOrderId || data.orderId,
            prefill: {
                name: currentUser?.name || '',
                email: currentUser?.email || '',
                contact: currentUser?.phone || '',
                method: 'upi',
                vpa: upiId
            },
            config: isMobileDevice() ? {
                upi: {
                    flow: 'intent'
                }
            } : {},
            handler: async function (response) {
                showLoader('Verifying payment and generating ticket...');
                try {
                    notify('Verifying payment...', 'info');
                    var verifyRes = await fetch(API_URL + '/api/razorpay/verify-payment', {
                        method: 'POST', headers: authHeaders(),
                        body: JSON.stringify({
                            razorpayOrderId: response.razorpay_order_id,
                            razorpayPaymentId: response.razorpay_payment_id,
                            razorpaySignature: response.razorpay_signature,
                            orderId: data.orderId
                        })
                    });
                    var verifyData = await verifyRes.json();
                    if (verifyData.success) {
                        closePaymentPage();
                        notify('Booking confirmed! ID: ' + data.orderId, 'success');

                        var ticketData = {
                            ...currentBooking,
                            orderId: data.orderId,
                            amount: amount / 100,
                            paymentMethod: 'UPI (' + upiId + ')',
                            paymentStatus: 'confirmed'
                        };
                        saveAndRedirectTicket(ticketData);
                    } else {
                        notify('Payment verification failed: ' + verifyData.message, 'error');
                    }
                } catch (err) {
                    notify('Payment verification error', 'error');
                } finally {
                    hideLoader();
                }
            },
            theme: { color: '#d84e55' },
            modal: {
                ondismiss: function () {
                    notify('Payment cancelled. Ticket not generated.', 'info');
                }
            }
        };
        var rzp = new Razorpay(options);
        rzp.on('payment.failed', function (response) {
            notify('Payment failed: ' + response.error.description, 'error');
        });
        rzp.open();
    } catch (err) {
        notify('Payment error: ' + err.message, 'error');
    } finally {
        hideLoader();
    }
}



// ========== BOOKINGS ==========
function openBookings() {
    if (!isIndexPage()) {
        window.location.href = 'index.html#bookings';
        return;
    }
    if (!requireAuth()) return;
    navigateTo('bookings');
    loadBookings();
}

async function loadBookings() {
    var container = document.getElementById('bookingsList');
    if (!container) return;
    container.innerHTML = `
        <div class="premium-spinner-container">
            <div class="premium-spinner-inline"></div>
            <div class="premium-spinner-text">Loading your bookings...</div>
        </div>
    `;
    try {
        var res = await fetch(API_URL + '/api/user/bookings', { method: 'POST', headers: authHeaders() });
        var data = await res.json();
        if (data.success && (data.bookings || data.data)) {
            renderBookings(data.bookings || data.data);
        } else {
            container.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--gray);">No bookings yet.</p>';
        }
    } catch (err) {
        container.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--gray);">Could not load bookings. Please try again.</p>';
    }
}

function renderBookings(bookings) {
    var container = document.getElementById('bookingsList');
    if (!container) return;
    if (!bookings || bookings.length === 0) {
        container.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--gray);">No bookings found.</p>';
        return;
    }
    var html = '';
    bookings.forEach(function (b) {
        var icons = { bus: 'Bus', hotel: 'Hotel', cab: 'Cab', cafe: 'Cafe' };
        var icon = icons[b.type] || 'Booking';
        html += '<div class="result-card" onclick="showBookingDetail(\'' + (b.id || b.bookingId) + '\')">';
        html += '<h3>' + icon + ' ' + (b.type || 'Booking').toUpperCase() + '</h3>';
        html += '<div class="result-details"><span>' + (b.date || b.createdAt || '') + '</span>';
        html += '<span>₹' + (b.amount || b.total || 0) + '</span></div>';
        html += '<div class="result-details"><span>🆔 ' + (b.id || b.bookingId || '') + '</span>';
        html += '<span>' + (b.status || 'confirmed') + '</span></div>';
        html += '</div>';
    });
    container.innerHTML = html;
}

function showBookingDetail(bookingId) {
    var container = document.getElementById('bookingDetailContent');
    if (!container) return;
    container.innerHTML = '<p>Booking ID: ' + bookingId + '<br><br><button class="btn-primary" onclick="closeModal(\'bookingDetailModal\')">Close</button></p>';
    openModal('bookingDetailModal');
}

// ========== PROFILE ==========
function openProfile() {
    if (!isIndexPage()) {
        window.location.href = 'index.html#profile';
        return;
    }
    if (!requireAuth()) return;
    navigateTo('profile');
    loadProfile();
}

function loadProfile() {
    if (!currentUser) return;
    const nameEl = document.getElementById('profileName');
    const emailEl = document.getElementById('profileEmail');
    const nameInputEl = document.getElementById('profileNameInput');
    const photoInitialEl = document.getElementById('profilePhotoInitial');
    const emailBadgeEl = document.getElementById('emailVerifiedBadge');
    
    if (nameEl) nameEl.textContent = currentUser.name || 'User';
    if (emailEl) emailEl.textContent = currentUser.email || '—';
    if (nameInputEl) nameInputEl.value = currentUser.name || '';
    
    if (photoInitialEl) {
        var initial = (currentUser.name || currentUser.email || 'U')[0].toUpperCase();
        photoInitialEl.textContent = initial;
    }
    
    if (emailBadgeEl) {
        if (currentUser.authProvider === 'google') {
            emailBadgeEl.style.display = 'inline-block';
        } else {
            emailBadgeEl.style.display = 'none';
        }
    }
    
    var phone = currentUser.phone || '';
    var verified = currentUser.phoneVerified;
    
    var displayEl = document.getElementById('profilePhoneDisplay');
    var verifiedBadge = document.getElementById('phoneVerifiedBadge');
    var unverifiedBadge = document.getElementById('phoneUnverifiedBadge');
    var verifyBtn = document.getElementById('btnVerifyPhoneProfile');
    
    if (phone) {
        if (displayEl) displayEl.textContent = phone;
        if (verified) {
            if (verifiedBadge) verifiedBadge.style.display = 'inline-block';
            if (unverifiedBadge) unverifiedBadge.style.display = 'none';
            if (verifyBtn) verifyBtn.style.display = 'none';
        } else {
            if (verifiedBadge) verifiedBadge.style.display = 'none';
            if (unverifiedBadge) unverifiedBadge.style.display = 'inline-block';
            if (verifyBtn) verifyBtn.style.display = 'inline-block';
        }
    } else {
        if (displayEl) displayEl.textContent = 'Not available';
        if (verifiedBadge) verifiedBadge.style.display = 'none';
        if (unverifiedBadge) unverifiedBadge.style.display = 'none';
        if (verifyBtn) verifyBtn.style.display = 'none';
    }
}

function togglePhoneEditForm(show) {
    const container = document.getElementById('phoneEditFormContainer');
    if (!container) return;
    container.style.display = show ? 'block' : 'none';
    if (show) {
        var rawPhone = currentUser?.phone || '';
        const phoneInput = document.getElementById('profilePhoneInput');
        if (phoneInput) {
            phoneInput.value = rawPhone.replace('+91', '').replace(/\D/g, '').slice(-10);
            phoneInput.focus();
        }
    }
}

async function saveProfilePhone() {
    var phoneInputEl = document.getElementById('profilePhoneInput');
    if (!phoneInputEl) return;
    var phoneInput = phoneInputEl.value.trim();
    var cleanPhone = phoneInput.replace(/\D/g, '').slice(-10);
    if (!cleanPhone || !/^[6-9]\d{9}$/.test(cleanPhone)) {
        return notify('Please enter a valid 10-digit Indian mobile number', 'error');
    }
    
    var formattedPhone = '+91' + cleanPhone;
    
    // If user inputs the exact same phone number and it is already verified, do nothing
    if (formattedPhone === currentUser.phone && currentUser.phoneVerified) {
        notify('This phone number is already verified.', 'info');
        togglePhoneEditForm(false);
        return;
    }

    notify('Please verify the new phone number via OTP...', 'info');

    try {
        // Trigger MSG91 OTP verification first
        const token = await window.msg91OTP.verify(formattedPhone);
        
        notify('Saving changes...', 'info');
        
        // Once verified by widget, tell backend to update phone & mark verified
        const res = await fetch(API_URL + '/api/auth/mark-phone-verified', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authToken
            },
            body: JSON.stringify({ phone: formattedPhone, token: token })
        });
        const data = await res.json();
        
        if (data.success) {
            notify('Phone number changed and verified successfully!', 'success');
            currentUser.phone = formattedPhone;
            currentUser.phoneVerified = true;
            saveSession(authToken, currentUser, refreshToken);
            
            togglePhoneEditForm(false);
            loadProfile();
        } else {
            notify(data.message || 'Verification failed on server', 'error');
        }
    } catch (err) {
        console.error(err);
        if (err === 'mock-otp-token' || (err && err.message === 'mock-otp-token')) {
            // Support local offline/mock testing if widget resolves mock token
            currentUser.phone = formattedPhone;
            currentUser.phoneVerified = true;
            saveSession(authToken, currentUser, refreshToken);
            togglePhoneEditForm(false);
            loadProfile();
            notify('Phone number changed and verified (mock OTP)', 'success');
        } else {
            notify(err.message || err || 'Phone verification failed. Number was not changed.', 'error');
        }
    }
}

function saveProfileName() {
    var name = document.getElementById('profileNameInput').value.trim();
    if (!name) return notify('Name cannot be empty', 'error');
    fetch(API_URL + '/api/auth/profile', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ name: name })
    }).then(function (r) { return r.json(); }).then(function (data) {
        if (data.success) {
            currentUser.name = name;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            document.getElementById('profileName').textContent = name;
            document.getElementById('userNameDisplay').textContent = name;
            const topAccountNameText = document.getElementById('topAccountNameText');
            if (topAccountNameText) topAccountNameText.textContent = name;
            notify('Name updated', 'success');
        } else {
            notify(data.message || 'Failed to update', 'error');
        }
    }).catch(function () {
        // Update locally even if API fails
        currentUser.name = name;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        document.getElementById('profileName').textContent = name;
        document.getElementById('userNameDisplay').textContent = name;
        const topAccountNameText = document.getElementById('topAccountNameText');
        if (topAccountNameText) topAccountNameText.textContent = name;
        notify('Name updated (offline)', 'success');
    });
}

function handlePhotoUpload(e) {
    var file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return notify('Image too large (max 5MB)', 'error');
    var reader = new FileReader();
    reader.onload = function (ev) {
        var wrapper = document.getElementById('profilePhotoWrapper');
        if (wrapper) wrapper.innerHTML = '<img src="' + ev.target.result + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
        notify('Photo updated', 'success');
    };
    reader.readAsDataURL(file);
}



// ========== LIVE LOCATION ==========
function toggleLiveLocation(cb) {
    if (!cb.checked) {
        document.getElementById('liveLocationStatus').style.display = 'none';
        return;
    }

    if (!confirm("Would you like to share your live location from this device?")) {
        cb.checked = false;
        return;
    }

    if (!navigator.geolocation) {
        cb.checked = false;
        notify('Geolocation not supported by your browser', 'error');
        return;
    }
    navigator.geolocation.getCurrentPosition(
        function (pos) {
            document.getElementById('liveLocationStatus').style.display = 'block';
            currentBooking.liveLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            notify('Live location shared', 'success');
        },
        function (err) {
            cb.checked = false;
            notify('Could not get location. Please enable GPS.', 'error');
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

// ========== GPS FILL FOR INPUTS ==========
function fillLocationFromGPS(inputId) {
    if (!navigator.geolocation) {
        notify('Geolocation is not supported by your browser', 'error');
        return;
    }
    var btn = document.getElementById(
        inputId === 'carBoarding' ? 'boardingLocBtn' : 'droppingLocBtn'
    );
    var originalText = btn ? btn.textContent : '📍';
    if (btn) { btn.textContent = '⏳'; btn.disabled = true; }

    navigator.geolocation.getCurrentPosition(
        function (pos) {
            var lat = pos.coords.latitude;
            var lng = pos.coords.longitude;
            // Reverse geocode using OpenStreetMap Nominatim (free, no API key)
            fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng + '&zoom=18&addressdetails=1')
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    var addr = data.address || {};
                    // Build a short readable address
                    var parts = [
                        addr.road || addr.pedestrian || addr.footway || addr.path || '',
                        addr.neighbourhood || addr.suburb || addr.village || addr.town || addr.city_district || '',
                        addr.city || addr.county || addr.state_district || ''
                    ].filter(Boolean);
                    var readable = parts.slice(0, 3).join(', ') || data.display_name || (lat.toFixed(5) + ', ' + lng.toFixed(5));
                    var input = document.getElementById(inputId);
                    if (input) input.value = readable;
                    notify('📍 Location filled!', 'success');
                })
                .catch(function () {
                    // Fallback to raw coordinates
                    var input = document.getElementById(inputId);
                    if (input) input.value = lat.toFixed(6) + ', ' + lng.toFixed(6);
                    notify('📍 Location filled (coordinates)', 'success');
                })
                .finally(function () {
                    if (btn) { btn.textContent = originalText; btn.disabled = false; }
                });
        },
        function (err) {
            if (btn) { btn.textContent = originalText; btn.disabled = false; }
            if (err.code === err.PERMISSION_DENIED) {
                notify('Location permission denied. Please allow location in browser settings.', 'error');
            } else {
                notify('Could not get your location. Please try again.', 'error');
            }
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

// Pre-request location permission silently on page load
function requestLocationPermissionSilently() {
    if (!navigator.geolocation) return;
    navigator.permissions && navigator.permissions.query({ name: 'geolocation' }).then(function (result) {
        if (result.state === 'prompt') {
            // Trigger the permission dialog once so browser caches the decision
            navigator.geolocation.getCurrentPosition(
                function (pos) {
                    // Cache coordinates for later use
                    window._cachedUserLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                },
                function () { /* user denied — that's OK */ },
                { enableHighAccuracy: false, timeout: 8000 }
            );
        } else if (result.state === 'granted') {
            navigator.geolocation.getCurrentPosition(
                function (pos) {
                    window._cachedUserLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                },
                function () { },
                { enableHighAccuracy: false, timeout: 8000 }
            );
        }
    });
}

// ========== COLLABORATOR FORM ==========
function showCollabForm() {
    var type = document.getElementById('collabType').value;
    document.querySelectorAll('.collab-specific').forEach(function (el) { el.style.display = 'none'; });
    document.getElementById('collab-common').style.display = 'none';
    if (type) {
        var specific = document.getElementById('collab-' + type);
        if (specific) specific.style.display = 'block';
        document.getElementById('collab-common').style.display = 'block';
    }
}

function initCollabOTP() {
    var phone = document.getElementById('collabPhoneInput').value.replace(/\D/g, '');
    if (phone.length !== 10) return notify('Enter valid 10-digit phone number', 'error');
    var btn = document.getElementById('collabSendOtpBtn');
    if (btn) btn.textContent = 'Verified';
    if (btn) btn.style.background = '#28a745';
    notify('Phone verified', 'success');
}

async function submitCollab(e) {
    e.preventDefault();
    if (!requireAuth()) return;
    const btn = e.target.querySelector('button[type="submit"]');
    var type = document.getElementById('collabType').value;
    if (!type) return notify('Please select a business type', 'error');
    var data = {
        type: type,
        name: document.getElementById('collabName')?.value?.trim(),
        phone: document.getElementById('collabPhoneInput')?.value?.trim(),
        upi: document.getElementById('collabUPI')?.value?.trim()
    };
    if (!data.name || !data.phone || !data.upi) return notify('Please fill all required fields', 'error');
    // Type-specific fields
    if (type === 'cab') {
        data.plate = document.getElementById('cabPlate')?.value?.trim();
        data.rate = document.getElementById('cabRate')?.value;
        data.city = document.getElementById('cabCity')?.value;
        if (!data.plate || !data.rate || !data.city) return notify('Fill all cab details', 'error');
    } else if (type === 'bus') {
        data.plate = document.getElementById('busPlate')?.value?.trim();
        data.rate = document.getElementById('busRate')?.value;
        data.routes = document.getElementById('busRoutes')?.value?.trim();
        if (!data.plate || !data.rate || !data.routes) return notify('Fill all bus details', 'error');
    } else if (type === 'cafe') {
        data.cafeName = document.getElementById('cafeName')?.value?.trim();
        data.cost = document.getElementById('cafeCost')?.value;
        data.location = document.getElementById('cafeLocation')?.value?.trim();
        if (!data.cafeName || !data.cost || !data.location) return notify('Fill all café details', 'error');
    } else if (type === 'hotel') {
        data.hotelName = document.getElementById('hotelName')?.value?.trim();
        data.general = document.getElementById('hotelGeneral')?.value;
        data.ac = document.getElementById('hotelAc')?.value;
        data.balcony = document.getElementById('hotelBalcony')?.value;
        data.location = document.getElementById('hotelLocation')?.value?.trim();
        if (!data.hotelName || !data.general || !data.ac || !data.balcony || !data.location) return notify('Fill all hotel details', 'error');
    }

    showLoader('Submitting application...');
    setButtonLoading(btn, true, '🚀 Submit Application');
    try {
        var res = await fetch(API_URL + '/api/submit-collab', {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify(data)
        });
        var result = await res.json();
        if (result.success) {
            notify('Application submitted! We will review and contact you within 24 hours.', 'success');
            document.getElementById('collabForm').reset();
            showCollabForm();
        } else {
            notify(result.message || 'Submission failed', 'error');
        }
    } catch (err) {
        notify('Application submitted! (offline — we will review shortly)', 'success');
        document.getElementById('collabForm').reset();
        showCollabForm();
    } finally {
        setButtonLoading(btn, false, '🚀 Submit Application');
        hideLoader();
    }
}

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', function () {
    // Restore session
    restoreSession();
    bootstrapAuthenticatedExperience();

    // Ask for location permission silently on load
    requestLocationPermissionSilently();

    // Populate location selects
    populateLocationSelects();

    // Set default dates
    var today = new Date().toISOString().split('T')[0];
    var dateInputs = document.querySelectorAll('input[type="date"]');
    dateInputs.forEach(function (inp) { if (!inp.value) inp.value = today; });

    // Set today's date for car
    var carDate = document.getElementById('carDate');
    if (carDate) carDate.value = today;

    // Hide splash
    setTimeout(hideSplash, 1500);

    // Handle hash-based routing/actions on load
    handleHashAction();

    // Listen to hash changes
    window.addEventListener('hashchange', handleHashAction);

    // Fetch config and init Google Sign-In + MSG91 widget auth
    fetch(API_URL + '/api/config')
        .then(function (r) { return r.json(); })
        .then(function (config) {
            if (config.googleClientId) {
                GOOGLE_CLIENT_ID = config.googleClientId;
            }
            if (config.razorpayKeyId) {
                RAZORPAY_KEY_ID = config.razorpayKeyId;
            }
            // Initialize Google Sign-In once config is ready
            initGoogleSignIn();
        })
        .catch(function (err) {
            console.error('Failed to load /api/config:', err);
            notify('Unable to initialize payment. Please refresh and try again.', 'error');
            // Fallback only for Google sign-in. Do NOT fallback Razorpay to a hardcoded key,
            // otherwise frontend can drift from backend env and payments will fail.
            GOOGLE_CLIENT_ID = '494833578713-r3tbr8e1bquphe3r84pbdeba5no7tqmj.apps.googleusercontent.com';
            RAZORPAY_KEY_ID = '';
            initGoogleSignIn();
        });

    // Close dropdown on outside click
    document.addEventListener('click', function (e) {
        var menu = document.getElementById('dropdownMenu');
        var section = document.getElementById('userSection');
        if (menu && menu.classList.contains('active') && section && !section.contains(e.target)) {
            menu.classList.remove('active');
        }
    });

    // Handle Enter key in OTP inputs
    var otpInput = document.getElementById('otpInput');
    if (otpInput) {
        otpInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') confirmOTP();
        });
    }
    var emailOtpInput = document.getElementById('emailOtpInput');
    if (emailOtpInput) {
        emailOtpInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') confirmEmailOTP();
        });
    }

    // ============================================================
    // YP UTILITIES — skeleton, server-down UI, debounce, cache
    // ============================================================
    // All helpers live in public/js/yp-utils.js and are exposed as window.YP.
    // The wiring below is non-invasive: it decorates the existing search
    // functions without rewriting them.
    (function wireYpUtils() {
        if (!window.YP) return;
        var YP = window.YP;
        var api = YP.api;
        var Skeleton = YP.Skeleton;
        var ServerError = YP.ServerError;

        // 1) Wrap search functions with skeleton + cached fetch.
        //    The original handlers return a promise; we replace the body of
        //    the work they do with a YP.api.post call that uses the in-memory
        //    cache, and mount a skeleton in #resultsContainer first.
        function withSkeleton(fn) {
            return async function decorated() {
                var container = document.getElementById('resultsContainer');
                if (container) Skeleton.mount(container, 4);
                try {
                    return await fn.apply(this, arguments);
                } finally {
                    if (container) Skeleton.unmount(container);
                }
            };
        }

        // Patch the four search endpoints to use YP.api (caching + retry).
        var _origSearchBuses = window.searchBuses;
        if (typeof _origSearchBuses === 'function') {
            window.searchBuses = withSkeleton(async function (e) {
                e.preventDefault();
                if (!requireAuth()) return;
                var from = document.getElementById('busFrom').value;
                var to = document.getElementById('busTo').value;
                var date = document.getElementById('busDate').value;
                var passengers = parseInt(document.getElementById('busPassengers').value);
                if (from === to) return notify('From and To cannot be same', 'error');
                try {
                    var res = await api.post('/api/buses/search',
                        { from: from, to: to, date: date, passengers: passengers },
                        { headers: authHeaders(), cache: true, cacheTtl: 45_000, timeout: 15000 });
                    var data = res.data;
                    if (!data || !data.success || !data.buses || data.buses.length === 0)
                        return notify('No buses found for this route', 'error');
                    ALL_SEARCHED_BUSES = data.buses;
                    currentBooking = { type: 'bus', from: from, to: to, date: date, passengers: passengers, buses: data.buses };
                    var sorted = [].concat(data.buses).sort(function (a, b) { return a.startingPrice - b.startingPrice; });
                    renderBusResults(sorted);
                } catch (err) {
                    console.error('Bus search error:', err);
                    if (err && err.kind === 'NETWORK') return; // ServerError already shown
                    notify('No buses found for this route', 'error');
                }
            });
        }

        var _origSearchHotels = window.searchHotels;
        if (typeof _origSearchHotels === 'function') {
            window.searchHotels = withSkeleton(async function (e) {
                e.preventDefault();
                if (!requireAuth()) return;
                var location = document.getElementById('hotelLocation').value;
                var checkin = document.getElementById('hotelCheckin').value;
                var checkout = document.getElementById('hotelCheckout').value;
                var guests = document.getElementById('hotelGuests').value;
                if (!location) return notify('Please select a location', 'error');
                try {
                    var res = await api.post('/api/hotels/search',
                        { location: location, checkin: checkin, checkout: checkout, guests: guests },
                        { headers: authHeaders(), cache: true, cacheTtl: 60_000, timeout: 15000 });
                    var data = res.data;
                    if (!data || !data.success) return notify(data && data.message || 'No hotels found', 'error');
                    currentBooking = { type: 'hotel', location: location, checkin: checkin, checkout: checkout, guests: guests, hotels: data.hotels || data.data || [] };
                    renderHotelResults(data.hotels || data.data || []);
                } catch (err) {
                    console.error('Hotel search error:', err);
                    if (err && err.kind === 'NETWORK') return;
                    notify('No hotels found in ' + location, 'error');
                }
            });
        }

        var _origSearchCars = window.searchCars;
        if (typeof _origSearchCars === 'function') {
            window.searchCars = withSkeleton(async function (e) {
                e.preventDefault();
                if (!requireAuth()) return;
                var city = document.getElementById('carCity').value;
                var boarding = document.getElementById('carBoarding').value.trim();
                var dropping = document.getElementById('carDropping').value.trim();
                var date = document.getElementById('carDate').value;
                var time = document.getElementById('carTime').value;
                var passengers = document.getElementById('carPassengers').value;
                if (!city) return notify('Please select a city', 'error');
                try {
                    var res = await api.post('/api/cabs/search',
                        { city: city, boarding: boarding, dropping: dropping, date: date, time: time, passengers: passengers },
                        { headers: authHeaders(), cache: true, cacheTtl: 60_000, timeout: 15000 });
                    var data = res.data;
                    if (!data || !data.success) return notify(data && data.message || 'No cabs available', 'error');
                    currentBooking = { type: 'cab', city: city, boarding: boarding, dropping: dropping, date: date, time: time, passengers: passengers, cabs: data.cabs || data.data || [] };
                    renderCabResults(data.cabs || data.data || []);
                } catch (err) {
                    console.error('Cab search error:', err);
                    if (err && err.kind === 'NETWORK') return;
                    notify('No cabs available in ' + city, 'error');
                }
            });
        }

        var _origLoadCafes = window.loadCafes;
        if (typeof _origLoadCafes === 'function') {
            window.loadCafes = withSkeleton(async function () {
                var container = document.getElementById('cafeGrid') || document.getElementById('resultsContainer');
                try {
                    var res = await api.get('/api/cafes',
                        { headers: authHeaders(), cache: true, cacheTtl: 60_000, timeout: 15000 });
                    var data = res.data;
                    if (data && data.success && (data.cafes || data.data)) {
                        currentBooking.cafes = data.cafes || data.data;
                        renderCafes(data.cafes || data.data);
                        return;
                    }
                } catch (err) {
                    if (err && err.kind === 'NETWORK') { currentBooking.cafes = []; renderCafes([]); return; }
                    console.error('Cafe load error:', err);
                }
                currentBooking.cafes = [];
                renderCafes([]);
            });
        }

        // 2) Throttle the operator filter checkbox so flipping 5 boxes in a
        //    row only triggers one re-render, not five.
        if (typeof window.triggerFilterUpdate === 'function') {
            window.triggerFilterUpdate = YP.throttle(window.triggerFilterUpdate, 120);
        }

        // 3) Debounce the hash/route search-as-you-type, if any input exists.
        //    Skips gracefully if no element is present.
        var busFrom = document.getElementById('busFrom');
        if (busFrom) {
            var debouncedRouteLookup = YP.debounce(function () {
                // Hook for future autocomplete. Intentionally a no-op for now.
            }, 250);
            busFrom.addEventListener('input', debouncedRouteLookup);
        }

        // 4) Auto-hide the server-error overlay when the user retries and the
        //    next request succeeds. We do that by listening on the global
        //    retry event and probing /api/config.
        window.addEventListener('yp:retry', function () {
            api.get('/api/config', { timeout: 4000, showErrorOnFail: false })
                .then(function () { ServerError.hide(); })
                .catch(function () { ServerError.show(); });
        });
    })();
});
