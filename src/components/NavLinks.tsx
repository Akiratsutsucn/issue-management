"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "概览" },
  { href: "/issues", label: "课题" },
  { href: "/customers", label: "客户" },
  { href: "/reminders", label: "提醒" },
  { href: "/evidence", label: "证据库" },
  { href: "/import", label: "导入" },
];

export default function NavLinks() {
  const path = usePathname();
  const isOn = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <nav className="nav" aria-label="主导航">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={isOn(l.href) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
