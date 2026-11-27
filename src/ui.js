import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { addDays, formatDate, parseDate, today } from './core/dates.js';
import { useApp } from './app-context';

export const colors = {
  primary: '#0f6b4f', primarySoft: '#e4f0ea', accent: '#b45309', bg: '#f3f6f4', card: '#ffffff',
  text: '#17211c', muted: '#55635b', danger: '#b3261e', dangerSoft: '#fdecea', ok: '#1b6e36', okSoft: '#e5f4e9',
  warnSoft: '#fff4dc', border: '#d5ded9', side: '#0b3b2d',
};

export const Icon = ({ name, size = 18, color = colors.text }) => <Ionicons name={name} size={size} color={color} />;

export function Button({ title, onPress, kind = 'primary', icon, style, small, disabled, busy }) {
  const bg = { primary: colors.primary, danger: colors.danger, ghost: colors.primarySoft }[kind];
  const fg = kind === 'ghost' ? colors.primary : '#fff';
  return (
    <TouchableOpacity
      accessibilityRole="button" accessibilityLabel={title} disabled={disabled || busy} onPress={onPress}
      style={[s.btn, small && s.btnSmall, { backgroundColor: bg, opacity: disabled || busy ? 0.5 : 1 }, style]}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : icon ? <Icon name={icon} size={small ? 15 : 18} color={fg} /> : null}
      <Text style={[s.btnText, small && { fontSize: 13 }, { color: fg }]}>{title}</Text>
    </TouchableOpacity>
  );
}

export function Field({ label, error, hint, style, ...props }) {
  return (
    <View style={[s.field, style]}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label} placeholderTextColor="#7d8a83"
        style={[s.input, error && { borderColor: colors.danger }, props.multiline && { minHeight: 64, textAlignVertical: 'top' }, props.editable === false && { backgroundColor: colors.bg }]}
        {...props}
      />
      {error ? <Text style={s.error}>{error}</Text> : hint ? <Text style={s.muted}>{hint}</Text> : null}
    </View>
  );
}

