import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MarketPilot AI',
    short_name: 'MarketPilot',
    description: 'Inteligência para sua operação comercial.',
    start_url: '/login',
    display: 'standalone',
    background_color: '#0B0B12',
    theme_color: '#7C3AED',
    lang: 'pt-BR',
    icons: [{ src: '/brand/app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
