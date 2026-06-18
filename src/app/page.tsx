"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { attendanceRepository } from "@/lib/attendanceRepository";

export default function DashboardPage() {
  const router = useRouter();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);
  
  const [userEmail, setUserEmail] = useState<string>("読み込み中...");
  // 💡 【新設】ログインしたスタッフの本名を保管する部屋
  const [userName, setUserName] = useState<string>("読み込み中...");
  const [userId, setUserId] = useState<string>("");
  const [userRole, setUserRole] = useState<"user" | "admin" | "owner">("user");

  const [workState, setWorkState] = useState<"not_started" | "working" | "finished">("not_started");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [currentStampId, setCurrentStampId] = useState<string | null>(null);
  
  const [showEndModal, setShowEndModal] = useState<boolean>(false);
  const [breakMinutesInput, setBreakMinutesInput] = useState<number>(0);
  
  const [currentStartTimeStr, setCurrentStartTimeStr] = useState<string>("");

  // ⏱️ 1秒ごとに時計を動かすタイマー仕様（100%完全保持）
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 👑 修正：Firebase公式の見張り番から、ローカルストレージの「合言葉チェック」へ変更してループを破壊
  useEffect(() => {
    const checkLoginAndLoadData = async () => {
      // パソコン内のメモ帳からログイン証明書（合言葉）を取得
      const sessionStr = localStorage.getItem("session");

      if (sessionStr) {
        try {
          const session = JSON.parse(sessionStr);
          const email = session.email || "";
          setUserEmail(email);
          setUserId(session.memberId || "");

          // 💡 【機能追加】データベースからログインユーザーの登録情報を直接取得して名前をセット
          const memberMeta = await attendanceRepository.getMemberByEmail(email);
          if (memberMeta && memberMeta.name) {
            setUserName(memberMeta.name); // データベースに本名があればそれをセット
          } else {
            setUserName(email.split("@")[0]); // 万が一名前が空ならアドレスの前の部分を出す安心ガード
          }

          // 👑 【仕様100%保持】西尾さんは最上位のowner
          if (email === "nishio@aidma-hd.jp") {
            setUserRole("owner");
          } else {
            // 👑 【仕様100%保持】もしowner代理(isOwnerProxy)に☑があれば最強のowner権限を付与
            if (memberMeta && memberMeta.isOwnerProxy) {
              setUserRole("owner");
            } else if (memberMeta && memberMeta.role === "admin") {
              setUserRole("admin");
            } else {
              setUserRole("user");
            }
          }

          // 👑 【仕様100%保持】今日の最新の打刻履歴を自動で復元するロジック
          const now = new Date();
          const todayStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0') + "-" + String(now.getDate()).padStart(2, '0');
          const latest = await attendanceRepository.getTodayLatestRecord(email, todayStr);
          if (latest) {
            if (latest.endTime === "") {
              setWorkState("working");
              setCurrentStampId(latest.id);
              setCurrentStartTimeStr(latest.startTime || "");
            } else {
              setWorkState("not_started");
            }
          } else {
            setWorkState("not_started");
          }
        } catch (error) {
          console.error("ログイン情報の読み込みに失敗しました:", error);
          router.push("/login");
        } finally {
          setIsLoading(false);
        }
      } else {
        // メモ帳（合言葉）がなければ、未ログインと判断してログイン画面へ強制移動
        router.push("/login");
      }
    };

    checkLoginAndLoadData();
  }, [router]);

  const formatTime = (date: Date) => date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const formatDate = (date: Date) => date.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" });

  const handleStartWork = async () => {
    if (!userId) return;
    try {
      const todayStr = currentTime.getFullYear() + "-" + String(currentTime.getMonth() + 1).padStart(2, '0') + "-" + String(currentTime.getDate()).padStart(2, '0');
      const timeStr = String(currentTime.getHours()).padStart(2, '0') + ":" + String(currentTime.getMinutes()).padStart(2, '0');

      setStatusMessage("データを送信中...");
      const stampId = await attendanceRepository.saveStartRecord({
        userId: userId,
        userName: userName, // 💡 メールの削り出しではなく、データベース上の正確な本名で打刻履歴に残るよう改良！
        email: userEmail,
        workDate: todayStr,
        startTime: timeStr,
        breakMinutes: 0,
      });

      setCurrentStampId(stampId);
      setCurrentStartTimeStr(timeStr);
      setWorkState("working");
      setWorkState("working");
      setStatusMessage("業務を開始しました！今日もがんばりましょう。");
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (error) {
      setStatusMessage("エラー：業務開始データの保存に失敗しました。");
    }
  };

  const handleEndWork = async () => {
    if (!currentStampId) return;
    try {
      const timeStr = String(currentTime.getHours()).padStart(2, '0') + ":" + String(currentTime.getMinutes()).padStart(2, '0');
      
      if (currentStartTimeStr && timeStr) {
        const [startH, startM] = currentStartTimeStr.split(":").map(Number);
        const [endH, endM] = timeStr.split(":").map(Number);
        const totalWorkMinutes = (endH * 60 + endM) - (startH * 60 + startM);

        if (breakMinutesInput >= totalWorkMinutes && totalWorkMinutes > 0) {
          // 👑 開発方針徹底：Windows標準の嫌な alert ポップアップを撤廃し、画面内の美しいエラー表示に統合
          setStatusMessage(`⚠️ エラー：休憩時間（${breakMinutesInput}分）が実際の稼働時間（${totalWorkMinutes}分）以上になっています。正しい時間を選択してください。`);
          setShowEndModal(false);
          setTimeout(() => setStatusMessage(null), 6000);
          return;
        }
      }

      setStatusMessage("終了データを送信中...");
      await attendanceRepository.saveEndRecord(currentStampId, timeStr, breakMinutesInput);

      setWorkState("not_started");
      setCurrentStampId(null);
      setCurrentStartTimeStr("");
      setBreakMinutesInput(0);
      setShowEndModal(false);
      setStatusMessage("お疲れ様でした！本日の業務終了を記録しました。");
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (error) {
      setStatusMessage("エラー：業務終了データの保存に失敗しました。");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400 animate-pulse">権限を確認中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          <span className="text-2xl font-bold text-gray-800 tracking-tight">あ～るえむ</span>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${userRole === "owner" ? "bg-gray-800 text-white" : "bg-emerald-50 text-emerald-600"}`}>
            {userRole === "owner" ? "オーナー権限ログイン中" : "RM事業部 業務管理システム"}
          </span>
        </div>
        
        <div className="flex items-center space-x-4 flex-shrink-0">
          {(userRole === "admin" || userRole === "owner") && (
            <button onClick={() => router.push("/admin")} className="text-sm font-semibold text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-xl transition-all whitespace-nowrap">
              管理者画面（実績一覧）を開く
            </button>
          )}
          <button onClick={() => router.push("/records")} className="text-sm font-semibold text-emerald-500 hover:text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-4 py-2 rounded-xl transition-all whitespace-nowrap">
            自分の業務記録を見る
          </button>
          {/* 👑 修正：ログアウト時にローカルストレージの古い合言葉のメモ帳もしっかり破棄する仕様に最適化 */}
          <button 
            onClick={async () => { 
              localStorage.removeItem("session"); 
              await auth.signOut(); 
              router.push("/login"); 
            }} 
            className="text-sm text-gray-400 hover:text-red-500 transition-colors font-medium whitespace-nowrap"
          >
            ログアウト
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 text-center space-y-4">
          <p className="text-sm text-gray-400 font-medium">{formatDate(currentTime)}</p>
          <h2 className="text-5xl font-bold text-gray-800 tracking-wider tabular-nums">{formatTime(currentTime)}</h2>
          <div className="h-px w-16 bg-emerald-100 mx-auto my-2"></div>
          {/* 💡 【差し替え】userEmail から、データベースから抜いてきた美しい userName へ変更！ */}
          <p className="text-xl font-semibold text-gray-700">{userName} さん、今日もありがとうございます</p>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 text-center space-y-6">
          <h3 className="text-base font-medium text-gray-500">あなたの現在のステータス</h3>
          <div className="inline-block">
            {workState === "working" ? (
              <span className="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-2xl text-sm font-semibold animate-pulse">稼働中</span>
            ) : (
              <span className="bg-gray-100 text-gray-600 px-4 py-2 rounded-2xl text-sm font-semibold">開始前</span>
            )}
          </div>

          {statusMessage && (
            <div className="max-w-md mx-auto bg-emerald-50 text-emerald-800 border border-emerald-100 px-4 py-3 rounded-2xl text-sm font-medium animate-fadeIn">{statusMessage}</div>
          )}

          <div className="flex justify-center space-x-4 max-w-md mx-auto">
            <button onClick={handleStartWork} disabled={workState === "working"} className="flex-1 bg-emerald-400 hover:bg-emerald-500 text-white font-semibold py-4 rounded-2xl shadow-sm hover:shadow transition-all disabled:opacity-30">業務開始</button>
            <button onClick={() => setShowEndModal(true)} disabled={workState !== "working"} className="flex-1 bg-gray-700 hover:bg-gray-800 text-white font-semibold py-4 rounded-2xl shadow-sm hover:shadow transition-all disabled:opacity-30">業務終了</button>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 text-center">
          <p className="text-sm font-medium text-gray-600 leading-relaxed">
            今月予定していた業務がすべて終了しましたか？業務記録のページから業務記録の提出をお願いいたします！
          </p>
        </div>
      </main>

      {showEndModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full mx-4 shadow-xl border border-gray-100 text-center space-y-6">
            <div>
              <h4 className="text-lg font-bold text-gray-800">業務終了の確認</h4>
              <p className="text-xs text-gray-400 mt-1">本日の休憩・中抜け時間を選択してください</p>
            </div>

            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <select 
                value={breakMinutesInput}
                onChange={(e) => setBreakMinutesInput(Number(e.target.value))}
                className="w-full text-center text-base font-bold bg-white border border-gray-200 rounded-xl py-2.5 focus:outline-none focus:border-emerald-400 cursor-pointer text-gray-700"
              >
                <option value={0}>0分（休憩なし）</option>
                <option value={15}>15分</option>
                <option value={30}>30分</option>
                <option value={45}>45分</option>
                <option value={60}>60分（1時間）</option>
              </select>
            </div>

            <div className="flex space-x-3">
              <button 
                onClick={() => { setShowEndModal(false); setBreakMinutesInput(0); }}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold py-3 rounded-xl text-sm transition-all"
              >
                キャンセル
              </button>
              <button 
                onClick={handleEndWork}
                className="flex-1 bg-emerald-400 hover:bg-emerald-50 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-sm"
              >
                確定して終了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}