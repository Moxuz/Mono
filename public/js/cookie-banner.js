/**
 * Cookie Banner — Shared Component
 * ใช้ได้ทั้ง Auth Server และ Client App
 * 
 * Behavior:
 * - ถ้ายังไม่เคย consent → แสดง banner ล่างหน้าจอ
 * - Accept → เก็บ localStorage + เรียก API (ถ้า login อยู่)
 * - Decline → เก็บ localStorage (essential cookies only)
 * - Banner หายไป 365 วัน
 */

(function () {
    const COOKIE_CONSENT_KEY = 'cookie_consent';
    const COOKIE_CONSENT_EXPIRY_DAYS = 365;
    const PRIVACY_POLICY_VERSION = '1.0.0';

    // ─── Init ────────────────────────────────────────────────
    function init() {
        // ซ่อน cookie notice ใน login ถ้าเคย dismiss แล้ว
        hideCookieNoticeIfDismissed();

        // ถ้ายังไม่มี consent → inject banner
        if (!getConsent()) {
            injectBanner();
        }
    }

    // ─── Cookie Notice (Login Page inline) ───────────────────
    function hideCookieNoticeIfDismissed() {
        const notice = document.getElementById('cookieNotice');
        if (!notice) return;

        const dismissed = localStorage.getItem('cookie_notice_dismissed');
        if (dismissed) {
            notice.style.display = 'none';
        }
    }

    window.dismissCookieNotice = function () {
        const notice = document.getElementById('cookieNotice');
        if (notice) {
            notice.style.display = 'none';
        }
        localStorage.setItem('cookie_notice_dismissed', '1');
    };

    // ─── Get / Set Consent ───────────────────────────────────
    function getConsent() {
        try {
            const raw = localStorage.getItem(COOKIE_CONSENT_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            // ตรวจ expiry
            if (data.expiresAt && Date.now() > data.expiresAt) {
                localStorage.removeItem(COOKIE_CONSENT_KEY);
                return null;
            }
            return data;
        } catch {
            return null;
        }
    }

    function setConsent(accepted) {
        const expiryMs = COOKIE_CONSENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
        const data = {
            accepted,
            version: PRIVACY_POLICY_VERSION,
            timestamp: new Date().toISOString(),
            expiresAt: Date.now() + expiryMs
        };
        localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(data));
        return data;
    }

    // ─── Inject Banner HTML ───────────────────────────────────
    function injectBanner() {
        // ไม่แสดงซ้ำถ้ามีอยู่แล้ว
        if (document.getElementById('cookieBanner')) return;

        const banner = document.createElement('div');
        banner.id = 'cookieBanner';
        banner.className = 'cookie-banner';
        banner.setAttribute('role', 'dialog');
        banner.setAttribute('aria-label', 'Cookie consent');
        banner.innerHTML = `
            <div class="cookie-banner-content">
                <div class="cookie-banner-text">
                    <span class="cookie-icon">🍪</span>
                    <div>
                        <strong>We use cookies</strong>
                        <p>
                            We use essential cookies to make our site work. 
                            With your consent, we may also use analytics cookies 
                            to improve your experience. Read our 
                            <a href="/privacy-policy.html" target="_blank" class="link">Privacy Policy</a>.
                        </p>
                    </div>
                </div>
                <div class="cookie-banner-actions">
                    <button id="cookieDeclineBtn" class="btn btn-cookie-decline">
                        Essential Only
                    </button>
                    <button id="cookieAcceptBtn" class="btn btn-cookie-accept">
                        Accept All
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(banner);

        // Animate in
        requestAnimationFrame(() => {
            banner.classList.add('cookie-banner--visible');
        });

        // Event listeners
        document.getElementById('cookieAcceptBtn').addEventListener('click', () => {
            handleConsent(true);
        });
        document.getElementById('cookieDeclineBtn').addEventListener('click', () => {
            handleConsent(false);
        });
    }

    // ─── Handle Consent ───────────────────────────────────────
    function handleConsent(accepted) {
        const data = setConsent(accepted);
        removeBanner();

        // ถ้า user login อยู่ → sync กับ server
        const token = localStorage.getItem('accessToken') ||
                       localStorage.getItem('token');
        if (token) {
            syncConsentToServer(accepted, token);
        }

        // Dispatch event ให้ app อื่น listen ได้
        window.dispatchEvent(new CustomEvent('cookieConsent', {
            detail: { accepted, data }
        }));
    }

    // ─── Sync to Server ───────────────────────────────────────
    async function syncConsentToServer(accepted, token) {
        try {
            const baseUrl = getBaseUrl();
            await fetch(`${baseUrl}/api/auth/cookie-consent`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    cookieConsentAccepted: accepted,
                    version: PRIVACY_POLICY_VERSION
                })
            });
        } catch (err) {
            // Silent fail — consent ยังเก็บ localStorage ไว้แล้ว
            console.warn('[CookieBanner] Could not sync consent to server:', err.message);
        }
    }

    // ─── Remove Banner ────────────────────────────────────────
    function removeBanner() {
        const banner = document.getElementById('cookieBanner');
        if (!banner) return;

        banner.classList.remove('cookie-banner--visible');
        banner.classList.add('cookie-banner--hiding');

        setTimeout(() => {
            banner.remove();
        }, 300);
    }

    // ─── Utils ────────────────────────────────────────────────
    function getBaseUrl() {
        // Auth Server = port 5000, Client = port 3001
        const { protocol, hostname, port } = window.location;
        return `${protocol}//${hostname}:${port}`;
    }

    // ─── Public API ───────────────────────────────────────────
    window.CookieBanner = {
        getConsent,
        hasAccepted: () => {
            const c = getConsent();
            return c ? c.accepted : null;
        },
        reset: () => {
            localStorage.removeItem(COOKIE_CONSENT_KEY);
            injectBanner();
        }
    };

    // ─── Run ──────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();