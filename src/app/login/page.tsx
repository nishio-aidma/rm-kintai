"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  // 👑 進化：2回目以降は自動でログインをスキップする魔法（完全ログインレス仕様）
  useEffect(() => {
    const sessionStr = localStorage.getItem("session");
    if (sessionStr) {
      // すでにログインした記憶（合言葉）がメモ帳にあれば、フォームを見せずに直接トップ画面へジャンプ！
      router.push("/");
    } else {
      // メモ帳が空っぽ（初回やログアウト後）の時だけ、入力フォームを優しく表示する
      setIsChecking(false);
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    if (!email.trim() || !email.includes("@")) {
      setErrorMessage("正しいメールアドレスを入力してください。");
      setIsSubmitting(false);
      return;
    }

    if (!lastName.trim() || !firstName.trim()) {
      setErrorMessage("苗字と名前は必須です。");
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          lastName: lastName.trim(),
          firstName: firstName.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || "ログインに失敗しました。");
        setIsSubmitting(false);
        return;
      }

      // セッション（合言葉）をメモ帳に保存
      localStorage.setItem("session", JSON.stringify(data.session));

      setSuccessMessage("ログインしました");

      // トップ画面へ移動
      router.push("/");

    } catch (error: any) {
      console.error(error);
      setErrorMessage("通信エラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  // メモ帳を確認している一瞬（0.1秒）のチラつきを防ぐための安全装置
  if (isChecking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center font-sans text-xs px-4">
        <p className="text-gray-400 animate-pulse">ログイン情報を確認中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center font-sans text-xs px-4">
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-sm border border-gray-100 space-y-6 text-center">

<div className="flex flex-col items-center">
  {/* 👑 ログイン画面のテキストロゴも存在感のあるアイコン画像に差し替え */}
  <img 
    src="/icon_rmkintai.png" 
    alt="ダコック ロゴ" 
    className="h-20 w-auto mb-3" // 画面中央なので大きめに配置
  />
  <p className="text-gray-400 font-medium">ダコック 業務管理システム</p>
</div>

        {errorMessage && (
          <div className="bg-red-50 text-red-700 font-semibold p-3 rounded-xl border border-red-100 text-left">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="bg-emerald-50 text-emerald-800 font-semibold p-3 rounded-xl border border-emerald-100 text-left">
            {successMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-left font-bold text-gray-500">

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-400 block">苗字</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full border rounded-xl px-3 py-2"
              />
            </div>

            <div>
              <label className="text-[10px] text-gray-400 block">名前</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full border rounded-xl px-3 py-2"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-gray-400 block">メール</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-xl px-3 py-2"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-emerald-400 text-white font-bold py-3 rounded-2xl"
          >
            {isSubmitting ? "処理中..." : "ログイン"}
          </button>

        </form>
      </div>
    </div>
  );
}