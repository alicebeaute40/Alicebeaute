const express = require('express');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
// URL de redirection après paiement : toujours localhost en local (le navigateur est sur la même machine)
const REDIRECT_URL = process.env.REDIRECT_URL || `http://localhost:${PORT}`;

// ============================================
// MOLLIE CONFIGURATION
// ============================================
const MOLLIE_API_KEY = process.env.MOLLIE_API_KEY;
const { createMollieClient } = require('@mollie/api-client');
const mollie = createMollieClient({ apiKey: MOLLIE_API_KEY });

app.use(express.static(path.join(__dirname)));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// ============================================
// EMAIL CONFIGURATION (Nodemailer)
// ============================================
const emailTransporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '465'),
  secure: process.env.EMAIL_PORT === '465' || !process.env.EMAIL_PORT,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ============================================
// GIFT CARD FILE MAPPING
// Femme : images/image_carte_cadeaux_femme/{amount}€_femme.pdf
// Homme : images/image_catre_cadeaux_homme/{amount}€_homme.pdf ou .png
// ============================================
const GIFT_CARD_FOLDERS = {
  femme: path.join(__dirname, 'images', 'image_carte_cadeaux_femme'),
  homme: path.join(__dirname, 'images', 'image_catre_cadeaux_homme'),
};

function getGiftCardFile(gender, amount) {
  const folder = GIFT_CARD_FOLDERS[gender];
  if (!folder) return null;

  // Try PDF first, then PNG
  const pdfPath = path.join(folder, `${amount}€_${gender}.pdf`);
  const pngPath = path.join(folder, `${amount}€_${gender}.png`);

  if (fs.existsSync(pdfPath)) return { filePath: pdfPath, type: 'pdf' };
  if (fs.existsSync(pngPath)) return { filePath: pngPath, type: 'png' };

  return null;
}

// Converts a PNG image to a PDF buffer using PDFKit
function pngToPdfBuffer(pngPath) {
  return new Promise((resolve, reject) => {
    // A4 landscape for gift card presentation
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    doc.image(pngPath, 0, 0, { width: pageWidth, height: pageHeight, fit: [pageWidth, pageHeight], align: 'center', valign: 'center' });
    doc.end();
  });
}

// Builds a PDF buffer for a gift card (PDF → read directly, PNG → convert)
async function buildGiftCardPdfBuffer(gender, amount) {
  // Fallback to 30€ card if no file exists for the requested amount (ex: carte test 1€)
  const file = getGiftCardFile(gender, amount) || getGiftCardFile(gender, 30);
  if (!file) return null;

  if (file.type === 'pdf') {
    return fs.readFileSync(file.filePath);
  } else {
    return await pngToPdfBuffer(file.filePath);
  }
}

// Determine gender from item id (carte-femme / carte-homme)
function getGenderFromItem(item) {
  if (item.id === 'carte-femme') return 'femme';
  if (item.id === 'carte-homme') return 'homme';
  // Fallback: parse from name
  const lc = (item.name || '').toLowerCase();
  if (lc.includes('femme')) return 'femme';
  if (lc.includes('homme')) return 'homme';
  return null;
}

