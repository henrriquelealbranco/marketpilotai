import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export const money = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
export const number = (value: number) => new Intl.NumberFormat('pt-BR').format(value);
export const percent = (value: number) =>
  `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)}%`;
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
    credentials: 'same-origin',
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'Não foi possível acessar o serviço.' }));
    throw new ApiError(
      error.message || 'Não foi possível concluir a solicitação.',
      response.status,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
