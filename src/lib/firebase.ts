import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Firebaseの接続設定（後ほど作成する「秘密のメモ帳」ファイルから読み込みます）
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// アプリがすでに起動している場合はそれを使い、そうでない場合は新しく起動する仕組み
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// ログイン機能（Auth）とデータベース機能（Firestore）をいつでも使えるように外に公開する
export const auth = getAuth(app);
export const db = getFirestore(app);