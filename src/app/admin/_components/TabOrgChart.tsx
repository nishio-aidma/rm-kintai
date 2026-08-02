"use client";

import { useState, useEffect } from "react";
import { MemberInfo, attendanceRepository } from "@/lib/attendanceRepository";
import { useRouter } from "next/navigation";
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
  const [isEditable, setIsEditable] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoadingSubTeams, setIsLoadingSubTeams] = useState(true);
  
  const [subTeams, setSubTeams] = useState<{ [parentDept: string]: SubTeam[] }>({});
  const [showAddSubModal, setShowAddSubModal] = useState<string | null>(null);
  const [newSubTeamName, setNewSubTeamName] = useState("");

  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  useEffect(() => {
    const loadAllOrganizationData = async () => {
      setIsLoadingSubTeams(true); 
      try {
        const allMembers = await attendanceRepository.getAllMembers();
        setLocalMembers(allMembers);

        const allDepts = Array.from(
          new Set(allMembers.map(m => m.department?.trim()).filter(Boolean))
        ) as string[];
        setDisplayDepartments(allDepts);

        const sessionStr = localStorage.getItem("session");
        if (sessionStr) {
          const session = JSON.parse(sessionStr);
          const email = session.email || "";

          if (email === "nishio@aidma-hd.jp") {
            setIsEditable(true);
          } else {
            const me = allMembers.find(m => m.email.toLowerCase() === email.toLowerCase());
            if (me?.isOwnerProxy || (me?.role as string) === "owner") {
              setIsEditable(true);
            }
          }
        }
        
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
    if (currentLeading.includes(deptName)) {
      setToastMessage({ text: "⚠️ すでにこのチームのリーダーとして登録されています", type: "error" });
      return;
    }

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

  // 💡 【上下配置完全改修】横幅9.0インチに要素をすべて収め、はみ出しをゼロにする
  const handleExportPPTX = async () => {
    setIsExporting(true);
    try {
      const pptx = new pptxgen();
      // @ts-ignore
      pptx.layout = "LAYOUT_16x9";

      // 共通ヘッダー（幅9.0インチに統一）
      const addCommonHeader = (slide: any) => {
        slide.addText("緊急連絡先：西尾（070-3169-9955）/ 伊藤（070-5553-4180）", {
          x: 0.5, y: 0.15, w: 9.0, h: 0.22,
          fontSize: 10.5, color: "FF4B4B", bold: true, fontFace: "Meiryo", align: "left"
        });
        slide.addText("※ 各チームリーダーに連絡ができない状態の場合は、社員まで、SMSをください", {
          x: 0.5, y: 0.35, w: 9.0, h: 0.2,
          fontSize: 8, color: "64748B", fontFace: "Meiryo", align: "left"
        });
      };

      // 1. 表紙スライド
      const slide1 = pptx.addSlide();
      slide1.background = { color: "005088" };
      slide1.addText("RM 組織図", {
        x: 0.5, y: 1.8, w: 9.0, h: 1.2,
        fontSize: 44, color: "FFFFFF", bold: true, fontFace: "Meiryo", align: "center"
      });
      const today = new Date();
      const dateStr = `${today.getFullYear()}年${String(today.getMonth() + 1).padStart(2, "0")}月${String(today.getDate())}日 改訂`;
      slide1.addText(dateStr, {
        x: 0.5, y: 3.2, w: 9.0, h: 0.4,
        fontSize: 16, color: "11CAA0", fontFace: "Meiryo", align: "center"
      });

      // 2. 各部署スライド生成（上下配置モード）
      const cleanDeptsForExport = displayDepartments.map(d => d?.trim()).filter(Boolean);

      cleanDeptsForExport.forEach(deptName => {
        const slide = pptx.addSlide();
        addCommonHeader(slide);

        // 部署名見出し（幅 9.0 インチ）
        slide.addText(`🏢 チーム組織図 : ${deptName}`, {
          x: 0.5, y: 0.58, w: 9.0, h: 0.45,
          fontSize: 18, color: "005088", bold: true, fontFace: "Meiryo"
        });
        // 緑色の区切り線（幅 9.0 インチでスライド右端 X:9.5 にピッタリ合わせる）
        slide.addShape("rect" as any, { x: 0.5, y: 1.05, w: 9.0, h: 0.03, fill: { color: "11CAA0" } });

        // 重複排除ロジック
        const rawLeaders = getLeadersForDepartment(deptName);
        const leaders = Array.from(new Map(rawLeaders.map(m => [m.email.toLowerCase(), m])).values());
        const leaderEmails = leaders.map(l => l.email.toLowerCase());

        const rawDeptMembers = getMembersForDepartment(deptName);
        const displayMembers = Array.from(
          new Map(
            rawDeptMembers
              .filter(m => !leaderEmails.includes(m.email.toLowerCase()))
              .map(m => [m.email.toLowerCase(), m])
          ).values()
        );

        // ----------------------------------------------------
        // 【上段】チーム責任者（リーダー）エリア（Y: 1.15 〜）
        // ----------------------------------------------------
        slide.addText("👑 チーム責任者（リーダー）", {
          x: 0.5, y: 1.15, w: 9.0, h: 0.25,
          fontSize: 11, color: "005088", bold: true, fontFace: "Meiryo"
        });

        let nextY = 1.42;

        if (leaders.length > 0) {
          leaders.forEach((leader) => {
            slide.addShape("roundRect" as any, {
              x: 0.5, y: nextY, w: 9.0, h: 0.5,
              fill: { color: "FFF8E7" }, line: { color: "FCD34D", width: 1 }
            });
            slide.addText(`${leader.name}   (Mail: ${leader.email})`, {
              x: 0.7, y: nextY + 0.12, w: 8.6, h: 0.28,
              fontSize: 11, color: "111827", bold: true, fontFace: "Meiryo"
            });
            nextY += 0.58;
          });
        } else {
          slide.addText("（※リーダー未設定）", {
            x: 0.5, y: nextY, w: 9.0, h: 0.3,
            fontSize: 10, color: "94A3B8", fontFace: "Meiryo", italic: true
          });
          nextY += 0.38;
        }

        // ----------------------------------------------------
        // 【下段】チーム所属メンバー一覧エリア（Y: nextY + 0.1 〜）
        // ----------------------------------------------------
        const memberHeaderY = Math.max(nextY + 0.08, 2.05);

        slide.addText(`👥 チーム所属メンバー一覧（${displayMembers.length}名）`, {
          x: 0.5, y: memberHeaderY, w: 9.0, h: 0.25,
          fontSize: 11, color: "005088", bold: true, fontFace: "Meiryo"
        });

        const tableY = memberHeaderY + 0.3;

        if (displayMembers.length > 0) {
          // 5名以上の場合は2列（4カラム）、4名以下の場合は1列（2カラム）でレイアウト
          const isMultiColumn = displayMembers.length >= 5;

          let tableRows: any[] = [];
          let colWidths: number[] = [];

          if (isMultiColumn) {
            // 2列構成: [氏名1 (1.8in), メール1 (2.7in) || 氏名2 (1.8in), メール2 (2.7in)] ➔ 合計 9.0 インチ
            colWidths = [1.8, 2.7, 1.8, 2.7];
            const halfLength = Math.ceil(displayMembers.length / 2);

            for (let i = 0; i < halfLength; i++) {
              const m1 = displayMembers[i];
              const m2 = displayMembers[i + halfLength];

              const cellOpts = (isBold: boolean, isMono: boolean) => ({
                fontFace: isMono ? "Consolas" : "Meiryo",
                fontSize: 8.5,
                bold: isBold,
                color: isMono ? "475569" : "1E293B",
                margin: [0.03, 0.05, 0.03, 0.05] as [number, number, number, number]
              });

              tableRows.push([
                { text: m1 ? m1.name : "", options: cellOpts(true, false) },
                { text: m1 ? m1.email : "", options: cellOpts(false, true) },
                { text: m2 ? m2.name : "", options: cellOpts(true, false) },
                { text: m2 ? m2.email : "", options: cellOpts(false, true) },
              ]);
            }
          } else {
            // 1列構成: [氏名 (2.5in), メール (6.5in)] ➔ 合計 9.0 インチ
            colWidths = [2.5, 6.5];
            tableRows = displayMembers.map(m => [
              { 
                text: m.name, 
                options: { 
                  bold: true, 
                  fontFace: "Meiryo", 
                  fontSize: 9.5, 
                  color: "1E293B",
                  margin: [0.04, 0.06, 0.04, 0.06] as [number, number, number, number] 
                } 
              },
              { 
                text: m.email, 
                options: { 
                  fontFace: "Consolas", 
                  fontSize: 9, 
                  color: "475569", 
                  margin: [0.04, 0.06, 0.04, 0.06] as [number, number, number, number] 
                } 
              }
            ]);
          }

          slide.addTable(tableRows, {
            x: 0.5, y: tableY, w: 9.0,
            colW: colWidths,
            border: { type: "solid", color: "E2E8F0", pt: 0.5 },
            fill: { color: "F8FAFC" },
            valign: "middle",
            autoPage: false,
          } as any);
        } else {
          slide.addText("（所属メンバーなし）", {
            x: 0.5, y: tableY, w: 9.0, h: 0.3,
            fontSize: 10, color: "94A3B8", fontFace: "Meiryo", italic: true
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
              : "bg-purple-600 hover:bg-purple-700 text-white shadow-purple-100 hover:scale-[1.02] active:scale-95"
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
                                {isEditable && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveLeader(deptName, leader.email)}
                                    className="text-[9px] font-bold bg-white hover:bg-rose-50 text-rose-500 hover:text-rose-600 border border-amber-200 px-1.5 py-0.5 rounded flex-shrink-0 cursor-pointer"
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
                          </div>
                        )}

                        {/* リーダー追加用のプルダウン */}
                        {isEditable && (
                          <div className="grid grid-cols-1 gap-1 pt-0.5 mt-2">
                            <select
                              onChange={(e) => {
                                handleAssignLeader(deptName, e.target.value);
                                e.target.value = ""; 
                              }}
                              defaultValue=""
                              className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-[11px] font-bold text-gray-600 cursor-pointer focus:outline-none shadow-sm"
                            >
                              <option value="" disabled>👥 所属内から追加</option>
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
                              <option value="" disabled>🔍 全社員から追加</option>
                              {localMembers
                                .filter(m => !leaderEmails.includes(m.email))
                                .map(m => (
                                  <option key={m.email} value={m.email}>{m.name} ({m.department || "未"})</option>
                                ))}
                            </select>
                          </div>
                        )}
                      </div>

                      {/* ▼ 所属メンバー */}
                      <div className="space-y-1.5 pt-1">
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

                      {/* 子チーム作成ボタン */}
                      {isEditable && (
                        <div className="pt-2 border-t border-gray-100 flex flex-col items-center">
                          <button
                            onClick={() => setShowAddSubModal(deptName)}
                            className="w-full py-1.5 bg-gray-50 hover:bg-emerald-50 text-gray-500 hover:text-emerald-600 border border-gray-200 hover:border-emerald-200 border-dashed rounded-lg text-[10px] font-extrabold transition-all text-center cursor-pointer"
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
                    {currentSubTeams.map((sub) => (
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
                          className="text-[9px] font-bold bg-white text-gray-400 px-2 py-1 rounded border border-gray-200 cursor-pointer"
                        >
                          キャンセル
                        </button>
                        <button
                          onClick={() => handleAddSubTeam(deptName)}
                          className="text-[9px] font-bold bg-emerald-600 text-white px-2 py-1 rounded cursor-pointer"
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