import type { OrderFact } from '@marketpilot/contracts';

const products = [
  {
    id: 'demo-1',
    name: 'Fone Bluetooth Wave Pro',
    category: 'Eletrônicos',
    supplier: 'Nexo Distribuidora · fictício',
    price: 18990,
  },
  {
    id: 'demo-2',
    name: 'Luminária de mesa Orbit',
    category: 'Casa e decoração',
    supplier: 'Casa Norte · fictício',
    price: 12990,
  },
  {
    id: 'demo-3',
    name: 'Garrafa térmica 1L',
    category: 'Casa e cozinha',
    supplier: 'Casa Norte · fictício',
    price: 8990,
  },
  {
    id: 'demo-4',
    name: 'Smartwatch Pulse S2',
    category: 'Eletrônicos',
    supplier: 'Nexo Distribuidora · fictício',
    price: 24990,
  },
  {
    id: 'demo-5',
    name: 'Kit organizador de viagem',
    category: 'Acessórios',
    supplier: 'Via Brasil · fictício',
    price: 7990,
  },
];
export function demoOrders(now: Date): OrderFact[] {
  return Array.from({ length: 90 }, (_, day) => {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - day);
    date.setUTCHours(12, 0, 0, 0);
    return Array.from({ length: 3 + ((day * 7) % 5) }, (_, n) => {
      const product = products[(day + n) % products.length]!;
      const quantity = 1 + ((day + n) % 3 === 0 ? 1 : 0);
      const revenueCents = product.price * quantity;
      return {
        id: `DEMO-${String(4800 - day * 6 - n).padStart(5, '0')}`,
        date: date.toISOString(),
        productId: product.id,
        product: product.name,
        category: product.category,
        supplier: product.supplier,
        quantity,
        revenueCents,
        costCents: Math.round(revenueCents * (0.69 + (n % 3) * 0.03)),
        status: (day > 5
          ? 'delivered'
          : day > 1
            ? 'shipping'
            : 'processing') as OrderFact['status'],
      };
    });
  }).flat();
}