// ============================================
// SEND GIFT CARD EMAIL
// ============================================
async function sendGiftCardEmail(buyerEmail, items) {
  const attachments = [];
  const cardLines = [];

  for (const item of items) {
    if (item.type !== 'gift-card') continue;

    const gender = getGenderFromItem(item);
    if (!gender) continue;

    const qty = item.qty || 1;
    for (let i = 0; i < qty; i++) {
      const pdfBuffer = await buildGiftCardPdfBuffer(gender, item.amount);
      if (!pdfBuffer) {
        console.warn(`Fichier carte cadeau introuvable : ${gender} ${item.amount}€`);
        continue;
      }

      const filename = `Carte-Cadeau-Alice-Beaute-${item.amount}€-${gender}${qty > 1 ? `-${i + 1}` : ''}.pdf`;
      attachments.push({
        filename,
        content: pdfBuffer,
        contentType: 'application/pdf',
      });

      cardLines.push(`• ${item.name}`);
    }
  }

  if (attachments.length === 0) {
    console.warn('Aucune carte cadeau à envoyer pour ce paiement.');
    return;
  }

  const totalAmount = items
    .filter(i => i.type === 'gift-card')
    .reduce((sum, i) => sum + i.amount * (i.qty || 1), 0);

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Georgia, serif; background: #faf9f7; color: #333; margin: 0; padding: 0; }
    .wrapper { max-width: 600px; margin: 0 auto; background: #fff; }
    .header { background: #2c2c2c; padding: 40px; text-align: center; }
    .header h1 { color: #d4af7a; font-size: 28px; margin: 0; letter-spacing: 3px; font-weight: 300; }
    .header p { color: #aaa; margin: 8px 0 0; font-size: 13px; letter-spacing: 1px; }
    .body { padding: 40px; }
    .body h2 { color: #2c2c2c; font-size: 20px; font-weight: 400; margin-top: 0; }
    .body p { line-height: 1.7; color: #555; }
    .cards { background: #fdf8f2; border-left: 3px solid #d4af7a; padding: 16px 20px; margin: 24px 0; }
    .cards p { margin: 4px 0; color: #333; font-size: 15px; }
    .total { font-size: 16px; font-weight: bold; color: #2c2c2c; margin-top: 8px; }
    .note { background: #f5f5f5; border-radius: 6px; padding: 14px 18px; font-size: 13px; color: #777; margin-top: 28px; }
    .footer { background: #2c2c2c; padding: 24px 40px; text-align: center; }
    .footer p { color: #888; font-size: 12px; margin: 4px 0; }
    .footer a { color: #d4af7a; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>ALICE BEAUTÉ</h1>
      <p>Institut de beauté</p>
    </div>
    <div class="body">
      <h2>Merci pour votre achat !</h2>
      <p>
        Votre paiement a bien été reçu. Vous trouverez en pièce(s) jointe(s) votre carte cadeau Alice Beauté,
        prête à être imprimée ou transmise à son/sa bénéficiaire.
      </p>
      <div class="cards">
        ${cardLines.map(l => `<p>${l}</p>`).join('')}
        <p class="total">Total : ${totalAmount.toFixed(2)} €</p>
      </div>
      <p>
        La carte cadeau est valable pour tous les soins proposés à l'institut.<br>
        Nous vous souhaitons une belle expérience bien-être chez Alice Beauté.
      </p>
      <div class="note">
        Pour toute question, n'hésitez pas à nous contacter directement à l'institut.
      </div>
    </div>
    <div class="footer">
      <p>Alice Beauté — Institut de beauté</p>
      <p>Cet email a été généré automatiquement suite à votre achat en ligne.</p>
    </div>
  </div>
</body>
</html>
`;

  await emailTransporter.sendMail({
    from: `"Alice Beauté" <${process.env.EMAIL_USER}>`,
    to: buyerEmail,
    subject: 'Votre carte cadeau Alice Beauté',
    html,
    attachments,
  });

  console.log(`Email carte cadeau envoyé à ${buyerEmail} (${attachments.length} pièce(s) jointe(s))`);
}

// ============================================
// ROUTES
// ============================================

// Créer un paiement Mollie
app.post('/create-payment', async (req, res) => {
  try {
    const { items, buyerEmail } = req.body;

    const total = items.reduce((sum, item) => sum + (item.amount * (item.qty || 1)), 0);
    const description = items.map(i => `${i.name}${i.qty > 1 ? ' ×' + i.qty : ''}`).join(', ');

    const paymentData = {
      amount: {
        currency: 'EUR',
        value: total.toFixed(2)
      },
      description: `Alice Beauté — ${description}`,
      redirectUrl: `${REDIRECT_URL}/merci.html`,
      metadata: {
        items: JSON.stringify(items),
        buyerEmail: buyerEmail || '',
      }
    };

    if (!BASE_URL.includes('localhost')) {
      paymentData.webhookUrl = `${BASE_URL}/payment-webhook`;
    }

    const payment = await mollie.payments.create(paymentData);

    res.json({ url: payment.getCheckoutUrl(), paymentId: payment.id });

  } catch (err) {
    console.error('Mollie error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Webhook Mollie (confirmation de paiement)
app.post('/payment-webhook', async (req, res) => {
  console.log('\n--- WEBHOOK MOLLIE reçu ---');
  try {
    const { id } = req.body;
    console.log('Payment ID reçu :', id);

    if (!id) {
      console.warn('Webhook reçu sans ID de paiement.');
      return res.status(200).send('OK');
    }

    const payment = await mollie.payments.get(id);
    console.log(`Statut du paiement : ${payment.status}`);

    if (payment.status === 'paid') {
      const meta = payment.metadata || {};
      const buyerEmail = meta.buyerEmail || '';
      const items = JSON.parse(meta.items || '[]');

      console.log('Email acheteur :', buyerEmail || '(non renseigné)');
      console.log('Articles :', items.map(i => i.name).join(', '));

      if (!buyerEmail) {
        console.warn('Pas d\'email acheteur dans les métadonnées — email non envoyé.');
      } else if (items.length === 0) {
        console.warn('Aucun article dans les métadonnées — email non envoyé.');
      } else {
        try {
          await sendGiftCardEmail(buyerEmail, items);
        } catch (emailErr) {
          console.error('Erreur envoi email carte cadeau :', emailErr.message);
          console.error(emailErr.stack);
        }
      }
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(500).send('Error');
  }
});

// Route de test email (à désactiver en production)
app.get('/test-email', async (req, res) => {
  const to = req.query.to;
  if (!to) return res.status(400).send('Paramètre "to" requis. Ex: /test-email?to=tonemail@gmail.com');

  console.log(`\n--- TEST EMAIL vers ${to} ---`);
  try {
    // Vérification de la connexion SMTP
    await emailTransporter.verify();
    console.log('Connexion SMTP OK');

    // Envoi d'un email de test avec une vraie carte cadeau (femme 40€)
    const testItems = [{ id: 'carte-femme', name: 'Carte Cadeau Femme — 40 €', amount: 40, qty: 1, type: 'gift-card' }];
    await sendGiftCardEmail(to, testItems);
    res.send(`✅ Email de test envoyé à ${to}. Vérifiez votre boîte mail.`);
  } catch (err) {
    console.error('Test email error:', err.message);
    res.status(500).send(`❌ Erreur : ${err.message}`);
  }
});

// Vérification du statut de paiement au retour de Mollie
// L'envoi d'email est géré exclusivement par le webhook /payment-webhook
app.get('/verify-payment', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.json({ ok: false, error: 'ID manquant' });

  try {
    const payment = await mollie.payments.get(id);
    console.log(`\n--- VERIFY PAYMENT ${id} : ${payment.status} ---`);

    res.json({ ok: true, paid: payment.status === 'paid', status: payment.status });
  } catch (err) {
    console.error('verify-payment error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Diagnostic : inspecte un paiement Mollie et renvoie l'email si payé
// Usage : /diag-payment/tr_xxxxx   ou   /diag-payment/last
app.get('/diag-payment/:id', async (req, res) => {
  try {
    let payment;
    if (req.params.id === 'last') {
      const list = await mollie.payments.list({ limit: 1 });
      payment = list[0];
    } else {
      payment = await mollie.payments.get(req.params.id);
    }

    if (!payment) return res.send('Aucun paiement trouvé.');

    const meta = payment.metadata || {};
    const buyerEmail = meta.buyerEmail || '(vide)';
    const items = JSON.parse(meta.items || '[]');

    let html = `<pre>
ID        : ${payment.id}
Statut    : ${payment.status}
Montant   : ${payment.amount.value} ${payment.amount.currency}
Email     : ${buyerEmail}
Articles  : ${items.map(i => i.name).join(', ') || '(vide)'}
Webhook   : ${payment.details?.webhookUrl || payment._links?.checkout?.href || '—'}
</pre>`;

    if (payment.status === 'paid' && buyerEmail !== '(vide)' && items.length > 0) {
      html += `<br><a href="/diag-resend/${payment.id}">▶ Renvoyer l'email maintenant</a>`;
    } else if (buyerEmail === '(vide)') {
      html += `<br><b style="color:red">⚠ Email absent des métadonnées — le champ email n'a pas été rempli avant le paiement.</b>`;
    }

    res.send(html);
  } catch (err) {
    res.status(500).send(`Erreur : ${err.message}`);
  }
});

// Renvoie manuellement l'email pour un paiement donné
app.get('/diag-resend/:id', async (req, res) => {
  try {
    const payment = await mollie.payments.get(req.params.id);
    if (payment.status !== 'paid') return res.send('Paiement non payé.');

    const meta = payment.metadata || {};
    const buyerEmail = meta.buyerEmail || '';
    const items = JSON.parse(meta.items || '[]');

    if (!buyerEmail) return res.send('❌ Pas d\'email dans les métadonnées.');

    await sendGiftCardEmail(buyerEmail, items);
    res.send(`✅ Email renvoyé à ${buyerEmail}`);
  } catch (err) {
    res.status(500).send(`❌ Erreur : ${err.message}`);
  }
});

// Fallback pour servir les pages HTML
app.get('*', (req, res) => {
  const page = req.path.slice(1) || 'index';
  const filePath = path.join(__dirname, `${page}.html`);
  res.sendFile(filePath, (err) => {
    if (err) res.sendFile(path.join(__dirname, 'index.html'));
  });
});

app.listen(PORT, () => {
  const mode = MOLLIE_API_KEY?.startsWith('live_') ? 'LIVE 🔴' : 'TEST 🟡';
  console.log(`\n  ✨ Alice Beauté running at http://localhost:${PORT}\n`);
  console.log(`  ✅ Mollie configuré — mode ${mode}\n`);
});
