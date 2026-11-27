import React from 'react';
import { Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';

export const colors = {
  primary: '#1565c0',
  bg: '#f4f6fa',
  card: '#ffffff',
  text: '#1b1f27',
  muted: '#6b7280',
  danger: '#c62828',
  ok: '#2e7d32',
  border: '#d9dee7',
};

export function Button({ title, onPress, kind = 'primary', style }) {
  const bg = kind === 'danger' ? colors.danger : kind === 'ghost' ? '#e8eefb' : colors.primary;
  const fg = kind === 'ghost' ? colors.primary : '#fff';
  return (
    <TouchableOpacity onPress={onPress} style={[s.btn, { backgroundColor: bg }, style]}>
      <Text style={[s.btnText, { color: fg }]}>{title}</Text>
    </TouchableOpacity>
  );
}

export function Field({ label, ...props }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput style={s.input} placeholderTextColor="#9aa3b2" {...props} />
    </View>
  );
}

export function Chips({ options, value, onChange }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
      {options.map((o) => (
        <TouchableOpacity
          key={o}
          onPress={() => onChange(o)}
          style={[s.chip, value === o && { backgroundColor: colors.primary }]}
        >
          <Text style={{ color: value === o ? '#fff' : colors.text }}>{o}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function Card({ children, style }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export const s = StyleSheet.create({
  btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', marginVertical: 4 },
  btnText: { fontWeight: '700', fontSize: 15 },
  label: { color: colors.muted, fontSize: 12, marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 16, color: colors.text,
  },
  chip: {
    paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#e8eefb', marginRight: 8, marginBottom: 6,
  },
  card: {
    backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  h1: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  muted: { color: colors.muted, fontSize: 12 },
  bold: { fontWeight: '700', color: colors.text },
});
