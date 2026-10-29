import fs from 'fs';
import path from 'path';

try {
  const distIndex = path.resolve('dist/index.html');
  const dist404 = path.resolve('dist/404.html');
  const distRedirects = path.resolve('dist/_redirects');

  if (fs.existsSync(distIndex)) {
    fs.copyFileSync(distIndex, dist404);
    console.log('[Postbuild] 404.html compilado gerado com sucesso.');
  }
  if (!fs.existsSync(distRedirects)) {
    fs.writeFileSync(distRedirects, '/* /index.html 200\n', 'utf8');
    console.log('[Postbuild] _redirects gerado em dist/.');
  }
} catch (e) {
  console.error('[Postbuild Error]', e);
}
