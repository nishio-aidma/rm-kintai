"use client";

import { useState, useEffect } from "react";
import { attendanceRepository, MemberInfo } from "@/lib/attendanceRepository";
// 💡 公式関数を上部で完全に安全な静的インポートに集約
import { doc, setDoc, serverTimestamp, collection, getDocs, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// 固定メンバー用の型定義
interface FixedMember {
  id: string;
  managementNumber: string;
  lastName: string;
  lastNameKana: string;
  firstName: string;
  firstNameKana: string;
  email: string;
  hourlyRate: number;
  media: string;
  createdAtStr: string;
  name: string;
}

interface TabSettingsProps {
  setStatusMessage: (msg: string | null) => void;
  loadAllParentData: () => Promise<void>;
}

export default function TabSettings({ setStatusMessage, loadAllParentData }: TabSettingsProps) {
  const [footerMessageInput, setFooterMessageInput] = useState<string>("");
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);

  // 一般管理者(admin)に表示させるメニューをON/OFFするためのチェック配列ステート
  const [adminAllowedTabs, setAdminAllowedTabs] = useState<string[]>(["summary", "records", "org"]);

  // 🔒 固定メンバー管理用のステート
  const [fixedMembers, setFixedMembers] = useState<FixedMember[]>([]);
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastNameKana, setLastNameKana] = useState("");
  const [firstNameKana, setFirstNameKana] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [hourlyRate, setHourlyRate] = useState<number>(0);

  // 画面を開いた瞬間に、すべての設定データと固定メンバー一覧をFirestoreから同時回収
  const loadAllSettingsAndMembers = async () => {
    try {
      // 1. ダッシュボード設定の取得
      const settings = await attendanceRepository.getDashboardSettings();
      if (settings) {
        if (settings.footerMessage) setFooterMessageInput(settings.footerMessage);
        if (settings.adminAllowedTabs) setAdminAllowedTabs(settings.adminAllowedTabs);
      }

      // 2. 固定メンバー一覧の取得
      const querySnapshot = await getDocs(collection(db, "fixed_members"));
      const list: FixedMember[] = [];
      querySnapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as FixedMember);
      });
      setFixedMembers(list);
    } catch (error) {
      console.error("設定または固定メンバーの読み込みに失敗しました:", error);
    }
  };

  useEffect(() => {
    loadAllSettingsAndMembers();
  }, []);

  const handleCheckboxChange = (tabName: string) => {
    if (adminAllowedTabs.includes(tabName)) {
      setAdminAllowedTabs(adminAllowedTabs.filter((t) => tabName !== t));
    } else {
      setAdminAllowedTabs([...adminAllowedTabs, tabName]);
    }
  };

  // ダッシュボード・メニュー権限の保存関数
  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      setStatusMessage("ダッシュボード設定を更新中...");
      
      const docRef = doc(db, "settings", "dashboard");
      await setDoc(docRef, { 
        footerMessage: footerMessageInput,
        adminAllowedTabs: adminAllowedTabs,
        updatedAt: serverTimestamp() 
      }, { merge: true });

      setStatusMessage("✨ ダッシュボードメッセージ ＆ 管理者メニュー表示権限を正常に更新しました！");
      setTimeout(() => setStatusMessage(null), 4000);
      
      await loadAllParentData();
    } catch (error) {
      console.error("設定の保存エラー:", error);
      setStatusMessage("⚠️ エラー：設定の保存に失敗しました。");
      setTimeout(() => setStatusMessage(null), 4000);
    } finally {
      setIsSavingSettings(false);
    }
  };

  // 👑 固定メンバーの動的登録
  const handleRegisterFixedMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberEmail.trim() || !lastName.trim() || !firstName.trim()) {
      setStatusMessage("⚠️ 必須項目（苗字・名前・メール）を入力してください。");
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    const cleanEmail = memberEmail.trim().toLowerCase();
    const docId = `fixed-${Date.now()}`;

    const newMember: FixedMember = {
      id: docId,
      managementNumber: "固定枠",
      lastName: lastName.trim(),
      lastNameKana: lastNameKana.trim(),
      firstName: firstName.trim(),
      firstNameKana: firstNameKana.trim(),
      email: cleanEmail,
      hourlyRate: Number(hourlyRate) || 0,
      media: "オーナー直接登録",
      createdAtStr: new Date().toLocaleDateString("ja-JP"),
      name: `${lastName.trim()} ${firstName.trim()}`
    };

    try {
      await setDoc(doc(db, "fixed_members", cleanEmail), newMember);
      
      // フォームリセット
      setLastName("");
      setFirstName("");
      setLastNameKana("");
      setFirstNameKana("");
      setMemberEmail("");
      setHourlyRate(0);

      setStatusMessage("👑 固定メンバーを登録しました。CSVインポート時に自動マージされます。");
      setTimeout(() => setStatusMessage(null), 4000);
      
      await loadAllSettingsAndMembers();
      await loadAllParentData();
    } catch (error) {
      setStatusMessage("⚠️ エラー：固定メンバーの登録に失敗しました。");
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  // 👑 固定メンバーの保護解除（削除）
  const handleDeleteFixedMember = async (targetEmail: string) => {
    try {
      await deleteDoc(doc(db, "fixed_members", targetEmail));
      setStatusMessage("✕ 固定メンバーの保護を解除しました。");
      setTimeout(() => setStatusMessage(null), 3000);
      
      await loadAllSettingsAndMembers();
      await loadAllParentData();
    } catch (error) {
      setStatusMessage("⚠️ エラー：保護解除に失敗しました。");
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn text-slate-800 text-xs">
      
      {/* 1. 登録フォーム（インポート保護機能） */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4 text-left">
        <div>
          <h3 className="text-base font-extrabold text-gray-800 tracking-tight">📌 インポート保護・固定メンバー追加</h3>
          <p className="text-gray-400 mt-0.5 text-xs">
            ここで登録したメンバーは、アサインシステムCSVをインポートした際、上書き消去されずに**必ずマスタへ自動合流・保護**されます。
          </p>
        </div>

        <form onSubmit={handleRegisterFixedMember} className="space-y-4 font-bold text-gray-500">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">苗字（必須）</label>
              <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="西尾" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:bg-white focus:border-purple-500" />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">名前（必須）</label>
              <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="圭史" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:bg-white focus:border-purple-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">苗字カナ</label>
              <input type="text" value={lastNameKana} onChange={(e) => setLastNameKana(e.target.value)} placeholder="ニシオ" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:bg-white focus:border-purple-500" />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">名前カナ</label>
              <input type="text" value={firstNameKana} onChange={(e) => setFirstNameKana(e.target.value)} placeholder="ケイジ" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:bg-white focus:border-purple-500" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="text-[10px] text-gray-400 block mb-1">メールアドレス（必須 / ログインキー）</label>
              <input type="email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder="nishio@aidma-hd.jp" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:bg-white focus:border-purple-500" />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">管理番号（自動固定）</label>
              <input type="text" value="固定枠" className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-400 cursor-not-allowed" disabled />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white font-black px-6 py-2.5 rounded-xl shadow-xl shadow-purple-100 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer">
              🛡️ 固定メンバーとしてシステムに登録
            </button>
          </div>
        </form>

        {/* 保護ユーザー一覧サブテーブル */}
        <div className="pt-4 border-t border-gray-100 space-y-2">
          <h4 className="font-extrabold text-gray-700 text-xs">🔒 現在保護されている固定ユーザー一覧 ({fixedMembers.length}名)</h4>
          {fixedMembers.length === 0 ? (
            <p className="text-gray-400 italic py-2">登録されている固定メンバーはありません。</p>
          ) : (
            <div className="border border-gray-100 rounded-xl overflow-hidden bg-gray-50/30">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-gray-400 font-bold text-[10px]">
                    <th className="p-2.5 pl-4">氏名</th>
                    <th className="p-2.5">メールアドレス</th>
                    <th className="p-2.5 text-center w-24">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-gray-600 font-semibold text-xs">
                  {fixedMembers.map((m) => (
                    <tr key={m.email} className="hover:bg-white transition-colors">
                      <td className="p-2.5 pl-4 font-black text-gray-800">{m.name}</td>
                      <td className="p-2.5 font-mono text-gray-500 text-[11px]">{m.email}</td>
                      <td className="p-2.5 text-center">
                        <button type="button" onClick={() => handleDeleteFixedMember(m.email)} className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded-md font-bold transition-all cursor-pointer">
                          保護解除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 2. 一般管理者(admin)のメニュー表示カスタム */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4 text-left">
        <div>
          <h3 className="text-base font-extrabold text-gray-800 tracking-tight">🛠️ 一般管理者(admin)のメニュー表示カスタム</h3>
          <p className="text-gray-400 text-xs mt-0.5">
            チームリーダー(admin権限)がログインした際、上部のヘッダーに表示させる管理メニューを選択できます。チェックを外すとコードを書き換えずに**完全非表示**にロックされます。
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* 稼働実績 */}
          <label className="flex items-center space-x-3 bg-gray-50 border border-gray-100 p-4 rounded-xl hover:bg-purple-50/50 transition-all cursor-pointer group">
            <input 
              type="checkbox" 
              checked={adminAllowedTabs.includes("summary")}
              onChange={() => handleCheckboxChange("summary")}
              className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 cursor-pointer"
            />
            <div>
              <span className="text-xs font-black text-gray-700 block group-hover:text-purple-700 transition-colors">📊 稼働実績</span>
              <span className="text-[10px] text-gray-400 font-medium">自チーム限定の月次集計レポート（日数・実働時間）</span>
            </div>
          </label>

          {/* 稼働記録 */}
          <label className="flex items-center space-x-3 bg-gray-50 border border-gray-100 p-4 rounded-xl hover:bg-purple-50/50 transition-all cursor-pointer group">
            <input 
              type="checkbox" 
              checked={adminAllowedTabs.includes("records")}
              onChange={() => handleCheckboxChange("records")}
              className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 cursor-pointer"
            />
            <div>
              <span className="text-xs font-black text-gray-700 block group-hover:text-purple-700 transition-colors">📝 稼働記録</span>
              <span className="text-[10px] text-gray-400 font-medium">自チームの日次打刻データの閲覧・代理追加・削除、リーダー確認トグル</span>
            </div>
          </label>

          {/* 所属チーム登録 */}
          <label className="flex items-center space-x-3 bg-gray-50 border border-gray-100 p-4 rounded-xl hover:bg-purple-50/50 transition-all cursor-pointer group">
            <input 
              type="checkbox" 
              checked={adminAllowedTabs.includes("members")}
              onChange={() => handleCheckboxChange("members")}
              className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 cursor-pointer"
            />
            <div>
              <span className="text-xs font-black text-gray-700 block group-hover:text-purple-700 transition-colors">👥 所属チーム登録</span>
              <span className="text-[10px] text-gray-400 font-medium">メンバーのアサイン状況やログインアドレスの紐付け管理</span>
            </div>
          </label>

          {/* 組織図 */}
          <label className="flex items-center space-x-3 bg-gray-50 border border-gray-100 p-4 rounded-xl hover:bg-purple-50/50 transition-all cursor-pointer group">
            <input 
              type="checkbox" 
              checked={adminAllowedTabs.includes("org")}
              onChange={() => handleCheckboxChange("org")}
              className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 cursor-pointer"
            />
            <div>
              <span className="text-xs font-black text-gray-700 block group-hover:text-purple-700 transition-colors">🗺️ 組織図</span>
              <span className="text-[10px] text-gray-400 font-medium">RM全体の組織図マップおよびリーダー兼任アサイン操作ツリー</span>
            </div>
          </label>
        </div>
      </div>

      {/* 3. 下部の掲示板メッセージ編集 */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4 text-left">
        <div>
          <h3 className="text-base font-extrabold text-gray-800 tracking-tight">📢 メイン打刻画面の掲示板メッセージ編集</h3>
          <p className="text-gray-400 text-xs mt-0.5">ワーカーさんの打刻画面（最下部）に常設されている「ポップな黄色の吹き出しメッセージ」をリアルタイムに変更・更新できます。</p>
        </div>
        <div className="space-y-2">
          <textarea
            value={footerMessageInput}
            onChange={(e) => setFooterMessageInput(e.target.value)}
            placeholder="例: 今月予定していた業務がすべて終了しましたか？業務記録のページから業務記録の提出をお願いいたします！"
            rows={4}
            className="w-full bg-gray-50 border border-gray-200 p-4 rounded-2xl text-sm font-semibold focus:outline-none focus:bg-white focus:border-purple-500 shadow-inner resize-none min-h-[100px]"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={isSavingSettings || !footerMessageInput.trim()}
            className="bg-purple-600 hover:bg-purple-700 text-white font-black text-xs px-6 py-3 rounded-xl shadow-xl shadow-purple-100 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-30 disabled:scale-100 whitespace-nowrap cursor-pointer"
          >
            {isSavingSettings ? "⏳ 保存中..." : "🚀 この内容で設定をすべて確定・保存する"}
          </button>
        </div>
      </div>

    </div>
  );
}