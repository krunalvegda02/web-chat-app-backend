import admin from 'firebase-admin';

let firebaseApp = null;
let isInitialized = false;

try {
  // ✅ Only initialize if service account is available and valid
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

      // ✅ Validate required fields
      if (
        serviceAccount.private_key &&
        serviceAccount.client_email &&
        serviceAccount.project_id
      ) {
        firebaseApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id
        });

        isInitialized = true;
        console.log('✅ Firebase Admin SDK initialized successfully');
      } else {
        console.warn('⚠️ Firebase Admin: Missing required fields in service account');
      }
    } catch (parseError) {
      console.warn('⚠️ Firebase Admin: Invalid service account JSON -', parseError.message);
    }
  } else {
    console.log('ℹ️ Firebase Admin: FIREBASE_SERVICE_ACCOUNT not set (optional)');
  }
} catch (error) {
  console.warn('⚠️ Firebase Admin initialization warning:', error.message);
}

// ✅ Export with safe checks
export default admin;
export { firebaseApp, isInitialized };

// ✅ Helper function to check if Firebase is ready
export const isFirebaseReady = () => {
  return isInitialized && firebaseApp && admin.apps && admin.apps.length > 0;
};
