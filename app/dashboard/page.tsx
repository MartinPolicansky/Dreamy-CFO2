'use client'

import React, { useMemo, useState } from 'react'
import useSWR from 'swr'
import { signOut } from 'next-auth/react'
import {
  LineChart, Line, BarChart, Bar,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer
} from 'recharts'
import * as XLSX from 'xlsx'

const fetcher = (url: string) => fetch(url).then(r => r.json())
const czk = (n: number) => (n || 0).toLocaleString('cs-CZ') + ' Kč'

// ---------- Helpers pro robustní import ----------
function num(x: any): number {
  if (x == null || x === '') return 0
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0
  let s = String(x)
    // odstraní běžné mezery + pevné NBSP + úzké NBSP
    .replace(/[\u00A0\u202F\s]/g, '')
    // odstraní měny a vše kromě číslic, čárky, tečky a mínusu
    .replace(/[^\d.,-]/g, '')
    .trim()

  // pokud je zároveň tečka i čárka → čárky ber jako oddělovač tisíců
  if (s.includes('.') && s.includes(',')) {
    s = s.replace(/,/g, '')
  } else if ((s.match(/,/g) || []).length === 1 && !s.includes('.')) {
    // jediná čárka, žádná tečka → čárka je desetinný oddělovač
    s = s.replace(',', '.')
  }

  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}
