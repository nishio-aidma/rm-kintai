"use client";

import { useState, useEffect } from "react";
import { MemberInfo, AccountRequest, attendanceRepository } from "@/lib/attendanceRepository";
// 💡 Next.jsの画面キープ用リフレッシュ機能（useRouter）をインポート
import { useRouter } from "next/navigation";

interface TabMembersProps {
  members: MemberInfo[];
  editingDeptEmail: string | null;
  setEditingDeptEmail: (email: string | null) => void;
  inputDeptText: string;
  setInputDeptText: (text: string) => void;
  handleSaveDepartment: (email: string, selectedDept: string) => Promise<void>;
  accountRequests: AccountRequest[];
  myRole: "admin" | "owner";
  uniqueDepartments: string[];
}

export default function TabMembers({
  members,
  editingDeptEmail,
  setEditingDeptEmail,
  handleSaveDepartment,
  accountRequests,
  myRole,
  uniqueDepartments
}: TabMembersProps) {
  
  // 💡 useRouterを使えるように定義（現在のページ状態をキープするためのコントローラー）
  const router = useRouter();

  // 👑 西尾さんにご提示いただいた11個の正しいマスターチーム
  const initialDepts = [
    "架電チーム",
    "商談チーム",
    "岩田さんチーム",
    "金澤さんチーム",
    "アシスタントチーム",
    "採用チーム",
    "カスタマーサポート",
    "動画・デザイン制作",
    "有瀬さん秘書チーム",
    "西尾さんチーム",
    "業務効率化チーム"
  ];

  // 👑 選択肢として管理されるチームリストのステート
  const [customDepts, setCustomDepts] = useState<string[]>([]);
  // 新規チーム追加用の手入力文字列ステート
  const [newDeptInput, setNewDeptInput] = useState<string>("");
  // メンバー編集時の一時プルダウン選択用ステート
  const [selectedDeptTmp, setSelectedDeptTmp] = useState<string>("");

  // ローカルストレージまたは初期マスタから選択肢を読み込み
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("rm_custom_departments");
      if (saved) {
        setCustomDepts(JSON.parse(saved));
      } else {
        const merged = Array.from(new Set([...initialDepts, ...uniqueDepartments])).filter(Boolean);
        setCustomDepts(merged);
        localStorage.setItem("rm_custom_departments", JSON.stringify(merged));
      }
    }
  }, [uniqueDepartments]);

  // 👑 【シンプル設計】最上部からいつでもチームを「一発追加」する関数
  const handleAddDeptHeader = () => {
    const trimmed = newDeptInput.trim();
    if (!trimmed) return;
    if (customDepts.includes(trimmed)) {
      alert("そのチーム名は既に登録されています。");
      return;
    }
    const updated = [...customDepts, trimmed];
    setCustomDepts(updated);
    localStorage.setItem("rm_custom_departments", JSON.stringify(updated));
    setNewDeptInput("");
  };

  // 👑 【シンプル設計】最上部のバッジからいつでもチームを「一発削除」する関数
  const handleDeleteDeptHeader = (deptToDelete: string) => {
    if (!confirm(`プルダウンの選択肢から「${deptToDelete}」を削除しますか？\n（※すでにメンバーに割り当てられている所属名自体は保持されます）`)) return;
    const updated = customDepts.filter(d => d !== deptToDelete);
    setCustomDepts(updated);
    localStorage.setItem("rm_custom_departments", JSON.stringify(updated));
  };

  // カスタム確認モーダル用ステート
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    subMessage?: string;
    onConfirm: () => Promise<void>;
    confirmButtonText: string;
    isDanger?: boolean;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: async () => {},
    confirmButtonText: "確定する"
  });

  const toggleAdminRole = (member: MemberInfo) => {
    const targetRole = member.role === "admin" ? "user" : "admin";
    setModalConfig({
      isOpen: true,
      title: "権限変更の確認",
      message: `${member.name} さんの権限を変更しますか？`,
      subMessage: `【${member.role === "admin" ? "管理者 (admin)" : "一般ユーザー (user)"}】から【${targetRole === "admin" ? "管理者 (admin)" : "一般ユーザー (user)"}】に切り替わります。`,
      confirmButtonText: "権限を切り替える",
      isDanger: targetRole === "user",
      onConfirm: async () => {
        try {
          await attendanceRepository.updateMemberRole(member.email, targetRole);
          // 💡 画面をキープしたまま、データだけを裏側で最新にする仕様に変更
          router.refresh();
        } catch (e) {
          alert("権限の変更に失敗しました。");
        }
      }
    });
  };

  const handleOwnerProxyCheckbox = (member: MemberInfo, isChecked: boolean) => {
    setModalConfig({
      isOpen: true,
      title: isChecked ? "👑 オーナー代理権限の付与" : "⚠️ オーナー代理権限の解除",
      message: `${member.name} さんへのオーナー代理権限操作`,
      subMessage: isChecked 
        ? "付与すると、西尾さん（owner）と完全に同じすべての画面（CSVインポート・全チーム実績など）が閲覧・操作可能になります。" 
        : "解除すると、通常の管理権限（自チームのメンバー管理のみ）に戻ります。",
      confirmButtonText: isChecked ? "☑ 代理権限を付与する" : "代理権限を解除する",
      isDanger: !isChecked,
      onConfirm: async () => {
        try {
          await attendanceRepository.updateMemberOwnerProxy(member.email, isChecked);
          // 💡 画面をキープしたまま、データだけを裏側で最新にする仕様に変更
          router.refresh();
        } catch (e) {
          alert("オーナー代理権限の切り替えに失敗しました。");
        }
      }
    });
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      
      {/* 👑 【新設】最上部：チーム名追加・削除専用の独立管理エリア */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-4">
        <div>
          <h3 className="text-sm font-extrabold text-gray-800 tracking-tight">🏢 所属チーム選択肢（マスタ）の追加・削除管理</h3>
          <p className="text-gray-400 text-xs mt-0.5">ここでチーム名を追加・削除すると、下のメンバー編集時のプルダウンにリアルタイムに反映されます。</p>
        </div>

        {/* 追加用インプット */}
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={newDeptInput}
            onChange={(e) => setNewDeptInput(e.target.value)}
            placeholder="例: 新しいプロジェクト名チーム"
            className="w-64 bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-gray-800 font-bold text-xs focus:outline-none focus:bg-white focus:border-emerald-500 shadow-inner"
          />
          <button
            type="button"
            onClick={handleAddDeptHeader}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-4 py-2 rounded-xl text-xs shadow-sm transition-all flex items-center space-x-1"
          >
            <span>➕ このチームを追加する</span>
          </button>
        </div>

        {/* 削除用：現在のチーム名一覧バッジ */}
        <div className="pt-2 border-t border-gray-50">
          <p className="text-gray-400 font-bold text-[11px] mb-2">▼ 現在登録されている選択肢（「❌」を押すとプルダウンから削除できます）</p>
          <div className="flex flex-wrap gap-2">
            {customDepts.map((dept) => (
              <div
                key={dept}
                className="bg-purple-50 text-purple-700 border border-purple-100 px-2.5 py-1.5 rounded-xl font-bold text-xs flex items-center space-x-1.5 shadow-sm"
              >
                <span>{dept}</span>
                <button
                  type="button"
                  onClick={() => handleDeleteDeptHeader(dept)}
                  title={`${dept}を削除する`}
                  className="w-4 h-4 rounded-full bg-purple-200/60 hover:bg-rose-500 text-purple-800 hover:text-white flex items-center justify-center font-black text-[9px] transition-all"
                >
                  ✕
                </button>
              </div>
            ))}
            {customDepts.length === 0 && (
              <span className="text-gray-300 italic text-xs font-normal">チーム名が1つも登録されていません。</span>
            )}
          </div>
        </div>
      </div>

      {/* 2. アカウント紐付け申請一覧 */}
      {myRole === "owner" && accountRequests.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
          <h3 className="text-sm font-bold text-gray-800 flex items-center space-x-2">
            <span>📨 届いているログインアカウントの紐付け申請</span>
            <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-black animate-bounce">
              {accountRequests.length}
            </span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {accountRequests.map((req) => (
              <div key={req.email} className="bg-amber-50/50 border border-amber-100 rounded-xl p-3 flex flex-col justify-between space-y-2">
                <div>
                  <p className="text-gray-800 font-bold text-sm">{req.lastName} {req.firstName} さん</p>
                  <p className="text-xs text-gray-400 font-mono select-all">{req.email}</p>
                </div>
                <div className="text-[10px] text-gray-400 font-medium">
                  💡 下のメンバー一覧から該当者を探し、このメールアドレスを貼り付けて「保存」すると紐付きが完了します。
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. メンバーマスタ一覧 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden p-4">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-100 text-gray-400 font-bold bg-gray-50/50 text-[11px]">
              <th className="py-2 pl-3">管理番号</th>
              <th className="py-2">氏名</th>
              <th className="py-2">連絡先メール / 初回ログインメール</th>
              <th className="py-2">所属チーム（部署）</th>
              <th className="py-2 w-24 text-center">操作</th>
              
              {myRole === "owner" && (
                <th className="py-2 w-56 text-center bg-purple-50/40 border-l border-gray-100">👑 権限マスタ（オーナー限定）</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 text-gray-600 text-xs font-medium">
            {members.map((member) => {
              const isEditing = editingDeptEmail === member.email;

              // 🔑 初回ログインメール自動表示
              const loginEmailLabel = member.loginEmail ? (
                <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded font-mono ml-2 inline-block">
                  🔑 {member.loginEmail}
                </span>
              ) : (
                <span className="text-[10px] bg-gray-50 text-gray-400 px-1.5 py-0.5 rounded font-medium ml-2 italic inline-block">
                  未ログイン
                </span>
              );

              return (
                <tr key={member.email} className="hover:bg-gray-50/30 transition-colors">
                  <td className="py-2.5 pl-3 tabular-nums text-gray-400 font-mono">{member.managementNumber}</td>
                  <td className="py-2.5 font-bold text-gray-900 text-sm">{member.name}</td>
                  <td className="py-2.5 text-gray-500 font-medium flex items-center flex-wrap gap-y-1">
                    <span className="font-mono select-all">{member.email}</span>
                    {loginEmailLabel}
                  </td>
                  
                  {/* 所属部署セル */}
                  <td className="py-2.5">
                    {isEditing ? (
                      <select
                        value={selectedDeptTmp}
                        onChange={(e) => setSelectedDeptTmp(e.target.value)}
                        className="w-56 bg-white border-2 border-emerald-400 px-2.5 py-1.5 rounded-lg text-gray-800 font-bold focus:outline-none cursor-pointer shadow-sm text-xs animate-fadeIn"
                      >
                        <option value="">-- 未設定（全体表示） --</option>
                        {customDepts.map((dept) => (
                          <option key={dept} value={dept}>{dept}</option>
                        ))}
                      </select>
                    ) : (
                      member.department ? (
                        <span className="bg-purple-50 text-purple-700 border border-purple-100 px-2.5 py-0.5 rounded-full font-bold text-[11px]">
                          {member.department}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-[11px] font-normal italic">未設定</span>
                      )
                    )}
                  </td>

                  {/* 操作ボタン */}
                  <td className="py-2.5 text-center">
                    {isEditing ? (
                      <div className="flex items-center justify-center space-x-1.5">
                        <button
                          onClick={async () => {
                            await handleSaveDepartment(member.email, selectedDeptTmp);
                          }}
                          className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-2.5 py-1 rounded-lg shadow-sm text-[11px] transition-all"
                        >
                          保存
                        </button>
                        <button
                          onClick={() => setEditingDeptEmail(null)}
                          className="bg-gray-100 hover:bg-gray-200 text-gray-500 font-bold px-2 py-1 rounded-lg text-[11px] transition-all"
                        >
                          戻
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingDeptEmail(member.email);
                          setSelectedDeptTmp(member.department || "");
                        }}
                        className="border border-gray-200 bg-white hover:border-emerald-500 text-gray-500 hover:text-emerald-600 font-bold px-2.5 py-1 rounded-lg shadow-sm text-[11px] transition-all"
                      >
                        編集
                      </button>
                    )}
                  </td>

                  {/* 👑 権限管理エリア */}
                  {myRole === "owner" && (
                    <td className="py-2.5 text-center bg-purple-50/10 border-l border-gray-100">
                      <div className="flex items-center justify-start pl-4 space-x-3">
                        <button
                          onClick={() => toggleAdminRole(member)}
                          className={`px-2 py-0.5 w-20 rounded font-black text-[10px] shadow-sm transition-all border ${
                            member.role === "admin"
                              ? "bg-purple-600 text-white border-purple-700 hover:bg-purple-700"
                              : "bg-gray-50 text-gray-400 border-gray-200 hover:border-purple-500 hover:text-purple-600"
                          }`}
                        >
                          {member.role === "admin" ? "👑 admin" : "一般user"}
                        </button>

                        {member.role === "admin" ? (
                          <label className="flex items-center space-x-1 cursor-pointer text-purple-700 font-bold text-[11px] animate-fadeIn">
                            <input
                              type="checkbox"
                              checked={!!member.isOwnerProxy}
                              onChange={(e) => handleOwnerProxyCheckbox(member, e.target.checked)}
                              className="w-3.5 h-3.5 rounded border-purple-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                            />
                            <span>owner代理権限を付与</span>
                          </label>
                        ) : (
                          <span className="text-gray-300 italic text-[10px] font-normal pl-1 select-none">---</span>
                        )}
                      </div>
                    </td>
                  )}

                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 👑 カスタム確認モーダル */}
      {modalConfig.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[999] animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full mx-4 shadow-2xl border border-gray-100 text-center space-y-5 animate-scaleUp">
            
            <div className="w-12 h-12 mx-auto rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/xl" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            <div className="space-y-1">
              <h4 className="text-base font-black text-gray-900 tracking-tight">{modalConfig.title}</h4>
              <p className="text-sm font-bold text-gray-700">{modalConfig.message}</p>
              {modalConfig.subMessage && (
                <p className="text-xs text-gray-400 font-medium leading-relaxed bg-gray-50 p-2.5 rounded-xl border border-gray-100 mt-2 text-left">
                  {modalConfig.subMessage}
                </p>
              )}
            </div>

            <div className="flex space-x-2.5 pt-1">
              <button 
                onClick={() => {
                  // 💡 キャンセル時は画面リロードせず、単にモーダルを優しく閉じるだけに修正！これでもう飛ばされません
                  setModalConfig(prev => ({ ...prev, isOpen: false }));
                }} 
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold py-2.5 rounded-xl transition-all"
              >
                キャンセル
              </button>
              <button 
                onClick={async () => {
                  setModalConfig(prev => ({ ...prev, isOpen: false }));
                  await modalConfig.onConfirm();
                }} 
                className={`flex-1 text-white text-xs font-black py-2.5 rounded-xl shadow-sm transition-all ${
                  modalConfig.isDanger 
                    ? "bg-rose-500 hover:bg-rose-600 shadow-rose-100" 
                    : "bg-purple-600 hover:bg-purple-700 shadow-purple-100"
                }`}
              >
                {modalConfig.confirmButtonText}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}