import fs from 'fs';
import path from 'path';

const distIndex = path.resolve('apps/client/dist/index.html');
const dist404 = path.resolve('apps/client/dist/404.html');
const distRedirects = path.resolve('apps/client/dist/_redirects');

if (fs.existsSync(distIndex)) {
  fs.copyFileSync(distIndex, dist404);
}
if (!fs.existsSync(distRedirects)) {
  fs.writeFileSync(distRedirects, '/* /index.html 200\n', 'utf8');
}
