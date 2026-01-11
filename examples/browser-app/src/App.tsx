import { useEffect, useState, useRef } from 'react';
import { Shipbook } from '@shipbook/browser';

// Initialize Shipbook - replace with your actual credentials
const APP_ID = '5b8820297696832a3559a03e';
const APP_KEY = '313b2dc9b15fb31f2c085aa994d3c7b1';

// Get a logger instance
const log = Shipbook.getLogger('BrowserExample');

function App() {
  const [logs, setLogs] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);
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

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Shipbook Browser Example</h1>
      
      <div style={styles.status}>
        Status: {initialized ? '✅ Initialized' : '⏳ Initializing...'}
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
};

export default App;
