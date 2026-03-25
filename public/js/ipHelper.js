// public/js/ipHelper.js

/**
 * IP Helper for Frontend Display
 */

/**
 * Clean IPv4-mapped IPv6 address
 * ::ffff:192.168.1.1 → 192.168.1.1
 * ::1 → localhost
 * 172.17.0.1 → internal
 */
function cleanIPAddress(ip) {
    if (!ip) return 'unknown';
    
    // Remove IPv4-mapped IPv6 prefix
    let cleaned = ip.replace(/^::ffff:/i, '');
    
    // Convert ::1 to localhost
    if (cleaned === '::1' || cleaned === '127.0.0.1') {
        return 'localhost';
    }
    
    // Mask internal Docker IPs
    if (cleaned.startsWith('172.') || cleaned.startsWith('10.')) {
        return 'internal';
    }
    
    return cleaned;
}

/**
 * Mask IP for privacy (192.168.1.1 → 192.168.***.***) 
 */
function maskIP(ip) {
    const cleaned = cleanIPAddress(ip);
    
    if (cleaned === 'unknown' || cleaned === 'localhost' || cleaned === 'internal') {
        return cleaned;
    }
    
    const parts = cleaned.split('.');
    if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.***.***`;
    }
    
    // IPv6
    if (cleaned.includes(':')) {
        return cleaned.substring(0, 12) + '::***';
    }
    
    return cleaned;
}

/**
 * Format IP for display with icon
 */
function formatIPDisplay(ip) {
    const cleaned = cleanIPAddress(ip);
    
    if (cleaned === 'localhost') {
        return '🏠 localhost';
    }
    if (cleaned === 'internal') {
        return '🔒 internal';
    }
    if (cleaned === 'unknown') {
        return '❓ unknown';
    }
    
    return `🌐 ${maskIP(ip)}`;
}