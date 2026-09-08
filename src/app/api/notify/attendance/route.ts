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

    // 1. 通知設定の取得
    const settingsRef = doc(db, "settings", "notifications");
    const settingsSnap = await getDoc(settingsRef);

    if (!settingsSnap.exists()) {
      return NextResponse.json({ success: false, message: "設定なし" });
    }

    const settings = settingsSnap.data();
    const realtimeConfig = settings.realtimeAttendanceNotice;
    const token = settings.apiToken || "";

    // 機能がOFF、またはルームIDやトークンがない場合は送信をスキップ
    if (!realtimeConfig || !realtimeConfig.enabled || !realtimeConfig.roomId || !token) {
      return NextResponse.json({ success: true, message: "通知OFFまたは設定不足のためスキップ" });
    }

    const roomId = realtimeConfig.roomId;

    // 2. 日付のフォーマット変換 ("2026-09-08" -> "09/08")
    const dateParts = workDate.split("-");
    const formattedDate = dateParts.length === 3 ? `${dateParts[1]}/${dateParts[2]}` : workDate;

    // 3. 👑 画面で設定されたテンプレート文章を取得し、日付や時間を自動埋め込み
    let template = "";
    if (type === "start") {
      template = realtimeConfig.startMessage || "【業務開始報告】\n■日付：[日付]\n■時間：[打刻時刻]\n■連絡事項：";
    } else if (type === "end") {
      template = realtimeConfig.endMessage || "【業務終了報告】\n■日付：[日付]\n■時間：[打刻時刻]\n■連絡事項：";
    } else {
      return NextResponse.json({ success: false, message: "不正な打刻タイプです" });
    }

    // [日付], [打刻時刻], [氏名] のタグを実際データに変換
    const messageBody = template
      .replace(/\[日付\]/g, formattedDate)
      .replace(/\[打刻時刻\]/g, time)
      .replace(/\[氏名\]/g, userName || "");

    // 4. グループからメンバーを取得し、送信者のメンバーID（発言者）を特定する
    const roomMembers = await getRoomMembers(roomId, token);
    const cleanAppName = (userName || "").replace(/[\s\u3000]/g, "");
    
    // 名前の部分一致で対象者を検索
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