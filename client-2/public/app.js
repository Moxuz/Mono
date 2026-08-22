(async function () {
    const error = new URLSearchParams(window.location.search).get('error');
    const errorElement = document.getElementById('error');
    if (errorElement && error) errorElement.textContent = `Sign-in could not be completed: ${error}`;

    const nameElement = document.getElementById('userName');
    if (!nameElement) return;

    try {
        const response = await fetch('/api/session', { credentials: 'same-origin' });
        const session = await response.json();
        if (!session.authenticated) {
            window.location.assign('/login');
            return;
        }

        const user = session.user || {};
        const name = user.name || user.username || 'Workspace user';
        nameElement.textContent = name;
        document.getElementById('userEmail').textContent = user.email || 'Authenticated with AuthSys';
        document.getElementById('avatar').textContent = name.charAt(0).toUpperCase();
    } catch {
        window.location.assign('/?error=session_unavailable');
    }
}());
