import type {Metadata} from "next";
import NavBar from "@/components/navbar";
import './globals.css'
import {Ubuntu} from "next/font/google";
import { extractAccessToken, PreprTrackingPixel } from '@preprio/toolkit/nextjs'
import { preprGraphqlUrl } from '@/prepr-env'

const ubuntu = Ubuntu({weight: ['400', '700'], subsets: ['latin']})

export const metadata: Metadata = {
  title: "Prepr Next.js complete starter",
  description: "Showing the power of personalization and A/B testing",
};

export default async function RootLayout({children,}: {children: React.ReactNode})
{
    // Prerendered pages (/_not-found) build without a configured endpoint, so
    // a missing env var degrades to "no pixel" instead of failing the build.
    let accessToken: string | null = null
    try {
      accessToken = extractAccessToken(preprGraphqlUrl())
    } catch {
      accessToken = null
    }

  return (
      <html lang="en">
      <head>
        {accessToken && <PreprTrackingPixel id={accessToken}/>}
      </head>
      <body className={ubuntu.className}>
        <NavBar/>
        {children}
      </body>
    </html>
  );
}