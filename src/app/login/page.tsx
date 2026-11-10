import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/");
  return (
    <main className="login-wrap">
      <div className="login-card">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          课题管理系统
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
