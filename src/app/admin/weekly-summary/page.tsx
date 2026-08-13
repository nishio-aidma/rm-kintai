"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { attendanceRepository, MemberInfo } from "@/lib/attendanceRepository";

interface AdminAttendanceRecord {
  id: string;
  userName: string;
  email: string;
  workDate: string; // "YYYY-MM-DD"
  startTime: string;
  endTime: string;
  breakMinutes: number;
  workHours: number;
  workMinutes?: number;
  submitted: boolean;
}

// 週の範囲を表す型定義
interface WeekPeriod {
  label: string;      // 表示用（例: "8/3(月) 〜 8/9(日)"）
  startDate: string;  // "YYYY-MM-DD"
  endDate: string;    // "YYYY-MM-DD"
  totalMinutes: number;
  totalReward: number;
}

function WeeklySummaryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isLoading, setIsLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const paramMonth = searchParams?.get("month");
    if (paramMonth) return paramMonth;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  const [attendanceRecords, setAttendanceRecords] = useState<AdminAttendanceRecord[]>([]);
  const [members, setMembers] = useState<MemberInfo[]>([]);

  // データ読み込み
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [allRecords, allMembers] = await Promise.all([
        attendanceRepository.getAllRecordsForAdmin(),
        attendanceRepository.getAllMembers()
      ]);
      setAttendanceRecords(allRecords);
      setMembers(allMembers);
    } catch (error) {
      console.error("週別データの読み込みに失敗しました:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 月選択用の選択肢を作成（過去6ヶ月〜来月）
  const generateMonthOptions = () => {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = -6; i <= 1; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      options.push({ value: `${y}-${m}`, label: `${y}年${m}月` });
    }
    return options.reverse();
  };

  // メンバーの時給情報を取得する共通処理
  const getMemberHourlyRate = (email: string) => {
    const cleanEmail = (email || "").trim().toLowerCase();
    const matched = members.find(m => 
      (m.email || "").trim().toLowerCase() === cleanEmail || 
      (m.loginEmail || "").trim().toLowerCase() === cleanEmail
    );
    return matched ? matched.hourlyRate : 0;
  };

  // 👑 【修正】選択された月（selectedMonth）に属する打刻データのみを集計するように修正
  const calculateWeeklySummaries = (): WeekPeriod[] => {
    const [yearStr, monthStr] = selectedMonth.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    if (isNaN(year) || isNaN(month)) return [];

    // その月の1日と最終日
    const firstDayOfMonth = new Date(year, month - 1, 1);
    const lastDayOfMonth = new Date(year, month, 0);

    // 1日が含まれる週の「月曜日」を探す
    const firstMonday = new Date(firstDayOfMonth);
    const dayOfWeek = firstMonday.getDay(); // 0:日, 1:月, ... 6:土
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    firstMonday.setDate(firstMonday.getDate() + diffToMonday);

    const weeks: WeekPeriod[] = [];
    let currentMonday = new Date(firstMonday);

    // 月末日を超えるまで1週間（7日）ずつ進める
    while (currentMonday <= lastDayOfMonth) {
      const currentSunday = new Date(currentMonday);
      currentSunday.setDate(currentSunday.getDate() + 6);

      const formatYMD = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      const startYMD = formatYMD(currentMonday);
      const endYMD = formatYMD(currentSunday);

      const startLabel = `${currentMonday.getMonth() + 1}/${currentMonday.getDate()}(月)`;
      const endLabel = `${currentSunday.getMonth() + 1}/${currentSunday.getDate()}(日)`;

      // 👑 【修正箇所】この週（月曜〜日曜）の範囲に入り、かつ「選択中の月（selectedMonth）」に該当するデータのみを抽出
      const weekRecords = attendanceRecords.filter(r => 
        r.workDate >= startYMD && 
        r.workDate <= endYMD && 
        r.workDate.startsWith(selectedMonth)
      );

      // 時間と報酬を合算
      let totalMinutes = 0;
      let totalReward = 0;

      weekRecords.forEach(r => {
        const minutes = r.workMinutes ?? Math.round((r.workHours || 0) * 60);
        const hours = Math.round((r.workHours || 0) * 100) / 100;
        const rate = getMemberHourlyRate(r.email);

        totalMinutes += minutes;
        totalReward += Math.round(hours * rate);
      });

      weeks.push({
        label: `${startLabel} 〜 ${endLabel}`,
        startDate: startYMD,
        endDate: endYMD,
        totalMinutes,
        totalReward
      });

      // 次の週の月曜日へ
      currentMonday.setDate(currentMonday.getDate() + 7);
    }

    return weeks;
  };

  const weeklyList = calculateWeeklySummaries();

  // 月全体の総合計
  const monthTotalMinutes = weeklyList.reduce((sum, w) => sum + w.totalMinutes, 0);
  const monthTotalReward = weeklyList.reduce((sum, w) => sum + w.totalReward, 0);

  if (isLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center font-bold text-gray-400">集計データを計算中...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans text-sm pb-12">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          <span className="bg-gray-800 text-white text-xs px-2.5 py-1 rounded-full font-medium">
            オーナー特設パネル
          </span>
          <h1 className="text-base font-bold text-gray-900">📅 週別 稼働・報酬集計表</h1>
        </div>

        <button 
          onClick={() => router.push("/admin")} 
          className="text-xs font-bold bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-3.5 py-2 rounded-xl transition-all cursor-pointer"
        >
          ← 管理者画面に戻る
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        
        {/* 月選択 ＆ 月間総合計カード */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-gray-400 text-xs">対象月を選択:</span>
            <select 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)} 
              className="bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-xl font-bold text-gray-800 focus:outline-none cursor-pointer text-xs h-9 shadow-sm"
            >
              {generateMonthOptions().map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-[10px] font-bold text-gray-400">月間合計時間</p>
              <p className="text-sm font-black text-gray-800 font-mono">
                {Math.floor(monthTotalMinutes / 60)}時間 {monthTotalMinutes % 60}分
              </p>
            </div>
            <div className="text-right border-l border-gray-200 pl-4">
              <p className="text-[10px] font-bold text-emerald-600">月間合計報酬額（税抜）</p>
              <p className="text-sm font-black text-emerald-600 font-mono">
                ¥{monthTotalReward.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* 週別集計テーブル（シンプルな表形式） */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            <h2 className="text-xs font-bold text-gray-500">
              月曜始まり 〜 日曜終わり（選択月のみ集計）
            </h2>
            <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-md font-bold">
              全 {weeklyList.length} 週
            </span>
          </div>

          <div className="overflow-hidden border border-gray-100 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 font-bold bg-gray-50/60 text-xs">
                  <th className="py-3 pl-6">期間（月曜 〜 日曜）</th>
                  <th className="py-3 text-right">合計稼働時間</th>
                  <th className="py-3 text-right pr-6 text-emerald-600 font-extrabold">合計報酬額（税抜）</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-xs font-bold text-gray-700">
                {weeklyList.map((week, idx) => {
                  const hours = Math.floor(week.totalMinutes / 60);
                  const minutes = week.totalMinutes % 60;

                  return (
                    <tr key={idx} className="hover:bg-gray-50/40 transition-colors">
                      <td className="py-3.5 pl-6">
                        <span className="bg-gray-100 text-gray-800 px-2.5 py-1 rounded-lg text-xs font-mono font-bold inline-block">
                          第 {idx + 1} 週：{week.label}
                        </span>
                      </td>

                      <td className="py-3.5 text-right font-mono tabular-nums text-gray-800">
                        {hours > 0 || minutes > 0 ? (
                          <span>{hours} 時間 {minutes} 分</span>
                        ) : (
                          <span className="text-gray-300 font-normal">0 時間 0 分</span>
                        )}
                      </td>

                      <td className="py-3.5 text-right pr-6 font-mono tabular-nums text-emerald-600 text-sm font-black">
                        {week.totalReward > 0 ? (
                          `¥${week.totalReward.toLocaleString()}`
                        ) : (
                          <span className="text-gray-300 font-normal text-xs">¥0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  );
}

export default function WeeklySummaryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center font-bold text-gray-400">読み込み中...</div>}>
      <WeeklySummaryContent />
    </Suspense>
  );
}