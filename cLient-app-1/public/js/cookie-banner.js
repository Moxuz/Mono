/**
 * Cookie Banner — Client App
 * Sync consent through the client server-side session.
 */
(function () {
    const KEY     = 'cookie_consent';
    const EXPIRY  = 365 * 24 * 60 * 60 * 1000;
    const VERSION = '1.0.0';

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

        // The client server holds the access token in its HttpOnly session.
        // Do not read or send bearer tokens from browser storage.
        syncToServer(data);

        window.dispatchEvent(new CustomEvent('cookieConsent', {
            detail: { accepted, data }
        }));
    };

    async function syncToServer(data) {
        try {
            await fetch('/api/cookie-consent', {
                method:  'POST',
                headers: {
                    'Content-Type':  'application/json'
                },
                body: JSON.stringify({
                    cookieConsentAccepted: data.accepted,
                    analyticsAccepted: data.accepted,
                    version: data.version
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
