"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { attendanceRepository } from "@/lib/attendanceRepository";

// 🍏 【見やすさ＆操作性大幅向上版】ドラムロール選択UIコンポーネント
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

  // 初期表示時に選択値へスクロール
  useEffect(() => {
    if (containerRef.current) {
      const index = options.indexOf(value);
      if (index !== -1) {
        containerRef.current.scrollTop = index * 40;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleScroll = () => {
    if (containerRef.current) {
      const currentScroll = containerRef.current.scrollTop;
      const index = Math.round(currentScroll / 40);
      if (options[index] && options[index] !== value) {
        onChange(options[index]);
      }
    }
  };

  // 数字を直接クリックした際にもその数字へジャンプ
  const handleItemClick = (opt: string, index: number) => {
    onChange(opt);
    if (containerRef.current) {
      containerRef.current.scrollTop = index * 40;
    }
  };

  return (
    <div className="relative h-[160px] w-20 overflow-hidden select-none">
      {/* 中央の選択帯（くっきり見やすい中央枠） */}
      <div className="absolute top-[60px] left-0 right-0 h-[40px] bg-emerald-50 border-y-2 border-emerald-500 rounded-lg pointer-events-none z-10" />

      {/* スクロールする数字一覧 */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto snap-y snap-mandatory scroll-smooth cursor-pointer [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] py-[60px]"
      >
        {options.map((opt, idx) => (
          <div
            key={opt}
            onClick={() => handleItemClick(opt, idx)}
            className={`h-[40px] flex items-center justify-center snap-center transition-all ${
              opt === value
                ? "text-2xl text-gray-900 font-black z-20"
                : "text-base text-gray-500 font-semibold hover:text-gray-800"
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

  // 業務開始の時間選択モーダル制御（デフォルト 09:00）
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

  const handleOpenStartModal = () => {
    setStartHourInput("09");
    setStartMinuteInput("00");
    setShowStartModal(true);
  };

  // 1分微調整用のヘルパー関数
  const adjustMinute = (currentMinStr: string, delta: number, setMinFunc: (val: string) => void) => {
    const current = parseInt(currentMinStr, 10);
    let next = (current + delta + 60) % 60;
    setMinFunc(String(next).padStart(2, '0'));
  };

  const handleProceedToStartConfirm = () => {
    setShowStartModal(false);
    setShowStartConfirmModal(true);
  };

  const handleConfirmStartWork = async () => {
    if (!userId) return;
    try {
      const todayStr = currentTime.getFullYear() + "-" + String(currentTime.getMonth() + 1).padStart(2, '0') + "-" + String(currentTime.getDate()).padStart(2, '0');
      
      const selectedTimeStr = `${startHourInput}:${startMinuteInput}`;
      const actualTimeStr = String(currentTime.getHours()).padStart(2, '0') + ":" + String(currentTime.getMinutes()).padStart(2, '0');

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
    } catch (error) {
      setStatusMessage("エラー：業務開始データの保存に失敗しました。");
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
    const selectedEndTimeStr = `${endHourInput}:${endMinuteInput}`;
    
    if (currentStartTimeStr) {
      const [startH, startM] = currentStartTimeStr.split(":").map(Number);
      const [endH, endM] = selectedEndTimeStr.split(":").map(Number);
      const totalWorkMinutes = (endH * 60 + endM) - (startH * 60 + startM);

      if (totalWorkMinutes <= 0) {
        setStatusMessage("⚠️ エラー：終了時間は開始時間よりも後の時間を指定してください。");
        setTimeout(() => setStatusMessage(null), 5000);
        return;
      }

      if (breakMinutesInput >= totalWorkMinutes) {
        setStatusMessage(`⚠️ エラー：休憩時間（${breakMinutesInput}分）が稼働時間（${totalWorkMinutes}分）以上になっています。`);
        setTimeout(() => setStatusMessage(null), 5000);
        return;
      }
    }

    setShowEndModal(false);
    setShowEndConfirmModal(true);
  };

  const handleConfirmEndWork = async () => {
    if (!currentStampId) return;
    try {
      const selectedEndTimeStr = `${endHourInput}:${endMinuteInput}`;
      const actualTimeStr = String(currentTime.getHours()).padStart(2, '0') + ":" + String(currentTime.getMinutes()).padStart(2, '0');

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
    } catch (error) {
      setStatusMessage("エラー：業務終了データの保存に失敗しました。");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          <img 
            src="/icon_rmkintai.png" 
            alt="ダコック ロゴ" 
            onClick={() => router.push("/")} 
            className="h-9 w-auto cursor-pointer transition-transform hover:scale-105" 
          />
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${userRole === "owner" ? "bg-gray-800 text-white" : "bg-emerald-50 text-emerald-600"}`}>
            {userRole === "owner" ? "オーナー権限ログイン中" : "ダコック 業務管理システム"}
          </span>
        </div>
        
        <div className="flex items-center space-x-4">
          {(userRole === "admin" || userRole === "owner") && (
            <button onClick={() => router.push("/admin")} className="text-xs font-semibold text-gray-700 hover:text-gray-900 bg-gray-100 px-4 py-2 rounded-xl transition-all">
              管理者画面を開く
            </button>
          )}
          <button onClick={() => router.push("/records")} className="text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-4 py-2 rounded-xl transition-all">
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
        
        <div className="bg-white rounded-[40px] p-8 sm:p-12 shadow-sm border border-gray-100 text-center space-y-10">
          
          <div className="space-y-4">
            <p className="text-base text-gray-400 font-semibold tracking-widest">
              {isMounted ? formatDate(currentTime) : "----年--月--日"}
            </p>
            <h2 className="text-7xl font-bold text-gray-800 tabular-nums tracking-tighter">
              {isMounted ? formatTime(currentTime) : "--:--:--"}
            </h2>
            <div className="h-1 w-12 bg-gray-200 mx-auto rounded-full my-4"></div>
            <p className="text-xl font-bold text-gray-700">
              {userName ? `${userName} さん、今日もありがとうございます！` : "今日もありがとうございます！"}
            </p>

            {workState === "working" && (userRole === "owner" || userRole === "admin") && currentStartTimeStr && (
              <p className="text-xs font-medium text-emerald-600 bg-emerald-50 py-1.5 px-4 rounded-full inline-block animate-fadeIn">
                内部計測中（選択開始時刻: {currentStartTimeStr}）
              </p>
            )}
          </div>

          {statusMessage && (
            <div className="max-w-md mx-auto bg-emerald-50 text-emerald-800 border border-emerald-100 px-6 py-4 rounded-2xl text-sm font-semibold animate-fadeIn">
              {statusMessage}
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-center items-stretch space-y-4 sm:space-y-0 sm:space-x-4 max-w-lg mx-auto">
            <button 
              onClick={handleOpenStartModal} 
              disabled={workState === "working"} 
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-lg py-5 rounded-2xl shadow-sm transition-all disabled:opacity-20 disabled:scale-100 cursor-pointer"
            >
              業務開始
            </button>
            <button 
              onClick={handleOpenEndModal} 
              disabled={workState !== "working"} 
              className="flex-1 bg-gray-800 hover:bg-gray-900 text-white font-semibold text-lg py-5 rounded-2xl shadow-sm transition-all disabled:opacity-20 disabled:scale-100 cursor-pointer"
            >
              業務終了
            </button>
          </div>
        </div>

        <div className="relative max-w-2xl mx-auto group">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-gray-100 rotate-45 rounded-sm"></div>
          
          <div className="relative bg-gray-100 text-gray-700 p-8 rounded-[35px] text-center transform transition-transform group-hover:scale-[1.01]">
            <div className="flex items-center justify-center space-x-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Message from Owner</span>
            </div>
            <p className="text-sm font-semibold leading-relaxed whitespace-pre-wrap">
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
              <h4 className="text-lg font-bold text-gray-800">開始時間</h4>
              <p className="text-xs text-gray-400">スクロールまたはボタンで分を調整してください</p>
            </div>

            {/* 時間ピッカー本体 ＋ 1分単位微調整ボタン */}
            <div className="space-y-4">
              <div className="flex items-center justify-center space-x-3 bg-gray-50/80 p-3 rounded-3xl border border-gray-100 w-[240px] mx-auto">
                {/* 時ドラム */}
                <ScrollWheelPicker
                  options={hoursOptions}
                  value={startHourInput}
                  onChange={setStartHourInput}
                />
                
                <span className="text-2xl font-bold text-gray-800 pb-1">:</span>

                {/* 分ドラム ＋ 上下微調整ボタン */}
                <div className="flex items-center space-x-1">
                  <ScrollWheelPicker
                    options={minutesOptions}
                    value={startMinuteInput}
                    onChange={setStartMinuteInput}
                  />
                  <div className="flex flex-col space-y-1">
                    <button
                      type="button"
                      onClick={() => adjustMinute(startMinuteInput, 1, setStartMinuteInput)}
                      className="w-7 h-7 bg-white hover:bg-emerald-50 text-gray-600 hover:text-emerald-600 border border-gray-200 rounded-lg text-xs font-bold flex items-center justify-center shadow-sm active:scale-95 transition-all"
                      title="1分進める"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustMinute(startMinuteInput, -1, setStartMinuteInput)}
                      className="w-7 h-7 bg-white hover:bg-emerald-50 text-gray-600 hover:text-emerald-600 border border-gray-200 rounded-lg text-xs font-bold flex items-center justify-center shadow-sm active:scale-95 transition-all"
                      title="1分戻す"
                    >
                      ▼
                    </button>
                  </div>
                </div>
              </div>

              {/* 分数ショートカットボタン */}
              <div className="flex justify-center space-x-2 pt-1">
                {["00", "15", "30", "45"].map((min) => (
                  <button
                    key={min}
                    type="button"
                    onClick={() => setStartMinuteInput(min)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                      startMinuteInput === min
                        ? "bg-emerald-500 text-white shadow-sm"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {min}分
                  </button>
                ))}
              </div>
            </div>

            <div className="flex space-x-3 pt-2">
              <button onClick={() => setShowStartModal(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold py-3.5 rounded-xl text-sm transition-all">キャンセル</button>
              <button onClick={handleProceedToStartConfirm} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3.5 rounded-xl text-sm transition-all">次へ</button>
            </div>
          </div>
        </div>
      )}

      {/* 🟢 2. 業務開始：確認モーダル */}
      {showStartConfirmModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-[32px] p-8 max-w-sm w-full mx-4 shadow-xl text-center space-y-6">
            <div className="space-y-2">
              <h4 className="text-lg font-semibold text-gray-800">開始時間の確認</h4>
              <p className="text-4xl font-bold text-emerald-600 tracking-wider my-6 font-mono">
                {startHourInput}:{startMinuteInput}
              </p>
              <p className="text-xs text-gray-500">
                この時間で業務を開始します。<br/>よろしいですか？
              </p>
            </div>

            <div className="flex flex-col space-y-2 pt-2">
              <button onClick={handleConfirmStartWork} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3.5 rounded-xl text-sm transition-all">確定して送信</button>
              <button onClick={() => { setShowStartConfirmModal(false); setShowStartModal(true); }} className="w-full bg-white text-emerald-600 font-semibold py-3.5 rounded-xl text-sm transition-all">修正する</button>
            </div>
          </div>
        </div>
      )}

      {/* ⬛ 3. 業務終了モーダル */}
      {showEndModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-[32px] p-8 max-w-sm w-full mx-4 shadow-xl text-center space-y-6">
            <div className="space-y-1">
              <h4 className="text-lg font-bold text-gray-800">終了と休憩時間</h4>
              <p className="text-xs text-gray-400">スクロールまたはボタンで分を調整してください</p>
            </div>

            <div className="space-y-5">
              {/* 終了時間のドラム ＋ 微調整ボタン */}
              <div className="space-y-3">
                <div className="flex items-center justify-center space-x-3 bg-gray-50/80 p-3 rounded-3xl border border-gray-100 w-[240px] mx-auto">
                  <ScrollWheelPicker
                    options={hoursOptions}
                    value={endHourInput}
                    onChange={setEndHourInput}
                  />
                  <span className="text-2xl font-bold text-gray-800 pb-1">:</span>
                  <div className="flex items-center space-x-1">
                    <ScrollWheelPicker
                      options={minutesOptions}
                      value={endMinuteInput}
                      onChange={setEndMinuteInput}
                    />
                    <div className="flex flex-col space-y-1">
                      <button
                        type="button"
                        onClick={() => adjustMinute(endMinuteInput, 1, setEndMinuteInput)}
                        className="w-7 h-7 bg-white hover:bg-emerald-50 text-gray-600 hover:text-emerald-600 border border-gray-200 rounded-lg text-xs font-bold flex items-center justify-center shadow-sm active:scale-95 transition-all"
                        title="1分進める"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustMinute(endMinuteInput, -1, setEndMinuteInput)}
                        className="w-7 h-7 bg-white hover:bg-emerald-50 text-gray-600 hover:text-emerald-600 border border-gray-200 rounded-lg text-xs font-bold flex items-center justify-center shadow-sm active:scale-95 transition-all"
                        title="1分戻す"
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                </div>

                {/* 分数ショートカットボタン */}
                <div className="flex justify-center space-x-2">
                  {["00", "15", "30", "45"].map((min) => (
                    <button
                      key={min}
                      type="button"
                      onClick={() => setEndMinuteInput(min)}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
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

              {/* 休憩時間の選択 */}
              <div className="bg-gray-50/80 p-3 rounded-2xl border border-gray-100 flex items-center justify-between px-4">
                <span className="text-xs text-gray-500 font-semibold">休憩時間</span>
                <select 
                  value={breakMinutesInput}
                  onChange={(e) => setBreakMinutesInput(Number(e.target.value))}
                  className="text-sm font-bold bg-transparent focus:outline-none cursor-pointer text-gray-800 text-right"
                >
                  <option value={0}>なし（0分）</option>
                  <option value={15}>15分</option>
                  <option value={30}>30分</option>
                  <option value={45}>45分</option>
                  <option value={60}>60分</option>
                  <option value={90}>90分</option>
                  <option value={120}>120分</option>
                </select>
              </div>
            </div>

            <div className="flex space-x-3 pt-2">
              <button onClick={() => setShowEndModal(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold py-3.5 rounded-xl text-sm transition-all">キャンセル</button>
              <button onClick={handleProceedToEndConfirm} className="flex-1 bg-gray-800 hover:bg-gray-900 text-white font-semibold py-3.5 rounded-xl text-sm transition-all">次へ</button>
            </div>
          </div>
        </div>
      )}

      {/* ⬛ 4. 業務終了：確認モーダル */}
      {showEndConfirmModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-[32px] p-8 max-w-sm w-full mx-4 shadow-xl text-center space-y-6">
            <div className="space-y-2">
              <h4 className="text-lg font-semibold text-gray-800">終了時間の確認</h4>
              
              <div className="py-6 space-y-1">
                <p className="text-sm text-gray-500">終了時間 <span className="text-3xl font-bold text-gray-800 ml-2 font-mono">{endHourInput}:{endMinuteInput}</span></p>
                <p className="text-sm text-gray-500 pt-2">休憩時間 <span className="text-xl font-bold text-gray-800 ml-2 font-mono">{breakMinutesInput}分</span></p>
              </div>
              
              <p className="text-xs text-gray-500">
                この内容で本日の業務を終了します。
              </p>
            </div>

            <div className="flex flex-col space-y-2 pt-2">
              <button onClick={handleConfirmEndWork} className="w-full bg-gray-800 hover:bg-gray-900 text-white font-semibold py-3.5 rounded-xl text-sm transition-all">確定して送信</button>
              <button onClick={() => { setShowEndConfirmModal(false); setShowEndModal(true); }} className="w-full bg-white text-gray-600 font-semibold py-3.5 rounded-xl text-sm transition-all">修正する</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}