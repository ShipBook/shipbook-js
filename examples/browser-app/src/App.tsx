import { useEffect, useState, useRef } from 'react';
import { Shipbook } from '@shipbook/browser';

// Initialize Shipbook - replace with your actual credentials
// TODO: Replace these with your Shipbook App ID and App Key from https://app.shipbook.io
const APP_ID = 'YOUR_APP_ID_HERE';
const APP_KEY = 'YOUR_APP_KEY_HERE';

// Get a logger instance
const log = Shipbook.getLogger('BrowserExample');

interface UserInfo {
  userId: string;
  userName?: string;
  fullName?: string;
  email?: string;
  phoneNumber?: string;
}

function App() {
  const [logs, setLogs] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null);
  const [userForm, setUserForm] = useState<UserInfo>({
    userId: '',
    userName: '',
    fullName: '',
    email: '',
    phoneNumber: '',
  });
  const initStarted = useRef(false);

  useEffect(() => {
    // Prevent double initialization in React StrictMode
    if (initStarted.current) return;
    initStarted.current = true;

    // Enable inner logging for debugging
    Shipbook.enableInnerLog(true);
    
    // Start Shipbook
    Shipbook.start(APP_ID, APP_KEY)
      .then(() => {
        setInitialized(true);
        addLog('Shipbook initialized successfully');
      })
      .catch((err) => {
        addLog(`Failed to initialize: ${err}`);
      });
  }, []);

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const handleVerbose = () => {
    log.v('This is a verbose message');
    addLog('Logged: verbose');
  };

  const handleDebug = () => {
    log.d('This is a debug message');
    addLog('Logged: debug');
  };

  const handleInfo = () => {
    log.i('This is an info message');
    addLog('Logged: info');
  };

  const handleWarning = () => {
    log.w('This is a warning message');
    addLog('Logged: warning');
  };

  const handleError = () => {
    log.e('This is an error message');
    addLog('Logged: error');
  };

  const handleException = () => {
    try {
      throw new Error('Test exception from browser');
    } catch (e) {
      log.e('Caught exception', e as Error);
      addLog('Logged: exception');
    }
  };

  const handleUnhandledException = () => {
    addLog('Triggering unhandled exception...');
    setTimeout(() => {
      throw new Error('Unhandled test exception');
    }, 100);
  };

  const handleFlush = () => {
    Shipbook.flush();
    addLog('Flushed logs');
  };

  const handleScreen = () => {
    Shipbook.screen('TestScreen');
    addLog('Logged screen: TestScreen');
  };

  const handleRegisterUser = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUserId = userForm.userId.trim();
    if (!trimmedUserId) {
      addLog('Error: User ID is required');
      return;
    }

    try {
      Shipbook.registerUser(
        trimmedUserId,
        userForm.userName?.trim() || undefined,
        userForm.fullName?.trim() || undefined,
        userForm.email?.trim() || undefined,
        userForm.phoneNumber?.trim() || undefined
      );
      
      setCurrentUser({
        userId: trimmedUserId,
        userName: userForm.userName?.trim() || undefined,
        fullName: userForm.fullName?.trim() || undefined,
        email: userForm.email?.trim() || undefined,
        phoneNumber: userForm.phoneNumber?.trim() || undefined,
      });
      
      addLog(`User registered: ${trimmedUserId}`);
      
      // Reset form
      setUserForm({
        userId: '',
        userName: '',
        fullName: '',
        email: '',
        phoneNumber: '',
      });
    } catch (err) {
      addLog(`Failed to register user: ${err}`);
    }
  };

  const handleLogout = () => {
    try {
      Shipbook.logout();
      setCurrentUser(null);
      addLog('User logged out');
    } catch (err) {
      addLog(`Failed to logout: ${err}`);
    }
  };

  const handleUserFormChange = (field: keyof UserInfo, value: string) => {
    setUserForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Shipbook Browser Example</h1>
      
      <div style={styles.status}>
        Status: {initialized ? '✅ Initialized' : '⏳ Initializing...'}
        {currentUser && (
          <div style={styles.userInfo}>
            Current User: {currentUser.userId}
            {currentUser.userName && ` (${currentUser.userName})`}
          </div>
        )}
      </div>

      <div style={styles.section}>
        <h2>User Management</h2>
        {!currentUser ? (
          <form onSubmit={handleRegisterUser} style={styles.form}>
            <div style={styles.formGroup}>
              <label style={styles.label}>
                User ID <span style={styles.required}>*</span>
                <input
                  type="text"
                  value={userForm.userId}
                  onChange={(e) => handleUserFormChange('userId', e.target.value)}
                  style={styles.input}
                  required
                />
              </label>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>
                User Name
                <input
                  type="text"
                  value={userForm.userName}
                  onChange={(e) => handleUserFormChange('userName', e.target.value)}
                  style={styles.input}
                />
              </label>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>
                Full Name
                <input
                  type="text"
                  value={userForm.fullName}
                  onChange={(e) => handleUserFormChange('fullName', e.target.value)}
                  style={styles.input}
                />
              </label>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>
                Email
                <input
                  type="email"
                  value={userForm.email}
                  onChange={(e) => handleUserFormChange('email', e.target.value)}
                  style={styles.input}
                />
              </label>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>
                Phone Number
                <input
                  type="tel"
                  value={userForm.phoneNumber}
                  onChange={(e) => handleUserFormChange('phoneNumber', e.target.value)}
                  style={styles.input}
                />
              </label>
            </div>
            <button type="submit" style={styles.button}>
              Register User
            </button>
          </form>
        ) : (
          <div>
            <div style={styles.userDetails}>
              <p style={styles.userDetailText}><strong>User ID:</strong> {currentUser.userId}</p>
              {currentUser.userName && <p style={styles.userDetailText}><strong>User Name:</strong> {currentUser.userName}</p>}
              {currentUser.fullName && <p style={styles.userDetailText}><strong>Full Name:</strong> {currentUser.fullName}</p>}
              {currentUser.email && <p style={styles.userDetailText}><strong>Email:</strong> {currentUser.email}</p>}
              {currentUser.phoneNumber && <p style={styles.userDetailText}><strong>Phone:</strong> {currentUser.phoneNumber}</p>}
            </div>
            <button
              style={{ ...styles.button, backgroundColor: '#d9534f' }}
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        )}
      </div>

      <div style={styles.section}>
        <h2>Log Levels</h2>
        <div style={styles.buttonRow}>
          <button style={styles.button} onClick={handleVerbose}>Verbose</button>
          <button style={styles.button} onClick={handleDebug}>Debug</button>
          <button style={styles.button} onClick={handleInfo}>Info</button>
          <button style={{ ...styles.button, backgroundColor: '#f0ad4e' }} onClick={handleWarning}>Warning</button>
          <button style={{ ...styles.button, backgroundColor: '#d9534f' }} onClick={handleError}>Error</button>
        </div>
      </div>

      <div style={styles.section}>
        <h2>Exceptions</h2>
        <div style={styles.buttonRow}>
          <button style={styles.button} onClick={handleException}>Caught Exception</button>
          <button style={{ ...styles.button, backgroundColor: '#d9534f' }} onClick={handleUnhandledException}>
            Unhandled Exception
          </button>
        </div>
      </div>

      <div style={styles.section}>
        <h2>Other</h2>
        <div style={styles.buttonRow}>
          <button style={styles.button} onClick={handleScreen}>Log Screen</button>
          <button style={styles.button} onClick={handleFlush}>Flush</button>
        </div>
      </div>

      <div style={styles.section}>
        <h2>Log Output</h2>
        <div style={styles.logContainer}>
          {logs.length === 0 ? (
            <div style={styles.logEmpty}>No logs yet. Click a button above.</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} style={styles.logEntry}>{log}</div>
            ))
          )}
        </div>
      </div>

      <div style={styles.footer}>
        <p>Replace APP_ID and APP_KEY in App.tsx with your Shipbook credentials.</p>
        <p>UUID: {Shipbook.getUUID() || 'N/A'}</p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 800,
    margin: '0 auto',
    padding: 20,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  title: {
    textAlign: 'center',
    color: '#333',
  },
  status: {
    textAlign: 'center',
    fontSize: 18,
    marginBottom: 20,
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  section: {
    marginBottom: 24,
  },
  buttonRow: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  },
  button: {
    padding: '10px 20px',
    fontSize: 14,
    border: 'none',
    borderRadius: 6,
    backgroundColor: '#007bff',
    color: 'white',
    cursor: 'pointer',
  },
  logContainer: {
    backgroundColor: '#1e1e1e',
    color: '#d4d4d4',
    padding: 16,
    borderRadius: 8,
    minHeight: 150,
    maxHeight: 300,
    overflow: 'auto',
    fontFamily: 'monospace',
    fontSize: 13,
  },
  logEmpty: {
    color: '#666',
    fontStyle: 'italic',
  },
  logEntry: {
    marginBottom: 4,
  },
  footer: {
    marginTop: 40,
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    fontSize: 14,
    color: '#666',
  },
  userInfo: {
    marginTop: 8,
    fontSize: 14,
    color: '#28a745',
    fontWeight: 'bold',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: 500,
    color: '#333',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  required: {
    color: '#d9534f',
  },
  input: {
    padding: '8px 12px',
    fontSize: 14,
    border: '1px solid #ddd',
    borderRadius: 4,
    fontFamily: 'inherit',
  },
  userDetails: {
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  userDetailText: {
    margin: '8px 0',
    fontSize: 14,
    color: '#333',
  },
};

export default App;
