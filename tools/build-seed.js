// Generates apps-script/Seed.gs from data/products.seed.json.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const products = JSON.parse(fs.readFileSync(path.join(root, 'data', 'products.seed.json'), 'utf8'));
const out = '// Generado por tools/build-seed.js desde data/products.seed.json. No editar a mano.\n' +
  'var SEED_PRODUCTS = ' + JSON.stringify(products, null, 2) + ';\n';
fs.writeFileSync(path.join(root, 'apps-script', 'Seed.gs'), out);
console.log('Seed.gs escrito con ' + products.length + ' productos');
