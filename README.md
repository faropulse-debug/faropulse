# FARO / FaroPulse

Consola de decisión B2B para gastronomía — dashboards de KPIs, P&L, operación, inversión y descuentos para dueños y managers de locales.

## Stack

- [Next.js 16](https://nextjs.org) (App Router) + [React 19](https://react.dev) + TypeScript
- [Tailwind CSS 4](https://tailwindcss.com)
- [Supabase](https://supabase.com) (Postgres, Auth, RLS)
- Deploy en [Vercel](https://vercel.com)

## Branches

- `develop` → deploy automático a **STG**
- `main` → deploy automático a **PROD** (solo vía PR desde `develop`)

## Correr local

1. Instalar dependencias:

   ```bash
   npm install
   ```

2. Copiar `.env.example` a `.env.local` y completar las variables de Supabase (ver el archivo para el detalle de cada una).

3. Levantar el servidor de desarrollo (Next.js carga `.env.local` automáticamente):

   ```bash
   npm run dev
   ```

   Abrir [http://localhost:3000](http://localhost:3000).

## Scripts útiles

- `npm run lint` — ESLint
- `npm run typecheck` — chequeo de tipos sin emitir
- `npm run test` — suite de tests (Vitest)
- `npm run smoke` — smoke test de upload contra el entorno de `.env.local`
