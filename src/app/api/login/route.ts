import { NextResponse } from "next/server";
import { collection, query, where, getDocs, updateDoc, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function POST(req: Request) {
  try {
    const { lastName, firstName, email, uid } = await req.json();

    // 💡 前後の余計な空白（スペース）を綺麗に除去
    const cleanLastName = (lastName || "").trim();
    const cleanFirstName = (firstName || "").trim();
    const cleanEmail = (email || "").trim().toLowerCase();

    if (!cleanLastName || !cleanFirstName) {
      return NextResponse.json(
        { error: "姓・名は必須です" },
        { status: 400 }
      );
    }

    let targetDocRef: any = null;
    let data: any = null;

    // 1. members コレクションから「苗字 + 名前」で検索
    const membersRef = collection(db, "members");
    const qMembers = query(
      membersRef,
      where("lastName", "==", cleanLastName),
      where("firstName", "==", cleanFirstName)
    );
    const snapMembers = await getDocs(qMembers);

    if (!snapMembers.empty) {
      const docSnap = snapMembers.docs[0];
      targetDocRef = docSnap.ref;
      data = docSnap.data();
    } else {
      // 2. members にいない場合、fixed_members（固定メンバー枠）から「苗字 + 名前」で検索
      const fixedRef = collection(db, "fixed_members");
      const qFixed = query(
        fixedRef,
        where("lastName", "==", cleanLastName),
        where("firstName", "==", cleanFirstName)
      );
      const snapFixed = await getDocs(qFixed);

      if (!snapFixed.empty) {
        const docSnap = snapFixed.docs[0];
        targetDocRef = docSnap.ref;
        data = docSnap.data();
      } else if (cleanEmail) {
        // 3. 名前検索で見つからない場合、メールアドレスから救済検索
        const qEmailMembers = query(membersRef, where("email", "==", cleanEmail));
        const snapEmailMembers = await getDocs(qEmailMembers);

        if (!snapEmailMembers.empty) {
          const docSnap = snapEmailMembers.docs[0];
          targetDocRef = docSnap.ref;
          data = docSnap.data();
        } else {
          // fixed_members ドキュメントID指定検索
          const fixedDocRef = doc(db, "fixed_members", cleanEmail);
          const fixedDocSnap = await getDoc(fixedDocRef);
          if (fixedDocSnap.exists()) {
            targetDocRef = fixedDocRef;
            data = fixedDocSnap.data();
          }
        }
      }
    }

    // 最終チェック：どこにもデータが存在しない場合
    if (!targetDocRef || !data) {
      return NextResponse.json(
        { error: "ユーザーが見つかりません" },
        { status: 404 }
      );
    }

    const loginEmail = cleanEmail;

    // 👑 既存仕様維持：メールアドレスの更新と背番号(uid)の紐付け
    const updateData: any = {};

    if (loginEmail) {
      const secondary = data.secondaryEmails || [];

      if (!data.email) {
        updateData.email = loginEmail;
      } else if (data.email !== loginEmail && !secondary.includes(loginEmail)) {
        updateData.secondaryEmails = [...secondary, loginEmail];
      }
    }

    if (uid) {
      updateData.firebaseUid = uid;
    }

    if (Object.keys(updateData).length > 0) {
      await updateDoc(targetDocRef, updateData);
    }

    // 👑 既存仕様維持：セッション情報の生成
    const session = {
      memberId: targetDocRef.id,
      name: `${data.lastName || cleanLastName} ${data.firstName || cleanFirstName}`,
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