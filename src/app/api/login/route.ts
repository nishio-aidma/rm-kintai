import { NextResponse } from "next/server";
import { collection, query, where, getDocs, updateDoc } from "firebase/firestore";
// すでに打刻や組織図で100%完璧に動いている、実績のある普通のFirebase接続（db）をインポート
import { db } from "@/lib/firebase";

export async function POST(req: Request) {
  try {
    // 👑 進化：画面側から新しく送られてくる、Firebase公式の安全な背番号（uid）を追加で受け取る
    const { lastName, firstName, email, uid } = await req.json();

    if (!lastName || !firstName) {
      return NextResponse.json(
        { error: "姓・名は必須です" },
        { status: 400 }
      );
    }

    // データベースの登録に合わせて、すべて小文字の "lastname" と "firstname" で検索
    const membersRef = collection(db, "members");
    const q = query(
      membersRef,
      where("lastname", "==", lastName),
      where("firstname", "==", firstName)
    );
    const snapshot = await getDocs(q);

    console.log("LOGIN INPUT", {
      lastName,
      firstName,
      email,
    });
    
    console.log("SNAPSHOT SIZE", snapshot.size);

    if (snapshot.empty) {
      return NextResponse.json(
        { error: "ユーザーが見つかりません" },
        { status: 404 }
      );
    }

    const docSnap = snapshot.docs[0];
    const data = docSnap.data();

    const loginEmail = email?.trim();

    // 👑 修正＆進化：メールアドレスの更新と同時に、送られてきた公式の背番号（uid）をデータベースへガチッと紐付け保存
    const updateData: any = {};

    if (loginEmail) {
      const secondary = data.secondaryEmails || [];

      if (data.email === "") {
        updateData.email = loginEmail;
      } else if (data.email !== loginEmail && !secondary.includes(loginEmail)) {
        updateData.secondaryEmails = [...secondary, loginEmail];
      }
    }

    // 👑 今回追加：Firebase公式の背番号をメンバーデータへ自動保存（これがログインレスの鍵になります）
    if (uid) {
      updateData.firebaseUid = uid;
    }

    // 変更項目（メールや背番号）があれば、まとめてデータベースを安全に更新
    if (Object.keys(updateData).length > 0) {
      await updateDoc(docSnap.ref, updateData);
    }

    const session = {
      memberId: docSnap.id,
      name: `${data.lastname} ${data.firstname}`,
      email: data.email || loginEmail,
      loginAt: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      session,
    });
  } catch (e: any) {
    console.error("ログインAPI内部でエラーが発生しました:", e);
    return NextResponse.json(
      { error: "サーバーエラー" },
      { status: 500 }
    );
  }
}