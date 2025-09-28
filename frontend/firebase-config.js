// Replace with your Firebase web app config
const firebaseConfig = {
     apiKey: 'AIzaSyABz-NUgHc-x7_RQM_z9kKtZvVGbAedRGI', 
     authDomain: 'sos-emergency-app-4116c.firebaseapp.com', 
     projectId: 'sos-emergency-app-4116c', 
     storageBucket: 'sos-emergency-app-4116c.firebasestorage.app', 
     messagingSenderId: '492785441483', 
     appId: '1:492785441483:web:93e04cb271130f9b33994e' };
      if (!window.firebase) 
        { 
            const s1=document.createElement('script'); 
            s1.src='https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js'; 
            s1.onload=()=>{ 
                const s2=document.createElement('script'); 
                s2.src='https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js'; 
                s2.onload=()=>{
                 const s3=document.createElement('script'); 
                 s3.src='https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js'; 
                 s3.onload=()=>{ firebase.initializeApp(firebaseConfig); 
                 console.log('Firebase initialized'); }; 
                 document.head.appendChild(s3); }; 
                 document.head.appendChild(s2);
                 }; 
                 document.head.appendChild(s1); 
        } 
        else {
             firebase.initializeApp(firebaseConfig);
             }