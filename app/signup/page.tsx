import Link from "next/link";
import { signup } from "@/app/auth/actions";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <section className="auth-card">
      <h1>建立线上衣橱</h1>
      <p>先从你最常穿的十件单品开始。</p>
      {params.error && <div className="notice error">{params.error}</div>}
      <form action={signup}>
        <label>称呼<input name="display_name" type="text" maxLength={80} required /></label>
        <label>邮箱<input name="email" type="email" autoComplete="email" required /></label>
        <label>密码<input name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
        <button className="button primary" type="submit">创建账号</button>
      </form>
      <p className="auth-foot">已有账号？<Link href="/login">登录</Link></p>
    </section>
  );
}
