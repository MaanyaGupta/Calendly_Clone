'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import './Sidebar.css';

const navItems = [
  { href: '/', label: 'Scheduling', icon: '🔗' },
  { href: '/meetings', label: 'Meetings', icon: '📅' },
  { href: '/availability', label: 'Availability', icon: '🕐' },
];

export default function Sidebar() {
  const pathname = usePathname();

  // Don't show sidebar on public booking pages
  const isPublicPage = pathname && !['/', '/meetings', '/availability', '/event-types'].some(
    route => pathname === route || pathname.startsWith(route + '/')
  );
  if (isPublicPage) return null;

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="logo-circle">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="2"/>
                <path d="M8 12L11 15L16 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="logo-text">Calendly</span>
          </div>
        </div>

        <Link href="/?create=true" className="sidebar-create-btn">
          <span>+</span> Create
        </Link>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href === '/' && pathname === '/') ||
              (item.href !== '/' && pathname?.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-bottom-nav">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href === '/' && pathname === '/') ||
            (item.href !== '/' && pathname?.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mobile-nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="mobile-nav-icon">{item.icon}</span>
              <span className="mobile-nav-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
