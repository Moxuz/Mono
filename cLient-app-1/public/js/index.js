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

    function initConsentModal() {
        const modal = document.getElementById('consentModal');
        const login = document.getElementById('loginBtn');
        const cancel = document.getElementById('cancelConsent');
        const accept = document.getElementById('acceptConsent');
        if (!modal || !login || !cancel || !accept) return;

        login.addEventListener('click', (event) => {
            event.preventDefault();
            modal.style.display = 'flex';
        });
        cancel.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        accept.addEventListener('click', () => {
            window.location.assign('/login');
        });
        modal.addEventListener('click', (event) => {
            if (event.target === modal) modal.style.display = 'none';
        });
    }

    function init() {
        initSessionStatus();
        initConsentModal();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
