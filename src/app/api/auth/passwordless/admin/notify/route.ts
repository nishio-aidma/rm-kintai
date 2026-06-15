import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    // フロント（画面側）から自動組み立てされたリマインド文章を回収
    const { message } = await request.json();

    // 👑 共有していただいた MEMBER-S の認証情報を完全に裏側に固定
    const token = "2DdB80HEyHWjO6cnN4YHyjdVR0oNyYebTAuurtFQX0vzZOLh3LhIDltLp45c99BibB5SnG0GcRV2zR35";
    
    // 💡 西尾さん：ここへ、リマインドを投稿させたいMEMBER-Sの「6桁のルームID」を書き換えてください！
    // （現在は仮で "123456" になっています）
    const roomId = "123456"; 

    // MEMBER-S公式のメッセージ投稿APIのURLを生成
    const postUrl = `https://api.mem-bers.jp/web-api/rooms/${roomId}/messages`;

    // 共有いただいたコードと同じく、URLエンコード形式でメッセージ本文をセット
    const formData = new URLSearchParams();
    formData.append("body", message);

    // 安全ガードレール（10秒タイムアウト）付きで、MEMBER-Sのサーバーへ接続
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const postRes = await fetch(postUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`, // 🔑 正規の通行証
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: formData.toString(),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!postRes.ok) {
      const errorText = await postRes.text();
      throw new Error(`MEMBER-S APIがエラーを返しました: ${postRes.status} - ${errorText}`);
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("MEMBER-S一括通知API内部エラー:", error);
    return NextResponse.json(
      { error: error.message || "通知の送信中にサーバーエラーが発生しました。" },
      { status: 500 }
    );
  }
}