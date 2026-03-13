/**
 * Silent Authentication
 * - decode JWT เช็ค expiry
 * - ถ้าจะหมด (< 5 นาที) → refresh อัตโนมัติ
 * - ถ้า refresh fail → redirect login
 */
const SilentAuth = (function () {

    const REFRESH_THRESHOLD_SEC = 5 * 60; // refresh ล่วงหน้า 5 นาที

    // ─── Decode JWT (ไม่ verify — แค่อ่าน payload) ───────────
    function decodeJWT(token) {
        try {
            const base64 = token.split('.')[1]
                .replace(/-/g, '+')
                .replace(/_/g, '/');
            return JSON.parse(atob(base64));
        } catch {
            return null;
        }
    }

    // ─── เช็คว่า token ใกล้หมดอายุไหม ───────────────────────
    function isExpiringSoon(token) {
        const payload = decodeJWT(token);
        if (!payload?.exp) return true;

        const now       = Math.floor(Date.now() / 1000);
        const remaining = payload.exp - now;

        console.log(`[SilentAuth] Token expires in ${remaining}s`);
        return remaining < REFRESH_THRESHOLD_SEC;
    }

    // ─── Refresh ──────────────────────────────────────────────
    async function refresh() {
        try {
            const res  = await fetch('/api/refresh', { method: 'POST' });
            const data = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Refresh failed');
            }

            console.log('[SilentAuth] Token refreshed ✅');
            return data.access_token;

        } catch (err) {
            console.warn('[SilentAuth] Refresh failed:', err.message);
            throw err;
        }
    }

    // ─── Main: เรียกก่อน fetch ทุกครั้ง ─────────────────────
    async function ensureValidToken() {
        try {
            const sessionRes  = await fetch('/api/session');
            const sessionData = await sessionRes.json();

            if (!sessionData.authenticated) {
                window.location.href = '/login';
                return null;
            }

            const token = sessionData.accessToken;
            if (!token) {
                window.location.href = '/login';
                return null;
            }

            // ถ้าใกล้หมด → refresh
            if (isExpiringSoon(token)) {
                console.log('[SilentAuth] Refreshing token silently...');
                try {
                    return await refresh();
                } catch {
                    // refresh fail → login ใหม่
                    window.location.href = '/login';
                    return null;
                }
            }

            return token;

        } catch (err) {
            console.error('[SilentAuth] Error:', err);
            window.location.href = '/login';
            return null;
        }
    }

    // ─── Auto Refresh: ตั้ง interval เช็คทุก 4 นาที ──────────
    function startAutoRefresh() {
        const INTERVAL_MS = 4 * 60 * 1000; // 4 นาที

        setInterval(async () => {
            console.log('[SilentAuth] Auto-checking token...');
            await ensureValidToken();
        }, INTERVAL_MS);
    }

    // ─── Public API ───────────────────────────────────────────
    return {
        ensureValidToken,
        startAutoRefresh,
        decodeJWT,
        isExpiringSoon
    };
})();