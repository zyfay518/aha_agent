import Link from "next/link";
import { login } from "@/app/auth/actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams;
  return (
    <section className="auth-card">
      <h1>登录衣橱</h1>
      <p>继续管理你已经拥有的单品。</p>
      {params.error && <div className="notice error">{params.error}</div>}
      {params.message && <div className="notice success">{params.message}</div>}
      <form action={login}>
        <label>邮箱<input name="email" type="email" autoComplete="email" required /></label>
        <label>密码<input name="password" type="password" autoComplete="current-password" required /></label>
        <button className="button primary" type="submit">登录</button>
      </form>
      <p className="auth-foot">还没有账号？<Link href="/signup">立即注册</Link></p>
    </section>
  );
}
