"use client";

import { useState, useEffect, useRef } from "react";
import { MemberInfo } from "@/lib/attendanceRepository";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

// 🍏 ドラムロール選択UIコンポーネント
function ScrollWheelPicker({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: string[];
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
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
    if (disabled || isAutoScrolling.current) return;

    if (containerRef.current) {
      const currentScroll = containerRef.current.scrollTop;
      const index = Math.round(currentScroll / 40);
      if (options[index] && options[index] !== value) {
        onChange(options[index]);
      }
    }
  };

  const handleItemClick = (opt: string) => {
    if (disabled) return;
    onChange(opt);
  };

  return (
    <div className={`relative h-[120px] w-16 overflow-hidden select-none rounded-xl border transition-all ${
      disabled ? "bg-gray-100/80 border-gray-200 opacity-40 pointer-events-none" : "bg-gray-50/50 border-gray-100"
    }`}>
      <div className={`absolute top-[40px] left-1 right-1 h-[40px] border-2 rounded-lg pointer-events-none z-0 ${
        disabled ? "bg-gray-200/50 border-gray-300" : "bg-[#34C759]/15 border-[#34C759]"
      }`} />
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="relative z-10 h-full overflow-y-auto snap-y snap-mandatory cursor-pointer [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] py-[40px]"
      >
        {options.map((opt) => (
          <div
            key={opt}
            onClick={() => handleItemClick(opt)}
            className={`h-[40px] flex items-center justify-center snap-center transition-all tabular-nums font-mono ${
              opt === value
                ? "text-xl text-gray-900 font-black tracking-tight"
                : "text-xs text-gray-400 font-medium hover:text-gray-700"
            }`}
          >
            {opt}
          </div>
        ))}
      </div>
    </div>
  );
}

// 💡 実際の打刻時間を一覧で受け取れるように型を拡張
interface AdminAttendanceRecord {
  id: string;
  userName: string;
  email: string;
  workDate: string;
  startTime: string;
  actualStartTime?: string;
  endTime: string;
  actualEndTime?: string;
  breakMinutes: number;
  workHours: number;
  submitted: boolean;
  verified?: boolean;
  leaderVerified?: boolean;
}

interface TabRecordsProps {
  displayedRecords: AdminAttendanceRecord[];
  getMemberMeta: (email: string) => { name: string; managementNumber: string; hourlyRate: number; department: string };
  handleOpenEditModal: (record: AdminAttendanceRecord) => void;
  handleDeleteRecord: (id: string) => void;
  members: MemberInfo[];
  loadAllData: () => Promise<void>;
  setStatusMessage: (msg: string | null) => void;
}

