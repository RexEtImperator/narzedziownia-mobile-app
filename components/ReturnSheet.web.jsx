import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import { BottomSheet } from 'react-spring-bottom-sheet';
import 'react-spring-bottom-sheet/dist/style.css';

export default function ReturnSheet({ visible, onClose, items = [], loading, error, onQuickReturn, snapPoints = [0.3, 0.7, 1], initialSnap = 1 }) {
  if (Platform.OS !== 'web') return null;

  const ratios = useMemo(() => snapPoints.map((p) => {
    if (typeof p === 'number') return p <= 1 ? p : undefined;
    if (typeof p === 'string' && p.trim().endsWith('%')) {
      const num = parseFloat(p);
      return isNaN(num) ? 1 : Math.max(0, Math.min(1, num / 100));
    }
    return 1;
  }), [snapPoints]);

  const init = Math.min(Math.max(initialSnap, 0), ratios.length - 1);

  const computeSnapPoints = ({ maxHeight, minHeight }) => {
    const points = ratios.map((r) => Math.round(maxHeight * r));
    // Ensure at least minHeight
    return points.map((h) => Math.max(h, minHeight));
  };

  const header = (
    <div style={{ padding: 12, borderBottom: '1px solid #e6e6e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h3 style={{ margin: 0 }}>Do zwrotu</h3>
      <button onClick={onClose} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>Zamknij</button>
    </div>
  );

  return (
    <BottomSheet
      open={!!visible}
      onDismiss={onClose}
      header={header}
      snapPoints={computeSnapPoints}
      defaultSnap={({ snapPoints }) => snapPoints[init]}
    >
      <div style={{ padding: 12 }}>
        {loading ? (
          <p style={{ color: '#6b7280' }}>Ładowanie…</p>
        ) : error ? (
          <p style={{ color: '#b91c1c' }}>Błąd: {String(error)}</p>
        ) : (items && items.length > 0 ? (
          items.map((itm) => (
            <div key={`ret-web-${itm.id || itm.issue_id || itm.tool_id}`} style={{ padding: '10px 0', borderBottom: '1px solid #e6e6e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ paddingRight: 10 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{itm.tool_name || itm.name || 'Narzędzie'}</div>
                {itm.employee_name ? (<div style={{ color: '#555' }}>{itm.employee_name}</div>) : null}
                {itm.tool_code ? (<div style={{ color: '#555' }}>Kod: {itm.tool_code}</div>) : null}
                <div style={{ color: '#555' }}>Ilość: {itm.quantity || 1}</div>
              </div>
              {itm.tool_code ? (
                <button onClick={() => onQuickReturn?.(itm.tool_code)} style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>Szybki zwrot</button>
              ) : null}
            </div>
          ))
        ) : (
          <p style={{ color: '#6b7280' }}>Brak aktywnych wydań do zwrotu.</p>
        ))}
      </div>
    </BottomSheet>
  );
}
