const CART_KEY = 'shophub_cart';

function readCart() {
    try {
        const cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
        return Array.isArray(cart) ? cart : [];
    } catch {
        return [];
    }
}

function renderCartCount() {
    const count = document.getElementById('cartCount');
    if (count) count.textContent = String(readCart().length);
}

function addToCart(button) {
    const cart = readCart();
    cart.push({
        product: button.dataset.product,
        price: Number(button.dataset.price)
    });
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    renderCartCount();
    button.textContent = 'Added ✓';
    button.disabled = true;
    window.setTimeout(() => {
        button.textContent = 'Add to Cart';
        button.disabled = false;
    }, 900);
}

document.querySelectorAll('[data-product]').forEach((button) => {
    button.addEventListener('click', () => addToCart(button));
});
renderCartCount();
