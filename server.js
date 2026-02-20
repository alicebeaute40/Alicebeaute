const express = require('express');
const path = require('path');

const app = express();
const PORT = 3300;

// ============================================
// STRIPE CONFIGURATION
// Remplacez par vos propres clés Stripe
// Créez un compte sur https://stripe.com
// ============================================
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_VOTRE_CLE_SECRETE_ICI';
const STRIPE_CONFIGURED = !STRIPE_SECRET_KEY.includes('VOTRE_CLE');

let stripe;
if (STRIPE_CONFIGURED) {
  stripe = require('stripe')(STRIPE_SECRET_KEY);
}

app.use(express.static(path.join(__dirname)));
app.use(express.json());

// Stripe Checkout Session
app.post('/create-checkout-session', async (req, res) => {
  if (!STRIPE_CONFIGURED) {
    return res.status(500).json({
      error: 'Stripe non configuré. Ajoutez votre clé secrète dans server.js ou en variable d\'environnement STRIPE_SECRET_KEY.'
    });
  }

  try {
    const { items } = req.body;

    const lineItems = items.map(item => ({
      price_data: {
        currency: 'eur',
        product_data: {
          name: item.name,
        },
        unit_amount: item.amount, // already in cents
      },
      quantity: item.qty || 1,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `http://localhost:${PORT}/cartes-cadeaux.html?success=true`,
      cancel_url: `http://localhost:${PORT}/cartes-cadeaux.html?canceled=true`,
      locale: 'fr',
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Fallback to serve HTML pages with clean URLs
app.get('*', (req, res) => {
  const page = req.path.slice(1) || 'index';
  const filePath = path.join(__dirname, `${page}.html`);
  res.sendFile(filePath, (err) => {
    if (err) res.sendFile(path.join(__dirname, 'index.html'));
  });
});

app.listen(PORT, () => {
  console.log(`\n  ✨ Alice Beauté running at http://localhost:${PORT}\n`);
  if (!STRIPE_CONFIGURED) {
    console.log('  ⚠️  Stripe non configuré — les paiements ne fonctionneront pas.');
    console.log('  → Ajoutez STRIPE_SECRET_KEY en variable d\'environnement');
    console.log('  → Ou modifiez STRIPE_SECRET_KEY dans server.js\n');
  } else {
    console.log('  ✅ Stripe configuré et prêt\n');
  }
});
