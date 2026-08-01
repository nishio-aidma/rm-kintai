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
  // 改行コードをHTML用の<br>タグに変換
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

// 💡 MEMBERSのルームからメンバー一覧を取得する関数
async function getRoomMembers(roomId: string, token: string): Promise<Record<string, string>> {
  const getUrl = `https://api.mem-bers.jp/web-api/rooms/${roomId}/members`;
  const memberMap: Record<string, string> = {}; // { "スペースなし名前": "MEMBERS内部ID" }

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
    const notificationType = searchParams.get("type"); // "unverified" | "submission" | "missing_end" | null (全実行)

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

    // 2. 登録されているメンバーマスタと打刻記録を取得
    const membersSnap = await getDocs(collection(db, "members"));
    const allMembers: Record<string, { name: string; department: string; email: string }> = {};
    membersSnap.forEach((d) => {
      const data = d.data();
      allMembers[data.email] = {
        name: data.name || "",
        department: data.department || "",
        email: data.email,
      };
    });

    const recordsSnap = await getDocs(query(collection(db, "attendance_records"), where("deleted", "==", false)));
    const allRecords: any[] = [];
    recordsSnap.forEach((d) => {
      allRecords.push({ id: d.id, ...d.data() });
    });

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    // URLの置き換え用タグ定義
    const recordsUrl = `${origin}/records`;
    const stampUrl = `${origin}/?action=end`;

    const results: string[] = [];

    // ----------------------------------------------------
    // ① 未確認記録の催促通知 (unverified)
    // ----------------------------------------------------
    if (!notificationType || notificationType === "unverified") {
      const config = settings.unverifiedReminder;
      if (config && config.enabled) {
        // 過去日（今日より前）で、未確認（verified: false）のデータがあるメールアドレスを抽出
        const targetEmails = new Set<string>();
        allRecords.forEach((r) => {
          if (r.workDate < todayStr && !r.verified && r.endTime !== "") {
            targetEmails.add(r.email);
          }
        });

        // チームごとに集計して通知送信
        const deptTargetsMap: Record<string, string[]> = {};
        targetEmails.forEach((email) => {
          const m = allMembers[email];
          if (m && m.department) {
            if (!deptTargetsMap[m.department]) deptTargetsMap[m.department] = [];
            deptTargetsMap[m.department].push(m.name);
          }
        });

        for (const [dept, memberNames] of Object.entries(deptTargetsMap)) {
          const roomId = teamRoomIds[dept];
          if (roomId) {
            const roomMembers = await getRoomMembers(roomId, token);
            const toIds: string[] = [];

            memberNames.forEach((name) => {
              const cleanName = name.replace(/[\s\u3000]/g, "");
              if (roomMembers[cleanName]) {
                toIds.push(roomMembers[cleanName]);
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
    // ② 稼働記録の提出催促通知 (submission)
    // ----------------------------------------------------
    if (!notificationType || notificationType === "submission") {
      const config = settings.submissionReminder;
      if (config && config.enabled) {
        // 各チームのグループチャット全体へ一括送信
        for (const [dept, roomId] of Object.entries(teamRoomIds)) {
          if (roomId) {
            let msg = config.message || "";
            msg = msg.replace(/\[自分の記録URL\]/g, recordsUrl);
            msg = msg.replace(/\[打刻画面URL\]/g, stampUrl);

            const sent = await sendMembersMessage(roomId, token, msg, []);
            if (sent) results.push(`[提出催促] ${dept} チームへ一括送信完了`);
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
        // 終了時間（endTime）が空文字のまま放置されているデータがあるメールアドレスを抽出
        const targetEmails = new Set<string>();
        allRecords.forEach((r) => {
          if (r.endTime === "") {
            targetEmails.add(r.email);
          }
        });

        const deptTargetsMap: Record<string, string[]> = {};
        targetEmails.forEach((email) => {
          const m = allMembers[email];
          if (m && m.department) {
            if (!deptTargetsMap[m.department]) deptTargetsMap[m.department] = [];
            deptTargetsMap[m.department].push(m.name);
          }
        });

        for (const [dept, memberNames] of Object.entries(deptTargetsMap)) {
          const roomId = teamRoomIds[dept];
          if (roomId) {
            const roomMembers = await getRoomMembers(roomId, token);
            const toIds: string[] = [];

            memberNames.forEach((name) => {
              const cleanName = name.replace(/[\s\u3000]/g, "");
              if (roomMembers[cleanName]) {
                toIds.push(roomMembers[cleanName]);
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