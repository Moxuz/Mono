// ✅ Theme Initialization - ต้องโหลดก่อน CSS
(function() {
  'use strict';
  
  // ดึง theme จาก localStorage หรือใช้ 'dark' เป็น default
  const savedTheme = localStorage.getItem('theme') || 'dark';
  
  // Apply theme ทันที
  if (savedTheme === 'dark') {
    document.documentElement.classList.add('dark');
  } else if (savedTheme === 'light') {
    document.documentElement.classList.remove('dark');
  } else if (savedTheme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }
})();