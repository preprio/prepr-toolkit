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
    const accessToken = extractAccessToken(preprGraphqlUrl())
    
  return (
      <html lang="en">
      <head>
        <PreprTrackingPixel id={accessToken!}/>
      </head>
      <body className={ubuntu.className}>
        <NavBar/>
        {children}
      </body>
    </html>
  );
}