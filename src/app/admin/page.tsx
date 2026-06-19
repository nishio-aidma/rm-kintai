"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { attendanceRepository, MemberInfo, AccountRequest } from "@/lib/attendanceRepository";

import TabSummary from "./_components/TabSummary";
import TabRecords from "./_components/TabRecords";
import TabCsv from "./_components/TabCsv"; 
import TabMembers from "./_components/TabMembers";
import TabOrgChart from "./_components/TabOrgChart"; 
// 分割インポート仕様を100%保持
import TabSettings from "./_components/TabSettings";
import EditModal from "./_components/EditModal";

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

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, "").replace(/""/g, '"'));
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, "").replace(/""/g, '"'));
  return result;
}

export default function AdminPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [adminEmail, setAdminEmail] = useState<string>("");
  
  // ログイン中の管理者自身のデータ
  const [userRole, setUserRole] = useState<"admin" | "owner">("admin");
  const [myDepartment, setMyDepartment] = useState<string>("");
  
  // activeTabの選択肢の仕様を100%保持
  const [activeTab, setActiveTab] = useState<"summary" | "records" | "members" | "csv" | "org" | "settings">("records");

  const [attendanceRecords, setAttendanceRecords] = useState<AdminAttendanceRecord[]>([]);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  
  const [accountRequests, setAccountRequests] = useState<AccountRequest[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [selectedMonth, setSelectedMonth] = useState<string>("2026-06");
  const [filterEmail, setFilterEmail] = useState<string>("all");

  const [statusFilter, setStatusFilter] = useState<"all" | "submitted" | "unsubmitted">("all");
  const [viewMode, setViewMode] = useState<"user" | "department">("user");
  const [filterDepartment, setFilterDepartment] = useState<string>("all");

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AdminAttendanceRecord | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editBreak, setEditBreak] = useState(0);

  const [editingDeptEmail, setEditingDeptEmail] = useState<string | null>(null);
  const [inputDeptText, setInputDeptText] = useState("");

  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const loadAllData = async () => {
    try {
      const [allRecords, allMembers, allRequests] = await Promise.all([
        attendanceRepository.getAllRecordsForAdmin(),
        attendanceRepository.getAllMembers(),
        attendanceRepository.getAccountRequests()
      ]);
      setAttendanceRecords(allRecords);
      setMembers(allMembers);
      setAccountRequests(allRequests);
    } catch (error) {
      console.error("データの読み込みに失敗しました:", error);
    }
  };

  // 👑 修正：Firebaseの公式見張り番から、最新の「パソコンのメモ帳（合言葉）」を読み込む仕様に完全統合
  useEffect(() => {
    const checkAdminAuth = async () => {
      const sessionStr = localStorage.getItem("session");
      
      if (sessionStr) {
        try {
          const session = JSON.parse(sessionStr);
          const email = session.email || "";
          setAdminEmail(email);

          // 👑 【仕様100%保持】西尾さんは最上位のowner
          if (email === "nishio@aidma-hd.jp") {
            setUserRole("owner");
            setActiveTab("summary");
          } else {
            const meta = await attendanceRepository.getMemberByEmail(email);
            // 👑 【仕様100%保持】もしowner代理(isOwnerProxy)に☑があれば最強のowner権限を付与
            if (meta && meta.isOwnerProxy) {
              setUserRole("owner");
              setActiveTab("summary");
            } else if (meta && meta.role === "admin") {
              setUserRole("admin");
              const deptStr = meta.department || "";
              setMyDepartment(deptStr);
              // 💡 【機能追加】adminの場合は、集計時の初期選択チームを全員(all)ではなく「自チーム名」に自動設定
              setFilterDepartment(deptStr);
              setActiveTab("records");
            } else {
              // 管理者権限のない一般ユーザーは安全にトップ画面へ戻す
              router.push("/");
              return;
            }
          }

          // 権限確認が取れたら、管理データをFirestoreから一括取得
          await loadAllData();
        } catch (error) {
          console.error("管理者データの読み込みに失敗しました:", error);
          router.push("/login");
        } finally {
          setIsLoading(false);
        }
      } else {
        // ログインの合言葉がなければ、ログイン画面へ移動
        router.push("/login");
      }
    };

    checkAdminAuth();
  }, [router]);

  const getMemberMeta = (email: string) => {
    const matched = members.find(m => m.email === email || m.loginEmail === email);
    return {
      name: matched ? matched.name : email.split("@")[0],
      managementNumber: matched ? matched.managementNumber : "---",
      hourlyRate: matched ? matched.hourlyRate : 0,
      department: matched ? matched.department : "未設定"
    };
  };

  const uniqueDepartments = Array.from(
    new Set([
      ...members.map(m => m.department).filter(Boolean),
      ...attendanceRecords.map(r => getMemberMeta(r.email).department).filter(Boolean)
    ])
  );

  const handleSaveDepartment = async (email: string, selectedDept: string) => {
    try {
      setStatusMessage("所属チーム情報を更新中...");
      const targetMember = members.find(m => m.email === email);
      const currentLoginEmail = targetMember?.loginEmail || "";

      await attendanceRepository.updateMemberFields(email, selectedDept, currentLoginEmail);
      
      setEditingDeptEmail(null);
      setStatusMessage("所属チームを正常に更新しました！");
      setTimeout(() => setStatusMessage(null), 3000);
      await loadAllData();
    } catch (error) {
      setStatusMessage("⚠️ エラー：チーム名の更新に失敗しました。");
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const handleExportRewardCSV = () => {
    if (userRole !== "owner") return;

    const [year, month] = selectedMonth.split("-").map(Number);
    const startDateStr = `${year}/${String(month).padStart(2, '0')}/01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDateStr = `${year}/${String(month).padStart(2, '0')}/${String(lastDay).padStart(2, '0')}`;

    const monthFiltered = attendanceRecords.filter(r => r.workDate.startsWith(selectedMonth));
    const summaryMap: { [email: string]: { hours: number; days: Set<string> } } = {};
    
    monthFiltered.forEach(r => {
      if (!summaryMap[r.email]) summaryMap[r.email] = { hours: 0, days: new Set() };
      summaryMap[r.email].hours += r.workHours || 0;
      summaryMap[r.email].days.add(r.workDate);
    });

    const line1 = ["報酬"];
    const line2 = ["開始", startDateStr, "終了", endDateStr];
    const headers = ["No", "所属", "区分", "ID", "管理番号", "氏名", "報酬額（税抜）", "出勤日数", "時給（税抜）", "勤務時間", "時給制（税抜）", "単価制（税抜）", "対応案件数", "案件報酬（税抜）", "インセンティブ（税抜）", "備考"];

    let noCounter = 1;
    const rows = Object.keys(summaryMap).map(email => {
      const meta = getMemberMeta(email);
      const data = summaryMap[email];
      const roundedHours = Math.round(data.hours * 100) / 100;
      const totalReward = Math.round(roundedHours * meta.hourlyRate);
      
      return [noCounter++, `"RM"`, `"パートナー"`, `""`, `"${meta.managementNumber}"`, `"${meta.name}"`, totalReward, data.days.size, meta.hourlyRate, roundedHours, totalReward, 0, 0, 0, 0, `"${meta.department}"`].join(",");
    });

    const csvContent = "\uFEFF" + [line1.join(","), line2.join(","), headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `報酬計算書_${selectedMonth}.csv`;
    link.click();
  };

  const handleOpenEditModal = (record: AdminAttendanceRecord) => {
    setEditingRecord(record);
    setEditDate(record.workDate);
    setEditStart(record.startTime);
    setEditEnd(record.endTime === "---" ? "" : record.endTime);
    setEditBreak(record.breakMinutes);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editingRecord) return;
    try {
      await attendanceRepository.updateRecordByAdmin(editingRecord.id, { workDate: editDate, startTime: editStart, endTime: editEnd, breakMinutes: editBreak });
      setShowEditModal(false);
      setStatusMessage("打刻データを修正・再計算しました。");
      setTimeout(() => setStatusMessage(null), 3000);
      await loadAllData();
    } catch (error) {
      setStatusMessage("⚠️ エラー：データの修正に失敗しました。");
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const handleDeleteRecord = async (id: string) => {
    try {
      await attendanceRepository.deleteRecord(id);
      setStatusMessage("打刻データを削除しました。");
      setTimeout(() => setStatusMessage(null), 3000);
      await loadAllData();
    } catch (error) {
      setStatusMessage("⚠️ エラー：データの削除に失敗しました。");
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (userRole !== "owner") return;
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      try {
        const lines = text.split(/\r?\n/);
        let firstLine = lines[0] || "";
        
        const testHeaders = splitCSVLine(firstLine);
        if (!testHeaders.some(h => h.includes("管理番号")) && !testHeaders.some(h => h.includes("時給"))) {
          const sjisReader = new FileReader();
          sjisReader.onload = (ev) => processCSVLines(ev.target?.result as string);
          sjisReader.readAsText(file, "Shift_JIS");
        } else {
          processCSVLines(text);
        }
      } catch (error) {
        setStatusMessage("⚠️ エラー：インポート中にエラーが発生しました。");
        setTimeout(() => setStatusMessage(null), 4000);
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  const processCSVLines = async (text: string) => {
    const lines = text.split(/\r?\n/);
    const headers = splitCSVLine(lines[0] || "");
    
    const idxId = headers.findIndex(h => h === "ID");
    const idxNo = headers.findIndex(h => h === "管理番号");
    const idxLastName = headers.findIndex(h => h === "苗字");
    const idxLastNameKana = headers.findIndex(h => h === "苗字カナ");
    const idxFirstName = headers.findIndex(h => h === "名前");
    const idxFirstNameKana = headers.findIndex(h => h === "名前カナ");
    const idxEmail = headers.findIndex(h => h === "メール");
    const idxRate = headers.findIndex(h => h === "時給");
    const idxMedia = headers.findIndex(h => h === "求人媒体");
    const idxCreatedAt = headers.findIndex(h => h === "作成日時");

    if (idxEmail === -1 || idxLastName === -1 || idxFirstName === -1) {
      setStatusMessage("⚠️ エラー：CSVファイル内に必須列（メール・苗字・名前）が見つかりません。");
      setTimeout(() => setStatusMessage(null), 5000);
      return;
    }

    const parsedList: Omit<MemberInfo, "department" | "loginEmail" | "role" | "isOwnerProxy">[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const columns = splitCSVLine(line);
      const maxIdx = Math.max(idxId, idxNo, idxLastName, idxLastNameKana, idxFirstName, idxFirstNameKana, idxEmail, idxRate, idxMedia, idxCreatedAt);
      
      if (columns.length > maxIdx) {
        const email = columns[idxEmail];
        if (!email || !email.includes("@")) continue;

        parsedList.push({ 
          id: columns[idxId] || "",
          managementNumber: columns[idxNo] || "---", 
          lastName: columns[idxLastName] || "",
          lastNameKana: columns[idxLastNameKana] || "",
          firstName: columns[idxFirstName] || "",
          firstNameKana: columns[idxFirstNameKana] || "",
          email: email, 
          hourlyRate: Number(columns[idxRate]) || 0,
          media: columns[idxMedia] || "",
          createdAtStr: columns[idxCreatedAt] || "",
          name: `${columns[idxLastName]} ${columns[idxFirstName]}`
        });
      }
    }

    setStatusMessage("指定データをFirestoreに同期中...");
    const count = await attendanceRepository.saveImportedMembers(parsedList);
    setStatusMessage(`アサインシステムCSVから全 ${count} 名を同期しました！`);
    setTimeout(() => setStatusMessage(null), 4000);
    await loadAllData();
  };

  const filteredMembers = members.filter(m => {
    if (userRole === "owner") return true;
    return m.department === myDepartment;
  });

  const filteredAttendanceRecords = attendanceRecords.filter(rec => {
    if (userRole === "owner") return true;
    const meta = getMemberMeta(rec.email);
    return meta.department === myDepartment;
  });

  const displayedRecords = filteredAttendanceRecords.filter(r => {
    const matchesMonth = r.workDate.startsWith(selectedMonth);
    if (!matchesMonth) return false;

    const matchesEmail = filterEmail === "all" ? true : r.email === filterEmail;
    if (!matchesEmail) return false;

    if (startDate && r.workDate < startDate) return false;
    if (endDate && r.workDate > endDate) return false;

    return true;
  }).sort((a, b) => {
    if (b.workDate !== a.workDate) {
      return b.workDate.localeCompare(a.workDate);
    }
    const timeA = a.endTime === "---" ? "29:99" : a.endTime;
    const timeB = b.endTime === "---" ? "29:99" : b.endTime;
    return timeB.localeCompare(timeA);
  });

  const uniqueDepartmentsForSelect = uniqueDepartments.filter(dept => {
    if (userRole === "owner") return true;
    return dept === myDepartment;
  });

  if (isLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center font-bold text-gray-400">管理者認証中...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans text-sm">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-3">
            <span onClick={() => router.push("/")} className="text-2xl font-bold text-gray-800 tracking-tight cursor-pointer hover:text-emerald-500 transition-colors">あ～るえむ</span>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${userRole === "owner" ? "bg-gray-800 text-white" : "bg-purple-600 text-white"}`}>
              {userRole === "owner" ? "オーナーパネル" : `チーム管理者パネル (${myDepartment || "未設定"})`}
            </span>
          </div>

          <div className="flex space-x-2 border-l border-gray-200 pl-6 text-sm font-bold">
            {/* 💡 【解放】これまではowner限定だった「稼働実績」ボタンを、admin（チームリーダー）にも表示！ */}
            {(userRole === "owner" || userRole === "admin") && (
              <button onClick={() => setActiveTab("summary")} className={`px-3 py-1.5 rounded-xl transition-all ${activeTab === "summary" ? "bg-emerald-50 text-emerald-600 font-extrabold" : "border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50"}`}>
                稼働実績
              </button>
            )}
            <button onClick={() => setActiveTab("records")} className={`px-3 py-1.5 rounded-xl transition-all ${activeTab === "records" ? "bg-emerald-50 text-emerald-600 font-extrabold" : "border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50"}`}>
              稼働記録
            </button>
            <button onClick={() => setActiveTab("members")} className={`px-3 py-1.5 rounded-xl transition-all ${activeTab === "members" ? "bg-emerald-50 text-emerald-600 font-extrabold" : "border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50"}`}>
              所属チーム登録
            </button>
            <button onClick={() => setActiveTab("org")} className={`px-3 py-1.5 rounded-xl transition-all ${activeTab === "org" ? "bg-emerald-50 text-emerald-600 font-extrabold" : "border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50"}`}>
               組織図
            </button>
            {userRole === "owner" && (
              <button onClick={() => setActiveTab("csv")} className={`px-3 py-1.5 rounded-xl transition-all ${activeTab === "csv" ? "bg-emerald-50 text-emerald-600 font-extrabold" : "border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50"}`}>
                CSVインポート
              </button>
            )}
            {/* 👑 西尾さん（owner）限定のメニュー設定タブボタン（仕様保持） */}
            {userRole === "owner" && (
              <button onClick={() => setActiveTab("settings")} className={`px-3 py-1.5 rounded-xl transition-all ${activeTab === "settings" ? "bg-emerald-50 text-emerald-600 font-extrabold" : "border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50"}`}>
                オーナー設定
              </button>
            )}
          </div>
        </div>

        <button onClick={() => router.push("/")} className="text-sm text-emerald-600 hover:text-emerald-700 font-medium transition-colors">
          ← 自分の打刻画面に戻る
        </button>
      </header>

      <main className={`${activeTab === "org" ? "max-w-[100%] px-6" : "max-w-6xl mx-auto px-4"} py-4 space-y-4`}>
        {statusMessage && <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 px-4 py-2.5 rounded-xl font-medium shadow-sm animate-fadeIn">{statusMessage}</div>}

        {(activeTab === "summary" || activeTab === "records") && (
          <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div className="flex items-center flex-wrap gap-y-2 gap-x-4">
              <div className="flex items-center space-x-1.5">
                <span className="font-bold text-gray-400 text-xs">対象月:</span>
                <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-lg font-bold text-gray-700 focus:outline-none cursor-pointer text-xs h-8 shadow-sm">
                  <option value="2026-06">2026年06月</option>
                  <option value="2026-05">2026年05月</option>
                </select>
              </div>

              {/* 💡 【解放】集計用フィルターエリアの出現条件も admin にまで拡張 */}
              {activeTab === "summary" && (userRole === "owner" || userRole === "admin") && (
                <>
                  <div className="bg-gray-100 p-0.5 rounded-xl inline-flex border border-gray-200 shadow-inner border-l ml-2">
                    <button onClick={() => setViewMode("user")} className={`px-3 py-1 rounded-lg font-bold text-xs transition-all ${viewMode === "user" ? "bg-white text-gray-800 shadow-sm font-extrabold" : "text-gray-400 hover:text-gray-600"}`}>👤 user別</button>
                    <button onClick={() => setViewMode("department")} className={`px-3 py-1 rounded-lg font-bold text-xs transition-all ${viewMode === "department" ? "bg-white text-gray-800 shadow-sm font-extrabold" : "text-gray-400 hover:text-gray-600"}`}>🏢 所属別</button>
                  </div>

                  {viewMode === "user" && (
                    <div className="flex items-center flex-wrap gap-x-4 gap-y-2 border-l border-gray-200 pl-4 animate-fadeIn">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold text-gray-400 text-[11px]">提出状態:</span>
                        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-lg font-bold text-gray-700 focus:outline-none cursor-pointer text-xs h-8 shadow-sm">
                          <option value="all">すべて表示</option>
                          <option value="submitted">☑️ 提出済みのみ</option>
                          <option value="unsubmitted">⏳ 未提出のみ</option>
                        </select>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold text-gray-400 text-[11px]">チーム絞り込み:</span>
                        <select value={filterDepartment} onChange={(e) => setFilterDepartment(e.target.value)} className="bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-lg font-bold text-gray-700 focus:outline-none cursor-pointer text-xs h-8 shadow-sm">
                          {userRole === "owner" && <option value="all">すべてのチームを表示</option>}
                          {uniqueDepartmentsForSelect.map(dept => (
                            <option key={dept} value={dept}>{dept}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </>
              )}

              {activeTab === "records" && (
                <>
                  <div className="flex items-center space-x-1.5">
                    <span className="font-bold text-gray-400 text-xs">人フィルター:</span>
                    <select value={filterEmail} onChange={(e) => setFilterEmail(e.target.value)} className="bg-gray-50 border border-gray-200 px-2 py-1 rounded-lg font-bold text-gray-700 focus:outline-none cursor-pointer text-xs h-8 shadow-sm">
                      <option value="all">全員を表示</option>
                      {filteredMembers.map(m => <option key={m.email} value={m.email}>{m.name} ({m.email})</option>)}
                    </select>
                  </div>

                  <div className="flex items-center space-x-2 border-l border-gray-200 pl-4 animate-fadeIn text-xs font-bold">
                    <span className="text-gray-400">日付指定:</span>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-gray-50 border border-gray-200 px-2 py-1 rounded-lg text-gray-700 focus:outline-none cursor-pointer h-8 shadow-sm font-semibold" />
                    <span className="text-gray-400">〜</span>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-gray-50 border border-gray-200 px-2 py-1 rounded-lg text-gray-700 focus:outline-none cursor-pointer h-8 shadow-sm font-semibold" />
                    {(startDate || endDate) && (
                      <button onClick={() => { setStartDate(""); setEndDate(""); }} className="text-[11px] bg-gray-200 text-gray-600 hover:bg-gray-300 font-bold px-2 py-1 rounded-md transition-all ml-1">クリア</button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 💡 【ガチガチのセキュリティ制限】adminが閲覧する際は、流出を防ぐためデータを自チーム(filteredAttendanceRecords / filteredMembers)に内部で完全自動制限！ */}
        {activeTab === "summary" && (userRole === "owner" || userRole === "admin") && (
          <TabSummary 
            attendanceRecords={filteredAttendanceRecords} 
            members={filteredMembers} 
            selectedMonth={selectedMonth} 
            statusFilter={statusFilter}
            viewMode={viewMode}
            filterDepartment={filterDepartment}
            getMemberMeta={getMemberMeta} 
            handleExportRewardCSV={handleExportRewardCSV} 
          />
        )}
        
        {activeTab === "records" && (
          <TabRecords 
            displayedRecords={displayedRecords} 
            getMemberMeta={getMemberMeta} 
            handleOpenEditModal={handleOpenEditModal} 
            handleDeleteRecord={handleDeleteRecord} 
            members={filteredMembers}
            loadAllData={loadAllData}
            setStatusMessage={setStatusMessage}
          />
        )}
        
        {activeTab === "members" && (
          <TabMembers 
            members={filteredMembers} 
            editingDeptEmail={editingDeptEmail} 
            setEditingDeptEmail={setEditingDeptEmail} 
            inputDeptText={inputDeptText} 
            setInputDeptText={setInputDeptText} 
            handleSaveDepartment={handleSaveDepartment}
            accountRequests={userRole === "owner" ? accountRequests : []}
            myRole={userRole}
            uniqueDepartments={uniqueDepartments} 
          />
        )}

        {activeTab === "org" && (
          <TabOrgChart 
            members={filteredMembers}
            uniqueDepartments={uniqueDepartments}
          />
        )}

        {activeTab === "csv" && userRole === "owner" && (
          <TabCsv handleCSVUpload={handleCSVUpload} members={members} />
        )}

        {/* 分割した子コンポーネント TabSettings を呼び出す仕様（完全保持） */}
        {activeTab === "settings" && userRole === "owner" && (
          <TabSettings setStatusMessage={setStatusMessage} />
        )}
      </main>

      {showEditModal && editingRecord && (
        <EditModal editingRecord={editingRecord} editDate={editDate} setEditDate={setEditDate} editStart={editStart} setEditStart={setEditStart} editEnd={editEnd} setEditEnd={setEditEnd} editBreak={editBreak} setEditBreak={setEditBreak} setShowEditModal={setShowEditModal} handleSaveEdit={handleSaveEdit} getMemberMeta={getMemberMeta} />
      )}
    </div>
  );
}