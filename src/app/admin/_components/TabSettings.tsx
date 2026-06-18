"use client";

import { useState, useEffect } from "react";
import { attendanceRepository } from "@/lib/attendanceRepository";

interface TabSettingsProps {
  setStatusMessage: (msg: string | null) => void;
}

export default function TabSettings({ setStatusMessage }: TabSettingsProps) {
  const [footerMessageInput, setFooterMessageInput] = useState<string>("");
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);

  // 💡 画面を開いた瞬間に、現在のメッセージをFirebaseから安全にロードする
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await attendanceRepository.getDashboardSettings();
        if (settings && settings.footerMessage) {
          setFooterMessageInput(settings.footerMessage);
        }
      } catch (error) {
        console.error("設定の読み込みに失敗しました:", error);
      }
    };
    loadSettings();
  }, []);

  // 💡 保存ボタンを押したときの処理
  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      setStatusMessage("ダッシュボードのメッセージを更新中...");
      await attendanceRepository.saveDashboardSettings(footerMessageInput);
      setStatusMessage("✨ メッセージを正常に更新しました！メイン打刻画面に即座に反映されます。");
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (error) {
      setStatusMessage("⚠️ エラー：メッセージの保存に失敗しました。");
      setTimeout(() => setStatusMessage(null), 4000);
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4 animate-fadeIn text-slate-800">
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
          className="bg-purple-600 hover:bg-purple-700 text-white font-black text-xs px-6 py-3 rounded-xl shadow-xl shadow-purple-100 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-30 disabled:scale-100 whitespace-nowrap"
        >
          {isSavingSettings ? "⏳ 保存中..." : "🚀 この内容でメッセージを確定・保存する"}
        </button>
      </div>
    </div>
  );
}