"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth } from "@/lib/firebase";
import { attendanceRepository } from "@/lib/attendanceRepository";

// 🍏 ドラムロール選択UIコンポーネント
function ScrollWheelPicker({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (val: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isAutoScrolling = useRef(false);

  useEffect(() => {
    if (containerRef.current) {
      const index = options.indexOf(value);
      if (index !== -1) {
        isAutoScrolling.current = true;
        containerRef.current.scrollTo({ top: index * 40, behavior: 'auto' });
        
        setTimeout(() => {
          isAutoScrolling.current = false;
        }, 50);
      }
    }
  }, [value, options]);

  const handleScroll = () => {
    if (isAutoScrolling.current) return;

    if (containerRef.current) {
      const currentScroll = containerRef.current.scrollTop;
      const index = Math.round(currentScroll / 40);
      if (options[index] && options[index] !== value) {
        onChange(options[index]);
      }
    }
  };

  const handleItemClick = (opt: string) => {
    onChange(opt);
  };

  return (
    <div className="relative h-[160px] w-20 overflow-hidden select-none bg-gray-50/50 rounded-2xl border border-gray-100">
      <div className="absolute top-[60px] left-1 right-1 h-[40px] bg-[#34C759]/15 border-2 border-[#34C759] rounded-xl pointer-events-none z-0" />
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="relative z-10 h-full overflow-y-auto snap-y snap-mandatory cursor-pointer [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] py-[60px]"
      >
        {options.map((opt) => (
          <div
            key={opt}
            onClick={() => handleItemClick(opt)}
            className={`h-[40px] flex items-center justify-center snap-center transition-all tabular-nums font-mono ${
              opt === value
                ? "text-2xl text-gray-900 font-black tracking-tight"
                : "text-base text-gray-400 font-medium hover:text-gray-700"
            }`}
          >
            {opt}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams(); // 💡 URLパラメータを取得するためのフック

  const [currentTime, setCurrentTime] = useState(new Date());
  const [isMounted, setIsMounted] = useState(false);
  
  const [userEmail, setUserEmail] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [userRole, setUserRole] = useState<"user" | "admin" | "owner">("user");

  const [workState, setWorkState] = useState<"not_started" | "working" | "finished">("not_started");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [currentStampId, setCurrentStampId] = useState<string | null>(null);
  const [currentStartTimeStr, setCurrentStartTimeStr] = useState<string>("");

  const [showStartModal, setShowStartModal] = useState<boolean>(false);
  const [showStartConfirmModal, setShowStartConfirmModal] = useState<boolean>(false);
  const [startHourInput, setStartHourInput] = useState<string>("09");
  const [startMinuteInput, setStartMinuteInput] = useState<string>("00");

  const [showEndModal, setShowEndModal] = useState<boolean>(false);
  const [showEndConfirmModal, setShowEndConfirmModal] = useState<boolean>(false);
  const [endHourInput, setEndHourInput] = useState<string>("18");
  const [endMinuteInput, setEndMinuteInput] = useState<string>("00");

  const [customFooterMessage, setCustomFooterMessage] = useState<string>("");

  // 💡 未終了記録の警告モーダル表示用ステート
  const [showUnfinishedWarning, setShowUnfinishedWarning] = useState<boolean>(false);

  const hoursOptions = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutesOptions = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  useEffect(() => {
    setIsMounted(true);
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

          if (session.cachedName) setUserName(session.userName || session.cachedName);
          if (session.cachedRole) setUserRole(session.userRole || session.cachedRole);
          if (session.cachedMessage) setCustomFooterMessage(session.customFooterMessage || session.cachedMessage);

          const now = new Date();
          const todayStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0') + "-" + String(now.getDate()).padStart(2, '0');

          const [memberMeta, settings, latest] = await Promise.all([
            attendanceRepository.getMemberByEmail(email),
            attendanceRepository.getDashboardSettings(),
            attendanceRepository.getTodayLatestRecord(email, todayStr)
          ]);

          let finalName = email.split("@")[0];
          if (memberMeta && memberMeta.name) {
            finalName = memberMeta.name;
          }
          setUserName(finalName);

          let finalMessage = "";
          if (settings && settings.footerMessage) {
            finalMessage = settings.footerMessage;
            setCustomFooterMessage(finalMessage);
          }

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

          // 💡 過去の「未終了」データがないかチェックする
          const db = require("@/lib/firebase").db;
          const { collection, query, where, getDocs } = require("firebase/firestore");
          const q = query(
            collection(db, "attendance_records"),
            where("email", "==", email),
            where("endTime", "==", ""),
            where("deleted", "==", false)
          );
          const querySnapshot = await getDocs(q);
          
          let hasOldUnfinished = false;
          querySnapshot.forEach((doc: any) => {
            const data = doc.data();
            // 今日以外の未終了データがあればフラグを立てる
            if (data.workDate !== todayStr) {
              hasOldUnfinished = true;
            }
          });

          if (hasOldUnfinished) {
            setShowUnfinishedWarning(true);
          }

          let finalRole: "user" | "admin" | "owner" = "user";
          if (email === "nishio@aidma-hd.jp") {
            finalRole = "owner";
          } else {
            if (memberMeta && memberMeta.isOwnerProxy) {
              finalRole = "owner";
            } else if (memberMeta && memberMeta.role === "admin") {
              finalRole = "admin";
            }
          }
          setUserRole(finalRole);

          session.cachedName = finalName;
          session.cachedRole = finalRole;
          session.cachedMessage = finalMessage;
          localStorage.setItem("session", JSON.stringify(session));

          // 💡 URLパラメータの確認 (action=end なら終了モーダルを自動で開く)
          if (searchParams?.get("action") === "end") {
            handleOpenEndModal();
          }

        } catch (error) {
          console.error("ログイン情報の読み込みに失敗しました:", error);
          router.push("/login");
        }
      } else {
        router.push("/login");
      }
    };

    checkLoginAndLoadData();
  }, [router, searchParams]); // 💡 searchParams を依存配列に追加

  const formatTime = (date: Date) => date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const formatDate = (date: Date) => date.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" });

  const handleOpenStartModal = () => {
    const now = new Date();
    const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
    const nineAMMinutes = 9 * 60;

    if (currentTotalMinutes <= nineAMMinutes) {
      setStartHourInput("09");
      setStartMinuteInput("00");
    } else {
      setStartHourInput(String(now.getHours()).padStart(2, '0'));
      setStartMinuteInput(String(now.getMinutes()).padStart(2, '0'));
    }
    setShowStartModal(true);
  };

  const adjustHour = (currentHourStr: string, delta: number, setHourFunc: (val: string) => void) => {
    const current = parseInt(currentHourStr, 10);
    let next = (current + delta + 24) % 24;
    setHourFunc(String(next).padStart(2, '0'));
  };

  const adjustMinute = (currentMinStr: string, delta: number, setMinFunc: (val: string) => void) => {
    const current = parseInt(currentMinStr, 10);
    let next = (current + delta + 60) % 60;
    setMinFunc(String(next).padStart(2, '0'));
  };

  const handleProceedToStartConfirm = () => {
    const now = new Date();
    const selectedStartTotalMinutes = parseInt(startHourInput, 10) * 60 + parseInt(startMinuteInput, 10);
    const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();

    if (selectedStartTotalMinutes < currentTotalMinutes) {
      const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setStatusMessage(`⚠️ エラー：現在の時刻（${nowStr}）より過去の時間で業務を開始することはできません。`);
      setTimeout(() => setStatusMessage(null), 6000);
      return;
    }

    setShowStartModal(false);
    setShowStartConfirmModal(true);
  };

  const handleConfirmStartWork = async () => {
    if (!userId) return;

    const now = new Date();
    const selectedStartTotalMinutes = parseInt(startHourInput, 10) * 60 + parseInt(startMinuteInput, 10);
    const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();

    if (selectedStartTotalMinutes < currentTotalMinutes) {
      const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setShowStartConfirmModal(false);
      setShowStartModal(true);
      setStatusMessage(`⚠️ エラー：時刻が過ぎたため、指定された時間は過去の時間になっています（現在時刻: ${nowStr}）。`);
      setTimeout(() => setStatusMessage(null), 6000);
      return;
    }

    try {
      const todayStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0') + "-" + String(now.getDate()).padStart(2, '0');
      
      const selectedTimeStr = `${startHourInput}:${startMinuteInput}`;
      const actualTimeStr = String(now.getHours()).padStart(2, '0') + ":" + String(now.getMinutes()).padStart(2, '0');

      setStatusMessage("業務開始データを送信中...");
      setShowStartConfirmModal(false);

      const stampId = await attendanceRepository.saveStartRecord({
        userId: userId,
        userName: userName,
        email: userEmail,
        workDate: todayStr,
        startTime: selectedTimeStr,
        actualStartTime: actualTimeStr,
      });

      setCurrentStampId(stampId);
      setCurrentStartTimeStr(selectedTimeStr);
      setWorkState("working");
      setStatusMessage(`業務を開始しました！`);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (error: any) {
      const errorMsg = error?.message || "エラー：業務開始データの保存に失敗しました。";
      setStatusMessage(errorMsg);
      setTimeout(() => setStatusMessage(null), 7000);
    }
  };

  const handleOpenEndModal = () => {
    const now = new Date();
    setEndHourInput(String(now.getHours()).padStart(2, '0'));
    setEndMinuteInput(String(now.getMinutes()).padStart(2, '0'));
    setShowEndModal(true);
  };

  const handleProceedToEndConfirm = () => {
    const now = new Date();
    const selectedEndTotalMinutes = parseInt(endHourInput, 10) * 60 + parseInt(endMinuteInput, 10);
    const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();

    if (selectedEndTotalMinutes > currentTotalMinutes) {
      setStatusMessage("⚠️ エラー：現在の時刻よりも未来の時間は選択できません。");
      setTimeout(() => setStatusMessage(null), 6000);
      return;
    }

    if (currentStartTimeStr) {
      const [startH, startM] = currentStartTimeStr.split(":").map(Number);
      const totalWorkMinutes = selectedEndTotalMinutes - (startH * 60 + startM);

      if (totalWorkMinutes <= 0) {
        setStatusMessage("⚠️ エラー：終了時間は開始時間よりも後の時間を指定してください。");
        setTimeout(() => setStatusMessage(null), 6000);
        return;
      }
    }

    setShowEndModal(false);
    setShowEndConfirmModal(true);
  };

  const handleConfirmEndWork = async () => {
    if (!currentStampId) return;
    try {
      const now = new Date();
      const selectedEndTimeStr = `${endHourInput}:${endMinuteInput}`;
      const actualTimeStr = String(now.getHours()).padStart(2, '0') + ":" + String(now.getMinutes()).padStart(2, '0');

      setStatusMessage("業務終了データを送信中...");
      setShowEndConfirmModal(false);

      await attendanceRepository.saveEndRecord(
        currentStampId, 
        selectedEndTimeStr, 
        0, 
        actualTimeStr
      );

      setWorkState("not_started");
      setCurrentStampId(null);
      setCurrentStartTimeStr("");
      setStatusMessage(`お疲れ様でした！本日の業務終了を記録しました。`);
      
      // 💡 もしURLパラメータに ?action=end があった場合は、完了後にURLを綺麗にする
      if (searchParams?.get("action") === "end") {
        router.replace("/");
      }

      setTimeout(() => setStatusMessage(null), 4000);
    } catch (error: any) {
      const errorMsg = error?.message || "エラー：業務終了データの保存に失敗しました。";
      setStatusMessage(errorMsg);
      setTimeout(() => setStatusMessage(null), 7000);
    }
  };

  return (
    <div 
      className="min-h-screen bg-gray-50 text-gray-800 antialiased relative"
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif'
      }}
    >
      {/* 👑 最前面エラー・ステータス通知バナー */}
      {statusMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-md shadow-2xl transition-all animate-fadeIn">
          <div className="bg-gray-900/95 backdrop-blur-md text-white border border-gray-700 px-6 py-4 rounded-2xl text-xs sm:text-sm font-bold text-center tracking-tight leading-relaxed shadow-emerald-500/10">
            {statusMessage}
          </div>
        </div>
      )}

      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${userRole === "owner" ? "bg-gray-800 text-white" : "bg-[#34C759]/10 text-[#34C759]"}`}>
            {userRole === "owner" ? "オーナー権限ログイン中" : "ダコック 業務管理システム"}
          </span>
        </div>
        
        <div className="flex items-center space-x-4">
          {(userRole === "admin" || userRole === "owner") && (
            <button onClick={() => router.push("/admin")} className="text-xs font-semibold text-gray-700 hover:text-gray-900 bg-gray-100 px-4 py-2 rounded-xl transition-all">
              管理者画面を開く
            </button>
          )}
          <button onClick={() => router.push("/records")} className="text-xs font-semibold text-[#34C759] bg-[#34C759]/10 hover:bg-[#34C759]/20 px-4 py-2 rounded-xl transition-all">
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

      <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        
        <div className="bg-white rounded-[32px] p-8 sm:p-10 shadow-sm border border-gray-100 text-center space-y-8">
          
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              {isMounted ? formatDate(currentTime) : "----年--月--日"}
            </p>

            <div className="inline-flex items-center space-x-2 bg-gray-50/80 px-4 py-1.5 rounded-full border border-gray-100 shadow-inner">
              <span className="w-2 h-2 rounded-full bg-[#34C759] animate-pulse"></span>
              <span className="text-xl font-black text-gray-800 font-mono tracking-tight tabular-nums">
                {isMounted ? formatTime(currentTime) : "--:--:--"}
              </span>
            </div>

            <p className="text-2xl font-bold text-gray-800 pt-3 tracking-tight">
              {userName ? `${userName} さん、今日もありがとうございます！` : "今日もありがとうございます！"}
            </p>

            {workState === "working" && currentStartTimeStr && (
              <div className="pt-1">
                <p className="text-xs font-bold text-[#34C759] bg-[#34C759]/10 border border-[#34C759]/20 py-1.5 px-4 rounded-full inline-block animate-fadeIn">
                  選択開始時刻: {currentStartTimeStr}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row justify-center items-stretch space-y-3 sm:space-y-0 sm:space-x-4 max-w-md mx-auto">
            <button 
              onClick={handleOpenStartModal} 
              disabled={workState === "working"} 
              className="flex-1 bg-[#34C759] hover:bg-[#2FB350] text-white font-bold text-base py-4 rounded-2xl shadow-sm hover:shadow-md transition-all disabled:opacity-20 disabled:scale-100 cursor-pointer"
            >
              業務開始
            </button>
            <button 
              onClick={handleOpenEndModal} 
              disabled={workState !== "working"} 
              className="flex-1 bg-gray-800 hover:bg-gray-900 text-white font-bold text-base py-4 rounded-2xl shadow-sm hover:shadow-md transition-all disabled:opacity-20 disabled:scale-100 cursor-pointer"
            >
              業務終了
            </button>
          </div>
        </div>

        <div className="relative max-w-2xl mx-auto group">
          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-5 h-5 bg-gray-100 rotate-45 rounded-sm"></div>
          
          <div className="relative bg-gray-100 text-gray-700 p-6 rounded-[28px] text-center transform transition-transform group-hover:scale-[1.005]">
            <div className="flex items-center justify-center space-x-2 mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Message from Owner</span>
            </div>
            <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">
              {customFooterMessage || "今日も一日、よろしくお願いいたします！"}
            </p>
          </div>
        </div>
      </main>

      {/* 🟢 1. 業務開始モーダル */}
      {showStartModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-[32px] p-8 max-w-sm w-full mx-4 shadow-xl text-center space-y-6">
            <div className="space-y-1">
              <h4 className="text-lg font-bold text-gray-800 tracking-tight">開始時間</h4>
              <p className="text-xs text-gray-400">スクロールまたはボタンで時間を調整してください</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-center space-x-2.5 bg-white p-2 rounded-3xl border border-gray-100 max-w-[280px] mx-auto shadow-inner">
                <div className="flex items-center space-x-1.5">
                  <div className="flex flex-col space-y-1">
                    <button
                      type="button"
                      onClick={() => adjustHour(startHourInput, 1, setStartHourInput)}
                      className="w-7 h-7 bg-gray-100 hover:bg-[#34C759] text-gray-600 hover:text-white border border-gray-200 rounded-lg text-xs font-bold flex items-center justify-center shadow-sm active:scale-95 transition-all cursor-pointer"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustHour(startHourInput, -1, setStartHourInput)}
                      className="w-7 h-7 bg-gray-100 hover:bg-[#34C759] text-gray-600 hover:text-white border border-gray-200 rounded-lg text-xs font-bold flex items-center justify-center shadow-sm active:scale-95 transition-all cursor-pointer"
                    >
                      ▼
                    </button>
                  </div>
                  <ScrollWheelPicker options={hoursOptions} value={startHourInput} onChange={setStartHourInput} />
                </div>
                
                <span className="text-2xl font-black text-gray-800 pb-1 font-mono">:</span>

                <div className="flex items-center space-x-1.5">
                  <ScrollWheelPicker options={minutesOptions} value={startMinuteInput} onChange={setStartMinuteInput} />
                  <div className="flex flex-col space-y-1">
                    <button
                      type="button"
                      onClick={() => adjustMinute(startMinuteInput, 1, setStartMinuteInput)}
                      className="w-7 h-7 bg-gray-100 hover:bg-[#34C759] text-gray-600 hover:text-white border border-gray-200 rounded-lg text-xs font-bold flex items-center justify-center shadow-sm active:scale-95 transition-all cursor-pointer"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustMinute(startMinuteInput, -1, setStartMinuteInput)}
                      className="w-7 h-7 bg-gray-100 hover:bg-[#34C759] text-gray-600 hover:text-white border border-gray-200 rounded-lg text-xs font-bold flex items-center justify-center shadow-sm active:scale-95 transition-all cursor-pointer"
                    >
                      ▼
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-center space-x-2 pt-1">
                {["00", "15", "30", "45"].map((min) => (
                  <button
                    key={min}
                    type="button"
                    onClick={() => setStartMinuteInput(min)}
                    className={`px-3 py-1 rounded-xl text-xs font-extrabold transition-all cursor-pointer font-mono ${
                      startMinuteInput === min
                        ? "bg-[#34C759] text-white shadow-sm"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {min}分
                  </button>
                ))}
              </div>
            </div>

            <div className="flex space-x-3 pt-2">
              <button onClick={() => setShowStartModal(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold py-3.5 rounded-xl text-sm transition-all cursor-pointer">キャンセル</button>
              <button onClick={handleProceedToStartConfirm} className="flex-1 bg-[#34C759] hover:bg-[#2FB350] text-white font-semibold py-3.5 rounded-xl text-sm transition-all cursor-pointer">次へ</button>
            </div>
          </div>
        </div>
      )}

      {/* 🟢 2. 業務開始：確認モーダル */}
      {showStartConfirmModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-[32px] p-8 max-w-sm w-full mx-4 shadow-xl text-center space-y-6">
            <div className="space-y-2">
              <h4 className="text-lg font-bold text-gray-800 tracking-tight">開始時間の確認</h4>
              
              <p className="text-5xl font-black text-[#34C759] tracking-tight my-6 font-mono tabular-nums">
                {startHourInput}:{startMinuteInput}
              </p>
              
              <p className="text-xs text-gray-500 font-medium">
                この時間で業務を開始します。<br/>よろしいですか？
              </p>
            </div>

            <div className="flex flex-col space-y-2 pt-2">
              <button onClick={handleConfirmStartWork} className="w-full bg-[#34C759] hover:bg-[#2FB350] text-white font-bold py-3.5 rounded-xl text-sm transition-all cursor-pointer shadow-sm">確定して送信</button>
              <button onClick={() => { setShowStartConfirmModal(false); setShowStartModal(true); }} className="w-full bg-white text-[#34C759] font-bold py-3.5 rounded-xl text-sm transition-all cursor-pointer">修正する</button>
            </div>
          </div>
        </div>
      )}

      {/* ⬛ 3. 業務終了モーダル */}
      {showEndModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-[32px] p-8 max-w-sm w-full mx-4 shadow-xl text-center space-y-6">
            <div className="space-y-1">
              <h4 className="text-lg font-bold text-gray-800 tracking-tight">終了時間</h4>
              <p className="text-xs text-gray-400">終了時間を選択してください</p>
            </div>

            <div className="space-y-5">
              <div className="space-y-3">
                <div className="flex items-center justify-center space-x-2.5 bg-white p-2 rounded-3xl border border-gray-100 max-w-[280px] mx-auto shadow-inner">
                  <div className="flex items-center space-x-1.5">
                    <div className="flex flex-col space-y-1">
                      <button
                        type="button"
                        onClick={() => adjustHour(endHourInput, 1, setEndHourInput)}
                        className="w-7 h-7 bg-gray-100 hover:bg-[#34C759] text-gray-600 hover:text-white border border-gray-200 rounded-lg text-xs font-bold flex items-center justify-center shadow-sm active:scale-95 transition-all cursor-pointer"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustHour(endHourInput, -1, setEndHourInput)}
                        className="w-7 h-7 bg-gray-100 hover:bg-[#34C759] text-gray-600 hover:text-white border border-gray-200 rounded-lg text-xs font-bold flex items-center justify-center shadow-sm active:scale-95 transition-all cursor-pointer"
                      >
                        ▼
                      </button>
                    </div>
                    <ScrollWheelPicker options={hoursOptions} value={endHourInput} onChange={setEndHourInput} />
                  </div>

                  <span className="text-2xl font-black text-gray-800 pb-1 font-mono">:</span>

                  <div className="flex items-center space-x-1.5">
                    <ScrollWheelPicker options={minutesOptions} value={endMinuteInput} onChange={setEndMinuteInput} />
                    <div className="flex flex-col space-y-1">
                      <button
                        type="button"
                        onClick={() => adjustMinute(endMinuteInput, 1, setEndMinuteInput)}
                        className="w-7 h-7 bg-gray-100 hover:bg-[#34C759] text-gray-600 hover:text-white border border-gray-200 rounded-lg text-xs font-bold flex items-center justify-center shadow-sm active:scale-95 transition-all cursor-pointer"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustMinute(endMinuteInput, -1, setEndMinuteInput)}
                        className="w-7 h-7 bg-gray-100 hover:bg-[#34C759] text-gray-600 hover:text-white border border-gray-200 rounded-lg text-xs font-bold flex items-center justify-center shadow-sm active:scale-95 transition-all cursor-pointer"
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-center space-x-2">
                  {["00", "15", "30", "45"].map((min) => (
                    <button
                      key={min}
                      type="button"
                      onClick={() => setEndMinuteInput(min)}
                      className={`px-3 py-1 rounded-xl text-xs font-extrabold transition-all cursor-pointer font-mono ${
                        endMinuteInput === min
                          ? "bg-gray-800 text-white shadow-sm"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {min}分
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex space-x-3 pt-2">
              <button 
                onClick={() => {
                  setShowEndModal(false);
                  if (searchParams?.get("action") === "end") router.replace("/"); // パラメータがあれば綺麗にする
                }} 
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold py-3.5 rounded-xl text-sm transition-all cursor-pointer"
              >
                キャンセル
              </button>
              <button onClick={handleProceedToEndConfirm} className="flex-1 bg-gray-800 hover:bg-gray-900 text-white font-semibold py-3.5 rounded-xl text-sm transition-all cursor-pointer">次へ</button>
            </div>
          </div>
        </div>
      )}

      {/* ⬛ 4. 業務終了：確認モーダル */}
      {showEndConfirmModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-[32px] p-8 max-w-sm w-full mx-4 shadow-xl text-center space-y-6">
            <div className="space-y-2">
              <h4 className="text-lg font-bold text-gray-800 tracking-tight">終了時間の確認</h4>
              <div className="py-6 space-y-2">
                <p className="text-sm text-gray-500 font-medium">終了時間 <span className="text-4xl font-black text-gray-900 ml-2 font-mono tracking-tight tabular-nums">{endHourInput}:{endMinuteInput}</span></p>
              </div>
              <p className="text-xs text-gray-500 font-medium">
                この内容で本日の業務を終了します。
              </p>
            </div>

            <div className="flex flex-col space-y-2 pt-2">
              <button onClick={handleConfirmEndWork} className="w-full bg-gray-800 hover:bg-gray-900 text-white font-bold py-3.5 rounded-xl text-sm transition-all cursor-pointer shadow-sm">確定して送信</button>
              <button onClick={() => { setShowEndConfirmModal(false); setShowEndModal(true); }} className="w-full bg-white text-[#34C759] font-bold py-3.5 rounded-xl text-sm transition-all cursor-pointer">修正する</button>
            </div>
          </div>
        </div>
      )}

      {/* 🚨 5. 【新規】未終了レコード警告モーダル */}
      {showUnfinishedWarning && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[999] animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full mx-4 shadow-2xl border border-gray-100 text-center space-y-5 animate-scaleUp">
            <div className="w-12 h-12 mx-auto rounded-full bg-amber-50 text-amber-500 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>

            <div className="space-y-1">
              <h4 className="text-base font-black text-gray-900 tracking-tight">未終了の稼働記録があります！</h4>
              <p className="text-[11px] font-bold text-gray-600 mt-2 leading-relaxed text-left bg-amber-50/50 p-3 rounded-xl border border-amber-100">
                昨日以前に「業務終了」が押されていない記録が残っています。<br/><br/>
                <span className="text-amber-700">仮の時間で昨日の最終終了時間を登録した上で、当日の業務を開始してください。</span><br/>
                昨日の業務終了時間の変更は、管理者に終了時間の変更を申請ください。
              </p>
            </div>

            <div className="pt-2">
              <button 
                type="button"
                onClick={() => setShowUnfinishedWarning(false)} 
                className="w-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-black py-3.5 rounded-xl shadow-sm transition-all shadow-amber-100"
              >
                確認した
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}