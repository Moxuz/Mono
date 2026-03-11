console.log('Login page loaded');

// Auto-fill from URL parameters
window.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded');
    
    const params = new URLSearchParams(window.location.search);
    if (params.has('email')) {
        document.getElementById('email').value = params.get('email');
        console.log('Email filled from URL');
    }
    if (params.has('password')) {
        document.getElementById('password').value = params.get('password');
        console.log('Password filled from URL');
    }
});

// Login form handler
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
    console.log('Login form handler attached');
} else {
    console.error('Login form not found!');
}

async function handleLogin(e) {
    e.preventDefault();
    console.log('Login form submitted');
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const loginBtn = document.getElementById('loginBtn');

    console.log('Email:', email);
    console.log('Password:', password ? '***' : 'empty');

    // Disable button
    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in...';

    try {
        console.log('Sending POST request to /api/auth/login');
        
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);
        
        const data = await response.json();
        console.log('Response data:', data);

        if (response.ok && data.success) {
            console.log('Login successful!');
            
            // Save token and user info
            localStorage.setItem('token', data.data.token);
            localStorage.setItem('user', JSON.stringify(data.data.user));
            
            console.log('Token saved to localStorage');
            
            showAlert('Login successful! Redirecting...', 'success');
            
            // Redirect after 1 second
            setTimeout(function() {
                console.log('Redirecting to dashboard...');
                window.location.href = '/dashboard.html';
            }, 1000);
        } else {
            console.error('Login failed:', data);
            showAlert(data.error || data.message || 'Login failed', 'error');
            loginBtn.disabled = false;
            loginBtn.textContent = 'Sign In';
        }
    } catch (error) {
        console.error('Login error:', error);
        showAlert('Network error. Please check if MongoDB is running.', 'error');
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign In';
    }
}

function loginWithGoogle() {
    console.log('Google login clicked');
    window.location.href = '/api/auth/google';
}

function showAlert(message, type) {
    console.log('Showing alert:', type, message);
    const alertBox = document.getElementById('alert');
    alertBox.textContent = message;
    alertBox.className = 'alert alert-' + type;
    alertBox.style.display = 'block';
    
    setTimeout(function() {
        alertBox.style.display = 'none';
    }, 5000);
}

// Test connection on page load
console.log('Testing API connection...');
fetch('/health')
    .then(r => r.json())
    .then(data => console.log('Server health:', data))
    .catch(err => console.error('Server not responding:', err));