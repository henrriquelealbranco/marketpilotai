import { redirect } from 'next/navigation';
import { getIdentity } from '@/lib/server-session';

export default async function Home() {
  await getIdentity();
  redirect('/app/menu');
}
