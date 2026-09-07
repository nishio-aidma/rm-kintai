"use client";

import { useState, useEffect } from "react";
import { MemberInfo, AccountRequest, attendanceRepository } from "@/lib/attendanceRepository";
import { useRouter } from "next/navigation";

interface TabMembersProps {
  members: MemberInfo[];
  attendanceRecords?: any[];
  getMemberMeta?: (email: string) => { name: string; managementNumber: string; hourlyRate: number; department: string };
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
  attendanceRecords = [],
  getMemberMeta,
  editingDeptEmail,
  setEditingDeptEmail,
  handleSaveDepartment,
  accountRequests,
  myRole,
  uniqueDepartments
}: TabMembersProps) {
  
  const router = useRouter();

  // ボタンを押した瞬間に、その場で権限の表示をパッと切り替えるための「一時記憶の部屋」
  const [localRoles, setLocalRoles] = useState<{ [email: string]: string }>({});
  const [localProxies, setLocalProxies] = useState<{ [email: string]: boolean }>({});

  // 西尾さんにご提示いただいた11個の正しいマスターチーム
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

  // 選択肢として管理されるチームリストのステート
  const [customDepts, setCustomDepts] = useState<string[]>([]);
  // 新規チーム追加用の手入力文字列ステート
  const [newDeptInput, setNewDeptInput] = useState<string>("");
  // メンバー編集時の一時プルダウン選択用ステート
  const [selectedDeptTmp, setSelectedDeptTmp] = useState<string>("");

  // 👑 【改修】ブラウザの記憶ではなく、Firestore（データベース）から直接チーム一覧を読み込む
  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const savedDepts = await attendanceRepository.getCustomDepartments();
        if (savedDepts && savedDepts.length > 0) {
          // データベースに保存済みのデータがあれば最優先で採用
          const merged = Array.from(new Set([...savedDepts, ...uniqueDepartments])).filter(Boolean);
          setCustomDepts(merged);
        } else {
          // 初回起動時など、データベースが空の場合は初期マスタをセットしてデータベースへ保存
          const merged = Array.from(new Set([...initialDepts, ...uniqueDepartments])).filter(Boolean);
          setCustomDepts(merged);
          await attendanceRepository.saveCustomDepartments(merged);
        }
      } catch (error) {
        console.error("チームマスタの読み込みに失敗しました:", error);
      }
    };
    
    // クライアント側（ブラウザ）でのみ実行する
    if (typeof window !== "undefined") {
      loadDepartments();
    }
  }, [uniqueDepartments]);

  // 👑 【改修】チームを追加した際、Firestore（データベース）へ保存する
  const handleAddDeptHeader = async () => {
    const trimmed = newDeptInput.trim();
    if (!trimmed) return;
    if (customDepts.includes(trimmed)) {
      setModalConfig({
        isOpen: true,
        title: "チーム名の重複",
        message: "そのチーム名は既に登録されています。",
        confirmButtonText: "OK",
        onConfirm: async () => {}
      });
      return;
    }
    
    const updated = [...customDepts, trimmed];
    setCustomDepts(updated);
    setNewDeptInput("");
    
    try {
      await attendanceRepository.saveCustomDepartments(updated);
    } catch (error) {
      console.error("チームの追加保存に失敗しました", error);
    }
  };

  // 👑 【改修】チームを削除した際、Firestore（データベース）へ即座に反映する
  const handleDeleteDeptHeader = (deptToDelete: string) => {
    setModalConfig({
      isOpen: true,
      title: "選択肢の削除確認",
      message: `プルダウンの選択肢から「${deptToDelete}」を削除しますか？`,
      subMessage: "※すでにメンバーに割り当てられている所属名自体は保持されます。",
      confirmButtonText: "削除する",
      isDanger: true,
      onConfirm: async () => {
        const updated = customDepts.filter(d => d !== deptToDelete);
        setCustomDepts(updated);
        
        try {
          await attendanceRepository.saveCustomDepartments(updated);
        } catch (error) {
          console.error("チームの削除保存に失敗しました", error);
        }
      }
    });
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
    const currentRole = localRoles[member.email] || member.role;
    const targetRole = currentRole === "admin" ? "user" : "admin";
    
    setModalConfig({
      isOpen: true,
      title: "権限変更の確認",
      message: `${member.name} さんの権限を変更しますか？`,
      subMessage: `【${currentRole === "admin" ? "管理者 (admin)" : "一般ユーザー (user)"}】から【${targetRole === "admin" ? "管理者 (admin)" : "一般ユーザー (user)"}】に切り替わります。`,
      confirmButtonText: "権限を切り替える",
      isDanger: targetRole === "user",
      onConfirm: async () => {
        try {
          await attendanceRepository.updateMemberRole(member.email, targetRole);
          setLocalRoles(prev => ({ ...prev, [member.email]: targetRole }));
          router.refresh();
        } catch (e) {
          setModalConfig({
            isOpen: true,
            title: "エラー",
            message: "権限の変更に失敗しました。",
            confirmButtonText: "閉じる",
            onConfirm: async () => {}
          });
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
          setLocalProxies(prev => ({ ...prev, [member.email]: isChecked }));
          router.refresh();
        } catch (e) {
          setModalConfig({
            isOpen: true,
            title: "エラー",
            message: "オーナー代理権限の切り替えに失敗しました。",
            confirmButtonText: "閉じる",
            onConfirm: async () => {}
          });
        }
      }
    });
  };

  // 氏名を照合キーにして打刻レコードから最終ログイン/活動日時を割り出し、6段階バッジを生成する関数
  const renderLoginStatusBadge = (member: MemberInfo) => {
    const cleanMemberName = (member.name || "").replace(/[\s\u3000]/g, "");

    const userRecords = attendanceRecords.filter((r: any) => {
      const recUserName = (r.userName || "").replace(/[\s\u3000]/g, "");
      if (recUserName && recUserName === cleanMemberName) return true;

      if (getMemberMeta) {
        const metaName = (getMemberMeta(r.email)?.name || "").replace(/[\s\u3000]/g, "");
        if (metaName && metaName === cleanMemberName) return true;
      }

      const cleanMemberEmail = (member.email || "").trim().toLowerCase();
      const cleanMemberLoginEmail = (member.loginEmail || "").trim().toLowerCase();
      const recEmail = (r.email || "").trim().toLowerCase();
      if (recEmail && (recEmail === cleanMemberEmail || recEmail === cleanMemberLoginEmail)) return true;

      return false;
    });

    if (userRecords.length === 0) {
      return (
        <span className="text-[10px] bg-gray-100 text-gray-400 border border-gray-200 px-2 py-0.5 rounded-full font-bold select-none inline-block">
          ⚪ 未ログイン
        </span>
      );
    }

    const sorted = [...userRecords].sort((a, b) => {
      const timeA = `${a.workDate} ${a.startTime || "00:00"}`;
      const timeB = `${b.workDate} ${b.startTime || "00:00"}`;
      return timeB.localeCompare(timeA);
    });

    const latest = sorted[0];
    const latestDateStr = `${latest.workDate}T${latest.startTime && latest.startTime !== "---" ? latest.startTime : "00:00"}:00`;
    const latestDate = new Date(latestDateStr);
    const now = new Date();

    const diffMs = now.getTime() - latestDate.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours <= 24) {
      return (
        <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-black select-none inline-block">
          🟢 24時間以内ログイン
        </span>
      );
    } else if (diffHours <= 24 * 3) {
      return (
        <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-black select-none inline-block">
          🔵 3日以内ログイン
        </span>
      );
    } else if (diffHours <= 24 * 7) {
      return (
        <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-black select-none inline-block">
          🟡 7日以内ログイン
        </span>
      );
    } else if (diffHours <= 24 * 14) {
      return (
        <span className="text-[10px] bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-black select-none inline-block">
          🟠 14日以内ログイン
        </span>
      );
    } else {
      return (
        <span className="text-[10px] bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full font-black select-none inline-block">
          🔴 15日以上ログインなし
        </span>
      );
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      
      {/* 1. 最上部：チーム名追加・削除専用の独立管理エリア */}
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
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-4 py-2 rounded-xl text-xs shadow-sm transition-all flex items-center space-x-1 cursor-pointer"
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
                  className="w-4 h-4 rounded-full bg-purple-200/60 hover:bg-rose-500 text-purple-800 hover:text-white flex items-center justify-center font-black text-[9px] transition-all cursor-pointer"
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
            <tr className="border-b border-gray-100 text-gray-400 font-bold bg-gray-50/50 text-[11px] h-10">
              <th className="py-2 pl-3">管理番号</th>
              <th className="py-2">氏名</th>
              <th className="py-2">ログイン状況</th>
              <th className="py-2">所属チーム（部署）</th>
              <th className="py-2 w-28 text-center">操作</th>
              
              {myRole === "owner" && (
                <th className="py-2 w-56 text-center bg-purple-50/40 border-l border-gray-100">👑 権限マスタ（オーナー限定）</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 text-gray-600 text-xs font-medium">
            {members.map((member) => {
              const isEditing = editingDeptEmail === member.email;

              const currentRole = localRoles[member.email] || member.role;
              const currentIsOwnerProxy = localProxies[member.email] !== undefined ? localProxies[member.email] : !!member.isOwnerProxy;

              return (
                <tr key={member.email} className="hover:bg-gray-50/30 transition-colors h-12">
                  <td className="py-1 pl-3 tabular-nums text-gray-400 font-mono align-middle">{member.managementNumber}</td>
                  <td className="py-1 font-bold text-gray-900 text-sm align-middle">{member.name}</td>
                  
                  <td className="py-1 text-gray-500 font-medium align-middle">
                    {renderLoginStatusBadge(member)}
                  </td>
                  
                  <td className="py-1 align-middle">
                    {isEditing ? (
                      <div className="h-8 flex items-center">
                        <select
                          value={selectedDeptTmp}
                          onChange={(e) => setSelectedDeptTmp(e.target.value)}
                          className="w-56 bg-white border-2 border-emerald-400 px-2 py-1 rounded-lg text-gray-800 font-bold focus:outline-none cursor-pointer shadow-sm text-xs h-8"
                        >
                          <option value="">-- 未設定 --</option>
                          {customDepts.map((dept) => (
                            <option key={dept} value={dept}>{dept}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="h-8 flex items-center">
                        {member.department && member.department !== "未設定" ? (
                          <span className="bg-purple-50 text-purple-700 border border-purple-100 px-2.5 py-0.5 rounded-full font-bold text-[11px] inline-block">
                            {member.department}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-[11px] font-normal italic inline-block">未設定</span>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="py-1 text-center align-middle">
                    <div className="h-8 flex items-center justify-center">
                      {isEditing ? (
                        <div className="flex items-center space-x-1.5">
                          <button
                            onClick={async () => {
                              const saveValue = selectedDeptTmp === "未設定" ? "" : selectedDeptTmp;
                              await handleSaveDepartment(member.email, saveValue);
                            }}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-2.5 py-1 rounded-lg shadow-sm text-[11px] transition-all cursor-pointer h-7 flex items-center"
                          >
                            保存
                          </button>
                          <button
                            onClick={() => setEditingDeptEmail(null)}
                            className="bg-gray-100 hover:bg-gray-200 text-gray-500 font-bold px-2 py-1 rounded-lg text-[11px] transition-all cursor-pointer h-7 flex items-center"
                          >
                            戻
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingDeptEmail(member.email);
                            const currentDept = member.department === "未設定" ? "" : (member.department || "");
                            setSelectedDeptTmp(currentDept);
                          }}
                          className="border border-gray-200 bg-white hover:border-emerald-500 text-gray-500 hover:text-emerald-600 font-bold px-2.5 py-1 rounded-lg shadow-sm text-[11px] transition-all cursor-pointer h-7 flex items-center"
                        >
                          編集
                        </button>
                      )}
                    </div>
                  </td>

                  {myRole === "owner" && (
                    <td className="py-1 text-center bg-purple-50/10 border-l border-gray-100 align-middle">
                      <div className="flex items-center justify-start pl-4 space-x-3 h-8">
                        <button
                          onClick={() => toggleAdminRole(member)}
                          className={`px-2 py-0.5 w-20 rounded font-black text-[10px] shadow-sm transition-all border cursor-pointer ${
                            currentRole === "admin"
                              ? "bg-purple-600 text-white border-purple-700 hover:bg-purple-700"
                              : "bg-gray-50 text-gray-400 border-gray-200 hover:border-purple-500 hover:text-purple-600"
                          }`}
                        >
                          {currentRole === "admin" ? "👑 admin" : "一般user"}
                        </button>

                        {currentRole === "admin" ? (
                          <label className="flex items-center space-x-1 cursor-pointer text-purple-700 font-bold text-[11px] select-none">
                            <input
                              type="checkbox"
                              checked={currentIsOwnerProxy}
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

      {/* カスタム確認モーダル */}
      {modalConfig.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[999] animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full mx-4 shadow-2xl border border-gray-100 text-center space-y-5 animate-scaleUp">
            
            <div className="w-12 h-12 mx-auto rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
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
                  setModalConfig(prev => ({ ...prev, isOpen: false }));
                }} 
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer"
              >
                キャンセル
              </button>
              <button 
                onClick={async () => {
                  setModalConfig(prev => ({ ...prev, isOpen: false }));
                  await modalConfig.onConfirm();
                }} 
                className={`flex-1 text-white text-xs font-black py-2.5 rounded-xl shadow-sm transition-all cursor-pointer ${
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