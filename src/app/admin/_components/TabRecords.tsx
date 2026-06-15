"use client";

import { useState } from "react";
import { MemberInfo } from "@/lib/attendanceRepository";

interface AdminAttendanceRecord {
  id: string;
  userName: string;
  email: string;
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  workHours: number;
  submitted: boolean;
  verified?: boolean; // 👑 メンバー自身が確認したフラグを読み込む
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
  const [createDate, setCreateDate] = useState("");
  const [createStart, setCreateStart] = useState("09:00");
  const [createEnd, setCreateEnd] = useState("18:00");
  const [createBreak, setCreateBreak] = useState<number>(60);

  // 👑 代理削除用リッチ確認モーダルのステート
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; recordId: string; name: string; date: string }>({
    isOpen: false,
    recordId: "",
    name: "",
    date: ""
  });

  const handleSaveCreate = async () => {
    if (!createEmail) {
      alert("稼働を記録するメンバーをプルダウンから選択してください。");
      return;
    }
    if (!createDate || !createStart || !createEnd) {
      alert("勤務日、開始時間、終了時間は必須項目です。");
      return;
    }

    try {
      const [startH, startM] = createStart.split(":").map(Number);
      const [endH, endM] = createEnd.split(":").map(Number);
      
      if (!isNaN(startH) && !isNaN(startM) && !isNaN(endH) && !isNaN(endM)) {
        const totalDiff = (endH * 60 + endM) - (startH * 60 + startM);
        if (totalDiff <= 0) {
          alert("⚠️ エラー：終了時間は開始時間よりも後の時刻を指定してください。");
          return;
        }
        if (createBreak >= totalDiff) {
          alert(`⚠️ エラー：選択された休憩時間（${createBreak}分）が、勤務時間の総枠（${totalDiff}分）以上になっています。正しい休憩時間を選択してください。`);
          return;
        }
      } else {
        alert("⚠️ エラー：時間の入力形式が正しくありません。(例: 09:00)");
        return;
      }
    } catch (e) {
      alert("⚠️ エラー：時間の計算に失敗しました。入力形式をご確認ください。");
      return;
    }

    try {
      const matchedMember = members.find(m => m.email === createEmail || m.loginEmail === createEmail);
      const userNameStr = matchedMember ? matchedMember.name : createEmail.split("@")[0];

      setStatusMessage("新規データを保存中...");
      // 既存のcreateRecordByAdminを呼び出す
      const { attendanceRepository: repo } = require("@/lib/attendanceRepository");
      await repo.createRecordByAdmin(createEmail, userNameStr, {
        workDate: createDate,
        startTime: createStart,
        endTime: createEnd,
        breakMinutes: createBreak
      });

      setShowCreateModal(false);
      setCreateEmail("");
      setCreateDate("");
      setCreateStart("09:00");
      setCreateEnd("18:00");
      setCreateBreak(60);

      setStatusMessage("稼働記録を新規作成・自動計算しました！");
      setTimeout(() => setStatusMessage(null), 3000);
      await loadAllData();
    } catch (error) {
      alert("稼働記録の新規追加に失敗しました。");
    }
  };

  return (
    <div className="space-y-3 animate-fadeIn">
      
      <div className="flex items-center justify-between bg-gray-50 p-2.5 rounded-xl border border-gray-100">
        <p className="text-gray-400 font-medium text-[11px]">各メンバーが自身の画面で「間違いありません」と確認した状態がリアルタイムで反映されます。</p>
        <button 
          onClick={() => setShowCreateModal(true)} 
          className="bg-emerald-400 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg shadow-sm transition-all flex items-center space-x-1"
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
                <th className="py-2">休憩</th>
                <th className="py-2">実働時間</th>
                {/* 👑 本人が確認したステータスを見るだけの列 */}
                <th className="py-2 text-center w-28">本人確認状況</th>
                <th className="py-2 text-right pr-5 w-16">削除</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-gray-600 text-xs">
              {displayedRecords.map((record) => {
                const meta = getMemberMeta(record.email);
                const isVerified = !!record.verified;

                return (
                  <tr key={record.id} className="hover:bg-gray-50/30 transition-colors">
                    
                    <td className="py-2 pl-4 text-center">
                      <button 
                        onClick={() => handleOpenEditModal(record)} 
                        className="text-gray-400 hover:text-emerald-500 p-1.5 rounded-md hover:bg-emerald-50 transition-all block mx-auto shadow-sm border border-gray-100 bg-white"
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
                    <td className="py-2 tabular-nums font-medium text-emerald-600">{record.startTime}</td>
                    <td className="py-2 tabular-nums">
                      {record.endTime === "" ? <span className="text-amber-500 font-bold animate-pulse">稼働中...</span> : record.endTime}
                    </td>
                    <td className="py-2 tabular-nums text-gray-400">{record.breakMinutes} 分</td>
                    <td className="py-2 tabular-nums font-bold text-gray-700">{record.workHours} 時間</td>
                    
                    {/* 👑 【閲覧専用リニューアル】管理者側からはボタンではなく「状態バッジ」として表示 */}
                    <td className="py-2 text-center">
                      {isVerified ? (
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-xl font-extrabold shadow-sm inline-block">
                          ✅ 確認済み
                        </span>
                      ) : (
                        <span className="text-[10px] bg-gray-100 text-gray-400 px-2.5 py-0.5 rounded-xl font-bold inline-block">
                          ⏳ 未確認
                        </span>
                      )}
                    </td>
                    
                    {/* 削除ボタン */}
                    <td className="py-2 text-right pr-4">
                      <button 
                        onClick={() => setDeleteModal({ isOpen: true, recordId: record.id, name: meta.name, date: record.workDate })} 
                        className="text-gray-400 hover:text-red-500 p-1.5 rounded-md hover:bg-red-50 transition-all inline-block shadow-sm border border-gray-100 bg-white"
                        title="この記録を削除する"
                      >
                        <svg xmlns="http://www.w3.org/2000/xl" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-3.5 h-3.5">
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

      {/* 新規追加モーダル */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 text-xs font-sans">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl border border-gray-100 text-left space-y-4 animate-fadeIn">
            <div>
              <h4 className="text-sm font-bold text-gray-800">稼働記録の代理手動追加</h4>
              <p className="text-[10px] text-gray-400 mt-0.5">指定したメンバーの稼働データを裏側から強制作成します</p>
            </div>

            <div className="space-y-3 font-semibold text-gray-500">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400">対象メンバーの選択</label>
                <select 
                  value={createEmail} 
                  onChange={(e) => setCreateEmail(e.target.value)} 
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 font-bold text-xs focus:outline-none cursor-pointer"
                >
                  <option value="">-- メンバーを選択してください --</option>
                  {members.map(m => (
                    <option key={m.email} value={m.email}>{m.name} ({m.email})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400">勤務日</label>
                <input type="date" value={createDate} onChange={(e) => setCreateDate(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 font-medium text-xs focus:outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400">業務開始 (HH:MM)</label>
                  <input type="text" value={createStart} onChange={(e) => setCreateStart(e.target.value)} placeholder="09:00" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 font-medium text-xs focus:outline-none text-center" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400">業務終了 (HH:MM)</label>
                  <input type="text" value={createEnd} onChange={(e) => setCreateEnd(e.target.value)} placeholder="18:00" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 font-medium text-xs focus:outline-none text-center" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400">休憩時間</label>
                <select 
                  value={createBreak}
                  onChange={(e) => setCreateBreak(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 font-bold text-xs focus:outline-none cursor-pointer"
                >
                  <option value={0}>0分（休憩なし）</option>
                  <option value={15}>15分</option>
                  <option value={30}>30分</option>
                  <option value={45}>45分</option>
                  <option value={60}>60分（1時間）</option>
                </select>
              </div>
            </div>

            <div className="flex space-x-2 pt-2">
              <button onClick={() => setShowCreateModal(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-2 rounded-lg transition-all">キャンセル</button>
              <button onClick={handleSaveCreate} className="flex-1 bg-emerald-400 hover:bg-emerald-50 text-white font-bold py-2 rounded-lg transition-all shadow-sm">データを手動作成</button>
            </div>
          </div>
        </div>
      )}

      {/* 👑 代理削除用リッチ確認モーダル */}
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
              <button onClick={() => setDeleteModal({ isOpen: false, recordId: "", name: "", date: "" })} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold py-2 rounded-xl transition-all">キャンセル</button>
              <button 
                onClick={async () => {
                  const targetId = deleteModal.recordId;
                  setDeleteModal({ isOpen: false, recordId: "", name: "", date: "" });
                  await handleDeleteRecord(targetId);
                }} 
                className="flex-1 bg-rose-500 hover:bg-rose-600 text-white text-xs font-black py-2 rounded-xl transition-all shadow-sm shadow-rose-100"
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