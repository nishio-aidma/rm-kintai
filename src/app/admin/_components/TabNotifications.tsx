"use client";

import { useState, useEffect } from "react";
import { attendanceRepository, NotificationsSettings } from "@/lib/attendanceRepository";

interface TabNotificationsProps {
  uniqueDepartments: string[];
  setStatusMessage: (msg: string | null) => void;
}

export default function TabNotifications({
  uniqueDepartments,
  setStatusMessage,
}: TabNotificationsProps) {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showToken, setShowToken] = useState<boolean>(false);
  
  const [settings, setSettings] = useState<NotificationsSettings>({
    unverifiedReminder: {
      enabled: true,
      time: "12:00",
      message: "【ダコックリマインド】前日までの稼働記録で、未確認のデータがあります。内容をご確認の上、確認を完了させてください。\n[自分の記録URL]",
    },
    submissionReminder: {
      enabled: true,
      time: "15:00",
      message: "【ダコックリマインド】最終稼働日となりました。必ずすべての稼働記録を確認し、稼働記録の提出をお願いします。\n[自分の記録URL]",
    },
    missingEndWorkReminder: {
      enabled: true,
      time: "21:00",
      message: "【ダコックリマインド】本日または過去の稼働記録で、業務終了時間が未登録のデータがあります。正しい終了時間を記録してください。\n[打刻画面URL]",
    },
    teamRoomIds: {},
    apiToken: "",
  });

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await attendanceRepository.getNotificationSettings();
        if (data) {
          setSettings({
            ...data,
            apiToken: data.apiToken || "",
          });
        }
      } catch (error) {
        console.error("通知設定の読み込みに失敗しました:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  const handleRoomIdChange = (teamName: string, value: string) => {
    const cleanValue = value.replace(/\D/g, "").slice(0, 6);
    setSettings((prev) => ({
      ...prev,
      teamRoomIds: {
        ...prev.teamRoomIds,
        [teamName]: cleanValue,
      },
    }));
  };

  const handleInsertUrl = (
    key: "unverifiedReminder" | "submissionReminder" | "missingEndWorkReminder",
    urlTag: string
  ) => {
    setSettings((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        message: prev[key].message + `\n${urlTag}`,
      },
    }));
  };

  const handleSave = async () => {
    try {
      setStatusMessage("通知設定を保存中...");
      await attendanceRepository.saveNotificationSettings(settings);
      setStatusMessage("通知設定を正常に保存しました！");
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (error) {
      console.error("通知設定の保存に失敗しました:", error);
      setStatusMessage("⚠️ エラー：通知設定の保存に失敗しました。");
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  if (isLoading) {
    return <div className="text-center py-10 text-gray-400 font-bold">通知設定を読み込み中...</div>;
  }

  return (
    <div className="space-y-6 text-xs font-sans animate-fadeIn max-w-4xl mx-auto pb-12">
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-1">
        <h3 className="text-base font-bold text-gray-800 flex items-center space-x-2">
          <span>MEMBERS チャットリマインド通知設定</span>
        </h3>
        <p className="text-gray-400 text-xs">
          社内チャットツール（MEMBERS）への自動催促メッセージ、配信時刻、チーム別ルームID、API連携キーを設定します。
        </p>
      </div>

      {/* 🔑 APIトークン入力欄 */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-3">
        <div className="border-b border-gray-100 pb-3">
          <h4 className="text-sm font-bold text-gray-800">🔑 MEMBERS API アクセストークン設定</h4>
          <p className="text-[11px] text-gray-400 mt-0.5">
            MEMBERSから発行されたアクセストークン（Bearerトークン）を入力してください。
          </p>
        </div>

        <div className="space-y-1.5 pt-1">
          <label className="font-bold text-gray-600 block">APIアクセストークン</label>
          <div className="flex items-center space-x-2">
            <input
              type={showToken ? "text" : "password"}
              value={settings.apiToken || ""}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  apiToken: e.target.value,
                }))
              }
              placeholder="MEMBERSのAPIトークンを貼り付けてください"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 bg-gray-50/50 font-mono text-xs focus:bg-white focus:outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
            >
              {showToken ? "非表示にする" : "表示する"}
            </button>
          </div>
        </div>
      </div>

      {/* ① 未確認記録の催促通知 */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h4 className="text-sm font-bold text-gray-800">① 未確認記録の確認催促通知</h4>
            <p className="text-[11px] text-gray-400">過去の記録で未確認のデータがあるユーザーへ催促します</p>
          </div>
          <div className="flex items-center space-x-3">
            <span className="font-bold text-gray-500">配信時刻:</span>
            <input
              type="time"
              value={settings.unverifiedReminder.time}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  unverifiedReminder: { ...prev.unverifiedReminder, time: e.target.value },
                }))
              }
              className="border border-gray-200 rounded-lg px-2 py-1 font-mono text-xs bg-gray-50 focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="font-bold text-gray-600">通知メッセージ本文</label>
            <button
              type="button"
              onClick={() => handleInsertUrl("unverifiedReminder", "[自分の記録URL]")}
              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-3 py-1 rounded-lg border border-emerald-200 transition-all text-[11px] flex items-center space-x-1 cursor-pointer"
            >
              <span>🔗 自分の記録URLを挿入</span>
            </button>
          </div>
          <textarea
            rows={4}
            value={settings.unverifiedReminder.message}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                unverifiedReminder: { ...prev.unverifiedReminder, message: e.target.value },
              }))
            }
            className="w-full border border-gray-200 rounded-xl p-3 text-xs bg-gray-50/50 focus:bg-white focus:outline-none leading-relaxed font-sans"
            placeholder="通知メッセージを入力してください"
          />
        </div>
      </div>

      {/* ② 稼働記録の提出催促通知 */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h4 className="text-sm font-bold text-gray-800">② 稼働記録の提出催促通知</h4>
            <p className="text-[11px] text-gray-400">月末最終日および第3・第4月曜日に一括提出を促します</p>
          </div>
          <div className="flex items-center space-x-3">
            <span className="font-bold text-gray-500">配信時刻:</span>
            <input
              type="time"
              value={settings.submissionReminder.time}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  submissionReminder: { ...prev.submissionReminder, time: e.target.value },
                }))
              }
              className="border border-gray-200 rounded-lg px-2 py-1 font-mono text-xs bg-gray-50 focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="font-bold text-gray-600">通知メッセージ本文</label>
            <button
              type="button"
              onClick={() => handleInsertUrl("submissionReminder", "[自分の記録URL]")}
              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-3 py-1 rounded-lg border border-emerald-200 transition-all text-[11px] flex items-center space-x-1 cursor-pointer"
            >
              <span>🔗 自分の記録URLを挿入</span>
            </button>
          </div>
          <textarea
            rows={4}
            value={settings.submissionReminder.message}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                submissionReminder: { ...prev.submissionReminder, message: e.target.value },
              }))
            }
            className="w-full border border-gray-200 rounded-xl p-3 text-xs bg-gray-50/50 focus:bg-white focus:outline-none leading-relaxed font-sans"
            placeholder="通知メッセージを入力してください"
          />
        </div>
      </div>

      {/* ③ 業務終了の登録忘れ通知 */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h4 className="text-sm font-bold text-gray-800">③ 業務終了打刻忘れ催促通知</h4>
            <p className="text-[11px] text-gray-400">終了時間が未入力のまま放置されている場合に催促します</p>
          </div>
          <div className="flex items-center space-x-3">
            <span className="font-bold text-gray-500">配信時刻:</span>
            <input
              type="time"
              value={settings.missingEndWorkReminder.time}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  missingEndWorkReminder: { ...prev.missingEndWorkReminder, time: e.target.value },
                }))
              }
              className="border border-gray-200 rounded-lg px-2 py-1 font-mono text-xs bg-gray-50 focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="font-bold text-gray-600">通知メッセージ本文</label>
            <button
              type="button"
              onClick={() => handleInsertUrl("missingEndWorkReminder", "[打刻画面URL]")}
              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-3 py-1 rounded-lg border border-emerald-200 transition-all text-[11px] flex items-center space-x-1 cursor-pointer"
            >
              <span>🔗 打刻画面URLを挿入</span>
            </button>
          </div>
          <textarea
            rows={4}
            value={settings.missingEndWorkReminder.message}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                missingEndWorkReminder: { ...prev.missingEndWorkReminder, message: e.target.value },
              }))
            }
            className="w-full border border-gray-200 rounded-xl p-3 text-xs bg-gray-50/50 focus:bg-white focus:outline-none leading-relaxed font-sans"
            placeholder="通知メッセージを入力してください"
          />
        </div>
      </div>

      {/* ④ チーム別 MEMBERS ルームID設定 */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="border-b border-gray-100 pb-3">
          <h4 className="text-sm font-bold text-gray-800">④ チーム別 MEMBERS グループチャット ルームID設定</h4>
          <p className="text-[11px] text-gray-400">
            登録されている各チームのMEMBERSグループチャットの「6桁のルームID」を入力してください。
          </p>
        </div>

        {uniqueDepartments.length === 0 ? (
          <p className="text-gray-400 text-center py-4 font-bold">登録されている所属チームがありません。</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {uniqueDepartments.map((dept) => (
              <div key={dept} className="flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-100">
                <span className="font-bold text-gray-700 text-xs truncate max-w-[180px]">{dept}</span>
                <div className="flex items-center space-x-2">
                  <span className="text-gray-400 text-[10px] font-bold">ルームID:</span>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="123456"
                    value={settings.teamRoomIds[dept] || ""}
                    onChange={(e) => handleRoomIdChange(dept, e.target.value)}
                    className="w-24 border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-800 font-mono font-bold text-xs text-center focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 py-3 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer text-sm"
        >
          通知設定を保存する
        </button>
      </div>
    </div>
  );
}