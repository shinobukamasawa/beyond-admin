// 公開されても問題のない値だけ置く（anon キーは公開用。データ API は閉じてあり、運営の API は Google ログイン＋許可リストを通らないと何も返さない）
window.BEYOND_ADMIN = {
  supabaseUrl: 'https://acmshulzlasrflbjsnhw.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjbXNodWx6bGFzcmZsYmpzbmh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5ODIzMTAsImV4cCI6MjEwNTU1ODMxMH0.cuYpz5Cm5-X_4YJ_wW8zjlx2EfO5mVEo5CJstUX0K7Q',
  apiUrl: 'https://acmshulzlasrflbjsnhw.supabase.co/functions/v1/admin',
  schoolName: 'ビヨンド',
  envLabel: '開発用',   // 本番用の config.js では空にする
  // 開発用：メール＋パスワードのログイン欄を出す（PC で開いたときだけ。Edge Function 側も ADMIN_ALLOW_PASSWORD がないと通さない。本番用の config.js では false）
  devLogin: location.hostname === 'localhost' || location.hostname === '127.0.0.1',
};
