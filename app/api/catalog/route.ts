import { upsertCatalog } from '@/lib/server/db';
import { body, handle } from '@/lib/server/context';
import { parseCatalog } from '@/lib/server/validate';

export function GET(request: Request) {
  return handle(request, async context => Response.json({
    productCount: context.products.length,
    brands: [...new Set(context.products.map(p => p.brand))].sort(),
    sizeCharts: context.charts.map(c => ({ id: c.id, brand: c.brand, category: c.category })),
  }));
}

// The catalog is shared public product data. Personal data never goes here.
export function POST(request: Request) {
  return handle(request, async context => {
    if (context.demo) return Response.json({ error: 'The demo catalog is fixed.' }, { status: 403 });
    const catalog = parseCatalog(await body(request));
    await upsertCatalog('import', catalog.products, catalog.sizeCharts);
    return Response.json({ imported: catalog.products.length, sizeCharts: catalog.sizeCharts.length });
  });
}
