import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Whisper — Private AI Treasury',
  description: 'Private AI treasury agent for managing crypto assets with confidentiality.',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full bg-black">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="h-full bg-black text-white antialiased"
        style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
      >
        {children}
      </body>
    </html>
  )
}
