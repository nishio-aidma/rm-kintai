"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { attendanceRepository } from "@/lib/attendanceRepository";

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

  // 💡 【新機能】業務開始の時間選択・確認モーダル制御
  const [showStartModal, setShowStartModal] = useState<boolean>(false);
  const [showStartConfirmModal, setShowStartConfirmModal] = useState<boolean>(false);
  const [startHourInput, setStartHourInput] = useState<string>("09");
  const [startMinuteInput, setStartMinuteInput] = useState<string>("00");

  // 💡 【新機能】業務終了の時間・休憩選択・確認モーダル制御
  const [showEndModal, setShowEndModal] = useState<boolean>(false);
  const [showEndConfirmModal, setShowEndConfirmModal] = useState<boolean>(false);
  const [endHourInput, setEndHourInput] = useState<string>("18");
  const [endMinuteInput, setEndMinuteInput] = useState<string>("00");
  const [breakMinutesInput, setBreakMinutesInput] = useState<number>(0);

  // オーナーメッセージ
  const [customFooterMessage, setCustomFooterMessage] = useState<string>("");

  // 00〜23時、00〜59分の選択肢配列を生成
  const hoursOptions = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutesOptions = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  // ⏱️ タイマー＆マウント設定
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

  // 💡 【開始モーダルを開く処理】現在の時刻をあらかじめセレクトの初期値に設定
  const handleOpenStartModal = () => {
    const now = new Date();
    setStartHourInput(String(now.getHours()).padStart(2, '0'));
    setStartMinuteInput(String(now.getMinutes()).padStart(2, '0'));
    setShowStartModal(true);
  };

  // 💡 【開始確認モーダルを開く】
  const handleProceedToStartConfirm = () => {
    setShowStartModal(false);
    setShowStartConfirmModal(true);
  };

  // 💡 【開始確定処理】
  const handleConfirmStartWork = async () => {
    if (!userId) return;
    try {
      const todayStr = currentTime.getFullYear() + "-" + String(currentTime.getMonth() + 1).padStart(2, '0') + "-" + String(currentTime.getDate()).padStart(2, '0');
      const selectedTimeStr = `${startHourInput}:${startMinuteInput}`;

      setStatusMessage("業務開始データを送信中...");
      setShowStartConfirmModal(false);

      const stampId = await attendanceRepository.saveStartRecord({
        userId: userId,
        userName: userName,
        email: userEmail,
        workDate: todayStr,
        startTime: selectedTimeStr,
        breakMinutes: 0,
      });

      setCurrentStampId(stampId);
      setCurrentStartTimeStr(selectedTimeStr);
      setWorkState("working");
      setStatusMessage(`業務を開始しました！ (登録時間: ${selectedTimeStr})`);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (error) {
      setStatusMessage("エラー：業務開始データの保存に失敗しました。");
    }
  };

  // 💡 【終了モーダルを開く処理】
  const handleOpenEndModal = () => {
    const now = new Date();
    setEndHourInput(String(now.getHours()).padStart(2, '0'));
    setEndMinuteInput(String(now.getMinutes()).padStart(2, '0'));
    setBreakMinutesInput(0);
    setShowEndModal(true);
  };

  // 💡 【終了確認モーダルへ進む処理】時間の矛盾チェックを行う
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

  // 💡 【終了確定処理】
  const handleConfirmEndWork = async () => {
    if (!currentStampId) return;
    try {
      const selectedEndTimeStr = `${endHourInput}:${endMinuteInput}`;
      setStatusMessage("業務終了データを送信中...");
      setShowEndConfirmModal(false);

      await attendanceRepository.saveEndRecord(currentStampId, selectedEndTimeStr, breakMinutesInput);

      setWorkState("not_started");
      setCurrentStampId(null);
      setCurrentStartTimeStr("");
      setBreakMinutesInput(0);
      setStatusMessage(`お疲れ様でした！本日の業務終了を記録しました。 (登録時間: ${selectedEndTimeStr})`);
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
        
        {/* 👑 メインコンテナ */}
        <div className="bg-white rounded-[40px] p-8 sm:p-12 shadow-sm border border-gray-100 text-center space-y-10">
          
          {/* 時計・挨拶エリア */}
          <div className="space-y-4">
            <p className="text-base text-gray-400 font-bold uppercase tracking-widest">
              {isMounted ? formatDate(currentTime) : "----年--月--日"}
            </p>
            <h2 className="text-7xl font-black text-gray-800 tabular-nums tracking-tighter">
              {isMounted ? formatTime(currentTime) : "--:--:--"}
            </h2>
            <div className="h-1.5 w-12 bg-emerald-400 mx-auto rounded-full my-4"></div>
            <p className="text-2xl font-extrabold text-gray-700">
              {userName ? `${userName} さん、今日もありがとうございます！` : "今日もありがとうございます！"}
            </p>

            {/* 💡 【表示制御】登録された打刻時刻は管理者（owner/admin）のみ表示 */}
            {workState === "working" && (userRole === "owner" || userRole === "admin") && currentStartTimeStr && (
              <p className="text-xs font-bold text-emerald-600 bg-emerald-50 py-1.5 px-4 rounded-full inline-block animate-fadeIn">
                内部計測中（開始時刻: {currentStartTimeStr}）
              </p>
            )}
          </div>

          {/* システム通知メッセージ */}
          {statusMessage && (
            <div className="max-w-md mx-auto bg-emerald-50 text-emerald-800 border-2 border-emerald-100 px-6 py-4 rounded-3xl text-sm font-bold animate-fadeIn">
              {statusMessage}
            </div>
          )}

          {/* ボタンエリア */}
          <div className="flex flex-col sm:flex-row justify-center items-stretch space-y-4 sm:space-y-0 sm:space-x-6 max-w-xl mx-auto">
            <button 
              onClick={handleOpenStartModal} 
              disabled={workState === "working"} 
              className="flex-1 bg-emerald-400 hover:bg-emerald-500 text-white font-black text-xl py-6 rounded-2xl shadow-xl shadow-emerald-100/50 hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-20 disabled:grayscale disabled:scale-100 cursor-pointer"
            >
              業務開始
            </button>
            <button 
              onClick={handleOpenEndModal} 
              disabled={workState !== "working"} 
              className="flex-1 bg-gray-800 hover:bg-gray-900 text-white font-black text-xl py-6 rounded-2xl shadow-xl shadow-gray-200/50 hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-20 disabled:scale-100 cursor-pointer"
            >
              業務終了
            </button>
          </div>
        </div>

        {/* オーナー伝言板 */}
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

      {/* 🟢 1. 業務開始：時間選択モーダル（転がして選べるドラムUI） */}
      {showStartModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-[40px] p-8 max-w-sm w-full mx-4 shadow-2xl border border-gray-100 text-center space-y-6">
            <div className="space-y-1">
              <div className="w-14 h-14 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto text-2xl font-black">🚀</div>
              <h4 className="text-lg font-black text-gray-800">業務開始時間の選択</h4>
              <p className="text-xs text-gray-400 font-bold">開始した時間を回転させて選択してください</p>
            </div>

            {/* ドラムロール風セレクトボックス */}
            <div className="flex items-center justify-center space-x-3 bg-gray-50 p-4 rounded-3xl border-2 border-gray-100">
              <select 
                value={startHourInput} 
                onChange={(e) => setStartHourInput(e.target.value)}
                className="text-3xl font-black bg-white border border-gray-200 rounded-2xl px-3 py-2 text-gray-800 focus:outline-none focus:border-emerald-500 cursor-pointer text-center"
              >
                {hoursOptions.map(h => <option key={h} value={h}>{h}時</option>)}
              </select>
              <span className="text-2xl font-black text-gray-400">:</span>
              <select 
                value={startMinuteInput} 
                onChange={(e) => setStartMinuteInput(e.target.value)}
                className="text-3xl font-black bg-white border border-gray-200 rounded-2xl px-3 py-2 text-gray-800 focus:outline-none focus:border-emerald-500 cursor-pointer text-center"
              >
                {minutesOptions.map(m => <option key={m} value={m}>{m}分</option>)}
              </select>
            </div>

            <div className="flex space-x-3">
              <button onClick={() => setShowStartModal(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-500 font-black py-3.5 rounded-2xl text-xs transition-all">キャンセル</button>
              <button onClick={handleProceedToStartConfirm} className="flex-1 bg-emerald-400 hover:bg-emerald-500 text-white font-black py-3.5 rounded-2xl text-xs shadow-lg shadow-emerald-100 transition-all">次へ進む</button>
            </div>
          </div>
        </div>
      )}

      {/* 🟢 2. 業務開始：誤登録防止の確認モーダル */}
      {showStartConfirmModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-[40px] p-8 max-w-sm w-full mx-4 shadow-2xl border border-gray-100 text-center space-y-6">
            <div className="w-14 h-14 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto text-2xl">⚠️</div>
            <div className="space-y-2">
              <h4 className="text-lg font-black text-gray-800">開始時間の最終確認</h4>
              <p className="text-sm font-bold text-gray-700">
                開始時間: <span className="text-xl font-black text-emerald-600 font-mono">{startHourInput}:{startMinuteInput}</span>
              </p>
              <p className="text-xs text-amber-700 bg-amber-50 p-3 rounded-2xl border border-amber-100 font-semibold text-left leading-relaxed">
                上記の時間で業務開始を記録します。入力内容に間違いがないかご確認ください。
              </p>
            </div>

            <div className="flex space-x-3">
              <button onClick={() => { setShowStartConfirmModal(false); setShowStartModal(true); }} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-500 font-black py-3.5 rounded-2xl text-xs transition-all">修正する</button>
              <button onClick={handleConfirmStartWork} className="flex-1 bg-emerald-400 hover:bg-emerald-500 text-white font-black py-3.5 rounded-2xl text-xs shadow-lg shadow-emerald-100 transition-all">確定して送信</button>
            </div>
          </div>
        </div>
      )}

      {/* ⬛ 3. 業務終了：時間＆休憩選択モーダル */}
      {showEndModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-[40px] p-8 max-w-sm w-full mx-4 shadow-2xl border border-gray-100 text-center space-y-6">
            <div className="space-y-1">
              <div className="w-14 h-14 bg-gray-100 text-gray-700 rounded-full flex items-center justify-center mx-auto text-2xl font-black">☕</div>
              <h4 className="text-lg font-black text-gray-800">業務終了時間の選択</h4>
              <p className="text-xs text-gray-400 font-bold">終了時間と休憩時間を選択してください</p>
            </div>

            {/* ドラムロール風セレクトボックス */}
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-extrabold text-gray-400 block mb-1">【業務終了時間】</label>
                <div className="flex items-center justify-center space-x-2 bg-gray-50 p-3 rounded-2xl border-2 border-gray-100">
                  <select 
                    value={endHourInput} 
                    onChange={(e) => setEndHourInput(e.target.value)}
                    className="text-2xl font-black bg-white border border-gray-200 rounded-xl px-2 py-1.5 text-gray-800 focus:outline-none focus:border-gray-800 cursor-pointer text-center"
                  >
                    {hoursOptions.map(h => <option key={h} value={h}>{h}時</option>)}
                  </select>
                  <span className="text-xl font-black text-gray-400">:</span>
                  <select 
                    value={endMinuteInput} 
                    onChange={(e) => setEndMinuteInput(e.target.value)}
                    className="text-2xl font-black bg-white border border-gray-200 rounded-xl px-2 py-1.5 text-gray-800 focus:outline-none focus:border-gray-800 cursor-pointer text-center"
                  >
                    {minutesOptions.map(m => <option key={m} value={m}>{m}分</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-extrabold text-gray-400 block mb-1">【本日の休憩・中抜け時間】</label>
                <div className="bg-gray-50 p-2 rounded-2xl border-2 border-gray-100">
                  <select 
                    value={breakMinutesInput}
                    onChange={(e) => setBreakMinutesInput(Number(e.target.value))}
                    className="w-full text-center text-base font-black bg-transparent py-2 focus:outline-none cursor-pointer text-gray-700"
                  >
                    <option value={0}>なし（0分）</option>
                    <option value={15}>15分</option>
                    <option value={30}>30分</option>
                    <option value={45}>45分</option>
                    <option value={60}>60分（1時間）</option>
                    <option value={90}>90分（1時間30分）</option>
                    <option value={120}>120分（2時間）</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex space-x-3">
              <button onClick={() => setShowEndModal(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-500 font-black py-3.5 rounded-2xl text-xs transition-all">キャンセル</button>
              <button onClick={handleProceedToEndConfirm} className="flex-1 bg-gray-800 hover:bg-gray-900 text-white font-black py-3.5 rounded-2xl text-xs shadow-lg shadow-gray-200 transition-all">次へ進む</button>
            </div>
          </div>
        </div>
      )}

      {/* ⬛ 4. 業務終了：誤登録防止の確認モーダル */}
      {showEndConfirmModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-[40px] p-8 max-w-sm w-full mx-4 shadow-2xl border border-gray-100 text-center space-y-6">
            <div className="w-14 h-14 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto text-2xl">⚠️</div>
            <div className="space-y-2">
              <h4 className="text-lg font-black text-gray-800">終了時間の最終確認</h4>
              <div className="bg-gray-50 p-4 rounded-2xl space-y-1 text-sm font-bold text-gray-700">
                <p>終了時間: <span className="text-lg font-black text-gray-900 font-mono">{endHourInput}:{endMinuteInput}</span></p>
                <p>休憩時間: <span className="text-lg font-black text-emerald-600 font-mono">{breakMinutesInput} 分</span></p>
              </div>
              <p className="text-xs text-amber-700 bg-amber-50 p-3 rounded-2xl border border-amber-100 font-semibold text-left leading-relaxed">
                上記の通り本日の業務終了を記録します。修正が必要な場合は「修正する」を押してください。
              </p>
            </div>

            <div className="flex space-x-3">
              <button onClick={() => { setShowEndConfirmModal(false); setShowEndModal(true); }} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-500 font-black py-3.5 rounded-2xl text-xs transition-all">修正する</button>
              <button onClick={handleConfirmEndWork} className="flex-1 bg-gray-800 hover:bg-gray-900 text-white font-black py-3.5 rounded-2xl text-xs shadow-lg shadow-gray-200 transition-all">確定して送信</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}