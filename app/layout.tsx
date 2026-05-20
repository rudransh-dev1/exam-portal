import type { Metadata } from "next";
import { Inter, Orbitron, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-orbitron",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ExamGuard — Online Examination Portal",
  description: "Secure, scalable online exam system. Anti-cheat protected with real-time monitoring.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${orbitron.variable} ${jetbrainsMono.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#081224" />
      </head>
      <body>
        {children}
        <Script
          id="sw-registration"
          strategy="afterInteractive"
        >
          {`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js')
                  .then(function(reg) { 
                    console.log('[SW] Registered:', reg.scope);
                    
                    // Check for updates every 15 minutes
                    setInterval(() => { reg.update(); }, 15 * 60 * 1000);

                    reg.onupdatefound = () => {
                      const newWorker = reg.installing;
                      if (newWorker) {
                        newWorker.onstatechange = () => {
                          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // New update available and installed - force reload to apply
                            console.log('[SW] New version found! Reloading...');
                            window.location.reload();
                          }
                        };
                      }
                    };
                  })
                  .catch(function(err) { console.warn('[SW] Registration failed:', err); });
              });

              // Handle controller change (e.g. after skipWaiting)
              let refreshing = false;
              navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (refreshing) return;
                refreshing = true;
                window.location.reload();
              });
            }
          `}
        </Script>
      </body>
    </html>
  );
}
