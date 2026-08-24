(function () {
    'use strict';
    try {
        const stylesheet = document.getElementById('lighttheme-css');
        if (stylesheet && localStorage.getItem('theme') === 'light') {
            stylesheet.disabled = false;
        }
    } catch (_) {
        // Preferences are optional; a blocked storage API must not break UI.
    }
}());
