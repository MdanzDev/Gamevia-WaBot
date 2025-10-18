const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase
try {
    const serviceAccount = require('./firebase-key.json');
    
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });

    const db = admin.firestore();
    console.log('✅ Firebase connected successfully!');
    
    module.exports = { admin, db };
} catch (error) {
    console.log('❌ Firebase setup failed:', error.message);
    console.log('📝 Please make sure firebase-key.json is in /system/ folder');
    module.exports = { admin: null, db: null };
}
