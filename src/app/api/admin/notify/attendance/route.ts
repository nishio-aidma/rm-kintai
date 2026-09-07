import { NextResponse } from "next/server";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// MEMBERS APIのレスポンス用型定義
interface MembersApiUser {
  id?: string | number;
  account_id?: string | number;
  name: string;
}

// 💡 MEMBERS APIにメッセージを送信する関数（送信者を指定する機能付き）
async function sendMembersMessage(
  roomId: string,
  token: string,
  body: string,
  senderAccountId: string | null
) {
  const postUrl = `https://api.mem-bers.jp/web-api/rooms/${roomId}/messages`;
  
  // 改行をそのまま送信する
  const payload: Record<string, string> = {
    body: body,
  };

  // 💡 送信元（発言者）を各メンバーにするため、特定したメンバーIDをパラメータに追加
  if (senderAccountId) {
    payload.account_id = senderAccountId;
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

// 💡 MEMBERSのルームからメンバー一覧を取得し、名前と内部IDのマップを作成する関数
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
      const members: MembersApiUser[] = Array.isArray(json) ? json : (json.member || []);
      
      members.forEach((m) => {
        const cleanName = (m.name || "").replace(/[\s\u3000]/g, "");
        const accountId = m.account_id || m.id;
        
        if (cleanName && accountId) {
          memberMap[cleanName] = String(accountId);
        }
      });
    }
  } catch (error) {
    console.error(`[MEMBERSメンバー取得エラー] Room:${roomId}`, error);
  }

  return memberMap;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, userName, workDate, time } = body;
    // type: "start" または "end"
    // userName: "山田 太郎"
    // workDate: "2026-09-07"
    // time: "09:30"

    // 1. 通知設定の取得
    const settingsRef = doc(db, "settings", "notifications");
    const settingsSnap = await getDoc(settingsRef);

    if (!settingsSnap.exists()) {
      return NextResponse.json({ success: false, message: "設定なし" });
    }

    const settings = settingsSnap.data();
    const realtimeConfig = settings.realtimeAttendanceNotice;
    const token = settings.apiToken || "";

    // 機能がOFF、またはルームIDやトークンがない場合は何もせずに終了
    if (!realtimeConfig || !realtimeConfig.enabled || !realtimeConfig.roomId || !token) {
      return NextResponse.json({ success: true, message: "通知OFFまたは設定不足のためスキップ" });
    }

    const roomId = realtimeConfig.roomId;

    // 2. 日付のフォーマット変換 ("2026-09-07" -> "09/07")
    const dateParts = workDate.split("-");
    const formattedDate = dateParts.length === 3 ? `${dateParts[1]}/${dateParts[2]}` : workDate;

    // 3. テンプレートに従ってメッセージを作成
    let messageBody = "";
    if (type === "start") {
      messageBody = `【業務開始報告】\n■日付：${formattedDate}\n■時間：${time}\n■連絡事項：`;
    } else if (type === "end") {
      messageBody = `【業務終了報告】\n■日付：${formattedDate}\n■時間：${time}\n■連絡事項：`;
    } else {
      return NextResponse.json({ success: false, message: "不正な打刻タイプです" });
    }

    // 4. グループからメンバーを取得し、送信者のメンバーIDを特定する
    const roomMembers = await getRoomMembers(roomId, token);
    const cleanAppName = (userName || "").replace(/[\s\u3000]/g, "");
    
    // 名前の部分一致で探す
    const matchedKey = Object.keys(roomMembers).find(memName => 
      memName.includes(cleanAppName) || cleanAppName.includes(memName)
    );
    
    const senderAccountId = matchedKey ? roomMembers[matchedKey] : null;

    // 5. メッセージ送信
    const sent = await sendMembersMessage(roomId, token, messageBody, senderAccountId);

    if (!sent) {
      return NextResponse.json({ success: false, message: "MEMBERSへの送信に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "通知を送信しました" });

  } catch (error: any) {
    console.error("リアルタイム打刻通知エラー:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}