import type { Metadata } from 'next';
import '@fontsource-variable/inter';
import './globals.css';
import '@/components/catalog/catalog.css';
import { Providers } from '@/components/providers';
export const metadata: Metadata = {
  title: {
    default: 'MarketPilot AI · Sua operação, sob controle',
    template: '%s · MarketPilot AI',
  },
  description:
    'Inteligência e clareza para sua operação de comércio. Plataforma em desenvolvimento por fases.',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
