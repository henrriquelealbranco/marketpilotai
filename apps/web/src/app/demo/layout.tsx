import { AppShell } from '@/components/app-shell';
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <AppShell demo>{children}</AppShell>;
}
