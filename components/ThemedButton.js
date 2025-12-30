import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useTheme } from '../lib/theme';

export default function ThemedButton({ title, onPress, loading = false, disabled = false, style, textStyle, variant = 'primary', icon, children }) {
  const { colors } = useTheme();

  // Fallback na wypadek problemów z kontekstem
  const safeColors = colors || {
    primary: '#4f46e5',
    muted: '#475569',
    danger: '#dc2626',
    success: '#10b981',
    card: '#ffffff',
    border: '#e5e7eb',
    text: '#0f172a'
  };

  const getBackgroundColor = () => {
    if (disabled) return safeColors.muted;
    switch (variant) {
      case 'primary': return safeColors.primary;
      case 'danger': return safeColors.danger;
      case 'success': return safeColors.success;
      case 'outline': return 'transparent';
      case 'secondary': return safeColors.card;
      default: return safeColors.primary;
    }
  };

  const getBorderColor = () => {
    if (variant === 'outline') return safeColors.border;
    if (variant === 'secondary') return safeColors.border;
    return 'transparent';
  };

  const getTextColor = () => {
    if (variant === 'outline' || variant === 'secondary') return safeColors.text;
    return '#ffffff';
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.base,
        {
          backgroundColor: getBackgroundColor(),
          borderColor: getBorderColor(),
          borderWidth: (variant === 'outline' || variant === 'secondary') ? 1 : 0,
        },
        style
      ]}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} />
      ) : children ? (
        children
      ) : (
        <>
          {icon}
          <Text style={[styles.text, { color: getTextColor(), marginLeft: icon ? 8 : 0 }, textStyle]}>
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 48,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginVertical: 6,
    minWidth: 40, // Zapewnia minimalną szerokość dla ikon
  },
  text: {
    fontWeight: '600',
    fontSize: 16,
    textAlign: 'center',
  },
});
