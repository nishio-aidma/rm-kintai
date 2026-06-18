"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
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
  const [userEmail, setUserEmail] = useState<string>("読み込み中...");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // 👑 中央にカスタムモーダルを表示して美しく削除確認を行うための状態管理
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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

  // 👑 引き戻しを解消するため、トップ画面と同じ「合言葉のメモ帳」を読み込む仕組み
  useEffect(() => {
    const sessionStr = localStorage.getItem("session");
    
    if (sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        const email = session.email || "";
        setUserEmail(email);
        fetchRecords(email);
      } catch (error) {
        console.error("ログイン情報の読み込みに失敗しました:", error);
        router.push("/login");
      }
    } else {
      // 合言葉がなければ未ログインとみなし、安全にログイン画面へ移動
      router.push("/login");
    }
  }, [selectedMonth, router]);

  useEffect(() => {
    if (!selectedMonth) {
      setFilteredRecords(records);
      return;
    }
    const filtered = records.filter(rec => rec.workDate.startsWith(selectedMonth));
    setFilteredRecords(filtered);
  }, [selectedMonth, records]);

  // 💡 【機能拡張】確認済みの「確定」と「解除」を1つの関数でトグル制御できるようにアップデート
  const handleToggleVerifyRow = async (id: string, currentStatus: boolean) => {
    try {
      const nextStatus = !currentStatus; // 現在がtrueならfalse、falseならtrueに反転
      setStatusMessage(nextStatus ? "稼働データを確定中..." : "確定を解除中...");
      
      await attendanceRepository.updateRecordVerification(id, nextStatus);
      
      setStatusMessage(nextStatus ? "稼働セクションを確認済みにしました。" : "確認済みを解除（未確認に）しました。");
      setTimeout(() => setStatusMessage(null), 3000);
      
      await fetchRecords(userEmail);
    } catch (error) {
      setStatusMessage("エラー：確認ステータスの変更に失敗しました。");
    }
  };

  const handleDeleteRow = async (id: string) => {
    try {
      setStatusMessage("データを削除中...");
      await attendanceRepository.deleteRecord(id);
      setStatusMessage("打刻データを削除しました。");
      setDeleteConfirmId(null); // 確認状態をリセット
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
                    <th className="py-2 font-medium text-center w-20">削除</th>
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
                      
                      {/* 削除ボタンエリア */}
                      <td className="py-2 text-center">
                        {record.verified ? (
                          <span className="text-gray-300 select-none cursor-not-allowed" title="確認済みのデータは削除できません（一度確認を解除してください）">🔒</span>
                        ) : (
                          <button 
                            onClick={() => setDeleteConfirmId(record.id)}
                            className="text-gray-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50 transition-all"
                            title="このレコードを削除する"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-3.5 h-3.5 inline">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.34 6m-4.02 0l-.34-6M4.5 6.375a.5.5 0 01.5-.5h14a.5.5 0 01.5.5v1.5a.5.5 0 01-.5.5H5a.5.5 0 01-.5-.5v-1.5zM10.5 4.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1.375H10.5V4.5zm-5 4.125h13v11.25a2.25 2.25 0 01-2.25 2.25H7.75A2.25 2.25 0 015.5 19.875V8.625z" />
                            </svg>
                          </button>
                        )}
                      </td>

                      {/* 💡 【大改造】確認状況セル。一度確認済みにした行も、もう一度ポチッと押すことで安全に戻せる仕様に変更 */}
                      <td className="py-2 text-center pr-3">
                        {record.verified ? (
                          <button
                            onClick={() => handleToggleVerifyRow(record.id, true)}
                            className="text-[10px] bg-emerald-50 hover:bg-amber-50 text-emerald-700 hover:text-amber-700 border border-emerald-200 hover:border-amber-300 px-2.5 py-0.5 rounded-xl font-extrabold shadow-sm inline-block transition-all group cursor-pointer"
                            title="クリックすると未確認（戻す）状態に引き戻せます"
                          >
                            {/* 通常時は「確認済み」、マウスを乗せた時だけ「🔄 解除する」に変身するモダンUI仕様 */}
                            <span className="group-hover:hidden">✅ 確認済み</span>
                            <span className="hidden group-hover:inline">🔄 解除する</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleToggleVerifyRow(record.id, false)}
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

      {/* カスタム削除確認モーダル */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full mx-4 shadow-2xl border border-gray-100 text-center space-y-5 animate-scaleUp">
            
            <div className="w-12 h-12 mx-auto rounded-full bg-red-50 text-red-500 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>

            <div className="space-y-1">
              <h4 className="text-base font-black text-gray-900 tracking-tight">打刻データの削除確認</h4>
              <p className="text-sm font-bold text-gray-700">本当にこの業務記録を削除しますか？</p>
              <p className="text-xs text-red-500 bg-red-50 p-2.5 rounded-xl border border-red-100 font-medium mt-2 leading-relaxed text-left">
                ⚠️ 注意：この操作を実行すると、該当日の勤務時間および実働データが完全に削除され、復元できなくなります。
              </p>
            </div>

            <div className="flex space-x-2.5 pt-1">
              <button 
                type="button"
                onClick={() => setDeleteConfirmId(null)} 
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold py-2.5 rounded-xl transition-all"
              >
                キャンセル
              </button>
              <button 
                type="button"
                onClick={() => handleDeleteRow(deleteConfirmId)} 
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-black py-2.5 rounded-xl shadow-sm transition-all shadow-red-100"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}