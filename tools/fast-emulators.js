const path = require('path');
const process = require('process');

// Set cwd to project root
process.chdir(path.join(__dirname, '..'));

console.log('[FastEmulator] Initializing Firebase Local Emulator controller...');
try {
  const { startAll } = require('../node_modules/firebase-tools/lib/emulator/controller');
  const { loadConfig } = require('../node_modules/firebase-tools/lib/config');
  const { setExportOnExitOptions, beforeEmulatorCommand } = require('../node_modules/firebase-tools/lib/emulator/commandUtils');

  const options = {
    only: 'auth,firestore,functions',
    config: 'firebase.json',
    project: 'smart-attendance-dev',
  };

  beforeEmulatorCommand(options)
    .then(() => startAll(options))
    .then(({ deprecationNotices }) => {
      console.log('====================================================');
      console.log('Firebase Emulators successfully running!');
      console.log('Auth:      http://localhost:9099');
      console.log('Firestore: http://localhost:8080');
      console.log('Functions: http://localhost:5001');
      console.log('UI:        http://localhost:4000');
      console.log('====================================================');
    })
    .catch((err) => {
      console.error('[FastEmulator] Error starting:', err);
    });
} catch (e) {
  console.error('[FastEmulator] Startup error:', e);
}
