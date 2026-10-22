const keys = ['glq_history_v3','glq_bookmarks_v3','glq_wrong_v4','glq_custom_v3'];
const accountButton = document.getElementById('account-button');
const accountStatus = document.getElementById('account-status');
const config = window.GLQ_FIREBASE_CONFIG || {};
const configured = ['apiKey','authDomain','projectId','appId'].every(k=>config[k] && !String(config[k]).includes('YOUR_'));
let auth, db, currentUser = null, unsubscribe = null, timer = null, ready = false, syncing = false;
function showStatus(msg) { accountStatus.textContent = msg; }
// Diagnostic messages avoid logging API keys, tokens, or account credentials.
function authErrorMessage(e) {
  const code = e?.code || 'unknown';
  if (code === 'auth/api-key-not-valid' || code === 'auth/invalid-api-key') {
    return 'Khóa API Firebase không được Google chấp nhận. Kiểm tra API key trong firebase-config.js và Google Cloud > APIs & Services > Credentials; bảo đảm Identity Toolkit API được bật.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'Tên miền website chưa được cho phép trong Firebase Authentication > Settings > Authorized domains.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Chưa bật Google trong Firebase Authentication > Sign-in method.';
  }
  return 'Đăng nhập chưa thành công: ' + code;
}
function localSnapshot() { const out={}; for(const k of keys){try{out[k]=JSON.parse(localStorage.getItem(k)||'[]')}catch{out[k]=[]}} return out; }
function unique(items,identity) { const map=new Map(); for(const item of items||[])map.set(identity(item),item); return [...map.values()]; }
function merged(local, remote) {
  const a=local||{}, b=remote||{};
  return {
    glq_history_v3:unique([...(b.glq_history_v3||[]),...(a.glq_history_v3||[])], x=>JSON.stringify([x.date,x.type,x.total,x.correct,x.answered,x.questions])).slice(-150),
    glq_bookmarks_v3:[...new Set([...(b.glq_bookmarks_v3||[]),...(a.glq_bookmarks_v3||[])])],
    glq_wrong_v4:[...new Set([...(b.glq_wrong_v4||[]),...(a.glq_wrong_v4||[])])],
    glq_custom_v3:unique([...(b.glq_custom_v3||[]),...(a.glq_custom_v3||[])],x=>x.id)
  };
}
function clearVisibleData() {
  syncing=true;for(const k of keys)localStorage.removeItem(k);window.glqApplySyncedData?.();syncing=false;
}
function applySnapshot(data) {
  syncing=true;
  for(const k of keys) localStorage.setItem(k,JSON.stringify(data[k]||[]));
  // Những biến ứng dụng đã được khởi tạo trước khi đăng nhập cần được cập nhật.
  window.glqApplySyncedData?.();
  syncing=false;
}
function queueSync() {
  if(!ready||!currentUser||syncing)return;
  clearTimeout(timer);
  timer=setTimeout(async()=>{
    try { await window.glqWriteCloud(localSnapshot());showStatus('✓ Đã đồng bộ'); }
    catch(e) { console.error(e);showStatus('Chưa đồng bộ: kiểm tra Internet hoặc quyền Firestore'); }
  },900);
}
window.glqLocalChanged=queueSync;
window.glqAccountOpen=async()=>{
  if(!configured){alert('Chưa kết nối Firebase. Hãy làm theo tệp HUONG_DAN_FIREBASE.txt để bật đăng nhập Google. Tiến độ hiện vẫn lưu trên máy.');return;}
  if(currentUser){if(confirm('Đăng xuất tài khoản Google?')) await window.glqSignOut();return;}
  try { await window.glqSignIn(); }
  catch(e) { console.error(e);alert(authErrorMessage(e)); }
};
if(!configured){ accountButton.textContent='Đăng nhập Google';showStatus('Chưa cấu hình đồng bộ · dữ liệu lưu trên máy'); }
else {
  try {
    const [{initializeApp},{getAuth,GoogleAuthProvider,signInWithPopup,signInWithRedirect,getRedirectResult,onAuthStateChanged,signOut},{getFirestore,doc,getDoc,setDoc,onSnapshot}] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js')
    ]);
    const app=initializeApp(config);auth=getAuth(app);db=getFirestore(app);
    const provider=new GoogleAuthProvider();
    window.glqSignIn=async()=>{
      try{await signInWithPopup(auth,provider)}
      catch(e){if(['auth/popup-blocked','auth/operation-not-supported-in-this-environment'].includes(e.code))await signInWithRedirect(auth,provider);else throw e}
    };
    window.glqSignOut=()=>signOut(auth);
    window.glqWriteCloud=async data=>{if(!currentUser)return;await setDoc(doc(db,'users',currentUser.uid,'private','progress'),{...data,updatedAt:new Date().toISOString()});};
    getRedirectResult(auth).catch(e=>showStatus(authErrorMessage(e)));
    onAuthStateChanged(auth,async user=>{
      if(unsubscribe){unsubscribe();unsubscribe=null;}clearTimeout(timer);ready=false;currentUser=user;
      if(!user){if(localStorage.getItem('glq_account_owner'))clearVisibleData();accountButton.textContent='Đăng nhập Google';showStatus('Đã đăng xuất · dữ liệu tài khoản không hiển thị');return;}
      accountButton.textContent='Đăng xuất';showStatus('Đang đồng bộ: '+(user.displayName||user.email||'Google'));
      try {
        const priorOwner=localStorage.getItem('glq_account_owner');
        if(priorOwner && priorOwner!==user.uid)clearVisibleData();
        const ref=doc(db,'users',user.uid,'private','progress');
        const snap=await getDoc(ref);
        const combined=merged(localSnapshot(),snap.exists()?snap.data():{});
        applySnapshot(combined);
        localStorage.setItem('glq_account_owner',user.uid);
        await setDoc(ref,{...combined,updatedAt:new Date().toISOString()});
        ready=true;showStatus('✓ Đã đồng bộ · '+(user.email||''));
        unsubscribe=onSnapshot(ref,s=>{
          if(!ready||!s.exists()||syncing)return;
          const incoming=s.data();
          // Không ghi đè những thay đổi chưa được gửi đi từ thiết bị này.
          if(timer)return;
          applySnapshot(incoming);
        },e=>{console.error(e);showStatus('Mất kết nối đồng bộ');});
      }catch(e){console.error(e);showStatus('Không thể đồng bộ: kiểm tra quy tắc Firestore');}
    });
  } catch(e) {console.error(e);showStatus('Không tải được Firebase · dữ liệu vẫn lưu trên máy');}
}
