"use client";

interface AdminAttendanceRecord {
  id: string;
  userName: string;
  email: string;
  workDate: string;
  startTime: string;
  endTime: string;
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
  editBreak: number;
  setEditBreak: (v: number) => void;
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
  editBreak,
  setEditBreak,
  setShowEditModal,
  handleSaveEdit,
  getMemberMeta
}: EditModalProps) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 text-xs">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl border border-gray-100 text-left space-y-4">
        <div>
          <h4 className="text-sm font-bold text-gray-800">管理者権限での打刻データ修正</h4>
          <p className="text-[10px] text-gray-400 mt-0.5">{getMemberMeta(editingRecord.email).name} さんの記録を書き換えます</p>
        </div>

        <div className="space-y-3 font-semibold text-gray-500">
          <div className="space-y-1">
            <label className="text-[10px]">勤務日</label>
            <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 font-medium text-xs focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px]">業務開始 (HH:MM)</label>
              <input type="text" value={editStart} onChange={(e) => setEditStart(e.target.value)} placeholder="09:00" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 font-medium text-xs focus:outline-none text-center" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px]">業務終了 (HH:MM)</label>
              <input type="text" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} placeholder="18:00" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 font-medium text-xs focus:outline-none text-center" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px]">休憩時間 (分)</label>
            <input type="number" value={editBreak} onChange={(e) => setEditBreak(Number(e.target.value))} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 font-medium text-xs focus:outline-none text-center" />
          </div>
        </div>

        <div className="flex space-x-2 pt-2">
          <button onClick={() => setShowEditModal(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-2 rounded-lg transition-all">キャンセル</button>
          <button onClick={handleSaveEdit} className="flex-1 bg-emerald-400 hover:bg-emerald-500 text-white font-bold py-2 rounded-lg transition-all shadow-sm">確定して保存・再計算</button>
        </div>
      </div>
    </div>
  );
}