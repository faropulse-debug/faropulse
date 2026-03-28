import type { Metadata } from "next"
import { Rajdhani, DM_Sans, Syne, DM_Mono } from "next/font/google"
import "./globals.css"

const rajdhani = Rajdhani({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-rajdhani",
  display: "swap",
})

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm-sans",
  display: "swap",
})

const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-syne",
  display: "swap",
})

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: "FAROPULSE — Consola de Decisiones Gastronómicas",
  description: "Dashboard de inteligencia para restaurantes y negocios gastronómicos.",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${rajdhani.variable} ${dmSans.variable} ${syne.variable} ${dmMono.variable}`}>
        {children}
      </body>
    </html>
  )
}
