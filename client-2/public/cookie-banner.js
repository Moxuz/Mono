(function () {
    const storageKey = 'client2_cookie_consent';
    const banner = document.getElementById('cookieBanner');
    if (!banner) return;

    function readConsent() {
        try {
            const value = JSON.parse(localStorage.getItem(storageKey) || 'null');
            return value && typeof value.accepted === 'boolean' ? value : null;
        } catch {
            return null;
        }
    }

    async function saveConsent(accepted) {
        const data = {
            accepted,
            version: '1.0.0',
            updatedAt: new Date().toISOString()
        };
        localStorage.setItem(storageKey, JSON.stringify(data));
        banner.hidden = true;
        try {
            await fetch('/api/cookie-consent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    cookieConsentAccepted: accepted,
                    analyticsAccepted: accepted,
                    version: data.version
                })
            });
        } catch (_) {
            // The local decision still prevents the banner from reappearing.
        }
    }

    if (readConsent()) banner.hidden = true;
    banner.querySelectorAll('[data-consent]').forEach((button) => {
        button.addEventListener('click', () => saveConsent(button.dataset.consent === 'accept'));
    });
}());
