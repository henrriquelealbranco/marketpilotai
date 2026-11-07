import { AppShell } from '@/components/app-shell';
import { getIdentity } from '@/lib/server-session';
export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  const identity = await getIdentity();
  return (
    <AppShell demo={false} identity={identity}>
      {children}
    </AppShell>
  );
}
