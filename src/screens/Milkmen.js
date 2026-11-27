import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View, Alert, TouchableOpacity } from 'react-native';
import { getDb } from '../db';
import { Button, Card, Chips, Field, s } from '../ui';

export default function Milkmen() {
  const [list, setList] = useState([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('Cow');
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const db = await getDb();
    setList(await db.getAllAsync('SELECT * FROM Milkman_tbl ORDER BY milkman_code'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const reset = () => { setCode(''); setName(''); setType('Cow'); setEditing(false); };

  const save = async () => {
    if (!code || !name.trim()) return Alert.alert('Code aur Name zaroori hai');
    const db = await getDb();
    if (editing) {
      await db.runAsync('UPDATE Milkman_tbl SET milkman_name=?, milk_type=? WHERE milkman_code=?', [name.trim(), type, Number(code)]);
    } else {
      const ex = await db.getFirstAsync('SELECT 1 x FROM Milkman_tbl WHERE milkman_code=?', [Number(code)]);
      if (ex) return Alert.alert('Ye code pehle se hai');
      await db.runAsync('INSERT INTO Milkman_tbl (milkman_code, milkman_name, milk_type) VALUES (?,?,?)', [Number(code), name.trim(), type]);
    }
    reset(); load();
  };

  const toggle = async (m) => {
    const db = await getDb();
    await db.runAsync('UPDATE Milkman_tbl SET active=? WHERE milkman_code=?', [m.active ? 0 : 1, m.milkman_code]);
    load();
  };

  const edit = (m) => { setCode(String(m.milkman_code)); setName(m.milkman_name); setType(m.milk_type); setEditing(true); };

  return (
    <ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
      <Card>
        <Text style={s.h1}>{editing ? 'Milkman edit' : 'Naya milkman'}</Text>
        <Field label="Milkman Code" value={code} onChangeText={setCode} keyboardType="numeric" editable={!editing} />
        <Field label="Milkman Name" value={name} onChangeText={setName} />
        <Chips options={['Cow', 'Buffalo']} value={type} onChange={setType} />
        <Button title={editing ? 'Update' : 'Save'} onPress={save} />
        {editing && <Button title="Cancel" kind="ghost" onPress={reset} />}
      </Card>
      {list.map((m) => (
        <Card key={m.milkman_code}>
          <View style={s.row}>
            <TouchableOpacity onPress={() => edit(m)} style={{ flex: 1 }}>
              <Text style={s.bold}>{m.milkman_code} · {m.milkman_name}</Text>
              <Text style={s.muted}>{m.milk_type} · {m.active ? 'Active' : 'Inactive'}</Text>
            </TouchableOpacity>
            <Button title={m.active ? 'Deactivate' : 'Activate'} kind="ghost" onPress={() => toggle(m)} />
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}
