import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Lancelio',
    short_name: 'Lancelio',
    description: 'Your freelance workspace — مساحة لشغلك المستقل',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#f5f7f2',
    theme_color: '#173d30',
    prefer_related_applications: false,
    icons: [
      {
        src: '/pwa/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
