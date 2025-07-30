// --- Supabase Setup ---
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Your Supabase project credentials
const SUPABASE_URL = 'https://ynqlxqqeprgxjjusihlg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlucWx4cXFlcHJneGpqdXNpaGxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NTczMTEsImV4cCI6MjA2OTQzMzMxMX0.CtRdrVjnyy7atnFPwVGAhwpF08yDt-VDmVbJ8gnrVKM';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Global Variables ---
let currentUserProfile = null; // Stores the currently logged-in user's profile data
let html5QrCodeScanner = null; // Html5Qrcode instance
let isScannerActive = false; // Flag to track scanner state

// This is the string from your specific dustbin QR code.
const EXPECTED_FRAME_QR_CONTENT = 'https://qrco.de/bgBWbc';
// Cooldown period for scanning the same QR code (5 minutes)
const QR_SCAN_COOLDOWN_MS = 5 * 60 * 1000;

// Default coupons (can be moved to a Supabase table later)
const defaultCoupons = [
    { id: 'coupon1', name: '10% Off at Green Mart', points: 100 },
    { id: 'coupon2', name: 'Free Coffee at EcoCafe', points: 50 },
    { id: 'coupon3', name: '20% Off Recycled Clothing', points: 200 },
    { id: 'coupon4', name: 'Free Plant Seedling', points: 75 },
    { id: 'coupon5', name: '15% Off Solar Gadgets', points: 150 },
    { id: 'coupon6', name: 'Free Eco-Bag', points: 30 },
];

// --- UI Element References ---
const authModal = document.getElementById('authModal');
const loadingOverlay = document.getElementById('loadingOverlay');
const toastContainer = document.getElementById('toastContainer');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

// --- Core App Initialization ---

/**
 * Initializes the application.
 */
async function initApp() {
    console.log("Smart Dust Bin App Initializing with Supabase...");
    setupEventListeners();
    handleAuthStateChange(); // Check user session and listen for changes
    showPage('dashboard');
}

/**
 * Sets up global event listeners.
 */
function setupEventListeners() {
    loginForm?.addEventListener('submit', handleLogin);
    registerForm?.addEventListener('submit', handleRegister);
    document.getElementById('forgotPasswordForm')?.addEventListener('submit', handleForgotPassword);
    document.getElementById('passwordResetForm')?.addEventListener('submit', handlePasswordReset);
}

/**
 * Listens for authentication state changes (login, logout) and updates the UI.
 */
function handleAuthStateChange() {
    supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === "PASSWORD_RECOVERY") {
            // User arrived from a password reset link, show the reset page
            showPage('resetPassword');
        } else if (event === 'SIGNED_IN' && session) {
            console.log('User signed in:', session.user.id);
            await loadUserProfile(session.user);
            authModal.style.display = 'none';
            document.getElementById('forgotPasswordModal').style.display = 'none';
            showPage('dashboard');
        } else if (event === 'SIGNED_OUT') {
            console.log('User signed out.');
            currentUserProfile = null;
            updateUIForGuest();
            // Do not show the authModal automatically on logout if the user is on the reset page
            if (!window.location.hash.includes('access_token')) {
                authModal.style.display = 'flex';
                showPage('dashboard');
            }
        }
    });
}

/**
 * Loads the user's profile from the 'profiles' table.
 * @param {object} user The user object from Supabase Auth.
 */
async function loadUserProfile(user) {
    showLoading();
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error) throw error;

        currentUserProfile = data;
        await updateUI();
    } catch (error) {
        console.error("Error loading user profile:", error.message);
        showToast("Could not load your profile. Please try again.", "error");
        logout(); // Log out if profile is inaccessible
    } finally {
        hideLoading();
    }
}


// --- Authentication ---

/**
 * Handles user registration.
 */
async function handleRegister(event) {
    event.preventDefault();
    showLoading();

    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;

    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    username: username // Pass username to be used in the trigger
                }
            }
        });

        if (error) throw error;

        showToast('Registration successful!', 'success');
        // The onAuthStateChange listener will handle the rest
    } catch (error) {
        console.error('Registration error:', error.message);
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Handles user login.
 */
async function handleLogin(event) {
    event.preventDefault();
    showLoading();

    const email = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password,
        });

        if (error) throw error;
        // onAuthStateChange listener handles successful login
    } catch (error) {
        console.error('Login error:', error.message);
        showToast('Invalid login credentials.', 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Logs out the current user.
 */
async function logout() {
    showLoading();
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error("Logout error:", error.message);
        showToast("Error logging out.", "error");
    } else {
        showToast('Logged out successfully!', 'info');
    }
    // onAuthStateChange handles UI update
    hideLoading();
}

// --- New Password Feature Functions ---

function togglePasswordVisibility(inputId, iconId) {
    const passwordInput = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

function showForgotPasswordModal() {
    document.getElementById('authModal').style.display = 'none';
    document.getElementById('forgotPasswordModal').style.display = 'flex';
}

function hideForgotPasswordModal() {
    document.getElementById('forgotPasswordModal').style.display = 'none';
    document.getElementById('authModal').style.display = 'flex';
}

async function handleForgotPassword(event) {
    event.preventDefault();
    showLoading();
    const email = document.getElementById('resetEmail').value;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.href.split('#')[0], // Redirects to the current page without the hash
    });

    hideLoading();
    if (error) {
        showToast(error.message, 'error');
    } else {
        showToast('Password reset link sent! Check your email.', 'success');
        document.getElementById('forgotPasswordModal').style.display = 'none';
    }
}

