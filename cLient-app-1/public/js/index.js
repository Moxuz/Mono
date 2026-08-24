(function () {
    function initSessionStatus() {
        fetch('/api/session')
            .then((response) => response.json())
            .then((data) => {
                const status = document.getElementById('status');
                if (!status) return;

                status.replaceChildren();
                const message = document.createElement('p');
                if (data.authenticated) {
                    message.textContent = `✅ Logged in as: ${data.user.username}`;
                    status.appendChild(message);

                    const dashboard = document.createElement('p');
                    dashboard.style.marginTop = '8px';
                    const link = document.createElement('a');
                    link.href = '/dashboard';
                    link.style.color = '#0066cc';
                    link.textContent = 'Go to Dashboard →';
                    dashboard.appendChild(link);
                    status.appendChild(dashboard);
                } else {
                    message.textContent = '📍 Status: Not logged in';
                    status.appendChild(message);
                }
            })
            .catch(() => {});
    }

    function init() {
        initSessionStatus();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
