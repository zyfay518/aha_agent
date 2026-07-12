"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function login(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: value(formData, "email"),
    password: value(formData, "password"),
  });

  if (error) redirect(`/login?error=${encodeURIComponent("邮箱或密码不正确")}`);
  redirect("/wardrobe");
}

export async function signup(formData: FormData) {
  const password = value(formData, "password");
  if (password.length < 8) redirect(`/signup?error=${encodeURIComponent("密码至少需要 8 位")}`);

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: value(formData, "email"),
    password,
    options: { data: { display_name: value(formData, "display_name") } },
  });

  if (error) redirect(`/signup?error=${encodeURIComponent("注册失败，请检查邮箱或稍后重试")}`);
  redirect("/login?message=" + encodeURIComponent("注册成功，请检查邮箱并完成验证"));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
