"use server";

import { redirect } from "next/navigation";
import { login, logout } from "@/lib/server/auth";

export async function loginAction(_prev: { error: string }, fd: FormData): Promise<{ error: string }> {
  const email = String(fd.get("email") ?? "").slice(0, 200);
  const password = String(fd.get("password") ?? "").slice(0, 200);
  if (!email || !password) return { error: "请填写邮箱和密码" };
  const r = await login(email, password);
  if (!r.ok) return { error: r.error };
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/login");
}
