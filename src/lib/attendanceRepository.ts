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
  leadingTeams?: string[]; // 👑 リーダーを担当するチーム名の配列
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
        verified: false,
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
        verified: false,
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
          verified: data.verified || false
        }); 
      });
      return fetchedRecords;
    } catch (error) {
      throw error;
    }
  },

  // 確認ステート更新
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
        let currentLeadingTeams: string[] = [];
        if (snap.exists()) {
          const d = snap.data();
          currentDept = d.department || "";
          currentLoginEmail = d.loginEmail || "";
          currentRole = d.role || "user";
          currentOwnerProxy = d.isOwnerProxy || false;
          currentLeadingTeams = d.leadingTeams || [];
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
          leadingTeams: currentLeadingTeams,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
      await batch.commit();
      return membersList.length;
    } catch (error) {
      throw error;
    }
  },

  // 10. 通常メンバーマスタ ＋ オーナー固定メンバー枠を完全自動合流して配給
  getAllMembers: async (): Promise<MemberInfo[]> => {
    try {
      const [membersSnapshot, fixedSnapshot] = await Promise.all([
        getDocs(collection(db, "members")),
        getDocs(collection(db, "fixed_members"))
      ]);

      const allMembersMap = new Map<string, MemberInfo>();

      membersSnapshot.forEach((doc) => {
        const data = doc.data();
        const email = doc.id;
        allMembersMap.set(email, {
          id: data.id || "",
          managementNumber: data.managementNumber || "---",
          lastName: data.lastName || "",
          lastNameKana: data.lastNameKana || "",
          firstName: data.firstName || "",
          firstNameKana: data.firstNameKana || "",
          email: email,
          hourlyRate: data.hourlyRate || 0,
          media: data.media || "",
          createdAtStr: data.createdAtStr || "",
          name: data.name || "",
          department: data.department || "",
          loginEmail: data.loginEmail || "",
          role: data.role || "user",
          isOwnerProxy: data.isOwnerProxy || false,
          leadingTeams: data.leadingTeams || [],
        });
      });

      fixedSnapshot.forEach((doc) => {
        const data = doc.data();
        const email = doc.id;
        allMembersMap.set(email, {
          id: data.id || "",
          managementNumber: data.managementNumber || "固定枠",
          lastName: data.lastName || "",
          lastNameKana: data.lastNameKana || "",
          firstName: data.firstName || "",
          firstNameKana: data.firstNameKana || "",
          email: email,
          hourlyRate: data.hourlyRate || 0,
          media: data.media || "オーナー直接登録",
          createdAtStr: data.createdAtStr || "",
          name: data.name || "",
          department: data.department || "",
          loginEmail: data.loginEmail || "",
          role: data.role || "user",
          isOwnerProxy: data.isOwnerProxy || false,
          leadingTeams: data.leadingTeams || [],
        });
      });

      return Array.from(allMembersMap.values());
    } catch (error) {
      return [];
    }
  },

  // 👑 11. 【大改造】メンバーの所属・ログインメール更新（二重安全同期仕様）
  updateMemberFields: async (email: string, department: string, loginEmail: string) => {
    try {
      const cleanEmail = email.trim().toLowerCase();
      const updates = {
        department: department,
        loginEmail: loginEmail.trim(),
        updatedAt: serverTimestamp()
      };

      // A. 固定メンバー側にドキュメントが存在するかチェックし、あれば最優先で更新（インポート時の消滅を防ぐ）
      const fixedRef = doc(db, "fixed_members", cleanEmail);
      const fixedSnap = await getDoc(fixedRef);
      if (fixedSnap.exists()) {
        await updateDoc(fixedRef, updates);
      }

      // B. 通常の members コレクション側も確実に同期・作成
      const memberRef = doc(db, "members", cleanEmail);
      const memberSnap = await getDoc(memberRef);
      if (memberSnap.exists()) {
        await updateDoc(memberRef, updates);
      } else if (fixedSnap.exists()) {
        await setDoc(memberRef, { ...fixedSnap.data(), ...updates }, { merge: true });
      }
      
      if (loginEmail.trim()) {
        const requestRef = doc(db, "account_requests", loginEmail.trim().toLowerCase());
        await deleteDoc(requestRef).catch(() => {});
      }
      return true;
    } catch (error) {
      throw error;
    }
  },

  // 👑 12. 【大改造】権限トグル（二重安全同期仕様）
  updateMemberRole: async (email: string, newRole: "user" | "admin") => {
    try {
      const cleanEmail = email.trim().toLowerCase();
      const updates: any = { role: newRole, updatedAt: serverTimestamp() };
      if (newRole === "user") {
        updates.isOwnerProxy = false;
      }

      const fixedRef = doc(db, "fixed_members", cleanEmail);
      const fixedSnap = await getDoc(fixedRef);
      if (fixedSnap.exists()) {
        await updateDoc(fixedRef, updates);
      }

      const memberRef = doc(db, "members", cleanEmail);
      const memberSnap = await getDoc(memberRef);
      if (memberSnap.exists()) {
        await updateDoc(memberRef, updates);
      } else if (fixedSnap.exists()) {
        await setDoc(memberRef, { ...fixedSnap.data(), ...updates }, { merge: true });
      }
      return true;
    } catch (error) {
      throw error;
    }
  },

  // 👑 【大改造】オーナー代理権限切り替え（二重安全同期仕様）
  updateMemberOwnerProxy: async (email: string, isProxy: boolean) => {
    try {
      const cleanEmail = email.trim().toLowerCase();
      const updates = { isOwnerProxy: isProxy, updatedAt: serverTimestamp() };

      const fixedRef = doc(db, "fixed_members", cleanEmail);
      const fixedSnap = await getDoc(fixedRef);
      if (fixedSnap.exists()) {
        await updateDoc(fixedRef, updates);
      }

      const memberRef = doc(db, "members", cleanEmail);
      const memberSnap = await getDoc(memberRef);
      if (memberSnap.exists()) {
        await updateDoc(memberRef, updates);
      } else if (fixedSnap.exists()) {
        await setDoc(memberRef, { ...fixedSnap.data(), ...updates }, { merge: true });
      }
      return true;
    } catch (error) {
      throw error;
    }
  },

  // 👑 【大改造】兼任リーダーアサイン・組織図の登録（二重安全同期仕様）
  updateMemberLeadingTeams: async (email: string, leadingTeams: string[]) => {
    try {
      const cleanEmail = email.trim().toLowerCase();
      const updates = { leadingTeams: leadingTeams, updatedAt: serverTimestamp() };

      const fixedRef = doc(db, "fixed_members", cleanEmail);
      const fixedSnap = await getDoc(fixedRef);
      if (fixedSnap.exists()) {
        await updateDoc(fixedRef, updates);
      }

      const memberRef = doc(db, "members", cleanEmail);
      const memberSnap = await getDoc(memberRef);
      if (memberSnap.exists()) {
        await updateDoc(memberRef, updates);
      } else if (fixedSnap.exists()) {
        await setDoc(memberRef, { ...fixedSnap.data(), ...updates }, { merge: true });
      }
      return true;
    } catch (error) {
      throw error;
    }
  },

  // 子チームデータの保存
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

  // 子チームデータの取得
  getSubTeams: async (parentDept: string) => {
    try {
      const q = query(
        collection(db, "members"),
        where("department", "==", parentDept)
      );
      const querySnapshot = await getDocs(q);
      const members = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      return [{
        id: parentDept,
        name: parentDept,
        members: members
      }];
    } catch (error) {
      console.error(`【レポジトリ確認】${parentDept} 取得エラー:`, error);
      return [];
    }
  },

  // 13. 【仕様大改造】ログイン認証用の逆引き処理でも固定メンバー(fixed_members)を徹底救済
  getMemberByEmail: async (loginEmail: string): Promise<MemberInfo | null> => {
    try {
      const cleanEmail = loginEmail.trim().toLowerCase();

      const q = query(collection(db, "members"), or(where("loginEmail", "==", cleanEmail), where("email", "==", cleanEmail)));
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
          leadingTeams: docData.leadingTeams || [],
        };
      }

      const fixedDocRef = doc(db, "fixed_members", cleanEmail);
      const fixedSnap = await getDoc(fixedDocRef);
      if (fixedSnap.exists()) {
        const docData = fixedSnap.data();
        return {
          id: docData.id || "",
          managementNumber: docData.managementNumber || "固定枠",
          lastName: docData.lastName || "",
          lastNameKana: docData.lastNameKana || "",
          firstName: docData.firstName || "",
          firstNameKana: docData.firstNameKana || "",
          email: fixedSnap.id,
          hourlyRate: docData.hourlyRate || 0,
          media: docData.media || "オーナー直接登録",
          createdAtStr: docData.createdAtStr || "",
          name: docData.name || "",
          department: docData.department || "",
          loginEmail: docData.loginEmail || "",
          role: docData.role || "user",
          isOwnerProxy: docData.isOwnerProxy || false,
          leadingTeams: docData.leadingTeams || [],
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
  },

  // 設定情報のロード
  getDashboardSettings: async () => {
    try {
      const docRef = doc(db, "settings", "dashboard");
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data();
      }
      return { footerMessage: "業務記録の提出をお願いいたします！" };
    } catch (error) {
      return { footerMessage: "業務記録の提出をお願いいたします！" };
    }
  },

  // 設定情報のセーブ
  saveDashboardSettings: async (message: string) => {
    try {
      const docRef = doc(db, "settings", "dashboard");
      await setDoc(docRef, { 
        footerMessage: message,
        updatedAt: serverTimestamp() 
      }, { merge: true });
      return true;
    } catch (error) {
      throw error;
    }
  }
};