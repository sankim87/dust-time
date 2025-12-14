// Firebase client initialization for the Dust Time web app.
// Uses ES Modules so it can be imported with `<script type="module">`.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAASPggmibgpzuOuRXCB20_9jQlfZJzofk',
  authDomain: 'dust-time.firebaseapp.com',
  projectId: 'dust-time',
  storageBucket: 'dust-time.firebasestorage.app',
  messagingSenderId: '569365033006',
  appId: '1:569365033006:web:d32a1653bcf6b0edf6afbf',
  measurementId: 'G-TTMHL7YSVD'
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export default app;
