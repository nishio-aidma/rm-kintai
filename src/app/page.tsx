"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { attendanceRepository } from "@/lib/attendanceRepository";

// 🍏 ドラムロール選択UIコンポーネント（引き戻しバグ防止機構付き）
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
      {/* 中央のAppleグリーン選択枠 */}
      <div className="absolute top-[60px] left-1 right-1 h-[40px] bg-[#34C759]/15 border-2 border-[#34C759] rounded-xl pointer-events-none z-0" />

      {/* スクロールする数字一覧 */}
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

  // 業務開始の時間選択モーダル制御
  const [showStartModal, setShowStartModal] = useState<boolean>(false);
  const [showStartConfirmModal, setShowStartConfirmModal] = useState<boolean>(false);
  const [startHourInput, setStartHourInput] = useState<string>("09");
  const [startMinuteInput, setStartMinuteInput] = useState<string>("00");

  // 業務終了の時間・休憩選択モーダル制御
  const [showEndModal, setShowEndModal] = useState<boolean>(false);
  const [showEndConfirmModal, setShowEndConfirmModal] = useState<boolean>(false);
  const [endHourInput, setEndHourInput] = useState<string>("18");
  const [endMinuteInput, setEndMinuteInput] = useState<string>("00");
  const [breakMinutesInput, setBreakMinutesInput] = useState<number>(0);

  const [customFooterMessage, setCustomFooterMessage] = useState<string>("");

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

        } catch (error) {
          console.error("ログイン情報の読み込みに失敗しました:", error);
          router.push("/login");
        }
      } else {
        router.push("/login");
      }
    };

    checkLoginAndLoadData();
  }, [router]);

  const formatTime = (date: Date) => date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const formatDate = (date: Date) => date.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" });

  // 💡 9:00以前なら「09:00」、9:01以降なら「現在時刻」を初期設定するスマート制御
  const handleOpenStartModal = () => {
    const now = new Date();
    const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
    const nineAMMinutes = 9 * 60; // 09:00 = 540分

    if (currentTotalMinutes <= nineAMMinutes) {
      // 09:00以前（例: 08:30や09:00）の場合はデフォルト「09:00」を表示
      setStartHourInput("09");
      setStartMinuteInput("00");
    } else {
      // 09:01以降の場合は現在の時刻をデフォルト表示
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

  // 🔒 業務開始モーダルで「次へ」を押した時の判定（現在時刻より過去であれば即時ブロック）
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

  // 🔒 「確定して送信」を押した瞬間の判定（二重チェック）
  const handleConfirmStartWork = async () => {
    if (!userId) return;

    const now = new Date();
    const selectedStartTotalMinutes = parseInt(startHourInput, 10) * 60 + parseInt(startMinuteInput, 10);
    const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();

    // 確認モーダルで時間を置いた結果、過去時間になってしまっていないかチェック
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
        breakMinutes: 0,
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
    setBreakMinutesInput(0);
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

      if (breakMinutesInput >= totalWorkMinutes) {
        setStatusMessage(`⚠️ エラー：休憩時間（${breakMinutesInput}分）が稼働時間（${totalWorkMinutes}分）以上になっています。`);
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
        breakMinutesInput, 
        actualTimeStr
      );

      setWorkState("not_started");
      setCurrentStampId(null);
      setCurrentStartTimeStr("");
      setBreakMinutesInput(0);
      setStatusMessage(`お疲れ様でした！本日の業務終了を記録しました。`);
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
                      title="1時間進める"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustHour(startHourInput, -1, setStartHourInput)}
                      className="w-7 h-7 bg-gray-100 hover:bg-[#34C759] text-gray-600 hover:text-white border border-gray-200 rounded-lg text-xs font-bold flex items-center justify-center shadow-sm active:scale-95 transition-all cursor-pointer"
                      title="1時間戻す"
                    >
                      ▼
                    </button>
                  </div>
                  <ScrollWheelPicker
                    options={hoursOptions}
                    value={startHourInput}
                    onChange={setStartHourInput}
                  />
                </div>
                
                <span className="text-2xl font-black text-gray-800 pb-1 font-mono">:</span>

                <div className="flex items-center space-x-1.5">
                  <ScrollWheelPicker
                    options={minutesOptions}
                    value={startMinuteInput}
                    onChange={setStartMinuteInput}
                  />
                  <div className="flex flex-col space-y-1">
                    <button
                      type="button"
                      onClick={() => adjustMinute(startMinuteInput, 1, setStartMinuteInput)}
                      className="w-7 h-7 bg-gray-100 hover:bg-[#34C759] text-gray-600 hover:text-white border border-gray-200 rounded-lg text-xs font-bold flex items-center justify-center shadow-sm active:scale-95 transition-all cursor-pointer"
                      title="1分進める"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustMinute(startMinuteInput, -1, setStartMinuteInput)}
                      className="w-7 h-7 bg-gray-100 hover:bg-[#34C759] text-gray-600 hover:text-white border border-gray-200 rounded-lg text-xs font-bold flex items-center justify-center shadow-sm active:scale-95 transition-all cursor-pointer"
                      title="1分戻す"
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
              <h4 className="text-lg font-bold text-gray-800 tracking-tight">終了と休憩時間</h4>
              <p className="text-xs text-gray-400">終了時間と休憩時間を選択してください</p>
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
                        title="1時間進める"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustHour(endHourInput, -1, setEndHourInput)}
                        className="w-7 h-7 bg-gray-100 hover:bg-[#34C759] text-gray-600 hover:text-white border border-gray-200 rounded-lg text-xs font-bold flex items-center justify-center shadow-sm active:scale-95 transition-all cursor-pointer"
                        title="1時間戻す"
                      >
                        ▼
                      </button>
                    </div>
                    <ScrollWheelPicker
                      options={hoursOptions}
                      value={endHourInput}
                      onChange={setEndHourInput}
                    />
                  </div>

                  <span className="text-2xl font-black text-gray-800 pb-1 font-mono">:</span>

                  <div className="flex items-center space-x-1.5">
                    <ScrollWheelPicker
                      options={minutesOptions}
                      value={endMinuteInput}
                      onChange={setEndMinuteInput}
                    />
                    <div className="flex flex-col space-y-1">
                      <button
                        type="button"
                        onClick={() => adjustMinute(endMinuteInput, 1, setEndMinuteInput)}
                        className="w-7 h-7 bg-gray-100 hover:bg-[#34C759] text-gray-600 hover:text-white border border-gray-200 rounded-lg text-xs font-bold flex items-center justify-center shadow-sm active:scale-95 transition-all cursor-pointer"
                        title="1分進める"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustMinute(endMinuteInput, -1, setEndMinuteInput)}
                        className="w-7 h-7 bg-gray-100 hover:bg-[#34C759] text-gray-600 hover:text-white border border-gray-200 rounded-lg text-xs font-bold flex items-center justify-center shadow-sm active:scale-95 transition-all cursor-pointer"
                        title="1分戻す"
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

              <div className="space-y-1.5 text-left bg-gray-50/80 p-3.5 rounded-2xl border border-gray-100">
                <div className="flex justify-between items-center mb-1 px-0.5">
                  <span className="text-xs font-bold text-gray-500">休憩時間</span>
                  <span className="text-xs font-black text-gray-800 font-mono">
                    {breakMinutesInput === 0 ? "なし（0分）" : `${breakMinutesInput}分`}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "なし", value: 0 },
                    { label: "15分", value: 15 },
                    { label: "30分", value: 30 },
                    { label: "45分", value: 45 },
                    { label: "60分", value: 60 },
                    { label: "90分", value: 90 },
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setBreakMinutesInput(item.value)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        breakMinutesInput === item.value
                          ? "bg-gray-800 text-white shadow-sm scale-[1.02]"
                          : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200/60"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex space-x-3 pt-2">
              <button onClick={() => setShowEndModal(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold py-3.5 rounded-xl text-sm transition-all cursor-pointer">キャンセル</button>
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
                <p className="text-sm text-gray-500 font-medium pt-1">休憩時間 <span className="text-xl font-bold text-gray-800 ml-2 font-mono tracking-tight tabular-nums">{breakMinutesInput === 0 ? "なし" : `${breakMinutesInput}分`}</span></p>
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

    </div>
  );
}