function excelSerialToDate(serial: number): Date {
  const utcDays = Math.floor(serial - 25569)
  const utcValue = utcDays * 86400
  const dateInfo = new Date(utcValue * 1000)
  const fractional = serial - Math.floor(serial)
  const totalSeconds = Math.floor(86400 * fractional)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor(totalSeconds / 60) % 60
  const seconds = totalSeconds % 60
  dateInfo.setHours(hours, minutes, seconds, 0)
  return dateInfo
}
function ym(x: any): string {
  if (x == null) return ''
  if (x instanceof Date) return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`
  if (typeof x === 'number' && x > 20000 && x < 60000) {
    const d = excelSerialToDate(x); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  const s = String(x).trim()
  let m = s.match(/^(\d{4})[-/.](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[-/.](\d{4})$/)
  if (m) return `${m[2]}-${String(m[1]).padStart(2, '0')}`
  return s.slice(0, 7)
}
function ymd(x: any): string {
  if (x == null) return ''
  if (x instanceof Date) return x.toISOString().slice(0, 10)
  if (typeof x === 'number' && x > 20000 && x < 60000) return excelSerialToDate(x).toISOString().slice(0, 10)
  const s = String(x).trim()
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return s.slice(0, 10)
}

// ---------- Šablona XLSX ----------
function DownloadTemplate() {
  const wb = XLSX.utils.book_new()
  const obraty = XLSX.utils.json_to_sheet([{ 'Month (YYYY-MM)': '2025-01', 'Revenue Plan CZK': '', 'Revenue Reality CZK': '' }])
  const opex = XLSX.utils.json_to_sheet([{ 'Month (YYYY-MM)': '2025-01', 'Payroll CZK': '', 'Rent CZK': '', 'Marketing CZK': '', 'Fulfillment CZK': '', 'IT/Admin CZK': '', 'Other OPEX CZK': '' }])
  const capex = XLSX.utils.json_to_sheet([{ 'Date (YYYY-MM-DD)': '2025-01-15', 'Category': '', 'Amount CZK': '', 'Comment': '' }])
  const cf = XLSX.utils.json_to_sheet([{ 'Month (YYYY-MM)': '2025-01', 'Opening Cash CZK': '', 'Cash In CZK': '', 'Cash Out CZK': '', 'Ending Cash CZK': '' }])
  const kpi = XLSX.utils.json_to_sheet([{ 'Month (YYYY-MM)': '2025-01', 'Orders': '', 'Avg Order Value CZK': '', 'Conversion Rate %': '' }])
  const inv = XLSX.utils.json_to_sheet([{
    'Month (YYYY-MM)': '2025-01',
    'Purchases CZK': '',
    'Opening Stock CZK': '',
    'Closing Stock CZK': '',
    'Adjustments CZK': ''
  }])
  XLSX.utils.book_append_sheet(wb, obraty, 'Obraty')
  XLSX.utils.book_append_sheet(wb, opex, 'OPEX (Provozní náklady)')
  XLSX.utils.book_append_sheet(wb, capex, 'CAPEX')
  XLSX.utils.book_append_sheet(wb, cf, 'Cash Flow')
  XLSX.utils.book_append_sheet(wb, kpi, 'KPIs')
  XLSX.utils.book_append_sheet(wb, inv, 'Inventory')
  XLSX.writeFile(wb, 'Dreamy_CFO_Template.xlsx')
}

// ---------- Import XLSX (robustní) ----------
async function importXLSX(file: File) {
  const data = await file.arrayBuffer()
  const wb = XLSX.read(data)

  // 1) listy (tolerantní názvy)
  const sObraty = findSheet(wb, ['Obraty'])
  const sOpex = findSheet(wb, ['OPEX (Provozní náklady)', 'OPEX', 'OPEX - Provozní náklady'])
  const sCapex = findSheet(wb, ['CAPEX'])
  const sCF = findSheet(wb, ['Cash Flow', 'Cashflow'])
  const sKPI = findSheet(wb, ['KPIs', 'KPI'])
  const sInv = findSheet(wb, ['Inventory', 'Zásoby'])

  const obraty = sObraty ? (XLSX.utils.sheet_to_json(sObraty) as any[]) : []
  const opex = sOpex ? (XLSX.utils.sheet_to_json(sOpex) as any[]) : []
  const cap = sCapex ? (XLSX.utils.sheet_to_json(sCapex) as any[]) : []
  const cf = sCF ? (XLSX.utils.sheet_to_json(sCF) as any[]) : []
  const k = sKPI ? (XLSX.utils.sheet_to_json(sKPI) as any[]) : []
  const inv = sInv ? (XLSX.utils.sheet_to_json(sInv) as any[]) : []

  // 2) POSTy (sčítáme obraty+opex na měsíc)
  let cntMonths = 0, cntCapex = 0, cntCF = 0, cntKPI = 0, cntInv = 0

  const bucket: Record<string, any> = {}
  for (const r of obraty) {
    const m = ym(r['Month (YYYY-MM)']); if (!m) continue
    bucket[m] = { ...(bucket[m] || {}), month: m, revenuePlan: num(r['Revenue Plan CZK']), revenueActual: num(r['Revenue Reality CZK']) }
  }
  for (const r of opex) {
    const m = ym(r['Month (YYYY-MM)']); if (!m) continue
    bucket[m] = {
      ...(bucket[m] || {}), month: m,
      payroll: num(r['Payroll CZK']), rent: num(r['Rent CZK']), marketing: num(r['Marketing CZK']),
      fulfillment: num(r['Fulfillment CZK']), itAdmin: num(r['IT/Admin CZK']), otherOpex: num(r['Other OPEX CZK'])
    }
  }
  for (const m of Object.keys(bucket)) {
    const res = await fetch('/api/months', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bucket[m]) })
    if (res.ok) cntMonths++
  }

  for (const r of cap) {
    const res = await fetch('/api/capex', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: new Date(ymd(r['Date (YYYY-MM-DD)'] || r['Date'] || '')), category: String(r['Category'] || ''), amount: num(r['Amount CZK']), comment: r['Comment'] || '' })
    })
    if (res.ok) cntCapex++
  }

  for (const r of cf) {
    const m = ym(r['Month (YYYY-MM)']); if (!m) continue
    const res = await fetch('/api/cashflow', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: m, openingCash: num(r['Opening Cash CZK']), cashIn: num(r['Cash In CZK']), cashOut: num(r['Cash Out CZK']), endingCash: num(r['Ending Cash CZK']) })
    })
    if (res.ok) cntCF++
  }

  for (const r of k) {
    const m = ym(r['Month (YYYY-MM)']); if (!m) continue
    const res = await fetch('/api/kpi', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: m, orders: num(r['Orders']), avgOrderValue: num(r['Avg Order Value CZK']), conversionRate: Number(String(r['Conversion Rate %']).replace(',', '.')) || 0 })
    })
    if (res.ok) cntKPI++
  }

  for (const r of inv) {
    const m = ym(r['Month (YYYY-MM)']); if (!m) continue
    const res = await fetch('/api/inventory', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        month: m,
        purchases: num(r['Purchases CZK']),
        openingStock: num(r['Opening Stock CZK']),
        closingStock: num(r['Closing Stock CZK']),
        adjustments: num(r['Adjustments CZK'])
      })
    })
    if (res.ok) cntInv++
  }

  alert(`Import hotov:
- Měsíce (obrat/OPEX): ${cntMonths}
- Cash Flow: ${cntCF}
- CAPEX: ${cntCapex}
- KPI: ${cntKPI}
- Inventory: ${cntInv}`)
  location.reload()
}

// ---------- Hlavní komponenta ----------
export default function Dashboard() {
  const { data: months } = useSWR('/api/months', fetcher)
  const { data: capex } = useSWR('/api/capex', fetcher)
  const { data: cashflow } = useSWR('/api/cashflow', fetcher)
  const { data: kpi } = useSWR('/api/kpi', fetcher)
  const { data: inventory } = useSWR('/api/inventory', fetcher)

  const monthsSafe: any[] = Array.isArray(months) ? months : []
  const cashflowSafe: any[] = Array.isArray(cashflow) ? cashflow : []
  const capexSafe: any[] = Array.isArray(capex) ? capex : []
  const inventorySafe: any[] = Array.isArray(inventory) ? inventory : []

  const [newMonth, setNewMonth] = useState<any>({ month: '2025-01', revenuePlan: '', revenueActual: '', payroll: '', rent: '', marketing: '', fulfillment: '', itAdmin: '', otherOpex: '' })
  const [newCapex, setNewCapex] = useState<any>({ date: '2025-01-01', category: '', amount: '', comment: '' })
  const [newCF, setNewCF] = useState<any>({ month: '2025-01', openingCash: '', cashIn: '', cashOut: '', endingCash: '' })
  const [newKPI, setNewKPI] = useState<any>({ month: '2025-01', sessions: '', orders: '', conversionRate: '', avgOrderValue: '' })
  const [newInv, setNewInv] = useState<any>({ month: '2025-01', purchases: '', openingStock: '', closingStock: '', adjustments: '' })

  const [advisor, setAdvisor] = useState<any>(null)
  const [advisorLoading, setAdvisorLoading] = useState(false)
  async function generateMemo() {
    try {
      setAdvisorLoading(true)
      const res = await fetch('/api/advisor')
      const json = await res.json()
      setAdvisor(json)
    } finally {
      setAdvisorLoading(false)
    }
  }

  const computed = useMemo(() => {
    return monthsSafe.map((r: any) => {
      const opex = (r.payroll || 0) + (r.rent || 0) + (r.marketing || 0) + (r.fulfillment || 0) + (r.itAdmin || 0) + (r.otherOpex || 0)
      return {
        name: r.month,
        plan: r.revenuePlan || 0,
        actual: r.revenueActual || 0,
        opex,
        ebitdaPlan: (r.revenuePlan || 0) - opex,
        ebitdaActual: (r.revenueActual || 0) - opex,
      }
    })
  }, [monthsSafe])

  const totals = useMemo(() => {
    const sum = (k: string) => computed.reduce((a: number, b: any) => a + (b[k] || 0), 0)
    const be = computed.find((r: any) => r.ebitdaPlan > 0)?.name || '—'
    return { revenuePlan: sum('plan'), revenueActual: sum('actual'), opex: sum('opex'), ebitdaPlan: sum('ebitdaPlan'), ebitdaActual: sum('ebitdaActual'), breakEven: be }
  }, [computed])

  const invRows = useMemo(() => {
    return inventorySafe
      .slice()
      .sort((a, b) => String(a.month).localeCompare(String(b.month)))
      .map((r: any) => {
        const cogs = (r.openingStock || 0) + (r.purchases || 0) - (r.closingStock || 0) + (r.adjustments || 0)
        return { ...r, cogs }
      })
  }, [inventorySafe])

  async function save(path: string, body: any, after?: () => void) {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) { after?.(); location.reload() }
  }

  return (
    <main className="min-h-screen p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex items-center gap-2">
          <button onClick={DownloadTemplate} className="px-3 py-2 border rounded">Stáhnout XLSX šablonu</button>
          <label className="px-3 py-2 border rounded cursor-pointer">
            Import XLSX
            <input type="file" className="hidden" accept=".xlsx,.xls" onChange={e => e.target.files && importXLSX(e.target.files[0])} />
          </label>
          <button onClick={() => window.open('/api/board-report', '_blank')} className="px-3 py-2 border rounded">Stáhnout PDF report</button>
          <button onClick={() => signOut({ callbackUrl: '/' })} className="px-3 py-2 border rounded">Odhlásit</button>
        </div>
      </div>

      {/* Souhrny */}
      <div className="grid md:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded shadow"><div className="text-sm text-gray-500">Σ Obrat (plán)</div><div className="text-2xl">{czk(totals.revenuePlan)}</div></div>
        <div className="bg-white p-4 rounded shadow"><div className="text-sm text-gray-500">Σ Obrat (realita)</div><div className="text-2xl">{czk(totals.revenueActual)}</div></div>
        <div className="bg-white p-4 rounded shadow"><div className="text-sm text-gray-500">Σ OPEX</div><div className="text-2xl">{czk(totals.opex)}</div></div>
        <div className="bg-white p-4 rounded shadow"><div className="text-sm text-gray-500">Σ EBITDA (plán)</div><div className="text-2xl">{czk(totals.ebitdaPlan)}</div></div>
        <div className="bg-white p-4 rounded shadow"><div className="text-sm text-gray-500">Break-even</div><div className="text-2xl">{totals.breakEven}</div></div>
        <div className="bg-white p-4 rounded shadow"><div className="text-sm text-gray-500">Closing stock (poslední)</div><div className="text-2xl">{czk(invRows.length ? invRows[invRows.length - 1].closingStock : 0)}</div></div>
      </div>

      {/* Grafy: Obrat/OPEX a EBITDA */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded shadow h-80">
          <div className="font-medium mb-2">Obrat vs OPEX</div>
          <ResponsiveContainer>
            <LineChart data={computed}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" /><YAxis /><Tooltip formatter={(v: any) => czk(v)} /><Legend />
              <Line type="monotone" dataKey="plan" name="Obrat plán" />
              <Line type="monotone" dataKey="actual" name="Obrat realita" />
              <Line type="monotone" dataKey="opex" name="OPEX" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white p-4 rounded shadow h-80">
          <div className="font-medium mb-2">EBITDA</div>
          <ResponsiveContainer>
            <BarChart data={computed}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" /><YAxis /><Tooltip formatter={(v: any) => czk(v)} /><Legend />
              <ReferenceLine y={0} />
              <Bar dataKey="ebitdaPlan" name="EBITDA plán" />
              <Bar dataKey="ebitdaActual" name="EBITDA realita" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cash-flow & CAPEX grafy */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded shadow h-80">
          <div className="font-medium mb-2">Cash-flow (In/Out/Ending)</div>
          <ResponsiveContainer>
            <LineChart data={cashflowSafe.map((r: any) => ({ name: r.month, in: r.cashIn, out: r.cashOut, end: r.endingCash }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" /><YAxis /><Tooltip /><Legend />
              <Line type="monotone" dataKey="in" name="Cash In" />
              <Line type="monotone" dataKey="out" name="Cash Out" />
              <Line type="monotone" dataKey="end" name="Ending Cash" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white p-4 rounded shadow h-80">
          <div className="font-medium mb-2">CAPEX Timeline</div>
          <ResponsiveContainer>
            <BarChart data={capexSafe.map((r: any) => ({ name: (r.date || '').slice(0, 10), amount: r.amount, category: r.category }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" /><YAxis /><Tooltip /><Legend />
              <Bar dataKey="amount" name="Investice (CZK)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Inventář – grafy */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded shadow h-80">
          <div className="font-medium mb-2">Inventory level (Closing stock)</div>
          <ResponsiveContainer>
            <LineChart data={invRows.map(r => ({ name: r.month, closing: r.closingStock }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" /><YAxis /><Tooltip formatter={(v: any) => czk(v)} /><Legend />
              <Line type="monotone" dataKey="closing" name="Closing stock" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white p-4 rounded shadow h-80">
          <div className="font-medium mb-2">Purchases vs COGS</div>
          <ResponsiveContainer>
            <BarChart data={invRows.map(r => ({ name: r.month, purchases: r.purchases, cogs: r.cogs }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" /><YAxis /><Tooltip formatter={(v: any) => czk(v)} /><Legend />
              <Bar dataKey="purchases" name="Purchases" />
              <Bar dataKey="cogs" name="COGS" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* AI poradce (CFO memo) */}
      <div className="bg-white p-4 rounded shadow">
        <div className="flex items-center justify-between mb-2">
          <div className="font-medium">AI poradce (CFO memo)</div>
          <button onClick={generateMemo} disabled={advisorLoading} className="px-3 py-2 border rounded disabled:opacity-50">
            {advisorLoading ? 'Počítám…' : 'Vygenerovat memo'}
          </button>
        </div>
        {!advisor && <p className="text-sm text-gray-500">Klikni na „Vygenerovat memo“. Z aktuálních dat dopočítám trendy, odchylky proti plánu a runway.</p>}
        {advisor && (
          <div className="space-y-4">
            <div className="p-3 border rounded bg-gray-50">
              <div className="text-xs text-gray-500 mb-1">Shrnutí</div>
              <div>{advisor.memo}</div>
            </div>
            {advisor.highlights?.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Highlights</div>
                <ul className="list-disc pl-5 space-y-1">
                  {advisor.highlights.map((h: string, i: number) => <li key={i}>{h}</li>)}
                </ul>
              </div>
            )}
            {advisor.risks?.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Rizika</div>
                <ul className="list-disc pl-5 space-y-1">
                  {advisor.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
            {advisor.actions?.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Doporučené kroky</div>
                <ul className="list-disc pl-5 space-y-1">
                  {advisor.actions.map((a: string, i: number) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* DATA sections */}
      <section className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded shadow space-y-2">
          <div className="font-medium mb-2">Měsíční data (Obrat & OPEX)</div>
          <div className="grid grid-cols-2 gap-2">
            <input className="border p-2 rounded" placeholder="YYYY-MM" value={newMonth.month} onChange={e => setNewMonth({ ...newMonth, month: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Obrat plán" value={newMonth.revenuePlan} onChange={e => setNewMonth({ ...newMonth, revenuePlan: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Obrat realita" value={newMonth.revenueActual} onChange={e => setNewMonth({ ...newMonth, revenueActual: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Payroll" value={newMonth.payroll} onChange={e => setNewMonth({ ...newMonth, payroll: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Rent" value={newMonth.rent} onChange={e => setNewMonth({ ...newMonth, rent: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Marketing" value={newMonth.marketing} onChange={e => setNewMonth({ ...newMonth, marketing: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Fulfillment" value={newMonth.fulfillment} onChange={e => setNewMonth({ ...newMonth, fulfillment: e.target.value })} />
            <input className="border p-2 rounded" placeholder="IT/Admin" value={newMonth.itAdmin} onChange={e => setNewMonth({ ...newMonth, itAdmin: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Other OPEX" value={newMonth.otherOpex} onChange={e => setNewMonth({ ...newMonth, otherOpex: e.target.value })} />
          </div>
          <button className="px-3 py-2 rounded bg-black text-white" onClick={() => save('/api/months', {
            month: newMonth.month,
            revenuePlan: +newMonth.revenuePlan || 0, revenueActual: +newMonth.revenueActual || 0,
            payroll: +newMonth.payroll || 0, rent: +newMonth.rent || 0, marketing: +newMonth.marketing || 0,
            fulfillment: +newMonth.fulfillment || 0, itAdmin: +newMonth.itAdmin || 0, otherOpex: +newMonth.otherOpex || 0,
          })}>Uložit měsíc</button>
        </div>

        <div className="bg-white p-4 rounded shadow space-y-2">
          <div className="font-medium mb-2">CAPEX</div>
          <div className="grid grid-cols-2 gap-2">
            <input className="border p-2 rounded" type="date" value={newCapex.date} onChange={e => setNewCapex({ ...newCapex, date: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Kategorie" value={newCapex.category} onChange={e => setNewCapex({ ...newCapex, category: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Částka" value={newCapex.amount} onChange={e => setNewCapex({ ...newCapex, amount: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Komentář" value={newCapex.comment} onChange={e => setNewCapex({ ...newCapex, comment: e.target.value })} />
          </div>
          <button className="px-3 py-2 rounded bg-black text-white" onClick={() => save('/api/capex', {
            date: new Date(newCapex.date), category: newCapex.category, amount: +newCapex.amount || 0, comment: newCapex.comment || ''
          })}>Přidat CAPEX</button>
        </div>

        <div className="bg-white p-4 rounded shadow space-y-2">
          <div className="font-medium mb-2">Cash-flow</div>
          <div className="grid grid-cols-2 gap-2">
            <input className="border p-2 rounded" placeholder="YYYY-MM" value={newCF.month} onChange={e => setNewCF({ ...newCF, month: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Opening Cash" value={newCF.openingCash} onChange={e => setNewCF({ ...newCF, openingCash: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Cash In" value={newCF.cashIn} onChange={e => setNewCF({ ...newCF, cashIn: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Cash Out" value={newCF.cashOut} onChange={e => setNewCF({ ...newCF, cashOut: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Ending Cash" value={newCF.endingCash} onChange={e => setNewCF({ ...newCF, endingCash: e.target.value })} />
          </div>
          <button className="px-3 py-2 rounded bg-black text-white" onClick={() => save('/api/cashflow', {
            month: newCF.month, openingCash: +newCF.openingCash || 0, cashIn: +newCF.cashIn || 0, cashOut: +newCF.cashOut || 0, endingCash: +newCF.endingCash || 0
          })}>Uložit cash-flow</button>
        </div>

        <div className="bg-white p-4 rounded shadow space-y-2">
          <div className="font-medium mb-2">KPI</div>
          <div className="grid grid-cols-2 gap-2">
            <input className="border p-2 rounded" placeholder="YYYY-MM" value={newKPI.month} onChange={e => setNewKPI({ ...newKPI, month: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Sessions" value={newKPI.sessions} onChange={e => setNewKPI({ ...newKPI, sessions: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Orders" value={newKPI.orders} onChange={e => setNewKPI({ ...newKPI, orders: e.target.value })} />
            <input className="border p-2 rounded" placeholder="CR (%)" value={newKPI.conversionRate} onChange={e => setNewKPI({ ...newKPI, conversionRate: e.target.value })} />
            <input className="border p-2 rounded" placeholder="AOV (CZK)" value={newKPI.avgOrderValue} onChange={e => setNewKPI({ ...newKPI, avgOrderValue: e.target.value })} />
          </div>
          <button className="px-3 py-2 rounded bg-black text-white" onClick={() => save('/api/kpi', {
            month: newKPI.month, sessions: +newKPI.sessions || 0, orders: +newKPI.orders || 0,
            conversionRate: +newKPI.conversionRate || 0, avgOrderValue: +newKPI.avgOrderValue || 0
          })}>Uložit KPI</button>
        </div>

        <div className="bg-white p-4 rounded shadow space-y-2">
          <div className="font-medium mb-2">Inventory (zásoby)</div>
          <div className="grid grid-cols-2 gap-2">
            <input className="border p-2 rounded" placeholder="YYYY-MM" value={newInv.month} onChange={e => setNewInv({ ...newInv, month: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Purchases" value={newInv.purchases} onChange={e => setNewInv({ ...newInv, purchases: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Opening stock" value={newInv.openingStock} onChange={e => setNewInv({ ...newInv, openingStock: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Closing stock" value={newInv.closingStock} onChange={e => setNewInv({ ...newInv, closingStock: e.target.value })} />
            <input className="border p-2 rounded" placeholder="Adjustments (+/-)" value={newInv.adjustments} onChange={e => setNewInv({ ...newInv, adjustments: e.target.value })} />
          </div>
          <button className="px-3 py-2 rounded bg-black text-white" onClick={() => save('/api/inventory', {
            month: newInv.month,
            purchases: +newInv.purchases || 0,
            openingStock: +newInv.openingStock || 0,
            closingStock: +newInv.closingStock || 0,
            adjustments: +newInv.adjustments || 0
          })}>Uložit inventory</button>
        </div>
      </section>
    </main>
  )
}
