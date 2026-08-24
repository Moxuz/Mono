(function () {
    const storageKey = 'client2_cookie_consent';
    const consentVersion = '1.1.0';
    const consentLifetimeMs = 365 * 24 * 60 * 60 * 1000;
    const banner = document.getElementById('cookieBanner');
    if (!banner) return;

    function readConsent() {
        try {
            const value = JSON.parse(localStorage.getItem(storageKey) || 'null');
            if (!value || typeof value.accepted !== 'boolean' ||
                value.version !== consentVersion ||
                !Number.isFinite(value.expiresAt) ||
                value.expiresAt <= Date.now()) {
                localStorage.removeItem(storageKey);
                return null;
            }
            return value;
        } catch {
            return null;
        }
    }

    async function saveConsent(accepted) {
        const data = {
            accepted,
            version: consentVersion,
            updatedAt: new Date().toISOString(),
            expiresAt: Date.now() + consentLifetimeMs
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
