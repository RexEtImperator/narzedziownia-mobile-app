import React from 'react';

const DateField = ({ value, onChange, placeholder = 'YYYY-MM-DD', style, colors }) => {
  const textColor = colors?.text || '#111827';
  const borderColor = colors?.border || '#e5e7eb';
  const bgColor = colors?.card || '#fff';
  const muted = colors?.muted || '#6b7280';

  const mergedStyle = {
    borderWidth: (style?.borderWidth ?? 1),
    borderColor,
    borderRadius: (style?.borderRadius ?? 6),
    paddingLeft: (style?.paddingLeft ?? 8),
    paddingRight: (style?.paddingRight ?? 8),
    height: (style?.height ?? 40),
    backgroundColor: bgColor,
    color: textColor,
    width: '100%',
  };

  return (
    <input
      type="date"
      value={value || ''}
      onChange={(e) => {
        const v = e?.target?.value || '';
        try { onChange && onChange(v); } catch {}
      }}
      placeholder={placeholder}
      style={mergedStyle}
    />
  );
};

export default DateField;

