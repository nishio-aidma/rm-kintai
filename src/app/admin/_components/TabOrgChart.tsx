"use client";

import { useState, useEffect } from "react";
import { MemberInfo, attendanceRepository } from "@/lib/attendanceRepository";
// 💡 ログイン中のアカウント権限をその場で判定するためにFirebase Authをインポート
import { getAuth } from "firebase/auth";
// @ts-ignore
import pptxgen from "pptxgenjs";

interface TabOrgChartProps {
  members: MemberInfo[];
  uniqueDepartments: string[];
}

interface SubTeam {
  id: string;
  name: string;
  leaderName?: string;
  members: string[];
}

export default function TabOrgChart({ members, uniqueDepartments }: TabOrgChartProps) {
  const [localMembers, setLocalMembers] = useState<MemberInfo[]>([]);
  const [displayDepartments, setDisplayDepartments] = useState<string[]>([]);
  const [isEditable, setIsEditable] = useState(false); // 💡 ownerまたは代理ならtrue、一般adminならfalse（閲覧のみ）にするフラグ
  const [isExporting, setIsExporting] = useState(false);
  const [isLoadingSubTeams, setIsLoadingSubTeams] = useState(true);
  
  // 子チーム（下部階層）の状態管理
  const [subTeams, setSubTeams] = useState<{ [parentDept: string]: SubTeam[] }>({});
  const [showAddSubModal, setShowAddSubModal] = useState<string | null>(null);
  const [newSubTeamName, setNewSubTeamName] = useState("");

  // Windows標準のモーダルを使わないためのカスタム通知ステート
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // 通知を3秒後に自動で消すタイマー
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // 💡 【大改造】起動時に親の制限をバイパスし、全メンバー・全部署・ログイン権限を一撃でロードする
  useEffect(() => {
    const loadAllOrganizationData = async () => {
      setIsLoadingSubTeams(true); 
      try {
        // 1. Firestoreから全メンバーを強制的に直接全件取得
        const allMembers = await attendanceRepository.getAllMembers();
        setLocalMembers(allMembers);

        // 2. 取得した全メンバーの所属から、システム内の「重複のない全部署リスト」を自動生成してセット
        const allDepts = Array.from(
          new Set(allMembers.map(m => m.department?.trim()).filter(Boolean))
        ) as string[];
        setDisplayDepartments(allDepts);

        // 3. 現在ログインしているユーザーが「owner（またはオーナー代理）」か判定
        const auth = getAuth();
        const currentUser = auth.currentUser;
        if (currentUser?.email) {
          const me = allMembers.find(m => m.email.toLowerCase() === currentUser.email?.toLowerCase());
          // 💡 【ここを修正】(me?.role as string) とすることで、TypeScriptのエラー(ts2367)を完全に回避しました
          if ((me?.role as string) === "owner" || me?.isOwnerProxy) {
            setIsEditable(true); // owner系なら編集フル機能を解放
          }
        }
        
        // 4. 全部署の子チーム（下部階層）のデータを並列ロード
        const loadedSubTeams: { [parentDept: string]: SubTeam[] } = {};
        await Promise.all(
          allDepts.map(async (dept) => {
            if (dept) {
              const res = await attendanceRepository.getSubTeams(dept);
              loadedSubTeams[dept] = res as any; 
            }
          })
        );
        setSubTeams(loadedSubTeams);
      } catch (error) {
        console.error("【組織図の全開示ロードエラー】:", error);
      } finally {
        setIsLoadingSubTeams(false);
      }
    };

    loadAllOrganizationData();
  }, []);

  const getLeadersForDepartment = (deptName: string) => {
    return localMembers.filter(m => m.leadingTeams?.includes(deptName));
  };

  const getMembersForDepartment = (deptName: string) => {
    return localMembers.filter(m => m.department === deptName);
  };

  // 子チームを新規追加
  const handleAddSubTeam = async (parentDept: string) => {
    if (!newSubTeamName.trim()) return;
    
    const currentList = subTeams[parentDept] || [];
    const newTeam: SubTeam = {
      id: `sub-${Date.now()}`,
      name: newSubTeamName.trim(),
      members: []
    };
    const updatedList = [...currentList, newTeam];

    try {
      await attendanceRepository.saveSubTeams(parentDept, updatedList);
      setSubTeams(prev => ({ ...prev, [parentDept]: updatedList }));
      setNewSubTeamName("");
      setShowAddSubModal(null);
      setToastMessage({ text: "🏢 子チームを作成しました", type: "success" });
    } catch (error) {
      console.error("【保存エラー】", error);
      setToastMessage({ text: "❌ 子チームの作成に失敗しました", type: "error" });
    }
  };

  const handleAssignLeader = async (deptName: string, email: string) => {
    if (!email) return;
    const targetMember = localMembers.find(m => m.email === email);
    if (!targetMember) return;

    const currentLeading = targetMember.leadingTeams || [];
    if (currentLeading.includes(deptName)) return;

    const updatedLeading = [...currentLeading, deptName];
    try {
      await attendanceRepository.updateMemberLeadingTeams(email, updatedLeading);
      
      setLocalMembers(prev =>
        prev.map(m => (m.email === email ? { ...m, leadingTeams: updatedLeading } : m))
      );
      setToastMessage({ text: "👑 リーダーをアサインしました", type: "success" });
    } catch (error) {
      setToastMessage({ text: "❌ リーダーのアサインに失敗しました。", type: "error" });
    }
  };

  const handleRemoveLeader = async (deptName: string, email: string) => {
    const targetMember = localMembers.find(m => m.email === email);
    if (!targetMember) return;

    const updatedLeading = (targetMember.leadingTeams || []).filter(t => t !== deptName);
    try {
      await attendanceRepository.updateMemberLeadingTeams(email, updatedLeading);
      
      setLocalMembers(prev =>
        prev.map(m => (m.email === email ? { ...m, leadingTeams: updatedLeading } : m))
      );
      setToastMessage({ text: "✕ リーダーの解除を行いました", type: "success" });
    } catch (error) {
      setToastMessage({ text: "❌ リーダーの解除に失敗しました。", type: "error" });
    }
  };

  const handleExportPPTX = async () => {
    setIsExporting(true);
    try {
      const pptx = new pptxgen();
      // @ts-ignore
      pptx.layout = "LAYOUT_16x9";

      const addCommonHeader = (slide: any) => {
        slide.addText("緊急連絡先：西尾（070-3169-9955）/ 伊藤（070-5553-4180）", {
          x: 0.5, y: 0.15, w: 12.3, h: 0.3,
          fontSize: 12, color: "FF4B4B", bold: true, fontFace: "Meiryo", align: "left"
        });
        slide.addText("※ 各チームリーダーに連絡ができない状態の場合は、社員まで、SMSをください", {
          x: 0.5, y: 0.4, w: 12.3, h: 0.3,
          fontSize: 10, color: "64748B", fontFace: "Meiryo", align: "left"
        });
      };

      const slide1 = pptx.addSlide();
      slide1.background = { color: "005088" };
      slide1.addText("RM 組織図", {
        x: 1.0, y: 2.2, w: 11.3, h: 1.5,
        fontSize: 54, color: "FFFFFF", bold: true, fontFace: "Meiryo", align: "center"
      });
      const today = new Date();
      const dateStr = `${today.getFullYear()}年${String(today.getMonth() + 1).padStart(2, "0")}月${String(today.getDate())}日 改訂`;
      slide1.addText(dateStr, {
        x: 1.0, y: 3.8, w: 11.3, h: 0.5,
        fontSize: 18, color: "11CAA0", fontFace: "Meiryo", align: "center"
      });

      const cleanDeptsForExport = displayDepartments.map(d => d?.trim()).filter(Boolean);
      cleanDeptsForExport.forEach(deptName => {
        const slide = pptx.addSlide();
        addCommonHeader(slide);

        slide.addText(`🏢 チーム組織図 : ${deptName}`, {
          x: 0.5, y: 0.8, w: 12.0, h: 0.7,
          fontSize: 26, color: "005088", bold: true, fontFace: "Meiryo"
        });
        slide.addShape("rect" as any, { x: 0.5, y: 1.5, w: 12.3, h: 0.04, fill: { color: "11CAA0" } });

        const leaders = getLeadersForDepartment(deptName);
        const deptMembers = getMembersForDepartment(deptName);

        slide.addText("👑 チーム責任者（リーダー）", {
          x: 0.5, y: 1.8, w: 5.5, h: 0.4,
          fontSize: 15, color: "005088", bold: true, fontFace: "Meiryo"
        });

        if (leaders.length > 0) {
          leaders.forEach((leader, idx) => {
            const offset = idx * 0.9; 
            slide.addShape("roundRect" as any, {
              x: 0.5, y: 2.3 + offset, w: 5.5, h: 0.8,
              fill: { color: "FFF3DD" }, line: { color: "FFE0A3", width: 1 }
            });
            slide.addText(leader.name, {
              x: 0.8, y: 2.38 + offset, w: 5.0, h: 0.25,
              fontSize: 14, color: "111827", bold: true, fontFace: "Meiryo"
            });
            slide.addText(`Mail: ${leader.email}`, {
              x: 0.8, y: 2.68 + offset, w: 5.0, h: 0.2,
              fontSize: 9, color: "64748B", fontFace: "Consolas"
            });
          });
        } else {
          slide.addText("（※リーダー未設定）", {
            x: 0.5, y: 2.3, w: 5.5, h: 0.4,
            fontSize: 13, color: "94A3B8", fontFace: "Meiryo", italic: true
          });
        }

        slide.addText("👥 チーム所属メンバー一覧", {
          x: 6.5, y: 1.8, w: 6.0, h: 0.4,
          fontSize: 15, color: "005088", bold: true, fontFace: "Meiryo"
        });

        if (deptMembers.length > 0) {
          const tableRows = deptMembers.map(m => [
            { text: m.name, options: { bold: true, fontFace: "Meiryo", fontSize: 9.5, margin: [0.05, 0.08, 0.05, 0.08] as [number, number, number, number] } },
            { text: m.email, options: { fontFace: "Consolas", fontSize: 9, color: "475569", margin: [0.05, 0.08, 0.05, 0.08] as [number, number, number, number] } }
          ]);

          slide.addTable(tableRows, {
            x: 6.5, y: 2.3, w: 6.3,
            colW: [1.5, 4.8],
            border: { type: "solid", color: "E2E8F0", pt: 1 },
            fill: { color: "F8FAFC" },
            valign: "middle",
            autoPage: true,
            autoPageRepeatHeader: true,
            margin: [0.5, 0.5, 0.5, 0.5]
          } as any);
        } else {
          slide.addText("（所属メンバーなし）", {
            x: 6.5, y: 2.3, w: 6.0, h: 0.4,
            fontSize: 13, color: "94A3B8", fontFace: "Meiryo", italic: true
          });
        }
      });

      const todayStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
      // @ts-ignore
      await pptx.writeFile({ fileName: `RM_組織図_${todayStr}.pptx` });
      setToastMessage({ text: "📥 組織図スライドを出力しました！", type: "success" });
    } catch (e) {
      console.error(e);
      setToastMessage({ text: "❌ 組織図の生成中にエラーが発生しました。", type: "error" });
    } finally {
      setIsExporting(false);
    }
  };

  const validDepartments = displayDepartments.map(d => d?.trim()).filter(Boolean);

  if (isLoadingSubTeams) {
    return (
      <div className="w-full bg-white rounded-2xl border border-gray-100 p-12 text-center text-xs font-bold text-gray-400 animate-pulse">
        🔄 Firebaseから部署一覧の最新組織図を読み込んでいます...
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 animate-fadeIn">
      {/* カスタム通知 */}
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-xl font-bold text-xs transition-all animate-fadeIn ${
          toastMessage.type === "success" ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
        }`}>
          {toastMessage.text}
        </div>
      )}

      {/* 上部ヘッダーエリア */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center justify-between">
        <div>
          <h2 className="text-base font-extrabold text-gray-800 tracking-tight">🗺️ 組織図マスタ管理（全件開示中）</h2>
          <p className="text-gray-400 text-xs mt-0.5">
            {isEditable ? "👑 全チームの組織構成を確認し、編集・管理を行えます。" : "🔍 全チームの組織構成を表示しています（一般管理者アカウント：閲覧専用モード）"}
          </p>
        </div>
        <button
          onClick={handleExportPPTX}
          disabled={isExporting}
          className={`font-black text-xs px-5 py-3 rounded-xl shadow-xl transition-all flex items-center space-x-2 ${
            isExporting
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-purple-600 hover:bg-purple-700 text-white shadow-purple-100 hover:scale-[1.02]"
          }`}
        >
          <span>{isExporting ? "⏳ 組織図を生成中..." : "📥 組織図スライド(PPTX)を出力する"}</span>
        </button>
      </div>

      {/* 組織図全体の枠 */}
      <div className="w-full max-w-full bg-white rounded-2xl border border-gray-100 p-6 overflow-x-auto shadow-sm">
        <div className="min-w-max mx-auto flex flex-col items-center">
          
          {/* 親の枠 */}
          <div className="flex flex-col items-center mb-4">
            <div className="bg-white text-blue-600 border-2 border-blue-600 px-6 py-2.5 rounded-xl shadow-md text-center font-black text-xs tracking-wide z-10">
              📞 西尾 070-3169-9955 / 伊藤 070-5553-4180
            </div>
            <div className="w-0.5 h-8 bg-gray-300"></div>
          </div>

          {/* 各部署が横に美しく並ぶエリア */}
          <div className="flex items-start">
            
            {validDepartments.map((deptName, index) => {
              const leaders = getLeadersForDepartment(deptName);
              const deptMembers = getMembersForDepartment(deptName);

              const leaderEmails = leaders.map(l => l.email);
              const displayMembers = deptMembers.filter(m => !leaderEmails.includes(m.email));

              const isFirst = index === 0;
              const isLast = index === validDepartments.length - 1;
              const currentSubTeams = subTeams[deptName] || [];

              return (
                <div key={deptName} className="w-[280px] flex flex-col items-center relative flex-shrink-0">
                  
                  {/* T字ライン */}
                  <div className="absolute top-0 w-full h-8 flex flex-col items-center">
                    <div className="absolute top-0 w-full h-0.5 flex">
                      <div className={`w-1/2 h-full ${isFirst ? "" : "bg-gray-300"}`}></div>
                      <div className={`w-1/2 h-full ${isLast ? "" : "bg-gray-300"}`}></div>
                    </div>
                    <div className="w-0.5 h-full bg-gray-300"></div>
                  </div>

                  {/* チームのメインカード */}
                  <div className="w-60 mt-8 bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden flex flex-col justify-between z-10 relative">
                    <div className="bg-gray-50 border-b border-gray-100 px-3 py-2.5 flex items-center justify-between">
                      <span className="font-extrabold text-gray-800 text-[12px] tracking-tight truncate">🏢 {deptName}</span>
                      <span className="bg-emerald-50 text-emerald-700 font-sans text-[13px] px-2 py-0.5 rounded-full font-extrabold shadow-sm border border-emerald-100 flex-shrink-0">
                        {deptMembers.length}名
                      </span>
                    </div>

                    <div className="p-3 space-y-3 flex-grow">
                      
                      {/* ▼ チームリーダー エリア */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 block">▼ チームリーダー</label>
                        
                        {leaders.length > 0 ? (
                          <div className="space-y-1">
                            {leaders.map(leader => (
                              <div key={leader.email} className="bg-amber-50 text-amber-900 border border-amber-200 rounded-lg p-1.5 flex items-center justify-between shadow-sm">
                                <div className="flex items-center space-x-1.5 min-w-0">
                                  <span className="text-xs flex-shrink-0">👑</span>
                                  <span className="font-extrabold text-[12px] text-gray-800 truncate">{leader.name}</span>
                                </div>
                                {/* 💡 編集権限がある場合のみ表示 */}
                                {isEditable && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveLeader(deptName, leader.email)}
                                    className="text-[9px] font-bold bg-white hover:bg-rose-50 text-rose-500 hover:text-rose-600 border border-amber-200 px-1.5 py-0.5 rounded flex-shrink-0"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="bg-gray-50/50 border border-dashed border-gray-200 rounded-lg p-1.5 space-y-1 text-center">
                            <p className="text-gray-300 italic text-[10px] font-normal">未設定</p>
                            
                            {/* 💡 編集権限がある場合のみ表示 */}
                            {isEditable && (
                              <div className="grid grid-cols-1 gap-1 pt-0.5">
                                <select
                                  onChange={(e) => {
                                    handleAssignLeader(deptName, e.target.value);
                                    e.target.value = ""; 
                                  }}
                                  defaultValue=""
                                  className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-[11px] font-bold text-gray-600 cursor-pointer focus:outline-none shadow-sm"
                                >
                                  <option value="" disabled>👥 所属内から選択</option>
                                  {displayMembers.map(m => (
                                    <option key={m.email} value={m.email}>{m.name}</option>
                                  ))}
                                </select>

                                <select
                                  onChange={(e) => {
                                    handleAssignLeader(deptName, e.target.value);
                                    e.target.value = "";
                                  }}
                                  defaultValue=""
                                  className="w-full bg-white border border-purple-200 rounded px-2 py-1 text-[11px] font-bold text-purple-600 cursor-pointer focus:outline-none shadow-sm"
                                >
                                  <option value="" disabled>🔍 全社員から選択</option>
                                  {localMembers.map(m => (
                                    <option key={m.email} value={m.email}>{m.name} ({m.department || "未"})</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* ▼ 所属メンバー */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-gray-400 block">▼ 所属メンバー</label>
                        <div className="border-l-2 border-gray-200 pl-3 ml-1 space-y-2">
                          {displayMembers.map(m => (
                            <div key={m.email} className="relative flex items-center py-0.5 animate-fadeIn">
                              <div className="absolute left-0 top-1/2 w-2 h-0.5 bg-gray-200 -translate-x-3"></div>
                              <span className="font-extrabold text-gray-700 text-[12px] tracking-wide pl-1">
                                👤 {m.name}
                              </span>
                            </div>
                          ))}
                          {displayMembers.length === 0 && (
                            <p className="text-gray-300 italic text-[10px] py-1 pl-1 font-normal">所属なし</p>
                          )}
                        </div>
                      </div>

                      {/* 💡 編集権限がある場合のみ表示 */}
                      {isEditable && (
                        <div className="pt-2 border-t border-gray-100 flex flex-col items-center">
                          <button
                            onClick={() => setShowAddSubModal(deptName)}
                            className="w-full py-1.5 bg-gray-50 hover:bg-emerald-50 text-gray-500 hover:text-emerald-600 border border-gray-200 hover:border-emerald-200 border-dashed rounded-lg text-[10px] font-extrabold transition-all text-center"
                          >
                            ➕ 下部階層（子チーム）を作成
                          </button>
                        </div>
                      )}

                    </div>
                  </div>

                  {/* 子チームのカード群 */}
                  {currentSubTeams.length > 0 && (
                    <div className="w-0.5 h-8 bg-gray-300 z-0"></div>
                  )}

                  <div className="flex flex-col items-center space-y-4">
                    {currentSubTeams.map((sub, sIdx) => (
                      <div key={sub.id} className="w-52 bg-slate-50 border border-slate-200 rounded-xl p-2.5 shadow-sm relative z-10 animate-fadeIn">
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-4 w-0.5 h-4 bg-gray-300"></div>
                        
                        <div className="flex items-center justify-between border-b border-slate-200 pb-1 mb-1.5">
                          <span className="font-black text-slate-800 text-[11px]">↳ 🏢 {sub.name}</span>
                          <span className="text-[8px] bg-slate-200 text-slate-600 font-bold px-1 py-0.5 rounded">子階層</span>
                        </div>
                        <p className="text-[9px] text-slate-400 italic text-center py-1">メンバー・リーダー未設定</p>
                      </div>
                    ))}
                  </div>

                  {/* 子チーム追加用入力フォーム */}
                  {showAddSubModal === deptName && (
                    <div className="w-60 mt-2 p-2 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-2 z-20 animate-fadeIn">
                      <input
                        type="text"
                        placeholder="子チーム名を入力..."
                        value={newSubTeamName}
                        onChange={(e) => setNewSubTeamName(e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs font-bold text-gray-700 focus:outline-none"
                      />
                      <div className="flex space-x-1.5 justify-end">
                        <button
                          onClick={() => setShowAddSubModal(null)}
                          className="text-[9px] font-bold bg-white text-gray-400 px-2 py-1 rounded border border-gray-200"
                        >
                          キャンセル
                        </button>
                        <button
                          onClick={() => handleAddSubTeam(deptName)}
                          className="text-[9px] font-bold bg-emerald-600 text-white px-2 py-1 rounded"
                        >
                          作成する
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>

        </div>
      </div>
    </div>
  );
}