export function App() {
  return (
    <div style={{ width: 280, padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>rewrite.so</h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#666' }}>
          在任何输入框双击 <kbd style={kbdStyle}>Shift</kbd> <kbd style={kbdStyle}>Shift</kbd>。
        </p>
      </header>

      <div style={cardStyle}>
        <div style={{ fontSize: 11, color: '#888' }}>本月剩余</div>
        <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>未登录 · 5 次</div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button type="button" style={btnStyle} onClick={() => chrome.runtime.openOptionsPage()}>
          设置
        </button>
        <button type="button" style={btnPrimaryStyle} disabled>
          登录（Phase 2）
        </button>
      </div>
    </div>
  );
}

const kbdStyle = {
  display: 'inline-block',
  padding: '0 4px',
  border: '1px solid #d4d4d8',
  borderRadius: 3,
  fontSize: 10,
  fontFamily: 'inherit',
  background: '#fff',
};
const cardStyle = {
  padding: '10px 12px',
  border: '1px solid #e4e4e7',
  borderRadius: 8,
  background: '#fafafa',
};
const btnStyle = {
  flex: 1,
  padding: '8px 12px',
  fontSize: 12,
  border: '1px solid #d4d4d8',
  borderRadius: 6,
  background: '#fff',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const btnPrimaryStyle = {
  ...btnStyle,
  background: '#111',
  color: '#fff',
  border: 'none',
  opacity: 0.5,
  cursor: 'not-allowed',
};
