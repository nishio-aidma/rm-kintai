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
  workMinutes?: number;
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

  const [currentUserRole, setCurrentUserRole] = useState<"admin" | "owner">("admin");

  // モーダルの表示用ステート（type: "confirm" | "info" で送信確認とお知らせを切り替え）
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalData, setModalData] = useState<{
    type: "confirm" | "info";
    title: string;
    message: string;
    targetCount: number;
    targets: { name: string; dept: string }[];
    onConfirm: () => Promise<void>;
  }>({
    type: "confirm",
    title: "",
    message: "",
    targetCount: 0,
    targets: [],
    onConfirm: async () => {}
  });

  useEffect(() => {
    const sessionStr = localStorage.getItem("session");
    if (sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        const email = session.email || "";
        if (email === "nishio@aidma-hd.jp" || session.cachedRole === "owner" || session.userRole === "owner") {
          setCurrentUserRole("owner");
        }
      } catch (e) {
        console.error("閲覧権限の分離に失敗しました:", e);
      }
    }
  }, []);

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

  const uniqueDepartments = Array.from(
    new Set([
      ...members.map((m: any) => m.department).filter(Boolean),
      ...attendanceRecords.map((r: any) => defaultGetMemberMeta(r.email).department).filter(Boolean)
    ])
  ) as string[];

  const departmentSummaries: { 
    [key: string]: { 
      memberCount: number; 
      totalDays: number; 
      totalSessions: number; 
      totalHours: number; 
      totalMinutes: number;
      totalReward: number;
      hasUnsubmitted: boolean; 
      hasAttendance: boolean;  
    } 
  } = {};
  
  const allPossibleDepts = uniqueDepartments.includes("未設定") ? uniqueDepartments : [...uniqueDepartments, "未設定"];
  
  allPossibleDepts.forEach(dept => {
    const exactMemberCount = members.filter((m: any) => {
      const mDept = m.department || "未設定";
      const isBelong = mDept === dept;
      const isLeader = m.leadingTeams?.includes(dept);
      const isBelongToOther = m.department && m.department !== dept;
      
      return isBelong || (isLeader && !isBelongToOther);
    }).length;

    departmentSummaries[dept] = {
      memberCount: exactMemberCount,
      totalDays: 0,
      totalSessions: 0,
      totalHours: 0,
      totalMinutes: 0,
      totalReward: 0,
      hasUnsubmitted: false,
      hasAttendance: false
    };
  });

  allSummaryEmails.forEach(email => {
    const meta = defaultGetMemberMeta(email);
    const deptName = meta.department || "未設定";
    
    const userRecords = (attendanceRecords as AdminAttendanceRecord[]).filter(r => r.workDate.startsWith(selectedMonth) && r.email === email);
    const totalHours = userRecords.reduce((sum, r) => sum + (r.workHours || 0), 0);
    const totalMinutes = userRecords.reduce((sum, r) => sum + (r.workMinutes ?? Math.round((r.workHours || 0) * 60)), 0);
    const roundedHours = Math.round(totalHours * 100) / 100;
    const totalDays = new Set(userRecords.map(r => r.workDate)).size;
    const totalSessions = userRecords.filter(r => r.endTime && r.endTime !== "---").length;
    const totalReward = Math.round(roundedHours * meta.hourlyRate);

    const isSubmitted = userRecords.length > 0 && userRecords.some(r => r.submitted);

    if (!departmentSummaries[deptName]) {
      departmentSummaries[deptName] = { memberCount: 0, totalDays: 0, totalSessions: 0, totalHours: 0, totalMinutes: 0, totalReward: 0, hasUnsubmitted: false, hasAttendance: false };
    }
    
    departmentSummaries[deptName].hasAttendance = true;
    if (!isSubmitted) {
      departmentSummaries[deptName].hasUnsubmitted = true;
    }

    departmentSummaries[deptName].totalDays += totalDays;
    departmentSummaries[deptName].totalSessions += totalSessions;
    departmentSummaries[deptName].totalHours += roundedHours;
    departmentSummaries[deptName].totalMinutes += totalMinutes;
    departmentSummaries[deptName].totalReward += totalReward;
  });

  // 💡 【改修】チーム総報酬額が高い順（降順）に並び替えるソートロジックを追加
  const filteredDeptKeys = allPossibleDepts.filter(dept => {
    if (filterDepartment !== "all" && dept !== filterDepartment) return false;
    const data = departmentSummaries[dept];
    return data && (data.memberCount > 0 || data.hasAttendance);
  }).sort((a, b) => {
    const dataA = departmentSummaries[a];
    const dataB = departmentSummaries[b];

    // 1. チーム総報酬額（税抜）が高い順（金額が大きい方を上へ）
    if (dataB.totalReward !== dataA.totalReward) {
      return dataB.totalReward - dataA.totalReward;
    }

    // 2. 報酬額が同じ場合（例：共に0円）、総稼働時間が長い順
    if (dataB.totalMinutes !== dataA.totalMinutes) {
      return dataB.totalMinutes - dataA.totalMinutes;
    }

    // 3. それでも同じ場合、対象稼働人数が多い順
    return dataB.memberCount - dataA.memberCount;
  });

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

  const handleNotifySelected = async () => {
    if (selectedEmails.length === 0) return;

    const targetEmails = displayedEmails.filter(email => selectedEmails.includes(email));

    const unsubmittedTargets = targetEmails
      .filter(email => {
        const userRecords = (attendanceRecords as AdminAttendanceRecord[]).filter(r => r.workDate.startsWith(selectedMonth) && r.email === email);
        const isSubmitted = userRecords.length > 0 && userRecords.some(r => r.submitted);
        return !isSubmitted;
      })
      .map(email => ({
        name: defaultGetMemberMeta(email).name,
        dept: defaultGetMemberMeta(email).department || "未設定"
      }));

    if (unsubmittedTargets.length === 0) {
      setModalData({
        type: "info",
        title: "催促通知の対象外です",
        message: "選択されたメンバーは全員すでに【提出済】です。\n催促通知は【未提出】のメンバーにのみ送信されます。",
        targetCount: 0,
        targets: [],
        onConfirm: async () => {}
      });
      setIsModalOpen(true);
      return;
    }

    setModalData({
      type: "confirm",
      title: "MEMBER-S 個別催促通知",
      message: `選択中メンバーの中から【未提出】の ${unsubmittedTargets.length} 名へ個別に催促メッセージを送信しますか？`,
      targetCount: unsubmittedTargets.length,
      targets: unsubmittedTargets,
      onConfirm: async () => {
        setIsNotifying(true);
        try {
          const res = await fetch("/api/admin/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targets: unsubmittedTargets })
          });

          const resData = await res.json();

          if (!res.ok || !resData.success) {
            throw new Error(resData.message || "通知通信に失敗しました。");
          }

          setSelectedEmails([]);
        } catch (err: any) {
          console.error("催促通知エラー:", err);
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
          💡 チェックボックス（☑）で選択した未提出メンバーだけに、それぞれの所属チームチャット宛てへ個人メンション付きで催促通知を送信できます。
        </p>
      </div>

      <div className="flex items-center justify-between bg-gray-50 p-2 rounded-xl border border-gray-100 gap-4 animate-fadeIn">
        <div className="flex items-center">
          {viewMode === "user" && (
            <button
              onClick={handleNotifySelected}
              disabled={isNotifying || selectedEmails.length === 0}
              className="bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:hover:bg-amber-500 text-white text-xs font-black px-3 py-1.5 rounded-lg shadow-sm transition-all flex items-center space-x-1 h-8 cursor-pointer"
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

          {currentUserRole === "owner" && (
            <button 
              onClick={handleExportRewardCSV} 
              className="bg-gray-800 hover:bg-gray-900 text-white font-bold px-3.5 py-1.5 rounded-lg shadow-sm transition-all flex items-center space-x-1.5 text-xs h-8 cursor-pointer"
            >
              <span>📋 CSV出力</span>
            </button>
          )}
        </div>
      </div>

      {viewMode === "user" ? (
        displayedEmails.length === 0 ? (
          <p className="text-center text-gray-400 py-10 font-medium">該当する提出状態・所属チームのメンバーはいません。</p>
        ) : (
          <div className="overflow-hidden border border-gray-100 rounded-xl">
            <table className="w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 font-bold bg-gray-50/50 text-[11px] uppercase tracking-wider">
                  <th className="text-center px-3 py-2.5" style={{ width: "6%" }}>
                    <button 
                      onClick={handleSelectAll}
                      className="bg-white border border-gray-300 hover:border-emerald-500 text-gray-700 rounded-md px-1.5 py-0.5 font-bold text-[10px] shadow-sm transition-all whitespace-nowrap cursor-pointer"
                    >
                      {selectedEmails.length === displayedEmails.length ? "全解除" : "全選択"}
                    </button>
                  </th>
                  <th className="text-center px-3 py-2.5" style={{ width: currentUserRole === "owner" ? "10%" : "12%" }}>状態</th>
                  <th className="px-3 py-2.5" style={{ width: currentUserRole === "owner" ? "11%" : "14%" }}>管理番号</th>
                  <th className="px-3 py-2.5" style={{ width: currentUserRole === "owner" ? "15%" : "22%" }}>氏名 (メンバー名)</th>
                  <th className="px-3 py-2.5" style={{ width: currentUserRole === "owner" ? "16%" : "22%" }}>所属チーム</th>
                  <th className="text-center px-3 py-2.5" style={{ width: currentUserRole === "owner" ? "9%" : "10%" }}>出勤日数</th>
                  <th className="text-center px-3 py-2.5" style={{ width: currentUserRole === "owner" ? "9%" : "10%" }}>出勤回数</th>
                  <th className="text-right px-3 py-2.5" style={{ width: currentUserRole === "owner" ? "12%" : "12%" }}>稼働時間</th>
                  
                  {currentUserRole === "owner" && <th className="text-right px-3 py-2.5" style={{ width: "9%" }}>設定時給</th>}
                  {currentUserRole === "owner" && <th className="text-right pr-4 text-emerald-600" style={{ width: "13%" }}>報酬額（税抜）</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-gray-600 font-medium text-xs">
                {displayedEmails.map(email => {
                  const meta = defaultGetMemberMeta(email);
                  const userRecords = (attendanceRecords as AdminAttendanceRecord[]).filter(r => r.workDate.startsWith(selectedMonth) && r.email === email);
                  const totalHours = userRecords.reduce((sum, r) => sum + (r.workHours || 0), 0);
                  const roundedHours = Math.round(totalHours * 100) / 100;
                  
                  const totalMinutes = userRecords.reduce((sum, r) => sum + (r.workMinutes ?? Math.round((r.workHours || 0) * 60)), 0);
                  const displayH = Math.floor(totalMinutes / 60);
                  const displayM = totalMinutes % 60;

                  const totalDays = new Set(userRecords.map(r => r.workDate)).size;
                  const totalSessions = userRecords.filter(r => r.endTime && r.endTime !== "---").length;
                  const totalReward = Math.round(roundedHours * meta.hourlyRate);

                  const isSubmitted = userRecords.length > 0 && userRecords.some(r => r.submitted);
                  const isChecked = selectedEmails.includes(email);

                  return (
                    <tr key={email} className={`transition-colors ${isChecked ? "bg-emerald-50/20 hover:bg-emerald-50/30" : "hover:bg-gray-50/30"}`}>
                      <td className="text-center px-3 py-2.5">
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={() => handleSelectIndividual(email)}
                          className="w-4 h-4 rounded border-gray-300 text-emerald-500 focus:ring-emerald-400 cursor-pointer transition-all"
                        />
                      </td>
                      <td className="text-center px-3 py-2.5">
                        {isSubmitted ? (
                          <span className="text-[10px] text-emerald-600 font-black tracking-tight bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-md">提出済</span>
                        ) : (
                          <span className="text-[10px] text-amber-500 font-bold tracking-tight bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-md">未提出</span>
                        )}
                      </td>
                      <td className="tabular-nums text-gray-400 px-3 py-2.5">{meta.managementNumber}</td>
                      <td className="font-bold text-gray-900 px-3 py-2.5 truncate" title={meta.name}>{meta.name}</td>
                      <td className="px-3 py-2.5 truncate">
                        <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-bold text-[10px] inline-block truncate max-w-full" title={meta.department}>
                          {meta.department}
                        </span>
                      </td>
                      <td className="text-center tabular-nums px-3 py-2.5 text-gray-700">{totalDays} 日</td>
                      <td className="text-center tabular-nums font-bold text-purple-600 px-3 py-2.5">{totalSessions} 回</td>
                      <td className="text-right tabular-nums px-3 py-2.5 text-gray-800 font-semibold whitespace-nowrap">
                        {displayH}時間{displayM}分
                      </td>
                      
                      {currentUserRole === "owner" && <td className="text-right tabular-nums px-3 py-2.5">¥{meta.hourlyRate.toLocaleString()}</td>}
                      {currentUserRole === "owner" && <td className="text-right pr-4 tabular-nums font-black text-emerald-600 text-sm">¥{totalReward.toLocaleString()}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* 所属別モードのテーブル */
        filteredDeptKeys.length === 0 ? (
          <p className="text-center text-gray-400 py-10 font-medium">該当する所属チームはありません。</p>
        ) : (
          <div className="overflow-hidden border border-gray-100 rounded-xl shadow-sm">
            <table className="w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 font-bold bg-gray-50/50 text-[11px] uppercase tracking-wider">
                  <th className="pl-6 py-2.5 text-left" style={{ width: currentUserRole === "owner" ? "25%" : "35%" }}>所属チーム名</th>
                  <th className="py-2.5 text-center" style={{ width: currentUserRole === "owner" ? "12%" : "13%" }}>状態</th>
                  <th className="py-2.5 text-center" style={{ width: currentUserRole === "owner" ? "12%" : "13%" }}>対象稼働人数</th>
                  <th className="py-2.5 text-center" style={{ width: currentUserRole === "owner" ? "12%" : "13%" }}>チーム総出勤日数</th>
                  <th className="py-2.5 text-center" style={{ width: currentUserRole === "owner" ? "12%" : "13%" }}>チーム総出勤回数</th>
                  <th className="py-2.5 text-right" style={{ width: currentUserRole === "owner" ? "13%" : "13%" }}>チーム総稼働時間</th>
                  
                  {currentUserRole === "owner" && <th className="py-2.5 text-right pr-6 text-emerald-600 font-extrabold" style={{ width: "14%" }}>チーム総報酬額（税抜）</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-gray-600 font-bold text-xs">
                {filteredDeptKeys.map(dept => {
                  const data = departmentSummaries[dept];
                  if (!data) return null;

                  const deptH = Math.floor(data.totalMinutes / 60);
                  const deptM = data.totalMinutes % 60;

                  return (
                    <tr key={dept} className="hover:bg-gray-50/30 transition-colors">
                      <td className="pl-6 py-2.5 truncate" title={dept}>
                        <span className="bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-xl font-black border border-emerald-100 text-[11px] inline-block truncate max-w-full">
                          {dept}
                        </span>
                      </td>
                      
                      <td className="text-center py-2.5">
                        {!data.hasAttendance ? (
                          <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-xl font-medium inline-block select-none">
                            💤 稼働なし
                          </span>
                        ) : data.hasUnsubmitted ? (
                          <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-xl font-extrabold shadow-sm inline-block select-none animate-fadeIn">
                            ⏳ 未提出あり
                          </span>
                        ) : (
                          <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-xl font-extrabold shadow-sm inline-block select-none animate-fadeIn">
                            ☑️ 全員提出済
                          </span>
                        )}
                      </td>

                      <td className="text-center tabular-nums text-gray-700 py-2.5">{data.memberCount} 名</td>
                      <td className="text-center tabular-nums text-gray-500 py-2.5">{data.totalDays} 日分</td>
                      <td className="text-center tabular-nums text-purple-600 py-2.5">{data.totalSessions} 回</td>
                      
                      <td className="text-right tabular-nums text-gray-800 font-mono py-2.5 whitespace-nowrap">
                        {deptH}時間{deptM}分
                      </td>
                      
                      {currentUserRole === "owner" && (
                        <td className="text-right pr-6 tabular-nums text-emerald-600 font-mono text-sm font-black py-2.5">
                          ¥{data.totalReward.toLocaleString()}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* カスタムポップアップ（送信確認 ＆ 対象外お知らせ） */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[999] animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full mx-4 shadow-2xl border border-gray-100 text-center space-y-4 animate-scaleUp">
            
            <div className={`w-12 h-12 mx-auto rounded-full flex items-center justify-center ${
              modalData.type === "info" ? "bg-blue-50 text-blue-500" : "bg-amber-50 text-amber-500"
            }`}>
              {modalData.type === "info" ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>

            <div className="space-y-1">
              <h4 className="text-base font-black text-gray-900 tracking-tight">{modalData.title}</h4>
              <p className="text-xs font-bold text-gray-600 whitespace-pre-wrap">{modalData.message}</p>
              
              {modalData.type === "confirm" && (
                <div className="max-h-32 overflow-y-auto text-[10px] text-gray-500 font-sans bg-gray-50 p-2.5 rounded-xl border border-gray-100 text-left space-y-1 mt-2">
                  <p className="font-bold text-gray-700">▼ 送信対象メンバー</p>
                  {modalData.targets.map((t, idx) => (
                    <p key={idx} className="truncate">・ {t.name} さん ({t.dept})</p>
                  ))}
                  <p className="text-amber-600 font-bold pt-1">※通知設定で登録したテンプレート文面が個人メンション付きで送信されます。</p>
                </div>
              )}
            </div>

            <div className="flex space-x-2 pt-1">
              {modalData.type === "info" ? (
                <button 
                  onClick={() => setIsModalOpen(false)} 
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-black py-2.5 rounded-xl transition-all shadow-sm cursor-pointer"
                >
                  理解しました
                </button>
              ) : (
                <>
                  <button onClick={() => setIsModalOpen(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold py-2 rounded-xl transition-all cursor-pointer">キャンセル</button>
                  <button 
                    onClick={async () => {
                      setIsModalOpen(false);
                      await modalData.onConfirm();
                    }} 
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black py-2 rounded-xl transition-all shadow-sm shadow-amber-100 cursor-pointer"
                  >
                    🚀 送信する
                  </button>
                </>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}