// Theme Initialization — runs before CSS renders
// Only manages the .dark class. Light theme CSS is toggled via <link disabled> in each page.
(function() {
  'use strict';

  const savedTheme = localStorage.getItem('theme') || 'dark';
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = savedTheme === 'dark' || (savedTheme === 'auto' && prefersDark);

  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
})();
