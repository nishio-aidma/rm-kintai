"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { attendanceRepository } from "@/lib/attendanceRepository";

interface AttendanceRecord {
  id: string;
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  workHours: number;
  submitted: boolean;
  verified: boolean;
}

export default function RecordsPage() {
  const router = useRouter();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0');
  });

  const fetchRecords = async (email: string) => {
    try {
      const q = query(collection(db, "attendance_records"), where("email", "==", email), where("deleted", "==", false));
      const querySnapshot = await getDocs(q);
      const fetchedRecords: AttendanceRecord[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        fetchedRecords.push({
          id: doc.id,
          workDate: data.workDate || "",
          startTime: data.startTime || "",
          endTime: data.endTime || "---",
          breakMinutes: data.breakMinutes || 0,
          workHours: data.workHours || 0,
          submitted: data.submitted || false,
          verified: data.verified || false,
        });
      });

      fetchedRecords.sort((a, b) => {
        if (a.workDate !== b.workDate) return b.workDate.localeCompare(a.workDate);
        return a.startTime.localeCompare(b.startTime);
      });

      setRecords(fetchedRecords);
    } catch (error) {
      console.error("履歴の取得に失敗しました:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserEmail(user.email || "");
        fetchRecords(user.email || "");
      } else {
        router.push("/login");
      }
    });
    return () => unsubscribe();
  }, [selectedMonth, router]);

  useEffect(() => {
    if (!selectedMonth) {
      setFilteredRecords(records);
      return;
    }
    const filtered = records.filter(rec => rec.workDate.startsWith(selectedMonth));
    setFilteredRecords(filtered);
  }, [selectedMonth, records]);

  const handleVerifyRow = async (id: string) => {
    try {
      setStatusMessage("稼働データを確定中...");
      await attendanceRepository.updateRecordVerification(id, true);
      
      setStatusMessage("稼働セクションを確認済みにしました。");
      setTimeout(() => setStatusMessage(null), 3000);
      
      await fetchRecords(userEmail);
    } catch (error) {
      setStatusMessage("エラー：確認処理に失敗しました。");
    }
  };

  const handleDeleteRow = async (id: string) => {
    if (!confirm("この打刻データを削除してもよろしいですか？")) return;
    try {
      setStatusMessage("データを削除中...");
      await attendanceRepository.deleteRecord(id);
      setStatusMessage("打刻データを削除しました。");
      setTimeout(() => setStatusMessage(null), 3000);
      await fetchRecords(userEmail);
    } catch (error) {
      setStatusMessage("エラー：削除に失敗しました。");
    }
  };

  const uniqueDates = new Set(filteredRecords.map(rec => rec.workDate));
  const totalWorkDays = uniqueDates.size;

  const totalWorkHours = filteredRecords.reduce((sum, rec) => sum + (rec.workHours || 0), 0);
  const roundedTotalWorkHours = Math.round(totalWorkHours * 100) / 100;

  const totalCount = filteredRecords.length;
  const verifiedCount = filteredRecords.filter(rec => rec.verified).length;
  const isAllVerified = totalCount > 0 && verifiedCount === totalCount;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          <span onClick={() => router.push("/")} className="text-2xl font-bold text-gray-800 tracking-tight cursor-pointer hover:text-emerald-500 transition-colors">あ～るえむ</span>
          <span className="text-xs bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full font-medium">業務記録一覧</span>
        </div>
        <button onClick={() => router.push("/")} className="text-sm text-emerald-600 hover:text-emerald-700 font-medium transition-colors">← トップページに戻る</button>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-end justify-between">
          <div className="text-left">
            <h2 className="text-xl font-bold text-gray-800">あなたの業務記録</h2>
            <p className="text-xs text-gray-400 mt-1">{userEmail} さんの打刻履歴です。各稼働内容を確認し、確定させてください。</p>
          </div>
          
          <div className="flex items-center space-x-2 bg-white px-4 py-2 rounded-xl border border-gray-100 shadow-sm">
            <label className="text-xs font-bold text-gray-400">表示月:</label>
            <select 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="text-sm font-semibold bg-transparent text-gray-700 focus:outline-none cursor-pointer"
            >
              <option value="2026-06">2026年06月</option>
              <option value="2026-05">2026年05月</option>
              <option value="2026-04">2026年04月</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center space-y-0.5">
            <p className="text-[11px] font-bold text-gray-400 tracking-wider">当月の稼働日数</p>
            <p className="text-2xl font-black text-gray-800 tabular-nums">
              {totalWorkDays} <span className="text-xs font-medium text-gray-400">日</span>
            </p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center space-y-0.5">
            <p className="text-[11px] font-bold text-gray-400 tracking-wider">当月の総稼働時間</p>
            <p className="text-2xl font-black text-emerald-500 tabular-nums">
              {roundedTotalWorkHours} <span className="text-xs font-medium text-gray-400">時間</span>
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 overflow-hidden">
          {isLoading ? (
            <p className="text-center text-sm text-gray-400 py-6">記録を読み込み中...</p>
          ) : filteredRecords.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-6">選択された月の打刻記録がありません。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 font-semibold bg-gray-50/50">
                    <th className="py-2 pl-3 font-medium">勤務日</th>
                    <th className="py-2 font-medium">業務開始</th>
                    <th className="py-2 font-medium">業務終了</th>
                    <th className="py-2 font-medium">休憩時間</th>
                    <th className="py-2 font-medium">実働時間</th>
                    <th className="py-2 font-medium text-center w-14">削除</th>
                    {/* ✨ 「間違い確認」からスマートな「確認状況」に修正 */}
                    <th className="py-2 text-center w-36 pr-3 font-bold text-gray-500">確認状況</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-gray-600">
                  {filteredRecords.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50/30 transition-colors">
                      <td className="py-2 font-medium pl-3">{record.workDate}</td>
                      <td className="py-2 tabular-nums">{record.startTime}</td>
                      <td className="py-2 tabular-nums">
                        <span className={record.endTime === "---" ? "text-gray-300 font-normal" : ""}>{record.endTime}</span>
                      </td>
                      <td className="py-2 tabular-nums text-gray-400">{record.endTime === "---" ? "---" : `${record.breakMinutes} 分`}</td>
                      <td className="py-2 tabular-nums font-semibold text-gray-700">{record.endTime === "---" ? "---" : `${record.workHours} 時間`}</td>
                      
                      <td className="py-2 text-center">
                        {record.verified ? (
                          <span className="text-gray-300 select-none cursor-not-allowed" title="確認済みのデータは削除できません">🔒</span>
                        ) : (
                          <button 
                            onClick={() => handleDeleteRow(record.id)}
                            className="text-gray-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50 transition-all"
                            title="このレコードを削除する"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-3.5 h-3.5 inline">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.34 6m-4.02 0l-.34-6M4.5 6.375a.5.5 0 01.5-.5h14a.5.5 0 01.5.5v1.5a.5.5 0 01-.5.5H5a.5.5 0 01-.5-.5v-1.5zM10.5 4.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1.375H10.5V4.5zm-5 4.125h13v11.25a2.25 2.25 0 01-2.25 2.25H7.75A2.25 2.25 0 015.5 19.875V8.625z" />
                            </svg>
                          </button>
                        )}
                      </td>

                      {/* ✨ 「間違いありません」ボタンから「確認する」ボタンにブラッシュアップ */}
                      <td className="py-2 text-center pr-3">
                        {record.verified ? (
                          <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-xl font-extrabold shadow-sm inline-block select-none">
                            ✅ 確認済み
                          </span>
                        ) : (
                          <button
                            onClick={() => handleVerifyRow(record.id)}
                            disabled={record.endTime === "---"}
                            className="text-[10px] bg-white hover:bg-emerald-500 text-gray-500 hover:text-white border border-gray-200 hover:border-emerald-500 px-2.5 py-0.5 rounded-xl font-bold shadow-sm transition-all disabled:opacity-20 disabled:pointer-events-none"
                          >
                            🔍 確認する
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center space-y-4">
          
          {statusMessage && (
            <div className="max-w-md mx-auto bg-emerald-50 text-emerald-800 border border-emerald-100 px-4 py-2 rounded-xl text-xs font-medium transition-all">{statusMessage}</div>
          )}
          
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-gray-500">
              📊 当月の稼働確認進捗： <span className="text-gray-800 text-sm font-black font-mono">{verifiedCount}</span> / <span className="text-gray-400 font-mono">{totalCount}</span> 件 確認完了
            </p>
            
            <div className="max-w-xs mx-auto bg-gray-100 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-emerald-400 h-full transition-all duration-500" 
                style={{ width: `${totalCount > 0 ? (verifiedCount / totalCount) * 100 : 0}%` }}
              ></div>
            </div>
          </div>

          <div className="pt-1">
            {isAllVerified ? (
              <div className="bg-emerald-50 text-emerald-700 font-extrabold py-2.5 px-6 rounded-xl text-xs inline-block border border-emerald-100 shadow-sm">
                ✓ 今月分のすべての業務セクションの確認が完了しています！
              </div>
            ) : (
              <div className="bg-amber-50 text-amber-700 font-semibold py-2.5 px-6 rounded-xl text-xs inline-block border border-amber-100">
                ⏳ 未確認の稼働があります。各セクションの「確認する」ボタンを押して確定させてください。
              </div>
            )}
          </div>
          
        </div>
      </main>
    </div>
  );
}