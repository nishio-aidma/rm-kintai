import { NextResponse } from "next/server";
import { doc, getDoc } from "firebase/firestore";
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

export async function POST(request: Request) {
  try {
    const { origin } = new URL(request.url);
    const body = await request.json();
    const { targets, message: customMessage } = body;

    // 1. データベースから通知設定（APIトークン、チーム別ルームID、手動個別催促テンプレート）を取得
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

    // 2. 送信本文の確定
    const defaultTemplate = settings.manualReminder?.message || "【ダコック個別催促】稼働記録が【未提出】状態です。内容を確認の上、システムより提出ボタンの押下をお願いいたします。\n[自分の記録URL]";
    let baseMessage = customMessage || defaultTemplate;

    // URLタグの置換処理
    const recordsUrl = `${origin}/records`;
    const stampUrl = `${origin}/?action=fix_missing_end`;
    baseMessage = baseMessage.replace(/\[自分の記録URL\]/g, recordsUrl);
    baseMessage = baseMessage.replace(/\[打刻画面URL\]/g, stampUrl);

    const results: string[] = [];

    // 3. 送信対象メンバーが存在する場合：チームごとにまとめてメンション付き送信
    if (targets && Array.isArray(targets) && targets.length > 0) {
      const deptTargetsMap: Record<string, string[]> = {};
      targets.forEach((t: { name: string; department?: string; dept?: string }) => {
        const dept = t.department || t.dept || "未設定";
        if (!deptTargetsMap[dept]) deptTargetsMap[dept] = [];
        deptTargetsMap[dept].push(t.name);
      });

      for (const [dept, memberNames] of Object.entries(deptTargetsMap)) {
        const roomId = teamRoomIds[dept];
        if (!roomId) {
          results.push(`⚠️ ${dept} チームのルームIDが未設定のため送信をスキップしました。`);
          continue;
        }

        // チャットルームのメンバー一覧を取得
        const roomMembers = await getRoomMembers(roomId, token);
        const toIds: string[] = [];

        memberNames.forEach((name) => {
          // アプリ側の名前からスペースを消す（例：「村上 友美」→「村上友美」）
          const cleanAppName = name.replace(/[\s\u3000]/g, "");
          
          // 💡 【核心の修正】完全一致ではなく、「MEMBERS側の名前に、アプリ側のフルネームが含まれているか（部分一致）」で探す
          const matchedKey = Object.keys(roomMembers).find(memName => memName.includes(cleanAppName));
          
          if (matchedKey) {
            toIds.push(roomMembers[matchedKey]);
          }
        });

        const sent = await sendMembersMessage(roomId, token, baseMessage, toIds);
        if (sent) {
          results.push(`[手動催促] ${dept} チームへ送信完了 (${toIds.length}名メンション)`);
        } else {
          results.push(`[手動催促エラー] ${dept} チームへの送信に失敗しました。`);
        }
      }
    } else {
      return NextResponse.json({ success: false, message: "送信対象のメンバーが指定されていません。" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error: any) {
    console.error("手動催促通知APIエラー:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}