"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signInWithCustomToken, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();
  
  // 👑 【新設】Firebaseのチェックが終わるまで画面をロックするステート
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  const [email, setEmail] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // 👑 ログイン済みなら、ロード画面のまま（フォームを見せずに）トップへ即ジャンプ
        router.push("/");
      } else {
        // 👑 未ログインだと100%確定したら、初めてロード画面を解除してフォームを見せる
        setIsCheckingAuth(false);
      }
    });
    return () => unsubscribe();
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
      setErrorMessage("間違いを防ぐため、苗字と名前は必ず両方入力してください。");
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/passwordless", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          lastName: lastName.trim(),
          firstName: firstName.trim()
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "認証に失敗しました。");
        setIsSubmitting(false);
        return;
      }

      const customToken = data.customToken;
      await signInWithCustomToken(auth, customToken);
      
      router.push("/");

    } catch (error: any) {
      console.error("ログイン処理エラー:", error);
      setErrorMessage("通信エラーが発生しました。インターネット接続をご確認ください。");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 👑 【新設】チェックが完了するまではフォームを1ミリも表示させず、ロード画面で隠す
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400 animate-pulse">ログイン状態を確認中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center font-sans text-xs px-4">
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-sm border border-gray-100 space-y-6 text-center">
        <div>
          <h2 className="text-3xl font-black text-gray-800 tracking-tight">あ～るえむ</h2>
          <p className="text-gray-400 mt-1.5 font-medium">RM事業部 業務管理システム</p>
        </div>

        {errorMessage && <div className="bg-red-50 text-red-700 font-semibold p-3 rounded-xl border border-red-100 tracking-tight text-left">{errorMessage}</div>}
        {successMessage && <div className="bg-emerald-50 text-emerald-800 font-semibold p-3 rounded-xl border border-emerald-100 text-left leading-relaxed">{successMessage}</div>}

        <form onSubmit={handleSubmit} className="space-y-4 text-left font-bold text-gray-500">
          
          <div className="grid grid-cols-2 gap-3 animate-fadeIn">
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 font-bold block">苗字 (CSVと同じ)</label>
              <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="例: 山田" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 font-medium text-xs text-gray-700 focus:outline-none focus:border-emerald-400 bg-white" required />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 font-bold block">名前 (CSVと同じ)</label>
              <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="例: 太郎" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 font-medium text-xs text-gray-700 focus:outline-none focus:border-emerald-400 bg-white" required />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-gray-400 font-bold block">ログイン用メールアドレス</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="例: your-account@gmail.com" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 font-medium text-xs text-gray-700 focus:outline-none focus:border-emerald-400 bg-white" required />
          </div>

          <button type="submit" disabled={isSubmitting} className="w-full bg-emerald-400 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-2xl shadow-sm transition-all text-sm disabled:opacity-40 mt-2">
            {isSubmitting ? "処理中..." : "ログイン"}
          </button>
        </form>
      </div>
    </div>
  );
}