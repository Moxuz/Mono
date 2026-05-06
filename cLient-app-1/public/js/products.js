async function init() {
    const token = await SilentAuth.ensureValidToken();
    if (!token) return;
    // products โหลดจาก static HTML ไม่ต้องทำอะไรเพิ่ม
}

init();