/** Value hamesha ISO (YYYY-MM-DD); dikhta business ke date format me hai. */
export function DateField({ label, value, onChange, error, optional, style }) {
  const { settings, L } = useApp();
  const fmt = settings.dateFormat;
  const [text, setText] = useState(formatDate(value, fmt));
  useEffect(() => {
    setText((t) => ((parseDate(t, fmt) || t) === value && t !== value ? t : formatDate(value, fmt)));
  }, [value, fmt]);
  const change = (t) => { setText(t); onChange(parseDate(t, fmt) || t); };
  const step = (n) => onChange(addDays(parseDate(value) || today(), n));
  return (
    <View style={[s.field, style]}>
      <Text style={s.label}>{label} ({fmt})</Text>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <TouchableOpacity accessibilityLabel={L('Previous day', 'पिछला दिन')} style={s.stepper} onPress={() => step(-1)}><Icon name="chevron-back" /></TouchableOpacity>
        <TextInput accessibilityLabel={label} style={[s.input, { flex: 1, minWidth: 0 }, error && { borderColor: colors.danger }]} value={text}
          onChangeText={change} placeholder={optional ? L('All', 'सभी') : fmt} placeholderTextColor="#7d8a83" />
        <TouchableOpacity accessibilityLabel={L('Next day', 'अगला दिन')} style={s.stepper} onPress={() => step(1)}><Icon name="chevron-forward" /></TouchableOpacity>
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

/** options: 'x' ya ['value', 'label'] */
export function Chips({ label, options, value, onChange }) {
  return (
    <View style={s.field}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={s.wrap}>
        {options.map((o) => {
          const [v, text] = Array.isArray(o) ? o : [o, o];
          const on = value === v;
          return (
            <TouchableOpacity key={String(v)} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(v)}
              style={[s.chip, on && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
              <Text style={{ color: on ? '#fff' : colors.text, fontWeight: on ? '700' : '400' }}>{text}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export function Sheet({ visible, title, onClose, children }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.dialog}>
          <View style={[s.row, { marginBottom: 10 }]}>
            <Text style={[s.h2, { flex: 1 }]}>{title}</Text>
            {onClose ? <TouchableOpacity accessibilityLabel="Close" style={s.iconBtn} onPress={onClose}><Icon name="close" size={22} /></TouchableOpacity> : null}
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

export function MilkmanPicker({ label, list, value, onChange, allowAll, error }) {
  const { L } = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = list.find((m) => m.milkman_code === Number(value));
  const needle = q.trim().toLowerCase();
  const shown = list.filter((m) => !needle || m.milkman_name.toLowerCase().includes(needle) || String(m.milkman_code).startsWith(needle)).slice(0, 60);
  const pick = (code) => { onChange(code); setOpen(false); setQ(''); };
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} style={[s.input, s.row, error && { borderColor: colors.danger }]} onPress={() => setOpen(true)}>
        <Text style={{ flex: 1, color: selected ? colors.text : colors.muted }}>
          {selected ? `${selected.milkman_code} · ${selected.milkman_name}` : allowAll ? L('All milkmen', 'सभी दूधवाले') : L('Select milkman', 'दूधवाला चुनें')}
        </Text>
        <Icon name="chevron-down" />
      </TouchableOpacity>
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Sheet visible={open} title={label} onClose={() => setOpen(false)}>
        <Field label={L('Search name or code', 'नाम या कोड खोजें')} value={q} onChangeText={setQ} autoFocus />
        <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
          {allowAll ? <TouchableOpacity style={s.option} onPress={() => pick('')}><Text>{L('All milkmen', 'सभी दूधवाले')}</Text></TouchableOpacity> : null}
          {shown.map((m) => (
            <TouchableOpacity key={m.milkman_code} style={s.option} onPress={() => pick(m.milkman_code)}>
              <Text style={s.bold}>{m.milkman_code} · {m.milkman_name}</Text>
              <Text style={s.muted}>{m.milk_type}{m.active ? '' : ` · ${L('Inactive', 'निष्क्रिय')}`}</Text>
            </TouchableOpacity>
          ))}
          {!shown.length ? <Text style={s.muted}>{L('No match', 'कोई नहीं मिला')}</Text> : null}
        </ScrollView>
      </Sheet>
    </View>
  );
}

export const Card = ({ children, style }) => <View style={[s.card, style]}>{children}</View>;

export function Screen({ children }) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">{children}</ScrollView>
  );
}
/** Wide screen par barabar columns, mobile par neeche-neeche. */
export const Cols = ({ children }) => {
  const { wide } = useApp();
  return (
    <View style={wide ? { flexDirection: 'row', gap: 12, alignItems: 'flex-start' } : null}>
      {React.Children.toArray(children).map((c, i) => <View key={c.key || i} style={wide ? { flex: 1, minWidth: 0 } : null}>{c}</View>)}
    </View>
  );
};

export function Stat({ label, value, icon, tone = colors.primary, onPress }) {
  return (
    <TouchableOpacity disabled={!onPress} onPress={onPress} style={[s.card, s.stat]}>
      <View style={s.row}>
        <Text style={[s.muted, { flex: 1 }]}>{label}</Text>
        <Icon name={icon} color={tone} />
      </View>
      <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </TouchableOpacity>
  );
}

export const Loading = () => <ActivityIndicator accessibilityLabel="Loading" style={{ margin: 32 }} size="large" color={colors.primary} />;

export function Empty({ icon = 'file-tray-outline', text, action }) {
  return (
    <View style={{ alignItems: 'center', padding: 28, gap: 8 }}>
      <Icon name={icon} size={36} color={colors.muted} />
      <Text style={[s.muted, { textAlign: 'center' }]}>{text}</Text>
      {action}
    </View>
  );
}

export function Banner({ kind = 'warn', text, children }) {
  const bg = { warn: colors.warnSoft, error: colors.dangerSoft, ok: colors.okSoft }[kind];
  return (
    <View accessibilityRole="alert" style={[s.banner, { backgroundColor: bg }]}>
      <Text style={{ color: colors.text }}>{text}</Text>
      {children}
    </View>
  );
}

export function Avatar({ uri, name, size = 44 }) {
  if (uri) return <Image accessibilityLabel={name} source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.primary, fontWeight: '800', fontSize: size / 2.4 }}>{(name || '?').trim().charAt(0).toUpperCase()}</Text>
    </View>
  );
}

/** columns: [{key,label,type}] ; text(row, column) -> string */
export function Table({ columns, rows, text, totals }) {
  const width = (c) => ({ name: 140, notes: 180, reference: 120, date: 100 }[c.key] || (c.type === 'money' ? 90 : c.type === 'int' ? 56 : 74));
  const line = (row, key, extra, isHead) => (
    <View key={key} style={[{ flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.border }, extra]}>
      {columns.map((c, i) => (
        <Text key={c.key} style={[s.cell, { width: width(c), flexGrow: 1 }, ['num', 'money', 'int'].includes(c.type) && { textAlign: 'right' }, (isHead || key === 'total') && { fontWeight: '700' }]}>
          {isHead ? c.label : key === 'total' ? (i === 0 ? 'TOTAL' : c.key in row ? text(row, c) : '') : text(row, c)}
        </Text>
      ))}
    </View>
  );
  return (
    <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
      <View style={{ flexGrow: 1 }}>
        {line({}, 'head', { backgroundColor: colors.primarySoft }, true)}
        {rows.map((r, i) => line(r, i))}
        {totals && rows.length ? line(totals, 'total', { backgroundColor: colors.bg }) : null}
      </View>
    </ScrollView>
  );
}

export function More({ total, shown, onPress }) {
  const { L } = useApp();
  return total > shown ? <Button kind="ghost" title={`${L('Show more', 'और दिखाएँ')} (${total - shown})`} onPress={onPress} /> : null;
}

export const s = StyleSheet.create({
  screen: { padding: 14, paddingBottom: 32, width: '100%', maxWidth: 1120, alignSelf: 'center' },
  btn: { minHeight: 44, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginVertical: 4 },
  btnSmall: { minHeight: 40, paddingHorizontal: 12, paddingVertical: 6 },
  btnText: { fontWeight: '700', fontSize: 15 },
  field: { marginBottom: 12 },
  label: { color: colors.muted, fontSize: 13, marginBottom: 4, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, minHeight: 44, fontSize: 16, color: colors.text },
  stepper: { width: 40, minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  error: { color: colors.danger, fontSize: 13, marginTop: 2 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  stat: { flexGrow: 1, flexBasis: 150 },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 6 },
  banner: { borderRadius: 10, padding: 12, marginBottom: 12, gap: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(10,30,22,0.55)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  dialog: { backgroundColor: '#fff', borderRadius: 16, padding: 16, width: '100%', maxWidth: 480, maxHeight: '90%' },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  option: { paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border, minHeight: 44, justifyContent: 'center' },
  cell: { padding: 6, fontSize: 13, color: colors.text },
  h1: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 10 },
  h2: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  muted: { color: colors.muted, fontSize: 13 },
  bold: { fontWeight: '700', color: colors.text },
});
