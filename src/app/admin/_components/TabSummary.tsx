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

  // 親ファイルを汚さず、このコンポーネント単体で安全にownerを識別するためのセキュリティステート
  const [currentUserRole, setCurrentUserRole] = useState<"admin" | "owner">("admin");

  // 一括催促通知用のリッチカスタムモーダルステート（仕様保持）
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalData, setModalData] = useState<{
    targetCount: number;
    formattedMessage: string;
    onConfirm: () => Promise<void>;
  }>({ targetCount: 0, formattedMessage: "", onConfirm: async () => {} });

  // 画面起動時に「パソコンのメモ帳（合言葉）」をチェックしてownerかどうかを完全自動判定
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

  // 所属別モードの集計用オブジェクト（仕様保持）
  const departmentSummaries: { 
    [key: string]: { 
      memberCount: number; 
      totalDays: number; 
      totalSessions: number; 
      totalHours: number; 
      totalReward: number;
      hasUnsubmitted: boolean; 
      hasAttendance: boolean;  
    } 
  } = {};
  
  // マスタ全体の登録データから「対象稼働人数」をズレなく完全先行集計（兼任リーダー除外仕様保持）
  const allPossibleDepts = uniqueDepartments.includes("未設定") ? uniqueDepartments : [...uniqueDepartments, "未設定"];
  
  allPossibleDepts.forEach(dept => {
    const exactMemberCount = members.filter((m: any) => {
      const mDept = m.department || "未設定";
      const isBelong = mDept === dept; // 本来の所属チームが一致
      const isLeader = m.leadingTeams?.includes(dept); // そのチームのリーダーである
      const isBelongToOther = m.department && m.department !== dept; // 別のチームに所属している
      
      return isBelong || (isLeader && !isBelongToOther);
    }).length;

    departmentSummaries[dept] = {
      memberCount: exactMemberCount,
      totalDays: 0,
      totalSessions: 0,
      totalHours: 0,
      totalReward: 0,
      hasUnsubmitted: false,
      hasAttendance: false
    };
  });

  // 稼働実績データの合算と、チームごとの提出状況ステータスの判定
  allSummaryEmails.forEach(email => {
    const meta = defaultGetMemberMeta(email);
    const deptName = meta.department || "未設定";
    
    const userRecords = (attendanceRecords as AdminAttendanceRecord[]).filter(r => r.workDate.startsWith(selectedMonth) && r.email === email);
    const totalHours = userRecords.reduce((sum, r) => sum + (r.workHours || 0), 0);
    const roundedHours = Math.round(totalHours * 100) / 100;
    const totalDays = new Set(userRecords.map(r => r.workDate)).size;
    const totalSessions = userRecords.filter(r => r.endTime && r.endTime !== "---").length;
    const totalReward = Math.round(roundedHours * meta.hourlyRate);

    // このメンバー自身の提出状態
    const isSubmitted = userRecords.length > 0 && userRecords.some(r => r.submitted);

    if (!departmentSummaries[deptName]) {
      departmentSummaries[deptName] = { memberCount: 0, totalDays: 0, totalSessions: 0, totalHours: 0, totalReward: 0, hasUnsubmitted: false, hasAttendance: false };
    }
    
    departmentSummaries[deptName].hasAttendance = true; // 稼働実績あり
    if (!isSubmitted) {
      departmentSummaries[deptName].hasUnsubmitted = true; // チーム内に未提出者を発見
    }

    departmentSummaries[deptName].totalDays += totalDays;
    departmentSummaries[deptName].totalSessions += totalSessions;
    departmentSummaries[deptName].totalHours += roundedHours;
    departmentSummaries[deptName].totalReward += totalReward;
  });

  // フィルターがかかっている場合は、そのチームだけを表示対象にする
  const filteredDeptKeys = allPossibleDepts.filter(dept => {
    if (filterDepartment !== "all" && dept !== filterDepartment) return false;
    const data = departmentSummaries[dept];
    return data && (data.memberCount > 0 || data.hasAttendance);
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

  // 一括催促通知送信のコアロジック（仕様保持）
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
          <div className="overflow-x-auto border border-gray-100 rounded-xl shadow-sm">
            {/* 💡 table-fixedを適用し、インラインCSSを使わず確実なピクセル幅で列幅を100%固定 */}
            <table className="w-full text-left border-collapse table-fixed min-w-[1280px]">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 font-bold bg-gray-50/50 text-[11px] uppercase tracking-wider h-12">
                  <th className="w-20 text-center px-3 py-3">
                    <button 
                      onClick={handleSelectAll}
                      className="bg-white border border-gray-300 hover:border-emerald-500 text-gray-700 rounded-md px-2 py-0.5 font-bold text-[10px] shadow-sm transition-all whitespace-nowrap cursor-pointer"
                    >
                      {selectedEmails.length === displayedEmails.length ? "全解除" : "全選択"}
                    </button>
                  </th>
                  <th className="w-28 text-center px-3 py-3">状態</th>
                  <th className="w-28 px-3 py-3">管理番号</th>
                  <th className="w-36 px-3 py-3">氏名 (メンバー名)</th>
                  <th className="w-68 px-3 py-3">メールアドレス</th>
                  <th className="w-36 px-3 py-3">所属チーム</th>
                  <th className="w-24 text-center px-3 py-3">出勤日数</th>
                  <th className="w-24 text-center px-3 py-3">出勤回数</th>
                  <th className="w-26 text-right px-3 py-3">勤務時間</th>
                  {currentUserRole === "owner" && <th className="w-26 text-right px-3 py-3">設定時給</th>}
                  {currentUserRole === "owner" && <th className="w-36 text-right pr-6 text-emerald-600">報酬額（税抜）</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-gray-600 font-medium text-xs">
                {displayedEmails.map(email => {
                  const meta = defaultGetMemberMeta(email);
                  const userRecords = (attendanceRecords as AdminAttendanceRecord[]).filter(r => r.workDate.startsWith(selectedMonth) && r.email === email);
                  const totalHours = userRecords.reduce((sum, r) => sum + (r.workHours || 0), 0);
                  const roundedHours = Math.round(totalHours * 100) / 100;
                  const totalDays = new Set(userRecords.map(r => r.workDate)).size;
                  const totalSessions = userRecords.filter(r => r.endTime && r.endTime !== "---").length;
                  const totalReward = Math.round(roundedHours * meta.hourlyRate);

                  const isSubmitted = userRecords.length > 0 && userRecords.some(r => r.submitted);
                  const isChecked = selectedEmails.includes(email);

                  return (
                    <tr key={email} className={`transition-colors h-14 ${isChecked ? "bg-emerald-50/20 hover:bg-emerald-50/30" : "hover:bg-gray-50/30"}`}>
                      <td className="text-center px-3 py-3">
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={() => handleSelectIndividual(email)}
                          className="w-4 h-4 rounded border-gray-300 text-emerald-500 focus:ring-emerald-400 cursor-pointer transition-all"
                        />
                      </td>
                      <td className="text-center px-3 py-3">
                        {isSubmitted ? (
                          <span className="text-[11px] text-emerald-600 font-black tracking-tight bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-md">☑️ 提出済</span>
                        ) : (
                          <span className="text-[11px] text-amber-500 font-bold tracking-tight bg-amber-50 border border-amber-100 px-2 py-1 rounded-md">⏳ 未提出</span>
                        )}
                      </td>
                      <td className="tabular-nums text-gray-400 px-3 py-3">{meta.managementNumber}</td>
                      <td className="font-bold text-gray-900 px-3 py-3 truncate" title={meta.name}>{meta.name}</td>
                      <td className="text-gray-400 tabular-nums px-3 py-3 truncate" title={email}>{email}</td>
                      <td className="px-3 py-3 truncate">
                        <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-bold text-[11px] inline-block truncate max-w-full" title={meta.department}>
                          {meta.department}
                        </span>
                      </td>
                      <td className="text-center tabular-nums px-3 py-3 text-gray-700">{totalDays} 日</td>
                      <td className="text-center tabular-nums font-bold text-purple-600 px-3 py-3">{totalSessions} 回</td>
                      <td className="text-right tabular-nums px-3 py-3 text-gray-800 font-semibold">{roundedHours} 時間</td>
                      {currentUserRole === "owner" && <td className="text-right tabular-nums px-3 py-3 text-gray-700">¥{meta.hourlyRate.toLocaleString()}</td>}
                      {currentUserRole === "owner" && <td className="text-right pr-6 tabular-nums font-black text-emerald-600 text-sm">¥{totalReward.toLocaleString()}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* ================= 🏢 所属別モードのテーブル ================= */
        filteredDeptKeys.length === 0 ? (
          <p className="text-center text-gray-400 py-10 font-medium">該当する所属チームはありません。</p>
        ) : (
          <div className="overflow-x-auto border border-gray-100 rounded-xl shadow-sm">
            <table className="w-full text-left border-collapse table-fixed min-w-[1020px]">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 font-bold bg-gray-50/50 text-[11px] uppercase tracking-wider h-12">
                  <th className="w-52 pl-6 py-3">所属チーム名</th>
                  <th className="w-32 text-center py-3">状態</th>
                  <th className="w-32 text-center py-3">対象稼働人数</th>
                  <th className="w-32 text-center py-3">チーム総出勤日数</th>
                  <th className="w-32 text-center py-3">チーム総出勤回数</th>
                  <th className="w-36 text-right py-3">チーム総勤務時間</th>
                  {currentUserRole === "owner" && <th className="w-44 text-right pr-6 text-emerald-600 font-extrabold">チーム総報酬額（税抜）</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-gray-600 font-bold text-xs">
                {filteredDeptKeys.map(dept => {
                  const data = departmentSummaries[dept];
                  if (!data) return null;

                  return (
                    <tr key={dept} className="hover:bg-gray-50/30 transition-colors h-14">
                      <td className="pl-6 py-3 truncate" title={dept}>
                        <span className="bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-xl font-black border border-emerald-100 text-[11px] inline-block truncate max-w-full">
                          {dept}
                        </span>
                      </td>
                      
                      <td className="text-center py-3">
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

                      <td className="text-center tabular-nums text-gray-700 py-3">{data.memberCount} 名</td>
                      <td className="text-center tabular-nums text-gray-500 py-3">{data.totalDays} 日分</td>
                      <td className="text-center tabular-nums text-purple-600 py-3">{data.totalSessions} 回</td>
                      <td className="text-right tabular-nums text-gray-800 font-mono py-3">{Math.round(data.totalHours * 100) / 100} 時間</td>
                      {currentUserRole === "owner" && (
                        <td className="text-right pr-6 tabular-nums text-emerald-600 font-mono text-sm font-black py-3">
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

      {/* 一括催促用カスタムモーダル（仕様保持） */}
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
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black py-2 rounded-xl transition-all shadow-sm shadow-amber-100 cursor-pointer"
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