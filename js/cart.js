/* ============================================
   ALICE BEAUTÉ — Cart & Stripe Integration
   ============================================ */

const Cart = {
  items: JSON.parse(localStorage.getItem('aliceBeauteCart') || '[]'),

  save() {
    localStorage.setItem('aliceBeauteCart', JSON.stringify(this.items));
    this.updateUI();
  },

  add(item) {
    // item: { id, name, price, amount, image, type }
    const existing = this.items.find(i => i.id === item.id && i.amount === item.amount);
    if (existing) {
      existing.qty = (existing.qty || 1) + 1;
    } else {
      item.qty = 1;
      this.items.push(item);
    }
    this.save();
    this.open();
  },

  remove(index) {
    this.items.splice(index, 1);
    this.save();
  },

  getTotal() {
    return this.items.reduce((sum, item) => sum + (item.amount * (item.qty || 1)), 0);
  },

  getCount() {
    return this.items.reduce((sum, item) => sum + (item.qty || 1), 0);
  },

  updateUI() {
    // Update cart count badge
    const countEl = document.getElementById('cartCount');
    if (countEl) {
      const count = this.getCount();
      if (count > 0) {
        countEl.textContent = count;
        countEl.style.display = 'flex';
      } else {
        countEl.style.display = 'none';
      }
    }

    // Update cart sidebar content
    const cartItemsEl = document.getElementById('cartItems');
    const cartFooterEl = document.getElementById('cartFooter');
    const cartTotalEl = document.getElementById('cartTotal');

    if (!cartItemsEl) return;

    if (this.items.length === 0) {
      cartItemsEl.innerHTML = '<div class="cart-empty"><p>Votre panier est vide</p></div>';
      if (cartFooterEl) cartFooterEl.style.display = 'none';
      return;
    }

    if (cartFooterEl) cartFooterEl.style.display = 'block';

    cartItemsEl.innerHTML = this.items.map((item, i) => `
      <div class="cart-item">
        <img src="${item.image}" alt="${item.name}">
        <div class="cart-item-info">
          <h4>${item.name}</h4>
          <span class="cart-item-price">${item.amount.toFixed(2)} € ${item.qty > 1 ? '× ' + item.qty : ''}</span>
        </div>
        <button class="cart-item-remove" onclick="Cart.remove(${i})">Retirer</button>
      </div>
    `).join('');

    if (cartTotalEl) {
      cartTotalEl.textContent = this.getTotal().toFixed(2) + ' €';
    }
  },

  open() {
    const overlay = document.getElementById('cartOverlay');
    const sidebar = document.getElementById('cartSidebar');
    if (overlay) overlay.classList.add('open');
    if (sidebar) sidebar.classList.add('open');
  },

  close() {
    const overlay = document.getElementById('cartOverlay');
    const sidebar = document.getElementById('cartSidebar');
    if (overlay) overlay.classList.remove('open');
    if (sidebar) sidebar.classList.remove('open');
  },

  async checkout() {
    // STRIPE INTEGRATION
    // Replace with your Stripe publishable key
    const STRIPE_PK = 'pk_test_VOTRE_CLE_STRIPE_ICI';

    if (STRIPE_PK === 'pk_test_VOTRE_CLE_STRIPE_ICI') {
      alert(
        'Stripe n\'est pas encore configuré.\n\n' +
        'Pour activer le paiement :\n' +
        '1. Créez un compte sur stripe.com\n' +
        '2. Récupérez votre clé publique (pk_test_...)\n' +
        '3. Remplacez STRIPE_PK dans js/cart.js\n' +
        '4. Configurez le endpoint /create-checkout-session dans server.js'
      );
      return;
    }

    try {
      const response = await fetch('/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: this.items.map(item => ({
            name: item.name,
            amount: Math.round(item.amount * 100), // Stripe uses cents
            qty: item.qty || 1,
            image: item.image
          }))
        })
      });

      const session = await response.json();

      if (session.url) {
        // Clear cart and redirect to Stripe
        localStorage.removeItem('aliceBeauteCart');
        window.location.href = session.url;
      } else {
        alert('Erreur lors de la création de la session de paiement.');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      alert('Erreur de connexion au serveur de paiement.');
    }
  }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  Cart.updateUI();

  // Cart toggle events
  const cartOverlay = document.getElementById('cartOverlay');
  const cartClose = document.getElementById('cartClose');
  const checkoutBtn = document.getElementById('checkoutBtn');

  if (cartOverlay) cartOverlay.addEventListener('click', () => Cart.close());
  if (cartClose) cartClose.addEventListener('click', () => Cart.close());
  if (checkoutBtn) checkoutBtn.addEventListener('click', () => Cart.checkout());

  // Open cart on cart icon click
  const cartLink = document.querySelector('.nav-cart');
  if (cartLink && Cart.getCount() > 0) {
    cartLink.addEventListener('click', (e) => {
      if (Cart.getCount() > 0) {
        e.preventDefault();
        Cart.open();
      }
    });
  }
});
