import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

import { firebaseConfig } from "./firebase-config.js";


const fbApp = initializeApp(firebaseConfig);
const auth  = getAuth(fbApp);

const loginForm     = document.getElementById('login-form');
const loginEmail    = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginError    = document.getElementById('login-error');
const loginBtnText  = document.getElementById('login-btn-text');

// Se já estiver logado, vai direto pro Hub
onAuthStateChanged(auth, (user) => {
  if (user) window.location.href = '/meu-espaco/index.html';
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.style.display = 'none';
  loginBtnText.textContent = 'Autenticando...';

  try {
    await signInWithEmailAndPassword(auth, loginEmail.value.trim(), loginPassword.value);
    window.location.href = '/meu-espaco/index.html';
  } catch (err) {
    console.error("Login Error:", err);
    loginError.style.display = 'block';
    loginBtnText.textContent = 'Entrar';
  }
});
