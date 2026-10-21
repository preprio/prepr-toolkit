import { PreprRefresh } from '@preprio/toolkit/nextjs/live';
import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <PreprRefresh />
      </body>
    </html>
  );
}