export default function TabRecords({
  displayedRecords,
  getMemberMeta,
  handleOpenEditModal,
  handleDeleteRecord,
  members,
  loadAllData,
  setStatusMessage
}: TabRecordsProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  
  const [createDate, setCreateDate] = useState(() => {
    const now = new Date();
    return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0') + "-" + String(now.getDate()).padStart(2, '0');
  });

  // ドラムロール選択用の分割ステート
  const [createStartHour, setCreateStartHour] = useState("09");
  const [createStartMinute, setCreateStartMinute] = useState("00");
  
  // 👑 【新設】業務終了時間を設定するかどうかのフラグ（初期値: true＝設定する）
  const [hasEndTime, setHasEndTime] = useState(true);
  const [createEndHour, setCreateEndHour] = useState("18");
  const [createEndMinute, setCreateEndMinute] = useState("00");

  const hoursOptions = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutesOptions = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; recordId: string; name: string; date: string }>({
    isOpen: false,
    recordId: "",
    name: "",
    date: ""
  });

  const handleToggleLeaderVerify = async (id: string, currentStatus: boolean) => {
    try {
      const nextStatus = !currentStatus;
      setStatusMessage(nextStatus ? "リーダー確認を確定中..." : "確認を解除中...");
      
      const recordRef = doc(db, "attendance_records", id);
      await updateDoc(recordRef, {
        leaderVerified: nextStatus,
        updatedAt: serverTimestamp()
      });
      
      setStatusMessage(nextStatus ? "リーダー確認を完了しました。" : "リーダー確認を解除しました。");
      setTimeout(() => setStatusMessage(null), 3000);
      await loadAllData();
    } catch (error) {
      setStatusMessage("⚠️ エラー：リーダー確認の更新に失敗しました。");
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const handleSaveCreate = async () => {
    if (!createEmail) {
      setStatusMessage("⚠️ エラー：稼働を記録するメンバーを選択してください。");
      setTimeout(() => setStatusMessage(null), 4000);
      return;
    }
    if (!createDate) {
      setStatusMessage("⚠️ エラー：勤務日は必須項目です。");
      setTimeout(() => setStatusMessage(null), 4000);
      return;
    }

    const createStart = `${createStartHour}:${createStartMinute}`;
    // 👑 業務終了を設定しない場合は空文字にする（これで稼働中データになる）
    const createEnd = hasEndTime ? `${createEndHour}:${createEndMinute}` : "";

    // 終了時間が設定されている場合のみ時間の前後チェックを行う
    if (hasEndTime) {
      try {
        const [startH, startM] = [parseInt(createStartHour, 10), parseInt(createStartMinute, 10)];
        const [endH, endM] = [parseInt(createEndHour, 10), parseInt(createEndMinute, 10)];
        
        const totalDiff = (endH * 60 + endM) - (startH * 60 + startM);
        if (totalDiff <= 0) {
          setStatusMessage("⚠️ エラー：終了時間は開始時間よりも後の時刻を指定してください。");
          setTimeout(() => setStatusMessage(null), 4000);
          return;
        }
      } catch (e) {
        setStatusMessage("⚠️ エラー：時間の計算に失敗しました。");
        setTimeout(() => setStatusMessage(null), 4000);
        return;
      }
    }

    try {
      const matchedMember = members.find(m => m.email === createEmail || m.loginEmail === createEmail);
      const userNameStr = matchedMember ? matchedMember.name : createEmail.split("@")[0];

      setStatusMessage("新規データを保存中...");
      const { attendanceRepository: repo } = require("@/lib/attendanceRepository");
      await repo.createRecordByAdmin(createEmail, userNameStr, {
        workDate: createDate,
        startTime: createStart,
        endTime: createEnd,
        breakMinutes: 0
      });

      setShowCreateModal(false);
      const now = new Date();
      setCreateDate(now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0') + "-" + String(now.getDate()).padStart(2, '0'));
      setCreateEmail("");
      setCreateStartHour("09");
      setCreateStartMinute("00");
      setHasEndTime(true);
      setCreateEndHour("18");
      setCreateEndMinute("00");

      setStatusMessage(hasEndTime ? "稼働記録を新規作成・自動計算しました！" : "稼働中の記録を新規作成しました！");
      setTimeout(() => setStatusMessage(null), 3000);
      await loadAllData();
    } catch (error: any) {
      setStatusMessage(error.message || "⚠️ エラー：稼働記録の新規追加に失敗しました。");
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const hasUnverifiedRecords = displayedRecords.some(record => !record.leaderVerified);

  return (
    <div className="space-y-3 animate-fadeIn">
      
      {hasUnverifiedRecords && (
        <div className="bg-amber-50 text-amber-900 border-2 border-amber-200 p-4 rounded-2xl text-xs font-bold animate-fadeIn flex items-center space-x-2 shadow-sm shadow-amber-50">
          <span className="text-base">⏳</span>
          <p>
            担当チーム内に <span className="text-amber-700 underline font-black">リーダー未確認の稼働記録</span> が残っています。内容に問題がなければ「確認する」ボタンを押して確定させてください。
          </p>
        </div>
      )}
      
      <div className="flex items-center justify-between bg-gray-50 p-2.5 rounded-xl border border-gray-100">
        <p className="text-gray-400 font-medium text-[11px]">各メンバーが確認しているかどうかの状態はこれまで通り表示し、それに対してリーダー確認の項目を新設しました。</p>
        <button 
          onClick={() => setShowCreateModal(true)} 
          className="bg-emerald-400 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg shadow-sm transition-all flex items-center space-x-1 cursor-pointer"
        >
          <span>➕ 稼働記録を新規追加</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden p-4">
        {displayedRecords.length === 0 ? (
          <p className="text-center text-gray-400 py-10">該当する打刻記録はありません。</p>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400 font-bold bg-gray-50/50">
                <th className="py-2 pl-4 text-center w-16">修正</th>
                <th className="py-2 pl-6">氏名</th>
                <th className="py-2">勤務日</th>
                <th className="py-2">業務開始</th>
                <th className="py-2">業務終了</th>
                <th className="py-2">実働時間</th>
                <th className="py-2 text-center w-28">本人確認状況</th>
                <th className="py-2 text-center w-36">リーダー確認</th>
                <th className="py-2 text-right pr-5 w-16">削除</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-gray-600 text-xs">
              {displayedRecords.map((record) => {
                const meta = getMemberMeta(record.email);
                const isVerified = !!record.verified;
                const isLeaderVerified = !!record.leaderVerified;

                return (
                  <tr 
                    key={record.id} 
                    className={`transition-colors ${
                      isLeaderVerified 
                        ? "bg-[#34C759]/10 hover:bg-[#34C759]/15 font-medium" 
                        : "hover:bg-gray-50/30"
                    }`}
                  >
                    
                    <td className="py-2 pl-4 text-center">
                      <button 
                        onClick={() => handleOpenEditModal(record)} 
                        className="text-gray-400 hover:text-emerald-500 p-1.5 rounded-md hover:bg-emerald-50 transition-all block mx-auto shadow-sm border border-gray-100 bg-white cursor-pointer"
                        title="この記録を修正する"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor" className="w-3.5 h-3.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                      </button>
                    </td>

                    <td className="py-2 pl-6 font-bold text-gray-800">
                      {meta.name} <span className="text-[10px] text-gray-400 font-normal block">{record.email}</span>
                    </td>
                    <td className="py-2 font-medium">{record.workDate}</td>
                    
                    <td className="py-2">
                      <div className="flex flex-col">
                        <span className="tabular-nums font-medium text-emerald-600">{record.startTime}</span>
                        {record.actualStartTime && (
                          <span className="text-[9px] text-gray-400 whitespace-nowrap">
                            実打刻: {record.actualStartTime}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-2">
                      <div className="flex flex-col">
                        {record.endTime === "" ? (
                          <span className="text-amber-500 font-bold animate-pulse">稼働中...</span>
                        ) : (
                          <>
                            <span className="tabular-nums text-gray-800">{record.endTime}</span>
                            {record.actualEndTime && (
                              <span className="text-[9px] text-gray-400 whitespace-nowrap">
                                実打刻: {record.actualEndTime}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </td>

                    <td className="py-2 tabular-nums font-bold text-gray-700">{record.workHours} 時間</td>
                    
                    <td className="py-2 text-center">
                      {isVerified ? (
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-xl font-extrabold shadow-sm inline-block select-none">
                          ✅ 確認済み
                        </span>
                      ) : (
                        <span className="text-[10px] bg-gray-100 text-gray-400 px-2.5 py-0.5 rounded-xl font-bold inline-block select-none">
                          ⏳ 未確認
                        </span>
                      )}
                    </td>

                    <td className="py-2 text-center">
                      {isLeaderVerified ? (
                        <button
                          onClick={() => handleToggleLeaderVerify(record.id, true)}
                          className="text-[10px] bg-emerald-600 hover:bg-amber-500 text-white border border-emerald-600 hover:border-amber-500 px-2.5 py-0.5 rounded-xl font-extrabold shadow-sm inline-block transition-all group cursor-pointer"
                          title="クリックするとリーダー確認を解除して未確認に戻します"
                        >
                          <span className="group-hover:hidden">☑️ 承認済み</span>
                          <span className="hidden group-hover:inline">🔄 解除する</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleToggleLeaderVerify(record.id, false)}
                          disabled={record.endTime === "" || !isVerified}
                          className="text-[10px] bg-white hover:bg-purple-600 text-gray-500 hover:text-white border border-gray-200 hover:border-purple-600 px-2.5 py-0.5 rounded-xl font-bold shadow-sm transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                          title={
                            !isVerified 
                              ? "本人が確認済み（✅確認済み）になるまでリーダー確認は行えません" 
                              : record.endTime === "" 
                              ? "稼働中のデータは確認できません" 
                              : "このレコードをリーダーとして承認します"
                          }
                        >
                          🔍 確認する
                        </button>
                      )}
                    </td>
                    
                    <td className="py-2 text-right pr-4">
                      <button 
                        onClick={() => setDeleteModal({ isOpen: true, recordId: record.id, name: meta.name, date: record.workDate })} 
                        className="text-gray-400 hover:text-red-500 p-1.5 rounded-md hover:bg-red-50 transition-all inline-block shadow-sm border border-gray-100 bg-white cursor-pointer"
                        title="この記録を削除する"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-3.5 h-3.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.34 6m-4.02 0l-.34-6M4.5 6.375a.5.5 0 01.5-.5h14a.5.5 0 01.5.5v1.5a.5.5 0 01-.5.5H5a.5.5 0 01-.5-.5v-1.5zM10.5 4.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1.375H10.5V4.5zm-5 4.125h13v11.25a2.25 2.25 0 01-2.25 2.25H7.75A2.25 2.25 0 015.5 19.875V8.625z" />
                        </svg>
                      </button>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 👑 【改修】「開始時間のみ（業務終了なし＝稼働中）」でも作成できる手動追加モーダル */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 text-xs font-sans p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-100 text-left space-y-4 animate-fadeIn max-h-[90vh] overflow-y-auto">
            <div>
              <h4 className="text-sm font-bold text-gray-800">稼働記録の代理手動追加</h4>
              <p className="text-[10px] text-gray-400 mt-0.5">指定したメンバーの稼働データを裏側から強制作成します</p>
            </div>

            <div className="space-y-4 font-semibold text-gray-500">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400">対象メンバーの選択</label>
                <select 
                  value={createEmail} 
                  onChange={(e) => setCreateEmail(e.target.value)} 
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700 font-bold text-xs focus:outline-none cursor-pointer"
                >
                  <option value="">-- メンバーを選択してください --</option>
                  {members.map(m => (
                    <option key={m.email} value={m.email}>{m.name} ({m.email})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400">勤務日</label>
                <input type="date" value={createDate} onChange={(e) => setCreateDate(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700 font-medium text-xs focus:outline-none cursor-pointer" />
              </div>

              {/* 👑 ドラムロール選択UI（業務開始 & 業務終了） */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50/60 p-3 rounded-2xl border border-gray-100">
                
                {/* 業務開始 */}
                <div className="space-y-1 text-center">
                  <label className="text-[10px] font-bold text-emerald-600 block">業務開始時間</label>
                  <div className="flex items-center justify-center space-x-1 bg-white p-1.5 rounded-xl border border-gray-200 shadow-sm">
                    <ScrollWheelPicker options={hoursOptions} value={createStartHour} onChange={setCreateStartHour} />
                    <span className="font-mono font-bold text-xs text-gray-400">時</span>
                    <span className="text-base font-black text-gray-800 font-mono">:</span>
                    <ScrollWheelPicker options={minutesOptions} value={createStartMinute} onChange={setCreateStartMinute} />
                    <span className="font-mono font-bold text-xs text-gray-400">分</span>
                  </div>
                  <div className="flex justify-center space-x-1 pt-1">
                    {["00", "15", "30", "45"].map((min) => (
                      <button
                        key={min}
                        type="button"
                        onClick={() => setCreateStartMinute(min)}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer font-mono ${
                          createStartMinute === min
                            ? "bg-emerald-500 text-white shadow-sm"
                            : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                        }`}
                      >
                        {min}分
                      </button>
                    ))}
                  </div>
                </div>

                {/* 業務終了 */}
                <div className="space-y-1 text-center">
                  <div className="flex items-center justify-center space-x-1 mb-1">
                    <input 
                      type="checkbox" 
                      id="hasEndTimeCheck"
                      checked={hasEndTime} 
                      onChange={(e) => setHasEndTime(e.target.checked)} 
                      className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-500 focus:ring-emerald-400 cursor-pointer"
                    />
                    <label htmlFor="hasEndTimeCheck" className="text-[10px] font-bold text-gray-700 cursor-pointer select-none">
                      業務終了を設定する
                    </label>
                  </div>

                  {hasEndTime ? (
                    <>
                      <div className="flex items-center justify-center space-x-1 bg-white p-1.5 rounded-xl border border-gray-200 shadow-sm">
                        <ScrollWheelPicker options={hoursOptions} value={createEndHour} onChange={setCreateEndHour} />
                        <span className="font-mono font-bold text-xs text-gray-400">時</span>
                        <span className="text-base font-black text-gray-800 font-mono">:</span>
                        <ScrollWheelPicker options={minutesOptions} value={createEndMinute} onChange={setCreateEndMinute} />
                        <span className="font-mono font-bold text-xs text-gray-400">分</span>
                      </div>
                      <div className="flex justify-center space-x-1 pt-1">
                        {["00", "15", "30", "45"].map((min) => (
                          <button
                            key={min}
                            type="button"
                            onClick={() => setCreateEndMinute(min)}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer font-mono ${
                              createEndMinute === min
                                ? "bg-gray-800 text-white shadow-sm"
                                : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                            }`}
                          >
                            {min}分
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="h-[155px] bg-amber-50/60 border border-amber-200/80 rounded-xl p-3 flex flex-col items-center justify-center text-center space-y-1">
                      <span className="text-base">⏳</span>
                      <p className="text-[11px] font-black text-amber-700">「稼働中」として登録</p>
                      <p className="text-[9px] font-medium text-amber-600/80 leading-relaxed">
                        業務終了時間を指定せず、開始打刻のみのデータを作成します
                      </p>
                    </div>
                  )}
                </div>

              </div>
            </div>

            <div className="flex space-x-2 pt-2">
              <button onClick={() => setShowCreateModal(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-2.5 rounded-xl transition-all cursor-pointer">キャンセル</button>
              <button onClick={handleSaveCreate} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 rounded-xl transition-all shadow-sm cursor-pointer">データを手動作成</button>
            </div>
          </div>
        </div>
      )}

      {deleteModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[999] animate-fadeIn font-sans">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full mx-4 shadow-2xl border border-gray-100 text-center space-y-4 animate-scaleUp">
            <div className="w-12 h-12 mx-auto rounded-full bg-rose-50 text-rose-500 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.34 6m-4.02 0l-.34-6M4.5 6.375a.5.5 0 01.5-.5h14a.5.5 0 01.5.5v1.5a.5.5 0 01-.5.5H5a.5.5 0 01-.5-.5v-1.5zM10.5 4.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1.375H10.5V4.5zm-5 4.125h13v11.25a2.25 2.25 0 01-2.25 2.25H7.75A2.25 2.25 0 015.5 19.875V8.625z" />
              </svg>
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-black text-gray-900 tracking-tight">打刻データの削除確認</h4>
              <p className="text-xs text-gray-500 font-medium">
                <span className="font-bold text-gray-800">{deleteModal.name}</span> さんの <span className="font-bold text-gray-800">{deleteModal.date}</span> の打刻データを削除（非表示）にしますか？
              </p>
            </div>
            <div className="flex space-x-2 pt-1">
              <button onClick={() => setDeleteModal({ isOpen: false, recordId: "", name: "", date: "" })} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold py-2 rounded-xl transition-all cursor-pointer">キャンセル</button>
              <button 
                onClick={async () => {
                  const targetId = deleteModal.recordId;
                  setDeleteModal({ isOpen: false, recordId: "", name: "", date: "" });
                  await handleDeleteRecord(targetId);
                }} 
                className="flex-1 bg-rose-500 hover:bg-rose-600 text-white text-xs font-black py-2 rounded-xl transition-all shadow-sm shadow-rose-100 cursor-pointer"
              >
                🗑️ 削除する
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}