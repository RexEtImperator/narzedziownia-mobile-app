import React, { useMemo } from 'react';

function Container({ children }) {
  return <div style={{ zIndex: 2, position: 'absolute', left: 0, bottom: 0, width: '100%', display: 'flex', flexDirection: 'column', background: '#fff', borderTopLeftRadius: 8, borderTopRightRadius: 8, boxShadow: '0px -2px 16px rgba(0,0,0,0.3)' }}>{children}</div>;
}
function Header(props) {
  return <div {...props} style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />;
}
function Content({ children }) {
  return <div style={{ minHeight: 0, position: 'relative', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>{children}</div>;
}
function Backdrop({ onTap }) {
  return <div onClick={onTap} style={{ zIndex: 1, position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.2)' }} />;
}

export function Sheet({ isOpen, onClose, snapPoints = ['30%', '70%', '100%'], initialSnap = 1, children }) {
  const sp = useMemo(() => snapPoints.map((p) => (typeof p === 'number' && p <= 1 ? `${Math.round(p * 100)}%` : String(p))), [snapPoints]);
  const init = Math.min(Math.max(initialSnap, 0), sp.length - 1);
  if (!isOpen) return null;
  const stop = (e) => e.stopPropagation();
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 9999, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={stop} style={{ position: 'relative', width: '100%', height: sp[init] }}>{children}</div>
    </div>
  );
}

Sheet.Container = Container;
Sheet.Header = Header;
Sheet.Content = Content;
Sheet.Backdrop = Backdrop;

export default Sheet;

