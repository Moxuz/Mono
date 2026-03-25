// ==========================================
// COOKIE BANNER HANDLER
// ==========================================

// Cookie management utilities
const CookieManager = {
    // Set cookie
    set(name, value, days = 365) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        const expires = `expires=${date.toUTCString()}`;
        document.cookie = `${name}=${value};${expires};path=/;SameSite=Strict`;
    },

    // Get cookie
    get(name) {
        const nameEQ = `${name}=`;
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            let cookie = cookies[i];
            while (cookie.charAt(0) === ' ') {
                cookie = cookie.substring(1, cookie.length);
            }
            if (cookie.indexOf(nameEQ) === 0) {
                return cookie.substring(nameEQ.length, cookie.length);
            }
        }
        return null;
    },

    // Delete cookie
    delete(name) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
    },

    // Check if cookie exists
    exists(name) {
        return this.get(name) !== null;
    }
};

// Show cookie banner
function showCookieBanner() {
    const banner = document.getElementById('cookieBanner');
    if (banner) {
        banner.style.display = 'flex';
        console.log('Cookie banner displayed');
    }
}

// Hide cookie banner
function hideCookieBanner() {
    const banner = document.getElementById('cookieBanner');
    if (banner) {
        banner.style.display = 'none';
        console.log('Cookie banner hidden');
    }
}

// Handle cookie consent
function handleCookieConsent(accepted) {
    console.log('Cookie consent:', accepted ? 'ACCEPTED' : 'DECLINED');

    // Store consent
    if (accepted) {
        CookieManager.set('cookieConsent', 'all', 365);
        CookieManager.set('analyticsConsent', 'true', 365);
        console.log('All cookies accepted');
    } else {
        CookieManager.set('cookieConsent', 'essential', 365);
        CookieManager.set('analyticsConsent', 'false', 365);
        console.log('Only essential cookies accepted');
    }

    // Hide banner
    hideCookieBanner();

    // Send consent to backend (optional)
    sendConsentToBackend(accepted);
}

// Send consent to backend
async function sendConsentToBackend(analyticsAccepted) {
    try {
        const token = localStorage.getItem('token');
        
        if (!token) {
            console.log('No token found - skipping backend sync');
            return;
        }

        const response = await fetch('/api/auth/cookie-consent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                cookieConsentAccepted: true,
                analyticsAccepted,
                version: '1.0.0'
            })
        });

        if (response.ok) {
            console.log('Cookie consent synced to backend');
        } else {
            console.warn('Failed to sync cookie consent to backend');
        }
    } catch (error) {
        console.error('Error syncing cookie consent:', error);
    }
}

// Check and show banner on page load
function initCookieBanner() {
    console.log('Initializing cookie banner...');

    // Check if user has already given consent
    const hasConsent = CookieManager.exists('cookieConsent');

    console.log('Has cookie consent:', hasConsent);

    if (!hasConsent) {
        // Show banner after a short delay (for better UX)
        setTimeout(() => {
            showCookieBanner();
        }, 1000);
    } else {
        console.log('User already gave consent:', CookieManager.get('cookieConsent'));
    }
}

// Attach event listeners to buttons
function attachCookieBannerListeners() {
    const acceptBtn = document.querySelector('.btn-cookie-accept');
    const declineBtn = document.querySelector('.btn-cookie-decline');

    if (acceptBtn) {
        acceptBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleCookieConsent(true);
        });
        console.log('Accept button listener attached');
    }

    if (declineBtn) {
        declineBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleCookieConsent(false);
        });
        console.log('Decline button listener attached');
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded - initializing cookie banner');
    attachCookieBannerListeners();
    initCookieBanner();
});

// Make functions globally accessible
window.handleCookieConsent = handleCookieConsent;
window.CookieManager = CookieManager;