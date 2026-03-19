import type { Metadata } from 'next'
import { Cormorant_Garamond, Manrope } from 'next/font/google'

import './globals.css'

const displayFont = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700']
})

const bodyFont = Manrope({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700']
})

export const metadata: Metadata = {
  title: 'University Hotel HMS',
  description: 'Hotel operations, bookings, payments, and RFID keycard management for University Hotel.'
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${bodyFont.variable} min-h-screen font-[family-name:var(--font-body)]`}>
        {children}
      </body>
    </html>
  )
}