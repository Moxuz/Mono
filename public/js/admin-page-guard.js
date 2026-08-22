(async function () {
    const headers = {};

    try {
        const response = await fetch('/api/auth/profile', {
            headers,
            credentials: 'same-origin'
        });
        const result = await response.json();
        if (!response.ok || !result.success || result.data?.role !== 'admin') {
            document.body.innerHTML = '<main style="padding:3rem;font:16px system-ui">Admin access required. <a href="/login.html">Sign in</a></main>';
        }
    } catch {
        document.body.innerHTML = '<main style="padding:3rem;font:16px system-ui">Unable to verify administrator access.</main>';
    }
}());
