// Firebase client initialization for the Dust Time web app.
// Uses ES Modules so it can be imported with `<script type="module">`.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyAASPggmibgpzuOuRXCB20_9jQlfZJzofk',
  authDomain: 'dust-time.firebaseapp.com',
  projectId: 'dust-time',
  storageBucket: 'dust-time.firebasestorage.app',
  messagingSenderId: '569365033006',
  appId: '1:569365033006:web:d32a1653bcf6b0edf6afbf',
  measurementId: 'G-TTMHL7YSVD'
};

const app = initializeApp(firebaseConfig);

// 간단한 확인 로그로 올바른 Firebase 프로젝트가 초기화되었는지 확인합니다.
if (app.options?.projectId !== firebaseConfig.projectId) {
  console.warn('Firebase 프로젝트 ID가 기대값과 다릅니다:', app.options?.projectId);
} else {
  console.info('Firebase가 dust-time 구성으로 초기화되었습니다.');
}

export const db = getFirestore(app);
export const auth = getAuth(app);
export default app;
