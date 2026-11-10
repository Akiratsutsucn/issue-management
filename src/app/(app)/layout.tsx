import Link from "next/link";
import NavLinks from "@/components/NavLinks";
import { logoutAction } from "@/app/login/actions";
import { requireUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = await prisma.notification.count({ where: { userId: user.id, status: "unread" } });
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-row">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden />
              课题管理系统
            </Link>
            <form action="/issues" className="global-search" role="search">
              <input type="search" name="q" placeholder="番号、标题、客户名" aria-label="全局检索" />
              <input type="hidden" name="status" value="all" />
            </form>
            <div className="top-actions">
              <Link href="/issues/new" className="btn btn-primary">新建课题</Link>
              <Link href="/reminders" className="bell" aria-label={`提醒，未读 ${unread} 条`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                  <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                {unread > 0 && <span className="bell-count">{unread > 99 ? "99+" : unread}</span>}
              </Link>
              <details className="user-menu">
                <summary>{user.displayName}</summary>
                <div className="menu-pop">
                  <Link href="/settings">设置</Link>
                  <Link href="/settings/columns">列设置</Link>
                  <Link href="/audit">操作日志</Link>
                  <form action={logoutAction}>
                    <button type="submit">退出登录</button>
                  </form>
                </div>
              </details>
            </div>
          </div>
          <NavLinks />
        </div>
      </header>
      {children}
    </>
  );
}
