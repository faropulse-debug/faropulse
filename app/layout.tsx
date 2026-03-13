import type { Metadata } from "next"
import { Rajdhani, DM_Sans } from "next/font/google"
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

export const metadata: Metadata = {
  title: "FAROPULSE — Consola de Decisiones Gastronómicas",
  description: "Dashboard de inteligencia para restaurantes y negocios gastronómicos.",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${rajdhani.variable} ${dmSans.variable}`}>
        {children}
      </body>
    </html>
  )
}
