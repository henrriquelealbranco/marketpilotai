import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Identity } from '@marketpilot/contracts';
export async function getIdentity(): Promise<Identity> {
  const jar = await cookies();
  const token = jar.get('mp_session')?.value;
  if (!token) redirect('/login');
  let response: Response;
  try {
    response = await fetch(
      `${process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000'}/v1/auth/me`,
      { headers: { cookie: `mp_session=${encodeURIComponent(token)}` }, cache: 'no-store' },
    );
  } catch {
    throw new Error('A API está indisponível. Verifique se o serviço foi iniciado.');
  }
  if (response.status === 401) redirect('/login');
  if (!response.ok) throw new Error('Não foi possível consultar sua sessão. Tente novamente.');
  return response.json();
}
