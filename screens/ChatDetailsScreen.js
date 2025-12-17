import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Modal, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../lib/api';
import { useTheme } from '../lib/theme';
import { showSnackbar } from '../lib/snackbar';
import { formatDateTime } from '../lib/utils';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ChatDetailsScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const route = useRoute();
  const { conversationId, title } = route.params || {};

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [optionsModalVisible, setOptionsModalVisible] = useState(false);

  const wsRef = useRef(null);
  const flatListRef = useRef(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false, // Hide default header to use custom one
    });
  }, [navigation]);

  useEffect(() => {
    // Get current user info (id) for determining self messages
    const fetchUser = async () => {
        try {
            // Try AsyncStorage first for speed
            const saved = await AsyncStorage.getItem('@current_user');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && parsed.id) {
                    setCurrentUser(parsed);
                }
            }
            // Verify with API
            const user = await api.get('/api/auth/me');
            if (user && user.id) {
                setCurrentUser(user);
                await AsyncStorage.setItem('@current_user', JSON.stringify(user));
            }
        } catch (e) {
            console.log('Error fetching user', e);
        }
    };
    fetchUser();
  }, []);

  const fetchMessages = async () => {
    try {
      const data = await api.get(`/api/chat/conversations/${conversationId}/messages`);
      // Messages from backend are usually sorted by date ASC or DESC.
      // ChatPanel.jsx sorts them or receives them sorted.
      // Let's assume they come sorted by created_at ASC (oldest first).
      // FlatList inverted needs newest first (DESC).
      // So we might need to reverse them.
      // Let's check ChatPanel.jsx:
      // It uses VariableSizeList and scrolls to bottom.
      // For React Native inverted FlatList, we want array [Newest, ..., Oldest].
      // If API returns [Oldest, ..., Newest], we need to reverse.
      const msgs = Array.isArray(data) ? data : [];
      setMessages([...msgs].reverse());
      
      // Mark as read
      await api.post(`/api/chat/conversations/${conversationId}/read`, {});
    } catch (err) {
      console.log('Error fetching messages:', err);
      showSnackbar('Błąd pobierania wiadomości', { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (conversationId) {
      fetchMessages();
    }
  }, [conversationId]);

  // WebSocket Connection
  useEffect(() => {
    let ws = null;
    const connect = async () => {
      if (!conversationId) return;
      
      // Ensure token is available
      const token = await AsyncStorage.getItem('token');
      if (!token) return;

      const baseURL = api.baseURL || 'http://localhost:3000'; // Fallback
      // Construct WS URL
      // Remove http/https and replace with ws/wss
      let wsUrl = baseURL.replace(/^http/, 'ws');
      if (!wsUrl.startsWith('ws')) wsUrl = `ws://${wsUrl}`; // Handle clean domains if any
      
      wsUrl = `${wsUrl}/api/chat/ws?token=${encodeURIComponent(token)}`;

      console.log('Connecting WS:', wsUrl);
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WS Connected');
      };

      ws.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload && payload.type === 'chat:message' && Number(payload.conversationId) === Number(conversationId)) {
            const msg = payload.message;
            if (msg) {
               // Add new message to top (because inverted)
               setMessages(prev => {
                 if (prev.some(m => m.id === msg.id)) return prev; // Dedup
                 return [msg, ...prev];
               });
            }
          }
        } catch (err) {
          console.log('WS Parse Error', err);
        }
      };

      ws.onerror = (e) => {
        console.log('WS Error', e.message);
      };

      ws.onclose = (e) => {
        console.log('WS Closed', e.code, e.reason);
      };
    };

    connect();

    return () => {
      if (ws) ws.close();
    };
  }, [conversationId]);

  const handleLongPress = (item) => {
    setSelectedMessage(item);
    setOptionsModalVisible(true);
  };

  const handleReply = () => {
    if (!selectedMessage) return;
    setReplyingTo(selectedMessage);
    setEditingMessage(null);
    setOptionsModalVisible(false);
  };

  const handleEdit = () => {
    if (!selectedMessage) return;
    setEditingMessage(selectedMessage);
    setReplyingTo(null);
    setInputText(selectedMessage.content);
    setOptionsModalVisible(false);
  };

  const handleDelete = () => {
    if (!selectedMessage) return;
    const msgId = selectedMessage.id;
    Alert.alert(
      "Usuń wiadomość",
      "Czy na pewno chcesz usunąć tę wiadomość?",
      [
        { text: "Anuluj", style: "cancel" },
        { 
          text: "Usuń", 
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/api/chat/messages/${msgId}`);
              setMessages(prev => prev.filter(m => m.id !== msgId));
            } catch (e) {
              showSnackbar('Nie udało się usunąć wiadomości', { type: 'error' });
            } finally {
              setOptionsModalVisible(false);
            }
          }
        }
      ]
    );
  };

  const cancelAction = () => {
    setReplyingTo(null);
    setEditingMessage(null);
    setInputText('');
    setOptionsModalVisible(false);
  };

  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text) return;
    setSending(true);
    try {
      let res;
      if (editingMessage) {
        res = await api.put(`/api/chat/messages/${editingMessage.id}`, { content: text });
        setMessages(prev => prev.map(m => m.id === editingMessage.id ? { ...m, content: text } : m));
        setEditingMessage(null);
      } else {
        const payload = { content: text };
        if (replyingTo) payload.reply_to_id = replyingTo.id;
        res = await api.post(`/api/chat/conversations/${conversationId}/messages`, payload);
        
        if (res) {
          const msg = {
            ...res,
            sender_id: res.sender_id || currentUser?.id,
            sender_name: res.sender_name || currentUser?.full_name || currentUser?.username,
            created_at: res.created_at || new Date().toISOString(),
            reply_to_id: replyingTo?.id || null,
            reply_to_sender_name: replyingTo?.sender_name || null,
            reply_to_content: replyingTo?.content || null
          };

          setMessages(prev => {
              if (prev.some(m => m.id === msg.id)) return prev;
              return [msg, ...prev];
          });
        }
        setReplyingTo(null);
      }
      
      setInputText('');
    } catch (err) {
      showSnackbar('Nie udało się wysłać wiadomości', { type: 'error' });
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }) => {
    // Robust comparison matching source logic
    // Handle both string/number types safely
    const myId = currentUser ? Number(currentUser.id) : 0;
    const senderId = item.sender_id ? Number(item.sender_id) : 0;
    const isMe = myId > 0 && senderId > 0 && myId === senderId;
    
    return (
      <View style={[
        styles.msgRow, 
        isMe ? styles.msgRowMe : styles.msgRowOther
      ]}>
        {!isMe && (
          <View style={[styles.avatarSmall, { backgroundColor: '#94a3b8', marginRight: 8 }]}>
             <Text style={{color:'#fff', fontSize:10}}>
                 {(item.sender_name || '?').charAt(0).toUpperCase()}
             </Text>
          </View>
        )}
        <TouchableOpacity 
          activeOpacity={0.9}
          onLongPress={() => handleLongPress(item)}
          style={[
            styles.bubble, 
            isMe ? { backgroundColor: colors.primary } : { backgroundColor: '#e2e8f0' }
          ]}
        >
           {!isMe && <Text style={styles.senderName}>{item.sender_name}</Text>}
           
           {item.reply_to_id && (
             <View style={[styles.replyContext, { borderLeftColor: isMe ? 'rgba(255,255,255,0.5)' : '#cbd5e1' }]}>
               <Text style={[styles.replySender, { color: isMe ? 'rgba(255,255,255,0.8)' : '#64748b' }]}>
                 {item.reply_to_sender_name || 'Użytkownik'}
               </Text>
               <Text numberOfLines={1} style={{ color: isMe ? 'rgba(255,255,255,0.6)' : '#94a3b8', fontSize: 12 }}>
                 {item.reply_to_content || 'Wiadomość'}
               </Text>
             </View>
           )}

           <Text style={[styles.msgContent, isMe ? { color: '#fff' } : { color: '#0f172a' }]}>
             {item.content}
           </Text>
           <Text style={[styles.msgTime, isMe ? { color: 'rgba(255,255,255,0.7)' } : { color: '#64748b' }]}>
             {formatDateTime(item.created_at)}
             {isMe && item.read_by && item.read_by.length > 0 && (
               <Text style={{ fontSize: 10, marginLeft: 4 }}> • Przeczytano</Text>
             )}
           </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: colors.background }]} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 100}
    >
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <View style={[styles.avatarHeader, { backgroundColor: colors.primary }]}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
              {(title || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {title || 'Rozmowa'}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          style={{ flex: 1 }}
          data={messages}
          extraData={currentUser}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          inverted
          contentContainerStyle={{ padding: 16 }}
        />
      )}

      {/* Reply/Edit Preview */}
      {(replyingTo || editingMessage) && (
        <View style={[styles.actionPreview, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <View style={styles.actionPreviewContent}>
            <Text style={{ fontWeight: 'bold', color: colors.primary, marginBottom: 4 }}>
              {editingMessage ? 'Edytuj wiadomość' : `Odpowiedz do: ${replyingTo?.sender_name || 'Użytkownik'}`}
            </Text>
            <Text numberOfLines={1} style={{ color: colors.text }}>
              {editingMessage ? editingMessage.content : replyingTo?.content}
            </Text>
          </View>
          <TouchableOpacity onPress={cancelAction}>
            <Ionicons name="close-circle" size={24} color={colors.muted} />
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.inputContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TextInput
          style={[styles.input, { color: colors.text, backgroundColor: colors.background }]}
          value={inputText}
          onChangeText={setInputText}
          placeholder={editingMessage ? "Edytuj..." : "Napisz wiadomość..."}
          placeholderTextColor={colors.muted}
          multiline
        />
        <TouchableOpacity 
          style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: (!inputText.trim() || sending) ? 0.5 : 1 }]}
          onPress={sendMessage}
          disabled={!inputText.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name={editingMessage ? "checkmark" : "send"} size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={optionsModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setOptionsModalVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setOptionsModalVisible(false)}
        >
          <View style={[styles.optionsContainer, { backgroundColor: colors.card }]}>
             <TouchableOpacity style={styles.optionItem} onPress={handleReply}>
               <Ionicons name="arrow-undo" size={20} color={colors.text} />
               <Text style={[styles.optionText, { color: colors.text }]}>Odpowiedz</Text>
             </TouchableOpacity>
             
             {selectedMessage && currentUser && Number(selectedMessage.sender_id) === Number(currentUser.id) && (
               <>
                 <TouchableOpacity style={styles.optionItem} onPress={handleEdit}>
                   <Ionicons name="pencil" size={20} color={colors.text} />
                   <Text style={[styles.optionText, { color: colors.text }]}>Edytuj</Text>
                 </TouchableOpacity>
                 <TouchableOpacity style={styles.optionItem} onPress={handleDelete}>
                   <Ionicons name="trash" size={20} color="#ef4444" />
                   <Text style={[styles.optionText, { color: '#ef4444' }]}>Usuń</Text>
                 </TouchableOpacity>
               </>
             )}
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  msgRow: { flexDirection: 'row', marginBottom: 12, maxWidth: '80%' },
  msgRowMe: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  msgRowOther: { alignSelf: 'flex-start' },
  bubble: {
    padding: 10,
    borderRadius: 16,
    minWidth: 60
  },
  senderName: {
    fontSize: 10,
    color: '#64748b',
    marginBottom: 2,
    fontWeight: '700'
  },
  replyContext: {
    borderLeftWidth: 2,
    paddingLeft: 8,
    marginBottom: 6,
  },
  replySender: {
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2
  },
  msgContent: {
    fontSize: 15,
  },
  msgTime: {
    fontSize: 10,
    alignSelf: 'flex-end',
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center'
  },
  avatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto' // Align to bottom of bubble
  },
  actionPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
  },
  actionPreviewContent: {
    flex: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    alignItems: 'flex-end'
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#ddd',
    marginRight: 8
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  optionsContainer: {
    width: '80%',
    borderRadius: 12,
    padding: 16,
    elevation: 5
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  optionText: {
    marginLeft: 12,
    fontSize: 16,
    fontWeight: '500'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    paddingTop: Platform.OS === 'android' ? 10 : 12, // Status bar safe area
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  avatarHeader: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    maxWidth: '80%',
  },
});
