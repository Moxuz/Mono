(async function () {
    const loading = document.getElementById('loading');
    const app = document.getElementById('app');
    const status = document.getElementById('status');

    const headers = {};

    try {
        const profileResponse = await fetch('/api/auth/profile', { headers, credentials: 'same-origin' });
        const profile = await profileResponse.json();
        const user = profile.data;

        if (!profileResponse.ok || !profile.success || user?.role !== 'admin') {
            loading.textContent = 'Admin access required.';
            loading.style.color = '#fda4af';
            return;
        }

        loading.style.display = 'none';
        app.style.display = 'block';
        document.getElementById('user').textContent = `${user.username} · ${user.email}`;

        const healthResponse = await fetch('/api/dashboard/monitoring/health', { headers, credentials: 'same-origin' });
        if (healthResponse.ok) {
            const health = await healthResponse.json();
            const data = health.data || {};
            const dependencies = data.dependencies || {};
            const dependencyText = ['mongodb', 'redis', 'kafka']
                .map(name => `${name}: ${dependencies[name]?.status || 'unknown'}`)
                .join(' · ');
            status.textContent = `System ${data.status || 'unknown'} · ${dependencyText}`;
            status.classList.add(data.status === 'healthy' ? 'ok' : 'error');
        } else {
            status.textContent = `System status unavailable (${healthResponse.status}).`;
            status.classList.add('error');
        }
    } catch {
        loading.textContent = 'Unable to verify administrator access.';
        loading.style.color = '#fda4af';
    }

    document.getElementById('logout').addEventListener('click', async () => {
        await fetch('/api/auth/logout', { method: 'POST', headers, credentials: 'same-origin' }).catch(() => {});
        window.location.href = '/login.html';
    });
}());
