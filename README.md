# Dreamy CFO – Fullstack (Next.js + Prisma + NextAuth)

## Funkce
- Uživatelské účty (registrace/přihlášení) – NextAuth (Credentials)
- Ukládání dat do PostgreSQL (Prisma)
- Záložky: **Měsíční data (Obrat & OPEX)**, **CAPEX**, **Cash-flow**, **KPI**
- Grafy: Obrat vs. OPEX, EBITDA
- API: /api/months, /api/capex, /api/cashflow, /api/kpi
  

## Lokální spuštění
1. `cp .env.example .env` a doplň `NEXTAUTH_SECRET`, `DATABASE_URL`
2. `npm install`
3. `npx prisma migrate deploy` (poprvé můžeš použít `npx prisma migrate dev --name init`)
4. `npm run dev`
5. Otevři `http://localhost:3000`
   

## Nasazení (doporučeno: Vercel + Neon/Postgres)
1. Vytvoř si bezplatný účet na **Neon.tech** (PostgreSQL) → vytvoř databázi → zkopíruj `DATABASE_URL`.
2. Na **Vercel.com** dej **Add New > Project > Import** tento projekt z GitHubu (nahraj ho do nového repa).
3. Ve Vercelu nastav **Environment Variables**:
   - `DATABASE_URL=...` (z Neon)
   - `NEXTAUTH_SECRET=` (vygeneruj si `openssl rand -base64 32`)
   - `NEXTAUTH_URL=https://tvoje-domena.vercel.app`
4. Po 1. deployi spusť ve Vercelu **Run Command**: `npx prisma migrate deploy`.
5. Hotovo. Přihlas se, založ si účet na `/sign-up`, a pracuj s daty.

## Import/Export XLSX
- Pro jednoduchost zatím není přímý import v UI; data vyplňuj v dashboardu. (Import z XLSX můžeme přidat jako další krok.)


---

## Novinky ve verzi v2
- Import **XLSX** přímo v UI (Obraty, OPEX, CAPEX, Cash Flow, KPIs)
- Grafy **Cash-flow** (In/Out/Ending) a **CAPEX timeline**
- **Scénáře** (Best/Base/Worst) – multiplikátory obratu a OPEX
- **Alerts** API: negativní EBITDA 3×, runway < 6 měsíců
- **PDF Board report** (stub – implementovat generátor)
- **Multitenant pobočky (Branch)** + **Benchmark** model
- **Stubs** pro konektory **GA4** a **ABRA** (připrav env a propojení v produkci)

### Env variables (rozšíření)
- `ABRA_BASE_URL`, `ABRA_TOKEN`
- `GA4_PROPERTY_ID`, `GOOGLE_APPLICATION_CREDENTIALS` (service account JSON path)
- pro PDF generátor zvažte `PUPPETEER_EXECUTABLE_PATH`

### Co je potřeba doplnit při reálném napojení
- **ABRA**: zjistit konkrétní REST endpointy pro prodeje a výdaje, mapování účtové osnovy → `MonthData`/`Cashflow`.

- **GA4**: použít `@google-analytics/data` (reports.runReport) a mapovat sessions, orders, conversionRate, avgOrderValue.

- **PDF**: vyměnit stub za skutečný generátor (Puppeteer/React-PDF) a vložit grafy + souhrny.

