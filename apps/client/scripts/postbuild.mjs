import fs from 'fs';
import path from 'path';

const distDir = path.resolve('dist');
const distIndex = path.join(distDir, 'index.html');
const dist404 = path.join(distDir, '404.html');
const distRedirects = path.join(distDir, '_redirects');

if (fs.existsSync(distIndex)) {
  fs.copyFileSync(distIndex, dist404);
  fs.writeFileSync(distRedirects, '/* /index.html 200\n', 'utf8');
  console.log('Postbuild concluído com sucesso.');
}
