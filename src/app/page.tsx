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
  const [userName, setUserName] = useState<string>("読み込み中...");
  const [userId, setUserId] = useState<string>("");
  const [userRole, setUserRole] = useState<"user" | "admin" | "owner">("user");

  const [workState, setWorkState] = useState<"not_started" | "working" | "finished">("not_started");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [currentStampId, setCurrentStampId] = useState<string | null>(null);
  
  const [showEndModal, setShowEndModal] = useState<boolean>(false);
  const [breakMinutesInput, setBreakMinutesInput] = useState<number>(0);
  
  const [currentStartTimeStr, setCurrentStartTimeStr] = useState<string>("");

  // オーナーが設定したカスタムメッセージを保管するステート
  const [customFooterMessage, setCustomFooterMessage] = useState<string>("");

  // ⏱️ 1秒ごとに時計を動かすタイマー
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const checkLoginAndLoadData = async () => {
      const sessionStr = localStorage.getItem("session");

      if (sessionStr) {
        try {
          const session = JSON.parse(sessionStr);
          const email = session.email || "";
          setUserEmail(email);
          setUserId(session.memberId || "");

          const now = new Date();
          const todayStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0') + "-" + String(now.getDate()).padStart(2, '0');

          // 💡 【大改造】Promise.all を使って、これまで数珠つなぎ（直列）だった3つの重い通信を一斉に同時スタート！
          const [memberMeta, settings, latest] = await Promise.all([
            attendanceRepository.getMemberByEmail(email),
            attendanceRepository.getDashboardSettings(),
            attendanceRepository.getTodayLatestRecord(email, todayStr)
          ]);

          // 1. メンバー名の設定
          if (memberMeta && memberMeta.name) {
            setUserName(memberMeta.name);
          } else {
            setUserName(email.split("@")[0]);
          }

          // 2. オーナーカスタムメッセージの設定
          if (settings && settings.footerMessage) {
            setCustomFooterMessage(settings.footerMessage);
          }

          // 3. 今日最新の打刻履歴の復元
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

          // 4. 権限判定（西尾さんは最上位のowner）
          if (email === "nishio@aidma-hd.jp") {
            setUserRole("owner");
          } else {
            if (memberMeta && memberMeta.isOwnerProxy) {
              setUserRole("owner");
            } else if (memberMeta && memberMeta.role === "admin") {
              setUserRole("admin");
            } else {
              setUserRole("user");
            }
          }

        } catch (error) {
          console.error("ログイン情報の読み込みに失敗しました:", error);
          router.push("/login");
        } finally {
          setIsLoading(false);
        }
      } else {
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
        userName: userName,
        email: userEmail,
        workDate: todayStr,
        startTime: timeStr,
        breakMinutes: 0,
      });

      setCurrentStampId(stampId);
      setCurrentStartTimeStr(timeStr);
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
          setStatusMessage(`⚠️ エラー：休憩時間（${breakMinutesInput}分）が実際の稼働時間（${totalWorkMinutes}分）以上になっています。`);
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
          <span onClick={() => router.push("/")} className="text-2xl font-bold text-gray-800 tracking-tight cursor-pointer">あ～るえむ</span>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${userRole === "owner" ? "bg-gray-800 text-white" : "bg-emerald-50 text-emerald-600"}`}>
            {userRole === "owner" ? "オーナー権限ログイン中" : "RM事業部 業務管理システム"}
          </span>
        </div>
        
        <div className="flex items-center space-x-4">
          {(userRole === "admin" || userRole === "owner") && (
            <button onClick={() => router.push("/admin")} className="text-xs font-bold text-gray-700 hover:text-gray-900 bg-gray-100 px-4 py-2 rounded-xl transition-all">
              管理者画面を開く
            </button>
          )}
          <button onClick={() => router.push("/records")} className="text-xs font-bold text-emerald-500 bg-emerald-50 px-4 py-2 rounded-xl transition-all">
            自分の記録
          </button>
          <button 
            onClick={async () => { 
              localStorage.removeItem("session"); 
              await auth.signOut(); 
              router.push("/login"); 
            }} 
            className="text-xs text-gray-400 hover:text-red-500 font-medium"
          >
            ログアウト
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10 space-y-10">
        {/* 時計・挨拶セクション */}
        <div className="bg-white rounded-[40px] p-10 shadow-sm border border-gray-100 text-center space-y-4">
          <p className="text-sm text-gray-400 font-bold uppercase tracking-widest">{formatDate(currentTime)}</p>
          <h2 className="text-7xl font-black text-gray-800 tabular-nums tracking-tighter">{formatTime(currentTime)}</h2>
          <div className="h-1.5 w-12 bg-emerald-400 mx-auto rounded-full my-4"></div>
          <p className="text-2xl font-extrabold text-gray-700">{userName} さん、今日もありがとうございます！</p>
        </div>

        {/* 打刻ステータス ＆ ボタンセクション */}
        <div className="bg-white rounded-[40px] p-10 shadow-sm border border-gray-100 text-center space-y-8">
          <div className="flex flex-col items-center space-y-2">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">CURRENT STATUS</h3>
            {workState === "working" ? (
              <span className="bg-emerald-500 text-white px-6 py-2 rounded-full text-sm font-black animate-pulse shadow-lg shadow-emerald-100">稼働中</span>
            ) : (
              <span className="bg-gray-100 text-gray-400 px-6 py-2 rounded-full text-sm font-black">開始前</span>
            )}
          </div>

          {statusMessage && (
            <div className="max-w-md mx-auto bg-emerald-50 text-emerald-800 border-2 border-emerald-100 px-6 py-4 rounded-3xl text-sm font-bold animate-fadeIn">{statusMessage}</div>
          )}

          <div className="flex flex-col sm:flex-row justify-center items-stretch space-y-4 sm:space-y-0 sm:space-x-6 max-w-2xl mx-auto">
            <button 
              onClick={handleStartWork} 
              disabled={workState === "working"} 
              className="flex-1 bg-emerald-400 hover:bg-emerald-500 text-white font-black text-2xl py-10 rounded-[32px] shadow-xl shadow-emerald-100 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20 disabled:grayscale disabled:scale-100"
            >
              🚀 業務開始
            </button>
            <button 
              onClick={() => setShowEndModal(true)} 
              disabled={workState !== "working"} 
              className="flex-1 bg-gray-800 hover:bg-gray-900 text-white font-black text-2xl py-10 rounded-[32px] shadow-xl shadow-gray-200 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20 disabled:scale-100"
            >
              🏁 業務終了
            </button>
          </div>
        </div>

        {/* ポップな吹き出し風のカスタムメッセージエリア */}
        <div className="relative max-w-2xl mx-auto group">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-amber-400 rotate-45 rounded-sm"></div>
          
          <div className="relative bg-amber-400 text-amber-950 p-8 rounded-[35px] shadow-lg shadow-amber-100 text-center transform transition-transform group-hover:scale-[1.01]">
            <div className="flex items-center justify-center space-x-2 mb-2">
              <span className="text-2xl">📢</span>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Message from Owner</span>
            </div>
            <p className="text-lg font-black leading-relaxed whitespace-pre-wrap">
              {customFooterMessage || "今日も一日、よろしくお願いいたします！"}
            </p>
          </div>
        </div>
      </main>

      {/* 業務終了モーダル */}
      {showEndModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-[40px] p-10 max-w-sm w-full mx-4 shadow-2xl border border-gray-100 text-center space-y-8">
            <div className="space-y-2">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto text-3xl">☕</div>
              <h4 className="text-xl font-black text-gray-800">業務終了の確認</h4>
              <p className="text-xs text-gray-400 font-bold">本日の休憩・中抜け時間を選択してください</p>
            </div>

            <div className="bg-gray-50 p-2 rounded-[25px] border-2 border-gray-100">
              <select 
                value={breakMinutesInput}
                onChange={(e) => setBreakMinutesInput(Number(e.target.value))}
                className="w-full text-center text-xl font-black bg-transparent py-4 focus:outline-none cursor-pointer text-gray-700"
              >
                <option value={0}>なし</option>
                <option value={15}>15分</option>
                <option value={30}>30分</option>
                <option value={45}>45分</option>
                <option value={60}>60分（1時間）</option>
              </select>
            </div>

            <div className="flex space-x-4">
              <button onClick={() => { setShowEndModal(false); setBreakMinutesInput(0); }} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-500 font-black py-4 rounded-[20px] text-sm transition-all">戻る</button>
              <button onClick={handleEndWork} className="flex-1 bg-emerald-400 hover:bg-emerald-500 text-white font-black py-4 rounded-[20px] text-sm shadow-lg shadow-emerald-100 transition-all">確定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}