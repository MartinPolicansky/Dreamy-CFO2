import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Dreamy CFO Dashboard',
  description: 'Jednoduché prostředí pro CFO reporting',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  )
}