async function handlePasswordReset(event) {
    event.preventDefault();
    showLoading();
    const newPassword = document.getElementById('newPassword').value;

    if (newPassword.length < 6) {
        showToast('Password must be at least 6 characters long.', 'warning');
        hideLoading();
        return;
    }

    const { error } = await supabase.auth.updateUser({
        password: newPassword
    });

    hideLoading();
    if (error) {
        showToast(error.message, 'error');
    } else {
        showToast('Password updated successfully! Please log in.', 'success');
        // Clear the URL hash and show the login modal
        window.location.hash = '';
        showPage('dashboard');
        authModal.style.display = 'flex';
    }
}


// --- UI Updates ---

/**
 * Updates the entire UI based on the current user's data.
 */
async function updateUI() {
    if (!currentUserProfile) {
        updateUIForGuest();
        return;
    }
    document.getElementById('userName').innerText = currentUserProfile.username;
    document.getElementById('userPoints').innerText = currentUserProfile.points;

    // Fetch and render dashboard stats & history
    const { data: history, error } = await supabase
        .from('points_history')
        .select('*')
        .eq('user_id', currentUserProfile.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error fetching history:", error.message);
        return;
    }
    
    const totalScans = history.filter(item => item.action === 'qr_scan').length;
    const totalRedeemed = history.filter(item => item.action === 'coupon_redeem').length;

    document.getElementById('totalPoints').innerText = currentUserProfile.points;
    document.getElementById('totalScans').innerText = totalScans;
    document.getElementById('totalRedeemed').innerText = totalRedeemed;

    renderRecentActivity(history);
    renderPointsHistory(history);
}

/**
 * Resets the UI for a logged-out (guest) user.
 */
function updateUIForGuest() {
    document.getElementById('userName').innerText = 'Guest';
    document.getElementById('userPoints').innerText = '0';
    document.getElementById('totalPoints').innerText = '0';
    document.getElementById('totalScans').innerText = '0';
    document.getElementById('totalRedeemed').innerText = '0';
    document.getElementById('recentActivity').innerHTML = '<p class="activity-item">Please log in to see your activity.</p>';
    document.getElementById('pointsHistory').innerHTML = '<p class="history-item">Please log in to see your history.</p>';
}

// --- Page-Specific Rendering ---

function renderRecentActivity(historyData) {
    const recentActivityDiv = document.getElementById('recentActivity');
    recentActivityDiv.innerHTML = '';
    const recentItems = historyData.slice(0, 5);

    if (recentItems.length === 0) {
        recentActivityDiv.innerHTML = '<p class="activity-item">No recent activity. Start recycling!</p>';
        return;
    }
    
    recentItems.forEach(item => {
        const pointsClass = item.points_change >= 0 ? 'positive' : 'negative';
        const iconClass = item.action === 'qr_scan' ? 'scan' : (item.action === 'coupon_redeem' ? 'redeem' : 'bonus');
        const icon = item.points_change >= 0 ? 'fa-plus' : 'fa-gift';

        const activityItem = `
            <div class="activity-item">
                <div class="activity-icon ${iconClass}"><i class="fas ${icon}"></i></div>
                <div class="activity-details">
                    <div class="activity-description">${item.description}</div>
                    <div class="activity-time">${new Date(item.created_at).toLocaleString()}</div>
                </div>
                <div class="activity-points ${pointsClass}">${item.points_change > 0 ? '+' : ''}${item.points_change}</div>
            </div>`;
        recentActivityDiv.innerHTML += activityItem;
    });
}

function renderPointsHistory(historyData) {
    const pointsHistoryDiv = document.getElementById('pointsHistory');
    pointsHistoryDiv.innerHTML = '';

    if (historyData.length === 0) {
        pointsHistoryDiv.innerHTML = '<p class="history-item">No transactions yet.</p>';
        return;
    }

    historyData.forEach(item => {
        const pointsClass = item.points_change >= 0 ? 'positive' : 'negative';
        const iconClass = item.action === 'qr_scan' ? 'scan' : (item.action === 'coupon_redeem' ? 'redeem' : 'bonus');
        const icon = item.points_change >= 0 ? 'fa-plus' : 'fa-gift';

        const historyItem = `
            <div class="history-item">
                <div class="history-icon ${iconClass}"><i class="fas ${icon}"></i></div>
                <div class="history-details">
                    <div class="history-description">${item.description}</div>
                    <div class="history-time">${new Date(item.created_at).toLocaleString()}</div>
                </div>
                <div class="history-points ${pointsClass}">${item.points_change > 0 ? '+' : ''}${item.points_change}</div>
            </div>`;
        pointsHistoryDiv.innerHTML += historyItem;
    });
}


