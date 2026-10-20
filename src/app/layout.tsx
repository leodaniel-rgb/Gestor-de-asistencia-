import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// next/font descarga las fuentes en el build y las sirve desde nuestro dominio:
// el navegador del usuario no hace peticiones a Google.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Asistencia VIVE · Tecmilenio SLP",
    template: "%s · Asistencia VIVE",
  },
  description:
    "Portal de registro y análisis de asistencia del área VIVE, Universidad Tecmilenio campus San Luis Potosí.",
  // Portal interno: no debe aparecer en buscadores.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-MX"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
