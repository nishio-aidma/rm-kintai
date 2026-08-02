import { collection, doc, getDoc, updateDoc, query, where, getDocs, serverTimestamp, writeBatch, addDoc, or, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";

export interface AttendanceRecordInput {
  userId: string;
  userName: string;
  email: string;
  workDate: string;
  startTime: string; 
  actualStartTime?: string; 
  endTime?: string;
  breakMinutes?: number; 
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
  isOwnerProxy?: boolean; 
  leadingTeams?: string[]; 
}

export interface AccountRequest {
  email: string;
  lastName: string;
  firstName: string;
  createdAt: any;
}

export interface NotificationConfig {
  enabled: boolean;
  time: string;
  message: string;
}

export interface NotificationsSettings {
  unverifiedReminder: NotificationConfig;
  midSubmissionReminder: NotificationConfig; 
  monthEndSubmissionReminder: NotificationConfig; 
  missingEndWorkReminder: NotificationConfig;
  manualReminder?: NotificationConfig;
  teamRoomIds: { [teamName: string]: string };
  apiToken?: string; 
}

const parseTimeToMinutes = (timeStr: string): number => {
  if (!timeStr) return 0;
  const parts = timeStr.split(":").map(Number);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  return h * 60 + m;
};

const checkTimeOverlap = async (
  email: string,
  workDate: string,
  newStartStr: string,
  newEndStr: string,
  excludeStampId?: string
) => {
  const cleanEmail = email.trim().toLowerCase();
  const q = query(
    collection(db, "attendance_records"),
    where("email", "==", cleanEmail),
    where("workDate", "==", workDate),
    where("deleted", "==", false)
  );
  const querySnapshot = await getDocs(q);

  const newStart = parseTimeToMinutes(newStartStr);
  const newEnd = newEndStr ? parseTimeToMinutes(newEndStr) : 1440;

  for (const docSnap of querySnapshot.docs) {
    if (excludeStampId && docSnap.id === excludeStampId) continue;

    const data = docSnap.data();
    const existingStart = parseTimeToMinutes(data.startTime);
    const existingEnd = data.endTime ? parseTimeToMinutes(data.endTime) : 1440;

    if (newStart < existingEnd && newEnd > existingStart) {
      const existingPeriod = data.endTime ? `${data.startTime}〜${data.endTime}` : `${data.startTime}〜(稼働中)`;
      throw new Error(`⚠️ エラー：指定された時間帯は、既存の勤務記録（${existingPeriod}）と重複しています。`);
    }
  }
};

export const attendanceRepository = {
  saveStartRecord: async (data: AttendanceRecordInput) => {
    try {
      const cleanEmail = data.email.trim().toLowerCase();
      await checkTimeOverlap(cleanEmail, data.workDate, data.startTime, "");

      const attendanceCollection = collection(db, "attendance_records");
      const newRecord = {
        userId: data.userId,
        userName: data.userName,
        email: cleanEmail,
        workDate: data.workDate,
        startTime: data.startTime,
        actualStartTime: data.actualStartTime || data.startTime,
        endTime: "",
        actualEndTime: "",
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

  saveEndRecord: async (stampId: string, endTimeStr: string, breakMinutes?: number, actualEndTimeStr?: string) => {
    try {
      const recordRef = doc(db, "attendance_records", stampId);
      const recordSnap = await getDoc(recordRef);
      let workMinutes = 0;
      let workHours = 0;
      
      if (recordSnap.exists()) {
        const data = recordSnap.data();
        const startTimeStr = data.startTime;
        const cleanEmail = (data.email || "").trim().toLowerCase();
        
        if (startTimeStr && endTimeStr) {
          await checkTimeOverlap(cleanEmail, data.workDate, startTimeStr, endTimeStr, stampId);

          const startTotalMinutes = parseTimeToMinutes(startTimeStr);
          let endTotalMinutes = parseTimeToMinutes(endTimeStr);
          
          if (endTotalMinutes <= startTotalMinutes) {
            endTotalMinutes += 24 * 60;
          }
          
          const totalDiff = endTotalMinutes - startTotalMinutes;
          workMinutes = Math.max(0, totalDiff);
          workHours = Math.round((workMinutes / 60) * 100) / 100;
        }
      }

      await updateDoc(recordRef, {
        endTime: endTimeStr,
        actualEndTime: actualEndTimeStr || endTimeStr,
        breakMinutes: 0,
        workMinutes: workMinutes,
        workHours: workHours,
        updatedAt: serverTimestamp(),
      });
      return true;
    } catch (error) {
      throw error;
    }
  },

  getTodayLatestRecord: async (email: string, todayStr: string) => {
    try {
      const cleanEmail = email.trim().toLowerCase();
      const q = query(collection(db, "attendance_records"), where("email", "==", cleanEmail), where("workDate", "==", todayStr), where("deleted", "==", false));
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

  deleteRecord: async (stampId: string) => {
    try {
      const recordRef = doc(db, "attendance_records", stampId);
      await updateDoc(recordRef, { deleted: true, updatedAt: serverTimestamp() });
      return true;
    } catch (error) {
      throw error;
    }
  },

  updateRecordByAdmin: async (stampId: string, updatedFields: { workDate: string; startTime: string; endTime: string; breakMinutes?: number }) => {
    try {
      const recordRef = doc(db, "attendance_records", stampId);
      const recordSnap = await getDoc(recordRef);
      if (!recordSnap.exists()) throw new Error("対象データが見つかりません。");

      const recordData = recordSnap.data();
      const cleanEmail = (recordData.email || "").trim().toLowerCase();

      await checkTimeOverlap(cleanEmail, updatedFields.workDate, updatedFields.startTime, updatedFields.endTime, stampId);

      let workMinutes = 0;
      let workHours = 0;
      
      const startTotalMinutes = parseTimeToMinutes(updatedFields.startTime);
      let endTotalMinutes = parseTimeToMinutes(updatedFields.endTime);
      
      if (endTotalMinutes <= startTotalMinutes) {
        endTotalMinutes += 24 * 60;
      }
      
      const totalDiff = endTotalMinutes - startTotalMinutes;
      workMinutes = Math.max(0, totalDiff);
      workHours = Math.round((workMinutes / 60) * 100) / 100;

      await updateDoc(recordRef, { 
        workDate: updatedFields.workDate,
        startTime: updatedFields.startTime,
        endTime: updatedFields.endTime,
        breakMinutes: 0,
        workMinutes, 
        workHours, 
        updatedAt: serverTimestamp() 
      });
      return true;
    } catch (error) {
      throw error;
    }
  },

  createRecordByAdmin: async (email: string, userName: string, fields: { workDate: string; startTime: string; endTime: string; breakMinutes?: number }) => {
    try {
      const cleanEmail = email.trim().toLowerCase();
      await checkTimeOverlap(cleanEmail, fields.workDate, fields.startTime, fields.endTime);

      const attendanceCollection = collection(db, "attendance_records");
      let workMinutes = 0;
      let workHours = 0;

      const startTotalMinutes = parseTimeToMinutes(fields.startTime);
      let endTotalMinutes = parseTimeToMinutes(fields.endTime);

      if (endTotalMinutes <= startTotalMinutes) {
        endTotalMinutes += 24 * 60;
      }

      const totalDiff = endTotalMinutes - startTotalMinutes;
      workMinutes = Math.max(0, totalDiff);
      workHours = Math.round((workMinutes / 60) * 100) / 100;

      const newRecord = {
        userId: "admin_created",
        userName: userName,
        email: cleanEmail,
        workDate: fields.workDate,
        startTime: fields.startTime,
        actualStartTime: fields.startTime,
        endTime: fields.endTime,
        actualEndTime: fields.endTime,
        breakMinutes: 0,
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
          email: (data.email || "").trim().toLowerCase(),
          verified: data.verified || false
        }); 
      });
      return fetchedRecords;
    } catch (error) {
      throw error;
    }
  },

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

  saveImportedMembers: async (membersList: Omit<MemberInfo, "department" | "loginEmail">[]) => {
    try {
      const batch = writeBatch(db);

      const currentSnapshot = await getDocs(collection(db, "members"));
      const newEmailSet = new Set(membersList.map(m => m.email.trim().toLowerCase()));

      currentSnapshot.forEach((docSnap) => {
        const rawDocId = docSnap.id;
        const cleanDocId = rawDocId.trim().toLowerCase();

        if (rawDocId !== cleanDocId || !newEmailSet.has(cleanDocId)) {
          batch.delete(docSnap.ref);
        }
      });

      for (const member of membersList) {
        const cleanEmail = member.email.trim().toLowerCase();
        const memberRef = doc(db, "members", cleanEmail);
        const snap = await getDoc(memberRef);
        
        let currentDept = "";
        let currentLoginEmail = "";
        let currentRole = "user";
        let currentOwnerProxy = false;
        let currentLeadingTeams: string[] = [];

        if (snap.exists()) {
          const d = snap.data();
          currentDept = d.department !== undefined ? d.department : "";
          currentLoginEmail = d.loginEmail || "";
          currentRole = d.role || "user";
          currentOwnerProxy = d.isOwnerProxy || false;
          currentLeadingTeams = d.leadingTeams || [];
        } else {
          const fixedRef = doc(db, "fixed_members", cleanEmail);
          const fixedSnap = await getDoc(fixedRef);
          if (fixedSnap.exists()) {
            const d = fixedSnap.data();
            currentDept = d.department !== undefined ? d.department : "";
            currentLoginEmail = d.loginEmail || "";
            currentRole = d.role || "user";
            currentOwnerProxy = d.isOwnerProxy || false;
            currentLeadingTeams = d.leadingTeams || [];
          }
        }
        
        batch.set(memberRef, {
          id: member.id,
          managementNumber: member.managementNumber,
          lastName: member.lastName,
          lastNameKana: member.lastNameKana,
          firstName: member.firstName,
          firstNameKana: member.firstNameKana,
          email: cleanEmail,
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

  getAllMembers: async (): Promise<MemberInfo[]> => {
    try {
      const [membersSnapshot, fixedSnapshot] = await Promise.all([
        getDocs(collection(db, "members")),
        getDocs(collection(db, "fixed_members"))
      ]);

      const allMembersMap = new Map<string, MemberInfo>();

      membersSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const rawEmail = docSnap.id;
        const cleanEmail = rawEmail.trim().toLowerCase();

        const memberName = data.name || `${data.lastName || ""} ${data.firstName || ""}`.trim() || cleanEmail.split("@")[0];

        allMembersMap.set(cleanEmail, {
          id: data.id || "",
          managementNumber: data.managementNumber || "---",
          lastName: data.lastName || "",
          lastNameKana: data.lastNameKana || "",
          firstName: data.firstName || "",
          firstNameKana: data.firstNameKana || "",
          email: cleanEmail,
          hourlyRate: data.hourlyRate || 0,
          media: data.media || "",
          createdAtStr: data.createdAtStr || "",
          name: memberName,
          department: data.department !== undefined ? data.department : "",
          loginEmail: data.loginEmail || "",
          role: data.role || "user",
          isOwnerProxy: data.isOwnerProxy || false,
          leadingTeams: data.leadingTeams || [],
        });
      });

      fixedSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const rawEmail = docSnap.id;
        const cleanEmail = rawEmail.trim().toLowerCase();

        const existing = allMembersMap.get(cleanEmail);
        const fixedName = data.name || `${data.lastName || ""} ${data.firstName || ""}`.trim() || existing?.name || cleanEmail.split("@")[0];

        allMembersMap.set(cleanEmail, {
          id: data.id || existing?.id || "",
          managementNumber: data.managementNumber || existing?.managementNumber || "固定枠",
          lastName: data.lastName || existing?.lastName || "",
          lastNameKana: data.lastNameKana || existing?.lastNameKana || "",
          firstName: data.firstName || existing?.firstName || "",
          firstNameKana: data.firstNameKana || existing?.firstNameKana || "",
          email: cleanEmail,
          hourlyRate: data.hourlyRate !== undefined ? data.hourlyRate : (existing?.hourlyRate || 0),
          media: data.media || existing?.media || "オーナー直接登録",
          createdAtStr: data.createdAtStr || existing?.createdAtStr || "",
          name: fixedName,
          department: data.department !== undefined ? data.department : (existing?.department || ""),
          loginEmail: data.loginEmail || existing?.loginEmail || "",
          role: data.role || existing?.role || "user",
          isOwnerProxy: data.isOwnerProxy !== undefined ? data.isOwnerProxy : (existing?.isOwnerProxy || false),
          leadingTeams: data.leadingTeams || existing?.leadingTeams || [],
        });
      });

      return Array.from(allMembersMap.values());
    } catch (error) {
      return [];
    }
  },

  updateMemberFields: async (email: string, department: string, loginEmail: string) => {
    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanDept = (department || "").trim();
      const updates = {
        department: cleanDept,
        loginEmail: loginEmail.trim().toLowerCase(),
        updatedAt: serverTimestamp()
      };

      const fixedRef = doc(db, "fixed_members", cleanEmail);
      const fixedSnap = await getDoc(fixedRef);
      if (fixedSnap.exists()) {
        await updateDoc(fixedRef, updates);
      }

      const memberRef = doc(db, "members", cleanEmail);
      await setDoc(memberRef, updates, { merge: true });

      if (email !== cleanEmail) {
        const oldBigRef = doc(db, "members", email);
        await deleteDoc(oldBigRef).catch(() => {});
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
      await setDoc(memberRef, updates, { merge: true });

      if (email !== cleanEmail) {
        const oldBigRef = doc(db, "members", email);
        await deleteDoc(oldBigRef).catch(() => {});
      }
      return true;
    } catch (error) {
      throw error;
    }
  },

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
      await setDoc(memberRef, updates, { merge: true });

      if (email !== cleanEmail) {
        const oldBigRef = doc(db, "members", email);
        await deleteDoc(oldBigRef).catch(() => {});
      }
      return true;
    } catch (error) {
      throw error;
    }
  },

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
      await setDoc(memberRef, updates, { merge: true });

      if (email !== cleanEmail) {
        const oldBigRef = doc(db, "members", email);
        await deleteDoc(oldBigRef).catch(() => {});
      }
      return true;
    } catch (error) {
      throw error;
    }
  },

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

  // 💡 【根本解決の修正】偽の自作子チーム生成ロジックを完全廃止。本当にFirestoreに保存されたデータのみ取得する
  getSubTeams: async (parentDept: string) => {
    try {
      const docRef = doc(db, "org_sub_teams", parentDept);
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        const data = snap.data();
        return data.subTeams || [];
      }

      // まだ子チームが1つも作られていない場合は素直に空の配列（0件）を返す
      return [];
    } catch (error) {
      console.error(`【レポジトリ確認】${parentDept} 取得エラー:`, error);
      return [];
    }
  },

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
          email: cleanEmail,
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
          email: cleanEmail,
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

  createAccountRequest: async (email: string, lastName: string, firstName: string) => {
    try {
      const cleanEmail = email.trim().toLowerCase();
      const docRef = doc(db, "account_requests", cleanEmail);
      await setDoc(docRef, {
        email: cleanEmail,
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

  getNotificationSettings: async (): Promise<NotificationsSettings> => {
    try {
      const docRef = doc(db, "settings", "notifications");
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return {
          unverifiedReminder: data.unverifiedReminder || {
            enabled: true,
            time: "12:00",
            message: "【ダコックリマインド】前日までの稼働記録で、未確認のデータがあります。内容をご確認の上、確認を完了させてください。\n[自分の記録URL]",
          },
          midSubmissionReminder: data.midSubmissionReminder || {
            enabled: true,
            time: "15:00",
            message: "【ダコックリマインド】本日は月の中間稼働確認日（第3・第4月曜日）です。これまでの稼働記録をご確認の上、提出をお願いします。\n[自分の記録URL]",
          },
          monthEndSubmissionReminder: data.monthEndSubmissionReminder || {
            enabled: true,
            time: "15:00",
            message: "【ダコックリマインド】本日は今月の最終稼働日です。必ずすべての稼働記録を確認し、稼働記録の提出をお願いします。\n[自分の記録URL]",
          },
          missingEndWorkReminder: data.missingEndWorkReminder || {
            enabled: true,
            time: "21:00",
            message: "【ダコックリマインド】本日または過去の稼働記録で、業務終了時間が未登録のデータがあります。正しい終了時間を記録してください。\n[打刻画面URL]",
          },
          manualReminder: data.manualReminder || {
            enabled: true,
            time: "",
            message: "【ダコック個別催促】稼働記録が【未提出】状態です。内容を確認の上、システムより提出ボタンの押下をお願いいたします。\n[自分の記録URL]",
          },
          teamRoomIds: data.teamRoomIds || {},
          apiToken: data.apiToken || "",
        } as NotificationsSettings;
      }

      return {
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
          message: "【ダコック個別催促】稼働記録が【未提出】状態です。内容を確認の上, システムより提出ボタンの押下をお願いいたします。\n[自分の記録URL]",
        },
        teamRoomIds: {},
        apiToken: "",
      };
    } catch (error) {
      throw error;
    }
  },

  saveNotificationSettings: async (settingsData: NotificationsSettings) => {
    try {
      const docRef = doc(db, "settings", "notifications");
      await setDoc(docRef, {
        ...settingsData,
        updatedAt: serverTimestamp()
      }, { merge: true });
      return true;
    } catch (error) {
      throw error;
    }
  },

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