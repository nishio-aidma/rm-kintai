"use client";

import { useState, useEffect } from "react";
// 💡 Firestoreから共通設定を直接読み書きするため、repositoryと公式関数を上部で静的インポート
import { MemberInfo, attendanceRepository } from "@/lib/attendanceRepository";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface TabCsvProps {
  handleCSVUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  members: MemberInfo[];
}

export default function TabCsv({ handleCSVUpload, members }: TabCsvProps) {
  const [searchTerm, setSearchTerm] = useState("");
  
  // 最終アップロード日時を記憶するローカルステート
  const [lastUploadTime, setLastUploadTime] = useState<string>("---");

  // 💡 画面を開いた瞬間に、個人PCのメモ帳ではなくFirestoreの共通設定から前回のインポート日時を回収
  useEffect(() => {
    const loadImportTime = async () => {
      try {
        const settings = await attendanceRepository.getDashboardSettings();
        if (settings && settings.lastCsvImportTime) {
          setLastUploadTime(settings.lastCsvImportTime);
        }
      } catch (error) {
        console.error("インポート日時の読み込みに失敗しました:", error);
      }
    };
    loadImportTime();
  }, []);

  // 👑 修正：非同期の通信前にインポート処理を最優先で実行する安全仕様に改善
  const onFileChangeWithTimestamp = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;

    // 💡 【最重要】イベントやファイル情報がブラウザに破棄される前に、大元のインポート処理を即座に実行！
    handleCSVUpload(e);

    // インポート処理へ引き渡した後に、バックグラウンドで日時をFirestoreへ刻む
    const now = new Date();
    const timeStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    try {
      // settings/dashboard ドキュメントに「lastCsvImportTime」としてマージ保存！
      const docRef = doc(db, "settings", "dashboard");
      await setDoc(docRef, { lastCsvImportTime: timeStr }, { merge: true });
      setLastUploadTime(timeStr);
    } catch (error) {
      console.error("インポート日時の保存に失敗しました:", error);
    }
  };

  // 検索フィルター（仕様保持）
  const filteredMembers = members.filter(m => 
    m.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.managementNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.lastNameKana.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.firstNameKana.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* CSVインポートエリア */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-800">アサインシステムCSVインポート</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              アサインシステムから出力した最新のCSVファイルを読み込み、イエローハイライトの10項目をFirestoreへ一括同期します。
            </p>
          </div>
          
          {/* 最終アップロード日時バッジ */}
          <div className="text-right">
            <span className="text-[10px] text-gray-400 block font-bold">最終インポート日時</span>
            <span className="text-xs font-mono font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg inline-block mt-0.5 shadow-sm">
              🕒 {lastUploadTime}
            </span>
          </div>
        </div>

        <label className="border-2 border-dashed border-gray-200 hover:border-emerald-400 bg-gray-50/30 hover:bg-emerald-50/10 rounded-2xl p-8 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all group">
          <div className="bg-white p-3 rounded-full shadow-sm border border-gray-100 text-gray-400 group-hover:text-emerald-500 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-xs font-bold text-gray-700 group-hover:text-emerald-600 transition-colors">クリックしてCSVファイルを選択</p>
            <p className="text-[10px] text-gray-400 mt-0.5">またはファイルをここに直接ドラッグ＆ドロップ</p>
          </div>
          <input type="file" accept=".csv" onChange={onFileChangeWithTimestamp} className="hidden" />
        </label>
      </div>

      {/* 同期済みデータテーブル */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <span>🗂️ 同期済みメンバーマスタ（指定10項目完全網羅）</span>
              <span className="bg-emerald-50 text-emerald-600 text-[10px] px-2 py-0.5 rounded-full font-extrabold">
                全 {members.length} 名
              </span>
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5">CSVから抽出された10項目が、Firestoreへ寸分狂わず格納されている事実を確認できます。</p>
          </div>

          {/* 爆速検索ボックス */}
          <div className="w-52 relative">
            <input
              type="text"
              placeholder="名前・カナ・メール・IDで検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-gray-700 font-semibold focus:outline-none focus:border-emerald-400"
            />
            <span className="absolute left-2.5 top-2 text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0110.607 10.607z" />
              </svg>
            </span>
          </div>
        </div>

        {filteredMembers.length === 0 ? (
          <p className="text-center text-gray-400 py-12 border border-dashed border-gray-100 rounded-xl bg-gray-50/20 font-medium">
            {searchTerm ? "検索条件に一致するメンバーはいません。" : "現在データベースは空っぽです。上のエリアからCSVを同期してください。"}
          </p>
        ) : (
          <div className="overflow-x-auto border border-gray-100 rounded-xl">
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 font-bold bg-gray-50/50 text-[10px] uppercase tracking-wider">
                  <th className="py-3 pl-4 whitespace-nowrap">1. ID</th>
                  <th className="py-3 px-2 whitespace-nowrap">2. 管理番号</th>
                  <th className="py-3 px-2 whitespace-nowrap">3. 苗字</th>
                  <th className="py-3 px-2 whitespace-nowrap">4. 苗字カナ</th>
                  <th className="py-3 px-2 whitespace-nowrap">5. 名前</th>
                  <th className="py-3 px-2 whitespace-nowrap">6. 名前カナ</th>
                  <th className="py-3 px-2 whitespace-nowrap">7. メール</th>
                  <th className="py-3 px-2 text-right whitespace-nowrap w-24">8. 時給</th>
                  <th className="py-3 pl-6 whitespace-nowrap">9. 求人媒体</th>
                  <th className="py-3 px-2 whitespace-nowrap">10. 作成日時</th>
                  <th className="py-3 pr-4 text-center whitespace-nowrap w-28">（所属チーム）</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-gray-600 text-xs font-medium tabular-nums">
                {filteredMembers.map((member) => (
                  <tr key={member.email} className="hover:bg-gray-50/30 transition-colors text-[11px]">
                    <td className="py-2.5 pl-4 text-gray-400 font-mono text-[10px] max-w-[80px] truncate" title={member.id}>{member.id || "---"}</td>
                    <td className="py-2.5 px-2 text-gray-700 font-bold">{member.managementNumber || "---"}</td>
                    <td className="py-2.5 px-2 text-gray-900 font-black text-xs">{member.lastName || "---"}</td>
                    <td className="py-2.5 px-2 text-gray-400 text-[10px]">{member.lastNameKana || "---"}</td>
                    <td className="py-2.5 px-2 text-gray-900 font-black text-xs">{member.firstName || "---"}</td>
                    <td className="py-2.5 px-2 text-gray-400 text-[10px]">{member.firstNameKana || "---"}</td>
                    <td className="py-2.5 px-2 text-gray-500 font-medium">{member.email}</td>
                    <td className="py-2.5 px-2 text-right font-bold text-gray-800 text-xs">
                      {member.hourlyRate ? `¥${member.hourlyRate.toLocaleString()}` : "¥0"}
                    </td>
                    <td className="py-2.5 pl-6 text-gray-400 max-w-[120px] truncate" title={member.media}>{member.media || "---"}</td>
                    <td className="py-2.5 px-2 text-gray-400 text-[10px] whitespace-nowrap">{member.createdAtStr || "---"}</td>
                    <td className="py-2.5 pr-4 text-center">
                      <span className={`text-[9px] px-2 py-0.5 rounded-md font-bold ${member.department ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-gray-100 text-gray-400"}`}>
                        {member.department || "未設定"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}