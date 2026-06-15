"use client";

import { useState, useEffect } from "react";
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
}

interface TabSummaryProps {
  attendanceRecords?: AdminAttendanceRecord[] | any;
  members?: MemberInfo[] | any;
  selectedMonth?: string | any;
  statusFilter?: ("all" | "submitted" | "unsubmitted") | any;
  viewMode?: ("user" | "department") | any;
  filterDepartment?: string | any;
  getMemberMeta?: ((email: string) => { name: string; managementNumber: string; hourlyRate: number; department: string }) | any;
  handleExportRewardCSV?: (() => void) | any;
  [key: string]: any;
}

export default function TabSummary({
  attendanceRecords = [],
  members = [],
  selectedMonth = "2026-06",
  statusFilter = "all",
  viewMode = "user",
  filterDepartment = "all",
  getMemberMeta,
  handleExportRewardCSV
}: TabSummaryProps) {
  
  const [isNotifying, setIsNotifying] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);

  // 👑 【新設】一括催促通知用のリッチカスタムモーダルステート
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalData, setModalData] = useState<{
    targetCount: number;
    formattedMessage: string;
    onConfirm: () => Promise<void>;
  }>({ targetCount: 0, formattedMessage: "", onConfirm: async () => {} });

  const defaultGetMemberMeta = (email: string) => {
    if (getMemberMeta) return getMemberMeta(email);
    return { name: email.split("@")[0], managementNumber: "---", hourlyRate: 0, department: "未設定" };
  };

  const allSummaryEmails = Array.from(
    new Set((attendanceRecords as AdminAttendanceRecord[]).filter(r => r.workDate.startsWith(selectedMonth)).map(r => r.email))
  );

  const displayedEmails = allSummaryEmails.filter(email => {
    const meta = defaultGetMemberMeta(email);
    if (filterDepartment !== "all" && meta.department !== filterDepartment) return false;

    const userRecords = (attendanceRecords as AdminAttendanceRecord[]).filter(r => r.workDate.startsWith(selectedMonth) && r.email === email);
    const isSubmitted = userRecords.length > 0 && userRecords.some(r => r.submitted);

    if (statusFilter === "submitted") return isSubmitted;
    if (statusFilter === "unsubmitted") return !isSubmitted;
    return true;
  });

  const isAllSubmitted = allSummaryEmails.length > 0 && allSummaryEmails.every(email => {
    const userRecords = (attendanceRecords as AdminAttendanceRecord[]).filter(r => r.workDate.startsWith(selectedMonth) && r.email === email);
    return userRecords.length > 0 && userRecords.some(r => r.submitted);
  });

  const unsubmittedCount = allSummaryEmails.filter(email => {
    const userRecords = (attendanceRecords as AdminAttendanceRecord[]).filter(r => r.workDate.startsWith(selectedMonth) && r.email === email);
    const isSubmitted = userRecords.length > 0 && userRecords.some(r => r.submitted);
    return !isSubmitted;
  }).length;

  const departmentSummaries: { [key: string]: { memberCount: number; totalDays: number; totalHours: number; totalReward: number } } = {};
  
  allSummaryEmails.forEach(email => {
    const meta = defaultGetMemberMeta(email);
    const deptName = meta.department || "未設定";
    
    const userRecords = (attendanceRecords as AdminAttendanceRecord[]).filter(r => r.workDate.startsWith(selectedMonth) && r.email === email);
    const totalHours = userRecords.reduce((sum, r) => sum + (r.workHours || 0), 0);
    const roundedHours = Math.round(totalHours * 100) / 100;
    const totalDays = new Set(userRecords.map(r => r.workDate)).size;
    const totalReward = Math.round(roundedHours * meta.hourlyRate);

    if (!departmentSummaries[deptName]) {
      departmentSummaries[deptName] = { memberCount: 0, totalDays: 0, totalHours: 0, totalReward: 0 };
    }
    departmentSummaries[deptName].memberCount += 1;
    departmentSummaries[deptName].totalDays += totalDays;
    departmentSummaries[deptName].totalHours += roundedHours;
    departmentSummaries[deptName].totalReward += totalReward;
  });

  const filteredDeptKeys = Object.keys(departmentSummaries);

  useEffect(() => {
    setSelectedEmails([]);
  }, [selectedMonth, statusFilter, viewMode, filterDepartment]);

  const handleSelectAll = () => {
    if (selectedEmails.length === displayedEmails.length) {
      setSelectedEmails([]);
    } else {
      setSelectedEmails(displayedEmails);
    }
  };

  const handleSelectIndividual = (email: string) => {
    if (selectedEmails.includes(email)) {
      setSelectedEmails(selectedEmails.filter(e => e !== email));
    } else {
      setSelectedEmails([...selectedEmails, email]);
    }
  };

  // 📢 一括催促通知送信のコアロジック
  const handleNotifySelected = async () => {
    const targetEmails = displayedEmails.filter(email => selectedEmails.includes(email));

    const unsubmittedTargets = targetEmails
      .filter(email => {
        const userRecords = (attendanceRecords as AdminAttendanceRecord[]).filter(r => r.workDate.startsWith(selectedMonth) && r.email === email);
        const isSubmitted = userRecords.length > 0 && userRecords.some(r => r.submitted);
        return !isSubmitted;
      })
      .map(email => ({
        name: defaultGetMemberMeta(email).name,
        dept: defaultGetMemberMeta(email).department
      }));

    if (selectedEmails.length === 0) {
      alert("左側のチェックボックス（☑）で通知を送りたいメンバーを一人以上選択してください。");
      return;
    }

    if (unsubmittedTargets.length === 0) {
      alert("選択された対象の中に、現在【未提出】状態の人は一人もいません！");
      return;
    }

    const formattedMessage = `【稼働実績・未提出リマインド】\n対象月: ${selectedMonth}\n\n以下のメンバーの稼働実績が【未提出】状態です。内容を確認の上、システムから「提出」ボタンの押下をお願いいたします。\n\n${unsubmittedTargets.map(m => `・ ${m.name} さん (${m.dept})`).join("\n")}`;

    // 👑 【進化】ブラウザ標準confirmを廃止し、独自のリッチ確認モーダルを立ち上げる処理
    setModalData({
      targetCount: unsubmittedTargets.length,
      formattedMessage: formattedMessage,
      onConfirm: async () => {
        setIsNotifying(true);
        try {
          const res = await fetch("/api/admin/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: formattedMessage })
          });

          if (!res.ok) throw new Error("通知通信に失敗しました。");
          alert("🚀 MEMBER-Sへ選択された個人の未提出者一括催促通知を送信しました！");
          setSelectedEmails([]);
        } catch (err) {
          alert("エラー：通知の送信に失敗しました。裏側のルームIDやトークンをご確認ください。");
        } finally {
          setIsNotifying(false);
        }
      }
    });
    setIsModalOpen(true);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden p-3.5 space-y-3">
      
      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
        <p className="text-[11px] text-gray-400 font-medium">
          💡 チェックボックス（☑）で選択した未提出メンバーだけに一括で催促通知を飛ばせます。
        </p>
      </div>

      <div className="flex items-center justify-between bg-gray-50 p-2 rounded-xl border border-gray-100 gap-4 animate-fadeIn">
        <div className="flex items-center">
          {viewMode === "user" && (
            <button
              onClick={handleNotifySelected}
              disabled={isNotifying || selectedEmails.length === 0}
              className="bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:hover:bg-amber-500 text-white text-xs font-black px-3 py-1.5 rounded-lg shadow-sm transition-all flex items-center space-x-1 h-8"
            >
              <span>📢 {isNotifying ? "送信中..." : `選択した ${selectedEmails.length} 名へ催促通知`}</span>
            </button>
          )}
        </div>

        <div className="flex items-center space-x-3 flex-shrink-0">
          {allSummaryEmails.length > 0 && (
            isAllSubmitted ? (
              <span className="bg-emerald-600 text-white text-xs font-black px-2.5 py-1 rounded-lg shadow-sm flex items-center gap-1 tracking-tight animate-fadeIn">
                🎉 全員提出完了！
              </span>
            ) : (
              <span className="bg-rose-50 text-rose-700 border border-rose-200 text-xs font-black px-2.5 py-1 rounded-lg shadow-sm flex items-center gap-1 tracking-tight animate-fadeIn">
                ⚠️ 未提出あり（あと {unsubmittedCount} 名）
              </span>
            )
          )}

          <button 
            onClick={handleExportRewardCSV} 
            className="bg-gray-800 hover:bg-gray-900 text-white font-bold px-3.5 py-1.5 rounded-lg shadow-sm transition-all flex items-center space-x-1.5 text-xs h-8"
          >
            <span>📋 CSV出力</span>
          </button>
        </div>
      </div>

      {viewMode === "user" ? (
        displayedEmails.length === 0 ? (
          <p className="text-center text-gray-400 py-10 font-medium">該当する提出状態・所属チームのメンバーはいません。</p>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400 font-bold bg-gray-50/50 text-[11px]">
                <th className="py-2 pl-3 w-20 text-center whitespace-nowrap">
                  <button 
                    onClick={handleSelectAll}
                    className="bg-white border border-gray-300 hover:border-emerald-500 text-gray-700 rounded-md px-2 py-0.5 font-bold text-[10px] shadow-sm transition-all whitespace-nowrap"
                  >
                    {selectedEmails.length === displayedEmails.length ? "全解除" : "全選択"}
                  </button>
                </th>
                <th className="py-2 w-24 text-center whitespace-nowrap">状態</th>
                <th className="py-2 whitespace-nowrap">管理番号</th>
                <th className="py-2 whitespace-nowrap">氏名 (メンバー名)</th>
                <th className="py-2 whitespace-nowrap">メールアドレス</th>
                <th className="py-2 whitespace-nowrap">所属チーム</th>
                <th className="py-2 text-center whitespace-nowrap">出勤日数</th>
                <th className="py-2 text-right whitespace-nowrap">勤務時間</th>
                <th className="py-2 text-right whitespace-nowrap">設定時給</th>
                <th className="py-2 text-right pr-4 text-emerald-600 whitespace-nowrap">報酬額（税抜）</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-gray-600 font-medium text-sm">
              {displayedEmails.map(email => {
                const meta = defaultGetMemberMeta(email);
                const userRecords = (attendanceRecords as AdminAttendanceRecord[]).filter(r => r.workDate.startsWith(selectedMonth) && r.email === email);
                const totalHours = userRecords.reduce((sum, r) => sum + (r.workHours || 0), 0);
                const roundedHours = Math.round(totalHours * 100) / 100;
                const totalDays = new Set(userRecords.map(r => r.workDate)).size;
                const totalReward = Math.round(roundedHours * meta.hourlyRate);

                const isSubmitted = userRecords.length > 0 && userRecords.some(r => r.submitted);
                const isChecked = selectedEmails.includes(email);

                return (
                  <tr key={email} className={`transition-colors ${isChecked ? "bg-emerald-50/20 hover:bg-emerald-50/30" : "hover:bg-gray-50/30"}`}>
                    <td className="py-1.5 pl-3 text-center">
                      <input 
                        type="checkbox" 
                        checked={isChecked}
                        onChange={() => handleSelectIndividual(email)}
                        className="w-4 h-4 rounded border-gray-300 text-emerald-500 focus:ring-emerald-400 cursor-pointer transition-all"
                      />
                    </td>
                    <td className="py-1.5 text-center">
                      {isSubmitted ? (
                        <span className="text-emerald-600 font-black text-sm tracking-tight">☑️ 提出済</span>
                      ) : (
                        <span className="text-amber-500 font-bold text-sm tracking-tight">⏳ 未提出</span>
                      )}
                    </td>
                    <td className="py-1.5 tabular-nums text-gray-400 pl-1">{meta.managementNumber}</td>
                    <td className="py-1.5 font-bold text-gray-900">{meta.name}</td>
                    <td className="py-1.5 text-gray-400 tabular-nums">{email}</td>
                    <td className="py-1.5"><span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-bold text-xs">{meta.department}</span></td>
                    <td className="py-1.5 text-center tabular-nums">{totalDays} 日</td>
                    <td className="py-1.5 text-right tabular-nums">{roundedHours} 時間</td>
                    <td className="py-1.5 text-right tabular-nums">¥{meta.hourlyRate.toLocaleString()}</td>
                    <td className="py-1.5 text-right pr-4 tabular-nums font-black text-emerald-600 text-sm">¥{totalReward.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      ) : (
        /* ================= 🏢 所属別モードのテーブル ================= */
        filteredDeptKeys.length === 0 ? (
          <p className="text-center text-gray-400 py-10 font-medium">該当する所属チームはありません。</p>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400 font-bold bg-gray-50/50 text-[11px]">
                <th className="py-2 pl-6">所属チーム名</th>
                <th className="py-2 text-center w-32">対象稼働人数</th>
                <th className="py-2 text-center w-32">チーム総出勤日数</th>
                <th className="py-2 text-right w-40">チーム総勤務時間</th>
                <th className="py-2 text-right pr-6 text-emerald-600 font-extrabold">チーム総報酬額（税抜）</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-gray-600 font-bold text-sm">
              {filteredDeptKeys.map(dept => {
                const data = departmentSummaries[dept];
                return (
                  <tr key={dept} className="hover:bg-gray-50/30 transition-colors">
                    <td className="py-2 pl-6">
                      <span className="bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-xl font-black border border-emerald-100 text-xs">
                        {dept}
                      </span>
                    </td>
                    <td className="py-2 text-center tabular-nums text-gray-700">{data.memberCount} 名</td>
                    <td className="py-2 text-center tabular-nums text-gray-500">{data.totalDays} 日分</td>
                    <td className="py-2 text-right tabular-nums text-gray-800 font-mono">{Math.round(data.totalHours * 100) / 100} 時間</td>
                    <td className="py-2 text-right pr-6 tabular-nums text-emerald-600 font-mono text-base font-black">
                      ¥{data.totalReward.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      )}

      {/* 👑 【一括催促用】システム調和型リッチカスタムモーダル */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[999] animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full mx-4 shadow-2xl border border-gray-100 text-center space-y-4 animate-scaleUp">
            <div className="w-12 h-12 mx-auto rounded-full bg-amber-50 text-amber-500 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-black text-gray-900 tracking-tight">MEMBER-S 一括リマインド通知</h4>
              <p className="text-xs font-bold text-gray-600">選択中メンバーの中から【未提出】の {modalData.targetCount} 名へ通知を送信しますか？</p>
              <div className="max-h-32 overflow-y-auto text-[10px] text-gray-400 font-mono bg-gray-50 p-2 rounded-xl border border-gray-100 text-left whitespace-pre-wrap mt-2">
                {modalData.formattedMessage}
              </div>
            </div>
            <div className="flex space-x-2 pt-1">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold py-2 rounded-xl transition-all">キャンセル</button>
              <button 
                onClick={async () => {
                  setIsModalOpen(false);
                  await modalData.onConfirm();
                }} 
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black py-2 rounded-xl transition-all shadow-sm shadow-amber-100"
              >
                🚀 送信する
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}