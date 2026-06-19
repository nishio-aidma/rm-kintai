"use client";

import { useState, useEffect } from "react";
import { attendanceRepository } from "@/lib/attendanceRepository";
// 💡 親から直接一括ロードさせるための関数をプロップスに追加
interface TabSettingsProps {
  setStatusMessage: (msg: string | null) => void;
  loadAllParentData: () => Promise<void>;
}

export default function TabSettings({ setStatusMessage, loadAllParentData }: TabSettingsProps) {
  const [footerMessageInput, setFooterMessageInput] = useState<string>("");
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);

  // 💡 【大新設】一般管理者(admin)に表示させるメニューをON/OFFするためのチェック配列ステート
  const [adminAllowedTabs, setAdminAllowedTabs] = useState<string[]>(["summary", "records", "org"]);

  // 画面を開いた瞬間に、現在のメッセージとadmin用許可タブ設定をFirebaseから同時回収
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await attendanceRepository.getDashboardSettings();
        if (settings) {
          if (settings.footerMessage) {
            setFooterMessageInput(settings.footerMessage);
          }
          // 過去にオーナーが設定したカスタムタブ配列があればセット（無ければ初期値）
          if (settings.adminAllowedTabs) {
            setAdminAllowedTabs(settings.adminAllowedTabs);
          }
        }
      } catch (error) {
        console.error("設定の読み込みに失敗しました:", error);
      }
    };
    loadSettings();
  }, []);

  // 💡 【新設】チェックボックスをポチッと押したときに、配列の中に文字を出し入れするトグル処理
  const handleCheckboxChange = (tabName: string) => {
    if (adminAllowedTabs.includes(tabName)) {
      // すでに存在していれば、配列から削除（非表示へ）
      setAdminAllowedTabs(adminAllowedTabs.filter((t) => tabName !== t));
    } else {
      // 存在していなければ、配列に追加（表示へ）
      setAdminAllowedTabs([...adminAllowedTabs, tabName]);
    }
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      setStatusMessage("ダッシュボード設定を更新中...");
      
      // 💡 リポジトリの既存関数「saveDashboardSettings」をフル活用！
      // 第一引数にメッセージ、第二引数（またはmergeオブジェクト）として、カスタムタブ配列も一緒にFirestoreの settings/dashboard へ永久保存！
      const { doc, setDoc, serverTimestamp } = require("firebase/firestore");
      const { db } = require("@/lib/firebase");
      
      const docRef = doc(db, "settings", "dashboard");
      await setDoc(docRef, { 
        footerMessage: footerMessageInput,
        adminAllowedTabs: adminAllowedTabs, // チェックしたタブの配列をまとめて保存！
        updatedAt: serverTimestamp() 
      }, { merge: true });

      setStatusMessage("✨ ダッシュボードメッセージ ＆ 管理者メニュー表示権限を正常に更新しました！");
      setTimeout(() => setStatusMessage(null), 4000);
      
      // 親ファイルの権限状態も即座に再同期させる
      await loadAllParentData();
    } catch (error) {
      setStatusMessage("⚠️ エラー：設定の保存に失敗しました。");
      setTimeout(() => setStatusMessage(null), 4000);
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn text-slate-800">
      
      {/* 💡 【大新設】オーナー設定の一番目立つメインパーツとして「admin表示メニューのカスタム」を大降臨！ */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
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

      {/* 下部の掲示板メッセージ編集（これまでの仕様を完全保持） */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
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