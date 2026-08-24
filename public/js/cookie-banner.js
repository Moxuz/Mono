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
        const secure = window.location.protocol === 'https:' ? ';Secure' : '';
        document.cookie = `${name}=${encodeURIComponent(value)};${expires};path=/;SameSite=Strict${secure}`;
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
                return decodeURIComponent(cookie.substring(nameEQ.length, cookie.length));
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
    }
}

// Hide cookie banner
function hideCookieBanner() {
    const banner = document.getElementById('cookieBanner');
    if (banner) {
        banner.style.display = 'none';
    }
}

// Handle cookie consent
function handleCookieConsent(accepted) {
    // Store consent
    if (accepted) {
        CookieManager.set('cookieConsent', 'all', 365);
        CookieManager.set('analyticsConsent', 'true', 365);
    } else {
        CookieManager.set('cookieConsent', 'essential', 365);
        CookieManager.set('analyticsConsent', 'false', 365);
    }

    // Hide banner
    hideCookieBanner();

    // Send consent to backend (optional)
    sendConsentToBackend(accepted, accepted);
}

// Read the browser choice without treating a missing choice as consent.
function getStoredCookieConsent() {
    const choice = CookieManager.get('cookieConsent');
    if (choice !== 'all' && choice !== 'essential') return null;

    return {
        cookieConsentAccepted: choice === 'all',
        analyticsAccepted: CookieManager.get('analyticsConsent') === 'true'
    };
}

// Send consent to the account when a session exists. Anonymous choices remain
// in the browser until a later authenticated page can sync them.
async function sendConsentToBackend(cookieConsentAccepted, analyticsAccepted) {
    try {
        const response = await fetch('/api/auth/update-cookie-consent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'same-origin',
            body: JSON.stringify({
                cookieConsentAccepted,
                analyticsAccepted,
                version: '1.1.0'
            })
        });

        if (response.ok) {
            CookieManager.delete('cookieConsentPending');
            return true;
        }

        if (response.status === 401) {
            CookieManager.set('cookieConsentPending', 'true', 30);
            return false;
        }

        console.warn('Failed to sync cookie consent to backend');
        return false;
    } catch (error) {
        CookieManager.set('cookieConsentPending', 'true', 30);
        console.error('Error syncing cookie consent:', error);
        return false;
    }
}

async function syncStoredCookieConsent() {
    const stored = getStoredCookieConsent();
    if (!stored) return false;
    return sendConsentToBackend(stored.cookieConsentAccepted, stored.analyticsAccepted);
}

// Check and show banner on page load
function initCookieBanner() {
    // Only recognized values count as a decision. A malformed/stale cookie
    // must not hide the banner indefinitely.
    const storedConsent = getStoredCookieConsent();

    if (!storedConsent) {
        // Show banner after a short delay (for better UX)
        setTimeout(() => {
            showCookieBanner();
        }, 1000);
    } else {
        void sendConsentToBackend(
            storedConsent.cookieConsentAccepted,
            storedConsent.analyticsAccepted
        );
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
    }

    if (declineBtn) {
        declineBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleCookieConsent(false);
        });
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    attachCookieBannerListeners();
    initCookieBanner();
});

// Login/registration call this after a browser session is established.
window.syncStoredCookieConsent = syncStoredCookieConsent;
