import { NextResponse } from "next/server";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// MEMBERS APIのレスポンス用型定義
interface MembersApiUser {
  id?: string | number;
  account_id?: string | number;
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
  
  // 💡 メンションは本文の先頭に [To:xxxxx] として直接文字でくっつける
  let finalBody = body;
  if (toIds && toIds.length > 0) {
    const mentionText = toIds.map(id => `[To:${id}]`).join(" ");
    finalBody = `${mentionText}\n${body}`;
  }

  // 💡 MEMBERS(Chatwork系)は改行をそのまま(\n)送るのが正解のため、<br>変換を削除
  const payload: Record<string, string> = {
    body: finalBody,
  };

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
      // 💡 MEMBERSはデータが直接配列で返ってくるため、正しくリストを受け取るように変更
      const members: MembersApiUser[] = Array.isArray(json) ? json : (json.member || []);
      
      members.forEach((m) => {
        const cleanName = (m.name || "").replace(/[\s\u3000]/g, "");
        // 💡 IDの項目名が account_id である仕様に対応
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
        const notFoundNames: string[] = [];

        memberNames.forEach((name) => {
          const cleanAppName = name.replace(/[\s\u3000]/g, "");
          
          // MEMBERS側の名前にアプリ側の名前が含まれているか部分一致で検索
          const matchedKey = Object.keys(roomMembers).find(memName => 
            memName === cleanAppName || memName.includes(cleanAppName) || cleanAppName.includes(memName)
          );
          
          if (matchedKey) {
            toIds.push(roomMembers[matchedKey]);
          } else {
            notFoundNames.push(name);
          }
        });

        // もしMEMBERSの部屋に見つからなかった人がいた場合のみ、本文に警告文を足す
        let finalMessage = baseMessage;
        if (notFoundNames.length > 0) {
           finalMessage = `⚠️ [システム通知] MEMBERS名簿に以下のメンバーが見つからなかったため、メンションを付与できませんでした。\n対象者: ${notFoundNames.join(", ")}\n\n${baseMessage}`;
        }

        const sent = await sendMembersMessage(roomId, token, finalMessage, toIds);
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