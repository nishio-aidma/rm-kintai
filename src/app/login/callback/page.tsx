"use client";

import { useEffect, useState } from "react";
import { isSignInWithEmailLink, signInWithEmailLink } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

export default function LoginCallbackPage() {
  const router = useRouter();
  const [statusMessage, setStatusMessage] = useState("ログイン処理を行っています...");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    // 1. 画面が開いた瞬間、このURLが本当に「Firebaseから届いた正しいメールリンクか」をチェックします
    if (isSignInWithEmailLink(auth, window.location.href)) {
      
      // 2. ログイン画面で一時保存しておいた、その人のメールアドレスをブラウザの記憶から取り出します
      let email = window.localStorage.getItem("emailForSignIn");
      
      // 3. 万が一、ブラウザの記憶が消えていた場合は、画面上で「もう一度アドレスを入れてね」と優しく確認します
      if (!email) {
        email = window.prompt("確認のため、もう一度メールアドレスを入力してください：");
      }

      if (email) {
        // 4. 本物の鍵（URL）とメールアドレスを合わせて、Firebaseに「ログインを承認して！」と送ります
        signInWithEmailLink(auth, email, window.location.href)
          .then((result) => {
            // ログイン大成功！
            window.localStorage.removeItem("emailForSignIn"); // 使い終わった一時保存の記憶は消去します
            setStatusMessage("ログインに成功しました！ダッシュボードへ移動します...");
            
            // 5. ログインができたので、メイン画面（ダッシュボード）へ自動的にジャンプさせます
            // ※ダッシュボード画面は次のフェーズで作るので、まずは動くことを優先してトップページを指定します
            setTimeout(() => {
              router.push("/");
            }, 1500);
          })
          .catch((error) => {
            // 鍵が古かったり、エラーが起きた場合
            console.error("メールリンク認証エラー:", error);
            setIsError(true);
            setStatusMessage("ログインリンクの有効期限が切れているか、すでに使用されています。お手数ですが、もう一度ログイン画面からやり直してください。");
          });
      } else {
        setIsError(true);
        setStatusMessage("メールアドレスの確認が取れなかったため、ログインを中止しました。");
      }
    } else {
      setIsError(true);
      setStatusMessage("不正なアクセス、または無効なログインリンクです。");
    }
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      {/* デザインガイドに合わせた、柔らかいミントグリーンのアクセントを持った案内カード */}
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm border border-gray-100 text-center">
        <div className="mb-6 flex justify-center">
          {/* ローディング中、またはエラー時の丸いアイコンの代わり */}
          <div className={`h-12 w-12 rounded-full border-4 ${isError ? "border-red-200 bg-red-50 text-red-500" : "border-emerald-200 bg-emerald-50 text-emerald-500"} flex items-center justify-center text-xl font-bold`}>
            {isError ? "!" : "✓"}
          </div>
        </div>
        
        {/* メッセージ本文 */}
        <p className={`text-base font-medium ${isError ? "text-red-600" : "text-gray-700"} leading-relaxed`}>
          {statusMessage}
        </p>

        {isError && (
          <button
            onClick={() => router.push("/login")}
            className="mt-6 bg-emerald-400 hover:bg-emerald-500 text-white font-medium px-6 py-2 rounded-2xl shadow-sm transition-all text-sm"
          >
            ログイン画面に戻る
          </button>
        )}
      </div>
    </div>
  );
}