function loadCoupons() {
    const couponsGrid = document.getElementById('couponsGrid');
    couponsGrid.innerHTML = '';

    defaultCoupons.forEach(coupon => {
        const canRedeem = currentUserProfile && currentUserProfile.points >= coupon.points;
        const buttonDisabled = canRedeem ? '' : 'disabled';
        let buttonText = 'Redeem Now';
        if (!currentUserProfile) buttonText = 'Login to Redeem';
        else if (!canRedeem) buttonText = 'Insufficient Points';

        const couponCard = `
            <div class="card coupon-card">
                <div class="coupon-header">
                    <div class="coupon-name">${coupon.name}</div>
                    <div class="coupon-points"><i class="fas fa-coins"></i> ${coupon.points} Points</div>
                </div>
                <div class="coupon-body">
                    <p class="coupon-description">Redeem for exclusive eco-friendly benefits!</p>
                    <button class="coupon-btn" onclick="redeemCoupon('${coupon.id}', ${coupon.points})" ${buttonDisabled}>
                        ${buttonText}
                    </button>
                </div>
            </div>`;
        couponsGrid.innerHTML += couponCard;
    });
}

// --- Core Features ---

async function redeemCoupon(couponId, pointsRequired) {
    if (!currentUserProfile) {
        showToast("Please log in to redeem coupons.", "warning");
        return;
    }
    if (currentUserProfile.points < pointsRequired) {
        showToast("Insufficient points!", "warning");
        return;
    }

    showLoading();
    try {
        const coupon = defaultCoupons.find(c => c.id === couponId);
        if (!coupon) throw new Error("Coupon not found.");

        const newPoints = currentUserProfile.points - pointsRequired;

        // Perform DB updates
        const { error: profileError } = await supabase
            .from('profiles')
            .update({ points: newPoints })
            .eq('id', currentUserProfile.id);
        if (profileError) throw profileError;

        const { error: historyError } = await supabase.from('points_history').insert({
            user_id: currentUserProfile.id,
            action: 'coupon_redeem',
            points_change: -pointsRequired,
            description: `Redeemed: ${coupon.name}`
        });
        if (historyError) throw historyError;
        
        // Update local state and UI
        currentUserProfile.points = newPoints;
        showToast(`Coupon "${coupon.name}" redeemed!`, "success");
        await updateUI();
        loadCoupons();

    } catch (error) {
        console.error("Error redeeming coupon:", error.message);
        showToast("Could not redeem coupon. Please try again.", "error");
    } finally {
        hideLoading();
    }
}

async function handleQRScan(decodedText) {
    if (!isScannerActive || !currentUserProfile) return;

    await stopScanner();
    showLoading();

    try {
        if (decodedText !== EXPECTED_FRAME_QR_CONTENT) {
            showToast("Invalid QR Code. Please scan the one on the dustbin.", "error");
            return;
        }

        const qrId = decodedText;
        const userId = currentUserProfile.id;
        const currentTime = new Date();

        // Check for cooldown
        const { data: existingScan, error: scanError } = await supabase
            .from('qr_scans')
            .select('last_scanned_at')
            .eq('user_id', userId)
            .eq('qr_id', qrId)
            .single();

        // 'PGRST116' is the error code for 'no rows returned', which is expected for a first scan.
        if (scanError && scanError.code !== 'PGRST116') {
             throw scanError;
        }
        
        if (existingScan) {
            const timeSinceLastScan = currentTime.getTime() - new Date(existingScan.last_scanned_at).getTime();
            if (timeSinceLastScan < QR_SCAN_COOLDOWN_MS) {
                const remainingMinutes = Math.ceil((QR_SCAN_COOLDOWN_MS - timeSinceLastScan) / 60000);
                showToast(`Please wait ${remainingMinutes} more minute(s) to scan again.`, "warning");
                return; // Stop execution if on cooldown
            }
        }
        
        // Cooldown has passed or it's a first scan.
        const pointsEarned = 10;
        const newPoints = currentUserProfile.points + pointsEarned;

        // Update profile points
        const { error: profileError } = await supabase
            .from('profiles')
            .update({ points: newPoints })
            .eq('id', userId);
        if (profileError) throw profileError;

        // Log the scan for cooldown tracking (insert or update)
        const { error: upsertError } = await supabase.from('qr_scans').upsert({
            user_id: userId,
            qr_id: qrId,
            last_scanned_at: currentTime.toISOString()
        }, { onConflict: 'user_id, qr_id' });
        if (upsertError) throw upsertError;

        // Log the transaction in history
        const { error: historyError } = await supabase.from('points_history').insert({
            user_id: userId,
            action: 'qr_scan',
            points_change: pointsEarned,
            description: `Scanned Dust Bin QR`
        });
        if (historyError) throw historyError;
        
        // Update local state and UI
        currentUserProfile.points = newPoints;
        showToast(`+${pointsEarned} points added!`, "success");
        await updateUI();

    } catch (error) {
        console.error("Error processing QR scan:", error.message);
        showToast("An error occurred while processing the scan.", "error");
    } finally {
        hideLoading();
    }
}


