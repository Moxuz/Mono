/**
 * Cookie Banner — Client App
 * Sync consent → Auth Server (port 5000)
 */
(function () {
    const KEY     = 'cookie_consent';
    const EXPIRY  = 365 * 24 * 60 * 60 * 1000;
    const VERSION = '1.0.0';
    const AUTH_SERVER = 'http://localhost:5000';

    function getConsent() {
        try {
            const raw = localStorage.getItem(KEY);
            if (!raw) return null;
            const d = JSON.parse(raw);
            if (d.expiresAt && Date.now() > d.expiresAt) {
                localStorage.removeItem(KEY);
                return null;
            }
            return d;
        } catch { return null; }
    }

    function setConsent(accepted) {
        const data = {
            accepted,
            version:   VERSION,
            timestamp: new Date().toISOString(),
            expiresAt: Date.now() + EXPIRY
        };
        localStorage.setItem(KEY, JSON.stringify(data));
        return data;
    }

    window.handleCookieConsent = function (accepted) {
        const data = setConsent(accepted);
        removeBanner();

        // Sync ไป Auth Server ถ้ามี token
        const token = localStorage.getItem('accessToken');
        if (token) syncToServer(accepted, token);

        window.dispatchEvent(new CustomEvent('cookieConsent', {
            detail: { accepted, data }
        }));
    };

    async function syncToServer(accepted, token) {
        try {
            await fetch(`${AUTH_SERVER}/api/auth/cookie-consent`, {
                method:  'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    cookieConsentAccepted: accepted,
                    version: VERSION
                })
            });
        } catch (e) {
            console.warn('[CookieBanner] Sync failed:', e.message);
        }
    }

    function removeBanner() {
        const banner = document.getElementById('cookieBanner');
        if (!banner) return;
        banner.classList.remove('visible');
        banner.classList.add('hiding');
        setTimeout(() => banner.remove(), 300);
    }

    function init() {
        if (getConsent()) {
            // มี consent แล้ว → ลบ banner ทิ้ง
            const banner = document.getElementById('cookieBanner');
            if (banner) banner.remove();
            return;
        }
        // ยังไม่มี → show banner
        requestAnimationFrame(() => {
            const banner = document.getElementById('cookieBanner');
            if (banner) banner.classList.add('visible');
        });
    }

    // Public API
    window.CookieBanner = { getConsent, hasAccepted: () => getConsent()?.accepted ?? null };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();