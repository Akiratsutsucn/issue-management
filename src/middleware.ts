import { NextResponse, type NextRequest } from "next/server";

// 只做粗筛：无会话 cookie 则跳登录。会话有效性在服务端逐请求校验。
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/health") return NextResponse.next();
  if (!req.cookies.get("idesk_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "未登录" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

// /api/upload 与 /api/import 不经中间件（避免大文件请求体被中间件缓冲截断），路由内自行鉴权
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|api/upload|api/import).*)"] };
