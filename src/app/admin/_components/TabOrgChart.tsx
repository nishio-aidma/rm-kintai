"use client";

import { useState, useEffect } from "react";
import { MemberInfo, attendanceRepository } from "@/lib/attendanceRepository";
// @ts-ignore
import pptxgen from "pptxgenjs";

interface TabOrgChartProps {
  members: MemberInfo[];
  uniqueDepartments: string[];
}

export default function TabOrgChart({ members, uniqueDepartments }: TabOrgChartProps) {
  const [localMembers, setLocalMembers] = useState<MemberInfo[]>(members);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setLocalMembers(members);
  }, [members]);

  const getLeadersForDepartment = (deptName: string) => {
    return localMembers.filter(m => m.leadingTeams?.includes(deptName));
  };

  const getMembersForDepartment = (deptName: string) => {
    return localMembers.filter(m => m.department === deptName);
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
    } catch (error) {
      alert("リーダーのアサインに失敗しました。");
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
    } catch (error) {
      alert("リーダーの解除に失敗しました。");
    }
  };

  const handleExportPPTX = async () => {
    setIsExporting(true);
    try {
      const pptx = new pptxgen();
      // @ts-ignore
      pptx.layout = "LAYOUT_16x9";

      // --- 各スライド共通のヘッダー描画関数 ---
      const addCommonHeader = (slide: any) => {
        // 緊急連絡先
        slide.addText("緊急連絡先：西尾（070-3169-9955）/ 伊藤（070-5553-4180）", {
          x: 0.5, y: 0.15, w: 12.3, h: 0.3,
          fontSize: 12, color: "FF4B4B", bold: true, fontFace: "Meiryo", align: "left"
        });
        // 誘導メッセージ
        slide.addText("※ 各チームリーダーに連絡ができない状態の場合は、社員まで、SMSをください", {
          x: 0.5, y: 0.4, w: 12.3, h: 0.3,
          fontSize: 10, color: "64748B", fontFace: "Meiryo", align: "left"
        });
      };

      // --- スライド1: 表紙 ---
      const slide1 = pptx.addSlide();
      slide1.background = { color: "005088" };
      slide1.addText("RM 組織図", {
        x: 1.0, y: 2.2, w: 11.3, h: 1.5,
        fontSize: 54, color: "FFFFFF", bold: true, fontFace: "Meiryo", align: "center"
      });
      const today = new Date();
      const dateStr = `${today.getFullYear()}年${String(today.getMonth() + 1).padStart(2, "0")}月${String(today.getDate()).padStart(2, "0")}日 改訂`;
      slide1.addText(dateStr, {
        x: 1.0, y: 3.8, w: 11.3, h: 0.5,
        fontSize: 18, color: "11CAA0", fontFace: "Meiryo", align: "center"
      });

      // --- 各チームのスライド生成 ---
      uniqueDepartments.forEach(deptName => {
        const slide = pptx.addSlide();
        
        // 共通ヘッダー追加
        addCommonHeader(slide);

        // チーム名
        slide.addText(`🏢 チーム組織図 : ${deptName}`, {
          x: 0.5, y: 0.8, w: 12.0, h: 0.7,
          fontSize: 26, color: "005088", bold: true, fontFace: "Meiryo"
        });
        // 区切り線
        slide.addShape("rect" as any, { x: 0.5, y: 1.5, w: 12.3, h: 0.04, fill: { color: "11CAA0" } });

        const leaders = getLeadersForDepartment(deptName);
        const deptMembers = getMembersForDepartment(deptName);

        // 左カラム: リーダーエリア
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
              x: 0.8, y: 2.4 + offset, w: 5.0, h: 0.3,
              fontSize: 16, color: "111827", bold: true, fontFace: "Meiryo"
            });
            slide.addText(`Mail: ${leader.email}`, {
              x: 0.8, y: 2.7 + offset, w: 5.0, h: 0.25,
              fontSize: 10, color: "64748B", fontFace: "Consolas"
            });
          });
        } else {
          slide.addText("（※リーダー未設定）", {
            x: 0.5, y: 2.3, w: 5.5, h: 0.4,
            fontSize: 13, color: "94A3B8", fontFace: "Meiryo", italic: true
          });
        }

        // 右カラム: メンバー一覧
        slide.addText("👥 チーム所属メンバー一覧", {
          x: 6.5, y: 1.8, w: 6.0, h: 0.4,
          fontSize: 15, color: "005088", bold: true, fontFace: "Meiryo"
        });

        if (deptMembers.length > 0) {
          const tableRows = deptMembers.map(m => [
            { text: m.name, options: { bold: true, fontFace: "Meiryo", fontSize: 10 } },
            { text: m.email, options: { fontFace: "Consolas", fontSize: 9, color: "475569" } }
          ]);

          slide.addTable(tableRows, {
            x: 6.5, y: 2.3, w: 6.3,
            colW: [1.8, 4.5],
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
    } catch (e) {
      console.error(e);
      alert("組織図の生成中にエラーが発生しました。");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center justify-between">
        <div>
          <h2 className="text-base font-extrabold text-gray-800 tracking-tight">🗺️ 組織図 ＆ チーム責任者マスタ管理</h2>
          <p className="text-gray-400 text-xs mt-0.5">
            各チームの組織構成を確認し、リーダーの選定を行えます。完成した組織図はスライドとして書き出せます。
          </p>
        </div>
        <button
          onClick={handleExportPPTX}
          disabled={isExporting}
          className={`font-black text-xs px-5 py-3 rounded-xl shadow-sm transition-all flex items-center space-x-2 ${
            isExporting
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-purple-600 hover:bg-purple-700 text-white shadow-purple-100 hover:scale-[1.02]"
          }`}
        >
          <span>{isExporting ? "⏳ 組織図を生成中..." : "📥 組織図スライド(PPTX)を出力する"}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {uniqueDepartments.map(deptName => {
          const leaders = getLeadersForDepartment(deptName);
          const deptMembers = getMembersForDepartment(deptName);

          return (
            <div key={deptName} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col justify-between">
              <div className="bg-gray-50/70 border-b border-gray-100 px-4 py-3 flex items-center justify-between">
                <span className="font-extrabold text-gray-800 text-sm tracking-tight">🏢 {deptName}</span>
                <span className="bg-gray-200/60 text-gray-500 font-mono text-[10px] px-2 py-0.5 rounded-md font-bold">
                  所属 {deptMembers.length} 名
                </span>
              </div>

              <div className="p-4 space-y-4 flex-grow">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gray-400 block">▼ チームリーダー（責任者）</label>
                  
                  {leaders.length > 0 ? (
                    <div className="space-y-1.5">
                      {leaders.map(leader => (
                        <div key={leader.email} className="bg-amber-50 text-amber-900 border border-amber-200 rounded-xl p-2.5 flex items-center justify-between shadow-sm animate-fadeIn">
                          <div className="flex items-center space-x-2">
                            <span className="text-base">👑</span>
                            <div>
                              <p className="font-black text-xs">{leader.name}</p>
                              <p className="text-[10px] text-amber-600/80 font-mono">{leader.email}</p>
                            </div>
                            {leader.department !== deptName && (
                              <span className="text-[9px] bg-rose-100 text-rose-700 font-bold px-1.5 py-0.5 rounded-md">所属外アサイン</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveLeader(deptName, leader.email)}
                            className="text-[10px] font-bold bg-white hover:bg-rose-50 text-rose-500 hover:text-rose-600 border border-amber-200 hover:border-rose-200 px-2 py-1 rounded-lg shadow-sm transition-all"
                          >
                            ✕ 解除
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-gray-50/50 border border-dashed border-gray-200 rounded-xl p-3 space-y-2 text-center">
                      <p className="text-gray-300 italic text-[11px] font-normal">リーダーがアサインされていません</p>
                      
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <select
                            onChange={(e) => {
                              handleAssignLeader(deptName, e.target.value);
                              e.target.value = ""; 
                            }}
                            defaultValue=""
                            className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-[11px] font-bold text-gray-600 cursor-pointer focus:outline-none focus:border-purple-500 shadow-sm"
                          >
                            <option value="" disabled>👥 所属内から指名</option>
                            {deptMembers.map(m => (
                              <option key={m.email} value={m.email}>{m.name}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <select
                            onChange={(e) => {
                              handleAssignLeader(deptName, e.target.value);
                              e.target.value = "";
                            }}
                            defaultValue=""
                            className="w-full bg-white border border-purple-200 rounded-lg px-2 py-1.5 text-[11px] font-bold text-purple-600 cursor-pointer focus:outline-none focus:border-purple-500 shadow-sm"
                          >
                            <option value="" disabled>🔍 所属外（全社員）から指名</option>
                            {localMembers.map(m => (
                              <option key={m.email} value={m.email}>{m.name} ({m.department || "未設定"})</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-400 block">▼ 所属メンバー一覧</label>
                  <div className="max-h-40 overflow-y-auto border border-gray-50 rounded-xl divide-y divide-gray-50 bg-gray-50/20">
                    {deptMembers.map(m => (
                      <div key={m.email} className="px-3 py-2 flex items-center justify-between hover:bg-white/80 transition-colors">
                        <span className="font-bold text-gray-700 text-xs">{m.name}</span>
                        <span className="text-[10px] text-gray-400 font-mono select-all">{m.email}</span>
                      </div>
                    ))}
                    {deptMembers.length === 0 && (
                      <p className="text-gray-300 italic text-[11px] py-4 text-center">このチームに所属しているメンバーはいません。</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}