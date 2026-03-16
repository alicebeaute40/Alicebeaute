/**
 * ALICE BEAUTÉ — Tunnel public pour Mollie
 * Lance ce script pour obtenir une URL publique temporaire.
 * Usage : node tunnel.js
 */

const localtunnel = require('localtunnel');
const fs = require('fs');
const path = require('path');

const PORT = 8000;
const ENV_PATH = path.join(__dirname, '.env');

(async () => {
  console.log('\n  🔌 Création du tunnel public...\n');

  const tunnel = await localtunnel({ port: PORT, subdomain: 'alicebeaute' });

  const publicUrl = tunnel.url;

  // Mettre à jour BASE_URL dans .env automatiquement
  let envContent = fs.readFileSync(ENV_PATH, 'utf8');
  envContent = envContent.replace(/^BASE_URL=.*/m, `BASE_URL=${publicUrl}`);
  fs.writeFileSync(ENV_PATH, envContent);

  console.log('  ✅ Tunnel actif !');
  console.log(`  🌐 URL publique : ${publicUrl}`);
  console.log('  📄 BASE_URL mis à jour dans .env\n');
  console.log('  ⚠️  Lance le serveur dans un autre terminal : npm start');
  console.log('  ⚠️  Ce tunnel reste actif tant que cette fenêtre est ouverte.\n');

  tunnel.on('close', () => {
    // Remettre localhost dans .env à la fermeture
    let env = fs.readFileSync(ENV_PATH, 'utf8');
    env = env.replace(/^BASE_URL=.*/m, 'BASE_URL=http://localhost:8000');
    fs.writeFileSync(ENV_PATH, env);
    console.log('\n  🔴 Tunnel fermé. BASE_URL remis à localhost.\n');
  });
})();
