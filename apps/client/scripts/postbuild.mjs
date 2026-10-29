import fs from 'fs';
import path from 'path';

const distIndex = path.resolve('dist/index.html');
const dist404 = path.resolve('dist/404.html');
const distRedirects = path.resolve('dist/_redirects');

if (fs.existsSync(distIndex)) {
  fs.copyFileSync(distIndex, dist404);
  console.log('404.html gerado com sucesso em dist/');
}

if (!fs.existsSync(distRedirects)) {
  fs.writeFileSync(distRedirects, '/* /index.html 200\n', 'utf8');
  console.log('_redirects gerado com sucesso em dist/');
}
