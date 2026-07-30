'use client'

import Logo from '@/components/logo'
import Link from 'next/link'
import Button from "@/components/button";

export default function NavBar() {
  const navItems = [
    {
      text: 'Find a car',
      href: '/catalog',
    },
    {
      text: 'About Acme',
      href: '#',
    },
    {
      text: 'Blog',
      href: '#',
    },
    {
      text: 'Contacts',
      href: '#',
    },
    {
      text: <Button buttonStyle='secondary'>CALCULATOR</Button>,
      href: '#',
    },
  ]

  return (
    <header className="bg-primary-100 py-4">
      <nav aria-label="Global">
        <div className="mx-auto max-w-8xl p-spacing flex items-center justify-between">
          <a href='/'>
                        <span className='flex md:hidden'>
                            <Logo text={false} />
                        </span>
            <span className='hidden md:flex'>
                            <Logo />
                        </span>
          </a>
          <ul className='flex flex-wrap items-center justify-center gap-8 lg:gap-12'>
            {navItems.map((item, index) => (
              <li key={index}>
                <Link
                  href={item.href}>
                  {item.text}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </header>
  )
}