// --- QR Scanner Controls ---

async function startScanner() {
    if (!currentUserProfile) {
        showToast("Please log in to scan QR codes.", "warning");
        authModal.style.display = 'flex';
        return;
    }
    if (isScannerActive) return;

    isScannerActive = true;
    document.getElementById('startScanBtn').style.display = 'none';
    document.getElementById('stopScanBtn').style.display = 'block';
    document.getElementById('qr-reader').innerHTML = '';
    document.getElementById('qr-reader').style.display = 'block';
    
    html5QrCodeScanner = new Html5Qrcode("qr-reader");

    try {
        await html5QrCodeScanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (decodedText, decodedResult) => {
                if (isScannerActive) handleQRScan(decodedText);
            },
            (errorMessage) => { /* Ignore non-scans */ }
        );
    } catch (err) {
        isScannerActive = false; // Reset state on error
        document.getElementById('startScanBtn').style.display = 'block';
        document.getElementById('stopScanBtn').style.display = 'none';
        showToast("Could not start camera. Check permissions.", "error");
        console.error("Scanner start error:", err);
    }
}

async function stopScanner() {
    if (html5QrCodeScanner && isScannerActive) {
        try {
            await html5QrCodeScanner.stop();
        } catch (err) {
            console.error("Error stopping scanner:", err);
        } finally {
            isScannerActive = false;
            document.getElementById('startScanBtn').style.display = 'block';
            document.getElementById('stopScanBtn').style.display = 'none';
            document.getElementById('qr-reader').innerHTML = '';
            document.getElementById('qr-reader').style.display = 'none';
        }
    }
}

function generateDemoQR() {
    const demoQRContainer = document.getElementById('demoQRContainer');
    demoQRContainer.innerHTML = '';
    new QRCode(demoQRContainer, {
        text: EXPECTED_FRAME_QR_CONTENT,
        width: 200,
        height: 200,
    });
    const infoDiv = document.createElement('div');
    infoDiv.innerHTML = `<p style="margin-top:1rem;">Scan this QR code to test the feature.</p>`;
    demoQRContainer.appendChild(infoDiv);
    showToast("Demo QR generated!", "info");
}


// --- Helpers & Utilities ---

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    const pageElement = document.getElementById(`${pageId}Page`);
    if (pageElement) {
        pageElement.classList.add('active');
    }
    
    document.getElementById('navLinks').classList.remove('active');

    if (pageId !== 'scan' && isScannerActive) {
        stopScanner();
    }
    
    // Load page-specific data if the user is logged in
    if (currentUserProfile) {
        if (pageId === 'dashboard') updateUI();
        else if (pageId === 'coupons') loadCoupons();
        else if (pageId === 'history') updateUI();
    }
}

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
    document.querySelector(`.tab-btn[onclick="switchTab('${tab}')"]`).classList.add('active');
    document.getElementById(`${tab}Form`).classList.add('active');
}

function showLoading() { loadingOverlay.classList.add('active'); }
function hideLoading() { loadingOverlay.classList.remove('active'); }
function toggleNav() { document.getElementById('navLinks').classList.toggle('active'); }

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = '';
    if (type === 'success') icon = '<i class="fas fa-check-circle toast-icon"></i>';
    else if (type === 'error') icon = '<i class="fas fa-times-circle toast-icon"></i>';
    else if (type === 'warning') icon = '<i class="fas fa-exclamation-triangle toast-icon"></i>';
    else icon = '<i class="fas fa-info-circle toast-icon"></i>';

    toast.innerHTML = `${icon}<span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}


// --- Initial Load ---
document.addEventListener('DOMContentLoaded', initApp);

// Expose functions to global scope for HTML onclick attributes
window.showPage = showPage;
window.toggleNav = toggleNav;
window.logout = logout;
window.startScanner = startScanner;
window.stopScanner = stopScanner;
window.generateDemoQR = generateDemoQR;
window.redeemCoupon = redeemCoupon;
window.switchTab = switchTab;