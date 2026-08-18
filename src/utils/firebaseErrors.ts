/**
 * Maps Firebase Auth error codes to user-friendly error messages.
 */
export function getFirebaseErrorMessage(error: any): string {
  if (!error) return 'An unexpected authentication error occurred.';

  const code = typeof error === 'string' ? error : error.code || '';

  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-disabled':
      return 'This user account has been disabled. Please contact an administrator.';
    case 'auth/user-not-found':
      return 'No account found with this email address. Please sign up first.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please verify and try again.';
    case 'auth/invalid-credential':
      return 'Invalid email or password. Please check your credentials.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Please log in instead.';
    case 'auth/weak-password':
      return 'Password is too weak. Please use at least 6 characters.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not enabled in your Firebase project. Please enable it in the Firebase Console.';
    case 'auth/too-many-requests':
      return 'Access to this account has been temporarily disabled due to many failed login attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network connection error. Please check your internet connection.';
    case 'auth/requires-recent-login':
      return 'Please log in again to continue this action.';
    case 'auth/popup-closed-by-user':
      return 'The authentication popup was closed before completing.';
    default:
      if (error.message && typeof error.message === 'string') {
        // Strip out raw firebase prefix if present e.g. "Firebase: Error (auth/xyz)."
        return error.message.replace(/^Firebase:\s*(Error\s*)?(\(auth\/[^)]+\)\.?\s*)?/i, '');
      }
      return 'Authentication failed. Please check your credentials and try again.';
  }
}
