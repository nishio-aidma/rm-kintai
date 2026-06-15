import { NextResponse } from "next/server";
import { initializeApp, getApps, cert, getApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// 👑 【完全解決】値の前後に入り込んだダブルクォーテーションや空白を、跡形もなく綺麗に剥ぎ取る関数
function cleanValue(val: string | undefined): string {
  if (!val) return "";
  let cleaned = val.trim();
  cleaned = cleaned.replace(/^["']|["']$/g, ""); // 前後の " や ' を完全に消去
  return cleaned.trim();
}

// 👑 秘密鍵専用の改行コード修復処理
function formatPrivateKey(rawKey: string | undefined): string {
  if (!rawKey) return "";
  let key = cleanValue(rawKey); // まず前後のクォーテーションを徹底除去
  key = key.replace(/\\n/g, "\n"); // 記号としての\nを本物の改行に置換
  return key;
}

function ensureFirebaseAdmin() {
  if (getApps().length === 0) {
    // 💡 環境変数からデータを回収
    const rawProjectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const rawClientEmail = process.env.FIREBASE_CLIENT_EMAIL || process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL;
    const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY || process.env.NEXT_PUBLIC_FIREBASE_PRIVATE_KEY;

    if (!rawProjectId) throw new Error("環境変数内の『PROJECT_ID』が読み込めません。");
    if (!rawClientEmail) throw new Error("環境変数内の『CLIENT_EMAIL』が読み込めません。");
    if (!rawPrivateKey) throw new Error("環境変数内の『PRIVATE_KEY』が読み込めません。");

    // 👑 【バグの完全除去】すべての値から文字化けの原因であるダブルクォーテーションを完全に死滅させる
    const projectId = cleanValue(rawProjectId);
    const clientEmail = cleanValue(rawClientEmail);
    const privateKey = formatPrivateKey(rawPrivateKey);

    return initializeApp({
      credential: cert({
        projectId: projectId,
        clientEmail: clientEmail,
        privateKey: privateKey,
      }),
    });
  }
  return getApp();
}

export async function POST(request: Request) {
  try {
    ensureFirebaseAdmin();

    const { email, lastName, firstName } = await request.json();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "正しいメールアドレスが必要です。" }, { status: 400 });
    }

    const authAdmin = getAuth();
    const dbAdmin = getFirestore();
    const targetEmail = email.trim().toLowerCase();

    let uid = "";

    try {
      const userUser = await authAdmin.getUserByEmail(targetEmail);
      uid = userUser.uid;
    } catch (authError: any) {
      const errorCode = authError.code || authError.errorInfo?.code;

      if (errorCode === "auth/user-not-found") {
        const newUser = await authAdmin.createUser({ email: targetEmail });
        uid = newUser.uid;
        
        const requestRef = dbAdmin.collection("account_requests").doc(targetEmail);
        await requestRef.set({
          email: email.trim(),
          lastName: lastName.trim(),
          firstName: firstName.trim(),
          createdAt: FieldValue.serverTimestamp()
        });
      } else {
        throw new Error(`Firebase Auth通信エラー: ${errorCode || "未知のエラー"}`);
      }
    }

    const customToken = await authAdmin.createCustomToken(uid);
    return NextResponse.json({ customToken });

  } catch (error: any) {
    console.error("パスワードレス認証API内部エラー:", error);
    const friendlyMessage = error.message || "サーバー内部で予期せぬエラーが発生しました。";
    return NextResponse.json({ error: friendlyMessage }, { status: 500 });
  }
}