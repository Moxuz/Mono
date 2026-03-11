// Check authentication
const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || '{}');

console.log('Token:', token);
console.log('User:', user);

if (!token) {
    console.log('No token found, redirecting to login');
    window.location.href = '/login.html';
} else {
    console.log('User authenticated, loading dashboard');
}

// Load user data
document.addEventListener('DOMContentLoaded', () => {
    if (user.username) {
        document.getElementById('userName').textContent = user.username;
        document.getElementById('welcomeMessage').textContent = `Hello, ${user.username}! 👋`;
        document.getElementById('userEmail').textContent = user.email;
        document.getElementById('userRole').textContent = user.role || 'user';
        document.getElementById('tokenDisplay').textContent = token.substring(0, 50) + '...';
        
        const date = new Date();
        document.getElementById('memberSince').textContent = date.toLocaleDateString();
    }
});

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login.html';
    }
}

function copyToken() {
    navigator.clipboard.writeText(token);
    alert('Token copied to clipboard!');
}

function goToDeveloperPortal() {
    window.location.href = '/developer-portal.html';
}

function viewProfile() {
    alert('Profile page coming soon!');
}

function changePassword() {
    window.location.href = '/forgot-password.html';
}