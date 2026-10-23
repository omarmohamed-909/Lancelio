import { mkdir } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const source = fileURLToPath(new URL('apps/web/src/app/icon.png', root));
const directory = new URL('apps/web/public/pwa/', root);
await mkdir(directory, { recursive: true });
// Keep the existing logo. Maskable artwork stays inside the central safe area.
for (const [name, size, artwork] of [
  ['icon-192.png', 192, 168],
  ['icon-512.png', 512, 448],
  ['maskable-512.png', 512, 384],
]) {
  const logo = await sharp(source).resize(artwork, artwork).png().toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: '#f5f7f2' },
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .flatten({ background: '#f5f7f2' })
    .removeAlpha()
    .png()
    .toFile(fileURLToPath(new URL(name, directory)));
}
await sharp(fileURLToPath(new URL('icon-512.png', directory)))
  .resize(180, 180)
  .png()
  .toFile(fileURLToPath(new URL('apps/web/src/app/apple-icon.png', root)));
console.info('PWA icons generated from the existing favicon artwork.');
