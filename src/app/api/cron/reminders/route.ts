import { NextResponse } from "next/server";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

// MEMBERS APIのレスポンス用型定義
interface MembersApiUser {
  id: string | number;
  name: string;
}

// 💡 MEMBERS APIにメッセージを送信する共通関数
async function sendMembersMessage(
  roomId: string,
  token: string,
  body: string,
  toIds: string[]
) {
  const postUrl = `https://api.mem-bers.jp/web-api/rooms/${roomId}/messages`;
  const formattedBody = body.replace(/\r\n|\r|\n/g, "<br>");

  const payload: Record<string, string> = {
    body: formattedBody,
  };

  if (toIds.length > 0) {
    payload.to_id = toIds.join(",");
  }

  const res = await fetch(postUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(payload).toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[MEMBERS送信エラー] Room:${roomId}`, errorText);
    return false;
  }
  return true;
}

// 💡 MEMBERSのルームからメンバー一覧を取得する関数（名前のスペースを徹底除去）
async function getRoomMembers(roomId: string, token: string): Promise<Record<string, string>> {
  const getUrl = `https://api.mem-bers.jp/web-api/rooms/${roomId}/members`;
  const memberMap: Record<string, string> = {};

  try {
    const res = await fetch(getUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    if (res.ok) {
      const json = await res.json();
      const members: MembersApiUser[] = json.member || [];
      members.forEach((m) => {
        const cleanName = (m.name || "").replace(/[\s\u3000]/g, "");
        if (cleanName) {
          memberMap[cleanName] = String(m.id);
        }
      });
    }
  } catch (error) {
    console.error(`[MEMBERSメンバー取得エラー] Room:${roomId}`, error);
  }

  return memberMap;
}

export async function GET(request: Request) {
  try {
    const { searchParams, origin } = new URL(request.url);
    const notificationType = searchParams.get("type"); // "unverified" | "mid_submission" | "monthend_submission" | "missing_end" | null

    // 1. データベースから通知設定を取得
    const settingsRef = doc(db, "settings", "notifications");
    const settingsSnap = await getDoc(settingsRef);

    if (!settingsSnap.exists()) {
      return NextResponse.json({ success: false, message: "通知設定が見つかりません。" }, { status: 400 });
    }

    const settings = settingsSnap.data();
    const token = settings.apiToken || "";
    const teamRoomIds: Record<string, string> = settings.teamRoomIds || {};

    if (!token) {
      return NextResponse.json({ success: false, message: "MEMBERS APIトークンが設定されていません。" }, { status: 400 });
    }

    // 2. 通常枠（members）と固定保護枠（fixed_members）の両方からメンバー情報を一括取得
    const [membersSnap, fixedSnap] = await Promise.all([
      getDocs(collection(db, "members")),
      getDocs(collection(db, "fixed_members"))
    ]);

    const memberLookupMap: Record<string, { name: string; department: string; managementNumber: string }> = {};

    const registerMemberToMap = (docSnap: any) => {
      const data = docSnap.data();
      const cleanEmail = (data.email || docSnap.id || "").trim().toLowerCase();
      const cleanLoginEmail = (data.loginEmail || "").trim().toLowerCase();
      
      const rawName = data.name || `${data.lastName || ""} ${data.firstName || ""}`.trim() || cleanEmail.split("@")[0];
      const memberDept = (data.department || "").trim();
      const managementNumber = data.managementNumber || "";

      const memberObj = {
        name: rawName,
        department: memberDept,
        managementNumber: managementNumber
      };

      if (cleanEmail) {
        memberLookupMap[cleanEmail] = memberObj;
      }
      if (cleanLoginEmail) {
        memberLookupMap[cleanLoginEmail] = memberObj;
      }
    };

    membersSnap.forEach(registerMemberToMap);
    fixedSnap.forEach(registerMemberToMap);

    // 3. 打刻記録を取得
    const recordsSnap = await getDocs(query(collection(db, "attendance_records"), where("deleted", "==", false)));
    const allRecords: any[] = [];
    recordsSnap.forEach((d) => {
      allRecords.push({ id: d.id, ...d.data() });
    });

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    
    // 👑 修正: 当月（今月1日）の日付文字列を作成（例: "2026-08-01"）
    const firstDayOfCurrentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const recordsUrl = `${origin}/records`;
    const stampUrl = `${origin}/?action=fix_missing_end`;

    const results: string[] = [];

    // ----------------------------------------------------
    // ① 未確認記録の催促通知 (unverified)
    // ----------------------------------------------------
    if (!notificationType || notificationType === "unverified") {
      const config = settings.unverifiedReminder;
      if (config && config.enabled) {
        const targetEmails = new Set<string>();
        allRecords.forEach((r) => {
          const cleanEmail = (r.email || "").trim().toLowerCase();
          // 👑 修正: 「当月1日以降」かつ「今日より過去」かつ「未確認」の記録のみを抽出
          if (r.workDate >= firstDayOfCurrentMonthStr && r.workDate < todayStr && !r.verified && r.endTime !== "") {
            targetEmails.add(cleanEmail);
          }
        });

        const deptTargetsMap: Record<string, string[]> = {};
        targetEmails.forEach((email) => {
          const m = memberLookupMap[email];
          if (m && m.department) {
            if (!deptTargetsMap[m.department]) deptTargetsMap[m.department] = [];
            if (!deptTargetsMap[m.department].includes(m.name)) {
              deptTargetsMap[m.department].push(m.name);
            }
          }
        });

        for (const [dept, memberNames] of Object.entries(deptTargetsMap)) {
          const roomId = teamRoomIds[dept];
          if (roomId) {
            const roomMembers = await getRoomMembers(roomId, token);
            const toIds: string[] = [];

            memberNames.forEach((name) => {
              const cleanAppName = name.replace(/[\s\u3000]/g, "");
              const matchedKey = Object.keys(roomMembers).find(memName => 
                memName === cleanAppName || memName.includes(cleanAppName) || cleanAppName.includes(memName)
              );
              
              if (matchedKey) {
                toIds.push(roomMembers[matchedKey]);
              }
            });

            let msg = config.message || "";
            msg = msg.replace(/\[自分の記録URL\]/g, recordsUrl);
            msg = msg.replace(/\[打刻画面URL\]/g, stampUrl);

            const sent = await sendMembersMessage(roomId, token, msg, toIds);
            if (sent) results.push(`[未確認催促] ${dept} チームへ送信完了 (${toIds.length}名メンション)`);
          }
        }
      }
    }

    // ----------------------------------------------------
    // ②-A 中間稼働記録の提出催促通知 (mid_submission)
    // ----------------------------------------------------
    if (!notificationType || notificationType === "mid_submission") {
      const config = settings.midSubmissionReminder;
      if (config && config.enabled) {
        for (const [dept, roomId] of Object.entries(teamRoomIds)) {
          if (roomId) {
            let msg = config.message || "";
            msg = msg.replace(/\[自分の記録URL\]/g, recordsUrl);
            msg = msg.replace(/\[打刻画面URL\]/g, stampUrl);

            const sent = await sendMembersMessage(roomId, token, msg, []);
            if (sent) results.push(`[中間提出催促] ${dept} チームへ一括送信完了`);
          }
        }
      }
    }

    // ----------------------------------------------------
    // ②-B 月末稼働記録の提出催促通知 (monthend_submission)
    // ----------------------------------------------------
    if (!notificationType || notificationType === "monthend_submission") {
      const config = settings.monthEndSubmissionReminder;
      if (config && config.enabled) {
        for (const [dept, roomId] of Object.entries(teamRoomIds)) {
          if (roomId) {
            let msg = config.message || "";
            msg = msg.replace(/\[自分の記録URL\]/g, recordsUrl);
            msg = msg.replace(/\[打刻画面URL\]/g, stampUrl);

            const sent = await sendMembersMessage(roomId, token, msg, []);
            if (sent) results.push(`[月末提出催促] ${dept} チームへ一括送信完了`);
          }
        }
      }
    }

    // ----------------------------------------------------
    // ③ 業務終了打刻忘れ催促通知 (missing_end)
    // ----------------------------------------------------
    if (!notificationType || notificationType === "missing_end") {
      const config = settings.missingEndWorkReminder;
      if (config && config.enabled) {
        const targetEmails = new Set<string>();
        allRecords.forEach((r) => {
          const cleanEmail = (r.email || "").trim().toLowerCase();
          // 👑 修正: 「当月1日以降」の記録で業務終了が未登録のものを抽出
          if (r.workDate >= firstDayOfCurrentMonthStr && r.endTime === "") {
            targetEmails.add(cleanEmail);
          }
        });

        const deptTargetsMap: Record<string, string[]> = {};
        targetEmails.forEach((email) => {
          const m = memberLookupMap[email];
          if (m && m.department) {
            if (!deptTargetsMap[m.department]) deptTargetsMap[m.department] = [];
            if (!deptTargetsMap[m.department].includes(m.name)) {
              deptTargetsMap[m.department].push(m.name);
            }
          }
        });

        for (const [dept, memberNames] of Object.entries(deptTargetsMap)) {
          const roomId = teamRoomIds[dept];
          if (roomId) {
            const roomMembers = await getRoomMembers(roomId, token);
            const toIds: string[] = [];

            memberNames.forEach((name) => {
              const cleanAppName = name.replace(/[\s\u3000]/g, "");
              const matchedKey = Object.keys(roomMembers).find(memName => 
                memName === cleanAppName || memName.includes(cleanAppName) || cleanAppName.includes(memName)
              );
              
              if (matchedKey) {
                toIds.push(roomMembers[matchedKey]);
              }
            });

            let msg = config.message || "";
            msg = msg.replace(/\[自分の記録URL\]/g, recordsUrl);
            msg = msg.replace(/\[打刻画面URL\]/g, stampUrl);

            const sent = await sendMembersMessage(roomId, token, msg, toIds);
            if (sent) results.push(`[打刻忘れ催促] ${dept} チームへ送信完了 (${toIds.length}名メンション)`);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      processedTime: now.toISOString(),
      results: results.length > 0 ? results : ["対象の通知処理はありませんでした。"],
    });
  } catch (error: any) {
    console.error("通知API処理失敗:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}