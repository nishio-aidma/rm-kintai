"use client";

// 💡 実際の打刻時間をモーダルでも参照できるよう型定義を拡張
interface AdminAttendanceRecord {
  id: string;
  userName: string;
  email: string;
  workDate: string;
  startTime: string;
  actualStartTime?: string; // 👑 実際の開始打刻操作時刻
  endTime: string;
  actualEndTime?: string; // 👑 実際の終了打刻操作時刻
  breakMinutes: number;
  workHours: number;
  submitted: boolean;
}

interface EditModalProps {
  editingRecord: AdminAttendanceRecord;
  editDate: string;
  setEditDate: (v: string) => void;
  editStart: string;
  setEditStart: (v: string) => void;
  editEnd: string;
  setEditEnd: (v: string) => void;
  // 💡 editBreak / setEditBreak の型定義を削除
  setShowEditModal: (v: boolean) => void;
  handleSaveEdit: () => Promise<void>;
  getMemberMeta: (email: string) => { name: string };
}

export default function EditModal({
  editingRecord,
  editDate,
  setEditDate,
  editStart,
  setEditStart,
  editEnd,
  setEditEnd,
  setShowEditModal,
  handleSaveEdit,
  getMemberMeta
}: EditModalProps) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 text-xs font-sans">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl border border-gray-100 text-left space-y-4 animate-fadeIn">
        <div>
          <h4 className="text-sm font-bold text-gray-800">管理者権限での打刻データ修正</h4>
          <p className="text-[10px] text-gray-400 mt-0.5">{getMemberMeta(editingRecord.email).name} さんの記録を書き換えます</p>
        </div>

        <div className="space-y-3 font-semibold text-gray-500">
          <div className="space-y-1">
            <label className="text-[10px] text-gray-400 font-bold">勤務日</label>
            <input 
              type="date" 
              value={editDate} 
              onChange={(e) => setEditDate(e.target.value)} 
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 font-medium text-xs focus:outline-none cursor-pointer" 
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            {/* 業務開始入力欄 ＋ 実際の操作時間の参考表示 */}
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 font-bold">業務開始 (HH:MM)</label>
              <input 
                type="text" 
                value={editStart} 
                onChange={(e) => setEditStart(e.target.value)} 
                placeholder="09:00" 
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 font-medium text-xs focus:outline-none text-center font-mono" 
              />
              {editingRecord.actualStartTime && (
                <p className="text-[9px] text-gray-400 font-normal text-center pt-0.5 whitespace-nowrap">
                  実打刻: {editingRecord.actualStartTime}
                </p>
              )}
            </div>

            {/* 業務終了入力欄 ＋ 実際の操作時間の参考表示 */}
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 font-bold">業務終了 (HH:MM)</label>
              <input 
                type="text" 
                value={editEnd} 
                onChange={(e) => setEditEnd(e.target.value)} 
                placeholder="18:00" 
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 font-medium text-xs focus:outline-none text-center font-mono" 
              />
              {editingRecord.actualEndTime && (
                <p className="text-[9px] text-gray-400 font-normal text-center pt-0.5 whitespace-nowrap">
                  実打刻: {editingRecord.actualEndTime}
                </p>
              )}
            </div>
          </div>

          {/* 💡 休憩時間(分)の入力フィールドを完全削除しました */}
        </div>

        <div className="flex space-x-2 pt-2">
          <button 
            onClick={() => setShowEditModal(false)} 
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-2 rounded-lg transition-all cursor-pointer"
          >
            キャンセル
          </button>
          <button 
            onClick={handleSaveEdit} 
            className="flex-1 bg-[#34C759] hover:bg-[#2FB350] text-white font-bold py-2 rounded-lg transition-all shadow-sm cursor-pointer"
          >
            確定して保存・再計算
          </button>
        </div>
      </div>
    </div>
  );
}