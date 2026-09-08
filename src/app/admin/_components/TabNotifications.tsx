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
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [showToken, setShowToken] = useState<boolean>(false);
  const [showSuccessToast, setShowSuccessToast] = useState<boolean>(false);
  
  const [settings, setSettings] = useState<NotificationsSettings>({
    unverifiedReminder: {
      enabled: true,
      time: "12:00",
      message: "【ダコックリマインド】前日までの稼働記録で、未確認のデータがあります。内容をご確認の上、確認を完了させてください。\n[自分の記録URL]",
    },
    midSubmissionReminder: {
      enabled: true,
      time: "15:00",
      message: "【ダコックリマインド】本日は月の中間稼働確認日（第3・第4月曜日）です。これまでの稼働記録をご確認の上、提出をお願いします。\n[自分の記録URL]",
    },
    monthEndSubmissionReminder: {
      enabled: true,
      time: "15:00",
      message: "【ダコックリマインド】本日は今月の最終稼働日です。必ずすべての稼働記録を確認し、稼働記録の提出をお願いします。\n[自分の記録URL]",
    },
    missingEndWorkReminder: {
      enabled: true,
      time: "21:00",
      message: "【ダコックリマインド】本日または過去の稼働記録で、業務終了時間が未登録のデータがあります。正しい終了時間を記録してください。\n[打刻画面URL]",
    },
    manualReminder: {
      enabled: true,
      time: "",
      message: "【ダコック個別催促】稼働記録が【未提出】状態です。内容を確認の上、システムより提出ボタンの押下をお願いいたします。\n[自分の記録URL]",
    },
    // リアルタイム打刻通知（開始/終了の2パターン保持）
    realtimeAttendanceNotice: {
      enabled: false,
      roomId: "",
      startMessage: "【業務開始報告】\n■日付：[日付]\n■時間：[打刻時刻]\n■連絡事項：",
      endMessage: "【業務終了報告】\n■日付：[日付]\n■時間：[打刻時刻]\n■連絡事項：",
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
            realtimeAttendanceNotice: data.realtimeAttendanceNotice ? {
              enabled: data.realtimeAttendanceNotice.enabled ?? false,
              roomId: data.realtimeAttendanceNotice.roomId || "",
              startMessage: data.realtimeAttendanceNotice.startMessage || "【業務開始報告】\n■日付：[日付]\n■時間：[打刻時刻]\n■連絡事項：",
              endMessage: data.realtimeAttendanceNotice.endMessage || "【業務終了報告】\n■日付：[日付]\n■時間：[打刻時刻]\n■連絡事項：",
            } : {
              enabled: false,
              roomId: "",
              startMessage: "【業務開始報告】\n■日付：[日付]\n■時間：[打刻時刻]\n■連絡事項：",
              endMessage: "【業務終了報告】\n■日付：[日付]\n■時間：[打刻時刻]\n■連絡事項：",
            },
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
    key: "unverifiedReminder" | "midSubmissionReminder" | "monthEndSubmissionReminder" | "missingEndWorkReminder" | "manualReminder",
    urlTag: string
  ) => {
    setSettings((prev) => ({
      ...prev,
      [key]: {
        ...prev[key]!,
        message: prev[key]!.message + `\n${urlTag}`,
      },
    }));
  };

  // 業務開始メッセージへのタグ挿入
  const handleInsertRealtimeStartTag = (tag: string) => {
    setSettings((prev) => ({
      ...prev,
      realtimeAttendanceNotice: {
        ...prev.realtimeAttendanceNotice!,
        startMessage: (prev.realtimeAttendanceNotice?.startMessage || "") + `${tag}`,
      },
    }));
  };

  // 業務終了メッセージへのタグ挿入
  const handleInsertRealtimeEndTag = (tag: string) => {
    setSettings((prev) => ({
      ...prev,
      realtimeAttendanceNotice: {
        ...prev.realtimeAttendanceNotice!,
        endMessage: (prev.realtimeAttendanceNotice?.endMessage || "") + `${tag}`,
      },
    }));
  };

  const handleSave = async () => {
    if (isSaving) return;
    try {
      setIsSaving(true);
      setStatusMessage("通知設定を保存中...");
      await attendanceRepository.saveNotificationSettings(settings);
      
      setStatusMessage(null);
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
    } catch (error) {
      console.error("通知設定の保存に失敗しました:", error);
      setStatusMessage("⚠️ エラー：通知設定の保存に失敗しました。");
      setTimeout(() => setStatusMessage(null), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="text-center py-10 text-gray-400 font-bold">通知設定を読み込み中...</div>;
  }

  return (
    <div className="space-y-6 text-xs font-sans animate-fadeIn max-w-4xl mx-auto pb-24 relative">
      
      {showSuccessToast && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl font-bold flex items-center space-x-2 z-[999] animate-scaleUp">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
          <span className="text-sm">通知設定を正常に保存しました！</span>
        </div>
      )}

      {/* 画面ヘッダー */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-1">
        <h3 className="text-base font-bold text-gray-800 flex items-center space-x-2">
          <span>🔔 MEMBERS チャットリマインド通知設定</span>
        </h3>
        <p className="text-gray-400 text-xs">
          社内チャットツールへの自動催促メッセージや、チーム別ルームIDを設定します。<br/>
          ※変更後は画面右下の「保存する」ボタンを押してください。
        </p>
      </div>

      {/* ⑦ リアルタイム打刻通知設定（改修セクション） */}
      <div className="bg-white p-6 rounded-2xl border-2 border-emerald-500/30 shadow-md space-y-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-emerald-500"></div>
        <div className="flex items-center justify-between border-b border-gray-100 pb-3 pl-2">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-base">⚡</span>
              <h4 className="text-sm font-extrabold text-gray-800">リアルタイム打刻通知機能設定</h4>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">新機能</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">メンバーが打刻（業務開始・終了）した瞬間に共通チャットへ即時通知します（送信元は打刻本人になります）</p>
          </div>
          
          {/* ON/OFF 切り替えトグル */}
          <div className="flex items-center space-x-2">
            <span className={`text-xs font-bold ${settings.realtimeAttendanceNotice?.enabled ? "text-emerald-600" : "text-gray-400"}`}>
              {settings.realtimeAttendanceNotice?.enabled ? "機能: ON" : "機能: OFF"}
            </span>
            <button
              type="button"
              onClick={() =>
                setSettings((prev) => ({
                  ...prev,
                  realtimeAttendanceNotice: {
                    ...prev.realtimeAttendanceNotice!,
                    enabled: !prev.realtimeAttendanceNotice?.enabled,
                  },
                }))
              }
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                settings.realtimeAttendanceNotice?.enabled ? "bg-emerald-500" : "bg-gray-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  settings.realtimeAttendanceNotice?.enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="space-y-5 pl-2 font-medium">
          {/* 共通ルームID設定 */}
          <div className="space-y-1.5">
            <label className="font-bold text-gray-700 block text-xs">通知先グループチャット ルームID（6桁）</label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                maxLength={6}
                value={settings.realtimeAttendanceNotice?.roomId || ""}
                onChange={(e) => {
                  const cleanVal = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setSettings((prev) => ({
                    ...prev,
                    realtimeAttendanceNotice: {
                      ...prev.realtimeAttendanceNotice!,
                      roomId: cleanVal,
                    },
                  }));
                }}
                placeholder="例: 123456"
                className="w-36 border border-gray-200 rounded-xl px-3 py-2 bg-gray-50/50 font-mono font-bold text-xs focus:bg-white focus:outline-none focus:border-emerald-500 text-center"
              />
              <span className="text-[11px] text-gray-400">※全メンバー共通の打刻通知を送信するチャットルームIDを指定してください。</span>
            </div>
          </div>

          {/* 業務開始メッセージ設定 */}
          <div className="space-y-2 bg-emerald-50/30 p-4 rounded-xl border border-emerald-100">
            <div className="flex justify-between items-center">
              <label className="font-extrabold text-emerald-800 text-xs flex items-center space-x-1">
                <span>▶ 業務開始時（出勤）の通知テンプレート</span>
              </label>
              <div className="flex space-x-1">
                <button
                  type="button"
                  onClick={() => handleInsertRealtimeStartTag("[日付]")}
                  className="bg-white hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold px-2 py-0.5 rounded transition-all text-[10px] cursor-pointer"
                >
                  ＋[日付]
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertRealtimeStartTag("[打刻時刻]")}
                  className="bg-white hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold px-2 py-0.5 rounded transition-all text-[10px] cursor-pointer"
                >
                  ＋[打刻時刻]
                </button>
              </div>
            </div>
            <textarea
              rows={5}
              value={settings.realtimeAttendanceNotice?.startMessage || ""}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  realtimeAttendanceNotice: {
                    ...prev.realtimeAttendanceNotice!,
                    startMessage: e.target.value,
                  },
                }))
              }
              className="w-full border border-gray-200 rounded-xl p-3 text-xs bg-white focus:outline-none leading-relaxed font-mono"
              placeholder="【業務開始報告】\n■日付：[日付]\n■時間：[打刻時刻]\n■連絡事項："
            />
          </div>

          {/* 業務終了メッセージ設定 */}
          <div className="space-y-2 bg-gray-50 p-4 rounded-xl border border-gray-200">
            <div className="flex justify-between items-center">
              <label className="font-extrabold text-gray-800 text-xs flex items-center space-x-1">
                <span>■ 業務終了時（退勤）の通知テンプレート</span>
              </label>
              <div className="flex space-x-1">
                <button
                  type="button"
                  onClick={() => handleInsertRealtimeEndTag("[日付]")}
                  className="bg-white hover:bg-gray-200 text-gray-700 border border-gray-200 font-bold px-2 py-0.5 rounded transition-all text-[10px] cursor-pointer"
                >
                  ＋[日付]
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertRealtimeEndTag("[打刻時刻]")}
                  className="bg-white hover:bg-gray-200 text-gray-700 border border-gray-200 font-bold px-2 py-0.5 rounded transition-all text-[10px] cursor-pointer"
                >
                  ＋[打刻時刻]
                </button>
              </div>
            </div>
            <textarea
              rows={5}
              value={settings.realtimeAttendanceNotice?.endMessage || ""}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  realtimeAttendanceNotice: {
                    ...prev.realtimeAttendanceNotice!,
                    endMessage: e.target.value,
                  },
                }))
              }
              className="w-full border border-gray-200 rounded-xl p-3 text-xs bg-white focus:outline-none leading-relaxed font-mono"
              placeholder="【業務終了報告】\n■日付：[日付]\n■時間：[打刻時刻]\n■連絡事項："
            />
          </div>
        </div>
      </div>

      {/* 🔑 APIトークン設定 */}
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

      {/* ② 中間稼働記録の提出催促通知 */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h4 className="text-sm font-bold text-gray-800">② 中間稼働記録の提出催促通知（月途中）</h4>
            <p className="text-[11px] text-gray-400">第3・第4月曜日にチーム全員へ一括提出を促します</p>
          </div>
          <div className="flex items-center space-x-3">
            <span className="font-bold text-gray-500">配信時刻:</span>
            <input
              type="time"
              value={settings.midSubmissionReminder.time}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  midSubmissionReminder: { ...prev.midSubmissionReminder, time: e.target.value },
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
              onClick={() => handleInsertUrl("midSubmissionReminder", "[自分の記録URL]")}
              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-3 py-1 rounded-lg border border-emerald-200 transition-all text-[11px] flex items-center space-x-1 cursor-pointer"
            >
              <span>🔗 自分の記録URLを挿入</span>
            </button>
          </div>
          <textarea
            rows={4}
            value={settings.midSubmissionReminder.message}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                midSubmissionReminder: { ...prev.midSubmissionReminder, message: e.target.value },
              }))
            }
            className="w-full border border-gray-200 rounded-xl p-3 text-xs bg-gray-50/50 focus:bg-white focus:outline-none leading-relaxed font-sans"
            placeholder="通知メッセージを入力してください"
          />
        </div>
      </div>

      {/* ③ 月末稼働記録の提出催促通知 */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h4 className="text-sm font-bold text-gray-800">③ 月末稼働記録の提出催促通知（最終日）</h4>
            <p className="text-[11px] text-gray-400">月末最終日にチーム全員へ一括提出を促します</p>
          </div>
          <div className="flex items-center space-x-3">
            <span className="font-bold text-gray-500">配信時刻:</span>
            <input
              type="time"
              value={settings.monthEndSubmissionReminder.time}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  monthEndSubmissionReminder: { ...prev.monthEndSubmissionReminder, time: e.target.value },
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
              onClick={() => handleInsertUrl("monthEndSubmissionReminder", "[自分の記録URL]")}
              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-3 py-1 rounded-lg border border-emerald-200 transition-all text-[11px] flex items-center space-x-1 cursor-pointer"
            >
              <span>🔗 自分の記録URLを挿入</span>
            </button>
          </div>
          <textarea
            rows={4}
            value={settings.monthEndSubmissionReminder.message}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                monthEndSubmissionReminder: { ...prev.monthEndSubmissionReminder, message: e.target.value },
              }))
            }
            className="w-full border border-gray-200 rounded-xl p-3 text-xs bg-gray-50/50 focus:bg-white focus:outline-none leading-relaxed font-sans"
            placeholder="通知メッセージを入力してください"
          />
        </div>
      </div>

      {/* ④ 業務終了の登録忘れ通知 */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h4 className="text-sm font-bold text-gray-800">④ 業務終了打刻忘れ催促通知</h4>
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

      {/* ⑤ 個別催促（手動送信）のテンプレート設定 */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-400"></div>
        <div className="flex items-center justify-between border-b border-gray-100 pb-3 pl-2">
          <div>
            <h4 className="text-sm font-bold text-gray-800">⑤ 個別催促（手動送信）のテンプレート設定</h4>
            <p className="text-[11px] text-gray-400">稼働実績タブから、未提出のメンバーを個別に選んで送信する際のテンプレート文面です。</p>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md border border-amber-200">手動送信専用</span>
          </div>
        </div>

        <div className="space-y-2 pl-2">
          <div className="flex justify-between items-center">
            <label className="font-bold text-gray-600">通知メッセージ本文（名前は自動でメンションが付与されます）</label>
            <button
              type="button"
              onClick={() => handleInsertUrl("manualReminder", "[自分の記録URL]")}
              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-3 py-1 rounded-lg border border-emerald-200 transition-all text-[11px] flex items-center space-x-1 cursor-pointer"
            >
              <span>🔗 自分の記録URLを挿入</span>
            </button>
          </div>
          <textarea
            rows={4}
            value={settings.manualReminder?.message || ""}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                manualReminder: { ...prev.manualReminder!, message: e.target.value },
              }))
            }
            className="w-full border border-gray-200 rounded-xl p-3 text-xs bg-gray-50/50 focus:bg-white focus:outline-none leading-relaxed font-sans"
            placeholder="通知メッセージを入力してください"
          />
        </div>
      </div>

      {/* ⑥ チーム別 MEMBERS ルームID設定 */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="border-b border-gray-100 pb-3">
          <h4 className="text-sm font-bold text-gray-800">⑥ チーム別 MEMBERS グループチャット ルームID設定</h4>
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

      {/* 画面右下に常に追従するフローティング保存ボタン */}
      <div className="fixed bottom-8 right-8 z-[90] animate-scaleUp">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={`font-black px-6 py-4 rounded-full shadow-2xl transition-all flex items-center space-x-2 text-sm ${
            isSaving 
              ? "bg-gray-400 text-white cursor-not-allowed" 
              : "bg-emerald-600 hover:bg-emerald-700 hover:scale-105 hover:shadow-emerald-500/30 text-white active:scale-95 cursor-pointer"
          }`}
        >
          {isSaving ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              <span>保存中...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
              <span>設定を保存する</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}