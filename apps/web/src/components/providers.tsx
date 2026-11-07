'use client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { MotionConfig } from 'framer-motion';
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30000, retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <QueryClientProvider client={client}>
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
