import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import Sheet from './SheetWebShim';

export default function ReturnSheet({ visible, onClose, items = [], loading, error, onQuickReturn, snapPoints = ['30%', '70%', '100%'], initialSnap = 1 }) {
  if (Platform.OS !== 'web') return null;

  return (
    <Sheet isOpen={!!visible} onClose={onClose} snapPoints={snapPoints} initialSnap={initialSnap}>
      <Sheet.Container>
        <Sheet.Header>
          <div style={{ padding: 12, borderBottom: '1px solid #e6e6e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <h3 style={{ margin: 0 }}>Do zwrotu</h3>
            <button onClick={onClose} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>Zamknij</button>
          </div>
        </Sheet.Header>
        <Sheet.Content>
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
        </Sheet.Content>
      </Sheet.Container>
    </Sheet>
  );
}
