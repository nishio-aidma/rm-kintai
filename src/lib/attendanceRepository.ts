import { collection, doc, getDoc, updateDoc, query, where, getDocs, serverTimestamp, writeBatch, addDoc, or, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";

export interface AttendanceRecordInput {
  userId: string;
  userName: string;
  email: string;
  workDate: string;
  startTime: string;
  endTime?: string;
  breakMinutes: number;
}

export interface MemberInfo {
  id: string;
  managementNumber: string;
  lastName: string;
  lastNameKana: string;
  firstName: string;
  firstNameKana: string;
  email: string;
  hourlyRate: number;
  media: string;
  createdAtStr: string;
  name: string;
  department: string;
  loginEmail?: string;
  role?: "user" | "admin";
  isOwnerProxy?: boolean; // 👑 owner代理フラグ
  leadingTeams?: string[]; // 👑 【新設】リーダーを担当するチーム名の配列（所属外アサイン・兼任に対応）
}

export interface AccountRequest {
  email: string;
  lastName: string;
  firstName: string;
  createdAt: any;
}

export const attendanceRepository = {
  // 1. 業務開始データを保存
  saveStartRecord: async (data: AttendanceRecordInput) => {
    try {
      const attendanceCollection = collection(db, "attendance_records");
      const newRecord = {
        userId: data.userId,
        userName: data.userName,
        email: data.email,
        workDate: data.workDate,
        startTime: data.startTime,
        endTime: "",
        breakMinutes: 0,
        workMinutes: 0,
        workHours: 0,
        deleted: false,
        submitted: false,
        verified: false, // 👑 初期値は未確認
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const docRef = await addDoc(attendanceCollection, newRecord);
      return docRef.id;
    } catch (error) {
      throw error;
    }
  },

  // 2. 業務終了時刻の保存
  saveEndRecord: async (stampId: string, endTimeStr: string, breakMinutes: number) => {
    try {
      const recordRef = doc(db, "attendance_records", stampId);
      const recordSnap = await getDoc(recordRef);
      let workMinutes = 0;
      let workHours = 0;
      
      const validBreakMinutes = Math.min(60, breakMinutes);
      
      if (recordSnap.exists()) {
        const data = recordSnap.data();
        const startTimeStr = data.startTime;
        if (startTimeStr && endTimeStr) {
          const [startH, startM] = startTimeStr.split(":").map(Number);
          const [endH, endM] = endTimeStr.split(":").map(Number);
          const startTotalMinutes = startH * 60 + startM;
          let endTotalMinutes = endH * 60 + endM;
          
          // 🎯日マタギ対応：終了時刻が開始時刻以下の場合は翌日とみなし、24時間（1440分）を足す
          if (endTotalMinutes <= startTotalMinutes) {
            endTotalMinutes += 24 * 60;
          }
          
          const totalDiff = endTotalMinutes - startTotalMinutes;
          workMinutes = Math.max(0, totalDiff - validBreakMinutes);
          workHours = Math.round((workMinutes / 60) * 100) / 100;
        }
      }

      await updateDoc(recordRef, {
        endTime: endTimeStr,
        breakMinutes: validBreakMinutes,
        workMinutes: workMinutes,
        workHours: workHours,
        updatedAt: serverTimestamp(),
      });
      return true;
    } catch (error) {
      throw error;
    }
  },

  // 3. 今日の打刻データを取得
  getTodayLatestRecord: async (email: string, todayStr: string) => {
    try {
      const q = query(collection(db, "attendance_records"), where("email", "==", email), where("workDate", "==", todayStr), where("deleted", "==", false));
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) return null;
      
      let latestDoc = querySnapshot.docs[0];
      querySnapshot.docs.forEach((doc) => {
        const currentData = doc.data();
        const latestData = latestDoc.data();
        if (currentData.createdAt && latestData.createdAt) {
          if (currentData.createdAt.toMillis() > latestData.createdAt.toMillis()) latestDoc = doc;
        }
      });
      return { id: latestDoc.id, ...latestDoc.data() } as any;
    } catch (error) {
      return null;
    }
  },

  // 4. 提出ロック
  submitSelectedRecords: async (stampIds: string[]) => {
    try {
      const batch = writeBatch(db);
      stampIds.forEach((id) => {
        const docRef = doc(db, "attendance_records", id);
        batch.update(docRef, { submitted: true, updatedAt: serverTimestamp() });
      });
      await batch.commit();
      return stampIds.length;
    } catch (error) {
      throw error;
    }
  },

  // 5. 削除
  deleteRecord: async (stampId: string) => {
    try {
      const recordRef = doc(db, "attendance_records", stampId);
      await updateDoc(recordRef, { deleted: true, updatedAt: serverTimestamp() });
      return true;
    } catch (error) {
      throw error;
    }
  },

  // 6. 管理者が打刻生データを手動修正
  updateRecordByAdmin: async (stampId: string, updatedFields: { workDate: string; startTime: string; endTime: string; breakMinutes: number }) => {
    try {
      const recordRef = doc(db, "attendance_records", stampId);
      let workMinutes = 0;
      let workHours = 0;
      
      const validBreakMinutes = Math.min(60, updatedFields.breakMinutes);
      
      const [startH, startM] = updatedFields.startTime.split(":").map(Number);
      const [endH, endM] = updatedFields.endTime.split(":").map(Number);
      const startTotalMinutes = startH * 60 + startM;
      let endTotalMinutes = endH * 60 + endM;
      
      // 🎯日マタギ対応：終了時刻が開始時刻以下の場合は翌日とみなし、24時間（1440分）を足す
      if (endTotalMinutes <= startTotalMinutes) {
        endTotalMinutes += 24 * 60;
      }
      
      const totalDiff = endTotalMinutes - startTotalMinutes;
      workMinutes = Math.max(0, totalDiff - validBreakMinutes);
      workHours = Math.round((workMinutes / 60) * 100) / 100;

      await updateDoc(recordRef, { 
        ...updatedFields, 
        breakMinutes: validBreakMinutes,
        workMinutes, 
        workHours, 
        updatedAt: serverTimestamp() 
      });
      return true;
    } catch (error) {
      throw error;
    }
  },

  // 7. 管理者が1から打刻レコードを手動作成
  createRecordByAdmin: async (email: string, userName: string, fields: { workDate: string; startTime: string; endTime: string; breakMinutes: number }) => {
    try {
      const attendanceCollection = collection(db, "attendance_records");
      let workMinutes = 0;
      let workHours = 0;
      
      const validBreakMinutes = Math.min(60, fields.breakMinutes);

      const [startH, startM] = fields.startTime.split(":").map(Number);
      const [endH, endM] = fields.endTime.split(":").map(Number);
      const startTotalMinutes = startH * 60 + startM;
      let endTotalMinutes = endH * 60 + endM;

      // 🎯日マタギ対応：終了時刻が開始時刻以下の場合は翌日とみなし、24時間（1440分）を足す
      if (endTotalMinutes <= startTotalMinutes) {
        endTotalMinutes += 24 * 60;
      }

      const totalDiff = endTotalMinutes - startTotalMinutes;
      workMinutes = Math.max(0, totalDiff - validBreakMinutes);
      workHours = Math.round((workMinutes / 60) * 100) / 100;

      const newRecord = {
        userId: "admin_created",
        userName: userName,
        email: email,
        workDate: fields.workDate,
        startTime: fields.startTime,
        endTime: fields.endTime,
        breakMinutes: validBreakMinutes,
        workMinutes: workMinutes,
        workHours: workHours,
        deleted: false,
        submitted: false,
        verified: false, // 👑 初期値
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await addDoc(attendanceCollection, newRecord);
      return true;
    } catch (error) {
      throw error;
    }
  },

  // 8. 管理者用：全打刻データの取得
  getAllRecordsForAdmin: async () => {
    try {
      const q = query(collection(db, "attendance_records"), where("deleted", "==", false));
      const querySnapshot = await getDocs(q);
      const fetchedRecords: any[] = [];
      querySnapshot.forEach((doc) => { 
        const data = doc.data();
        fetchedRecords.push({ 
          id: doc.id, 
          ...data,
          verified: data.verified || false // 👑 過去のデータも含めて安全にフラグを読み込む
        }); 
      });
      return fetchedRecords;
    } catch (error) {
      throw error;
    }
  },

  // 👑 【新設】「この稼働セクションに間違いがない」という確認ステートを永久保存するための関数
  updateRecordVerification: async (stampId: string, isVerified: boolean) => {
    try {
      const recordRef = doc(db, "attendance_records", stampId);
      await updateDoc(recordRef, {
        verified: isVerified,
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (error) {
      throw error;
    }
  },

  // 9. CSVメンバーマスタ保存
  saveImportedMembers: async (membersList: Omit<MemberInfo, "department" | "loginEmail">[]) => {
    try {
      const batch = writeBatch(db);
      for (const member of membersList) {
        const memberRef = doc(db, "members", member.email);
        const snap = await getDoc(memberRef);
        
        let currentDept = "";
        let currentLoginEmail = "";
        let currentRole = "user";
        let currentOwnerProxy = false;
        let currentLeadingTeams: string[] = []; // 👑 インポート時にリーダー情報を保護
        if (snap.exists()) {
          const d = snap.data();
          currentDept = d.department || "";
          currentLoginEmail = d.loginEmail || "";
          currentRole = d.role || "user";
          currentOwnerProxy = d.isOwnerProxy || false;
          currentLeadingTeams = d.leadingTeams || []; // 👑 退避
        }
        
        batch.set(memberRef, {
          id: member.id,
          managementNumber: member.managementNumber,
          lastName: member.lastName,
          lastNameKana: member.lastNameKana,
          firstName: member.firstName,
          firstNameKana: member.firstNameKana,
          email: member.email,
          hourlyRate: member.hourlyRate,
          media: member.media,
          createdAtStr: member.createdAtStr,
          name: member.name,
          department: currentDept,
          loginEmail: currentLoginEmail,
          role: currentRole,
          isOwnerProxy: currentOwnerProxy,
          leadingTeams: currentLeadingTeams, // 👑 復元
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
      await batch.commit();
      return membersList.length;
    } catch (error) {
      throw error;
    }
  },

  // 10. 全メンバー情報の取得
  getAllMembers: async (): Promise<MemberInfo[]> => {
    try {
      const querySnapshot = await getDocs(collection(db, "members"));
      const members: MemberInfo[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        members.push({
          id: data.id || "",
          managementNumber: data.managementNumber || "---",
          lastName: data.lastName || "",
          lastNameKana: data.lastNameKana || "",
          firstName: data.firstName || "",
          firstNameKana: data.firstNameKana || "",
          email: doc.id,
          hourlyRate: data.hourlyRate || 0,
          media: data.media || "",
          createdAtStr: data.createdAtStr || "",
          name: data.name || "",
          department: data.department || "",
          loginEmail: data.loginEmail || "",
          role: data.role || "user",
          isOwnerProxy: data.isOwnerProxy || false,
          leadingTeams: data.leadingTeams || [], // 👑 安全に配列として取得
        });
      });
      return members;
    } catch (error) {
      return [];
    }
  },

  // 11. メンバーの所属・ログインメール更新
  updateMemberFields: async (email: string, department: string, loginEmail: string) => {
    try {
      const memberRef = doc(db, "members", email);
      await updateDoc(memberRef, {
        department: department,
        loginEmail: loginEmail.trim(),
        updatedAt: serverTimestamp()
      });
      
      if (loginEmail.trim()) {
        const requestRef = doc(db, "account_requests", loginEmail.trim().toLowerCase());
        await deleteDoc(requestRef).catch(() => {});
      }
      return true;
    } catch (error) {
      throw error;
    }
  },

  // 12. 画面からポチッとadmin権限をトグル切り替えするためのリポジトリ関数
  updateMemberRole: async (email: string, newRole: "user" | "admin") => {
    try {
      const memberRef = doc(db, "members", email);
      const updates: any = { role: newRole, updatedAt: serverTimestamp() };
      if (newRole === "user") {
        updates.isOwnerProxy = false;
      }
      await updateDoc(memberRef, updates);
      return true;
    } catch (error) {
      throw error;
    }
  },

  // owner代理権限の☑ボックス切り替え用リポジトリ関数
  updateMemberOwnerProxy: async (email: string, isProxy: boolean) => {
    try {
      const memberRef = doc(db, "members", email);
      await updateDoc(memberRef, {
        isOwnerProxy: isProxy,
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (error) {
      throw error;
    }
  },

  // 👑 組織図からポチポチと担当リーダー（leadingTeams型配列）を更新するためのリポジトリ関数
  updateMemberLeadingTeams: async (email: string, leadingTeams: string[]) => {
    try {
      const memberRef = doc(db, "members", email);
      await updateDoc(memberRef, {
        leadingTeams: leadingTeams,
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (error) {
      throw error;
    }
  },

  // 👑 【新設】子チーム（下部階層）のデータを Firebase（Firestore）に永久保存するためのリポジトリ関数
  saveSubTeams: async (parentDept: string, subTeamsList: any[]) => {
    try {
      const docRef = doc(db, "org_sub_teams", parentDept);
      await setDoc(docRef, {
        subTeams: subTeamsList,
        updatedAt: serverTimestamp()
      }, { merge: true });
      return true;
    } catch (error) {
      throw error;
    }
  },

  // 修正箇所：getSubTeams を以下の形に書き換えてください
  getSubTeams: async (parentDept: string) => {
    try {
      const q = query(
        collection(db, "members"),
        where("department", "==", parentDept)
      );
      const querySnapshot = await getDocs(q);
      
      // ここをメンバーの「オブジェクト」を返す形に戻す（ログイン正常化のため）
      const members = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      return [{
        id: parentDept,
        name: parentDept,
        members: members // ここはメンバーのオブジェクト配列
      }];
    } catch (error) {
      console.error(`【レポジトリ確認】${parentDept} 取得エラー:`, error);
      return [];
    }
  },

  // 13. メールアドレスからメンバー情報を逆引き
  getMemberByEmail: async (loginEmail: string): Promise<MemberInfo | null> => {
    try {
      const q = query(collection(db, "members"), or(where("loginEmail", "==", loginEmail), where("email", "==", loginEmail)));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docData = snap.docs[0].data();
        return {
          id: docData.id || "",
          managementNumber: docData.managementNumber || "---",
          lastName: docData.lastName || "",
          lastNameKana: docData.lastNameKana || "",
          firstName: docData.firstName || "",
          firstNameKana: docData.firstNameKana || "",
          email: snap.docs[0].id,
          hourlyRate: docData.hourlyRate || 0,
          media: docData.media || "",
          createdAtStr: docData.createdAtStr || "",
          name: docData.name || "",
          department: docData.department || "",
          loginEmail: docData.loginEmail || "",
          role: docData.role || "user",
          isOwnerProxy: docData.isOwnerProxy || false,
          leadingTeams: docData.leadingTeams || [], // 👑 安全に配列として逆引き取得
        };
      }
      return null;
    } catch (error) {
      return null;
    }
  },

  // 申請作成
  createAccountRequest: async (email: string, lastName: string, firstName: string) => {
    try {
      const docRef = doc(db, "account_requests", email.trim().toLowerCase());
      await setDoc(docRef, {
        email: email.trim(),
        lastName: lastName.trim(),
        firstName: firstName.trim(),
        createdAt: serverTimestamp()
      });
      return true;
    } catch (error) {
      console.error("申請データの作成に失敗しました:", error);
      throw error;
    }
  },

  // 申請一覧取得
  getAccountRequests: async (): Promise<AccountRequest[]> => {
    try {
      const snap = await getDocs(collection(db, "account_requests"));
      const requests: AccountRequest[] = [];
      snap.forEach((doc) => {
        const d = doc.data();
        requests.push({
          email: d.email || doc.id,
          lastName: d.lastName || "",
          firstName: d.firstName || "",
          createdAt: d.createdAt || null
        });
      });
      return requests;
    } catch (error) {
      return [];
    }
  }
};