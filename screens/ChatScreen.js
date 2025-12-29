import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Modal, TextInput, ActivityIndicator, Pressable, Alert } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../lib/api';
import { useTheme } from '../lib/theme';
import { showSnackbar } from '../lib/snackbar';
import { formatDateTime } from '../lib/utils';
import { usePermissions } from '../lib/PermissionsContext';

export default function ChatScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [creating, setCreating] = useState(false);
  const { currentUser } = usePermissions();

  const [selectedConversation, setSelectedConversation] = useState(null);
  const [optionsModalVisible, setOptionsModalVisible] = useState(false);

  const fetchConversations = async () => {
    try {
      const data = await api.get('/api/chat/conversations');
      setConversations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.log('Error fetching conversations:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchConversations();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchConversations();
  };

  const openNewChatModal = async () => {
    setShowNewChatModal(true);
    setLoading(true);
    try {
      const [uData, eData] = await Promise.all([
        api.get('/api/users'),
        api.get('/api/employees')
      ]);
      setUsers(Array.isArray(uData) ? uData : []);
      setEmployees(Array.isArray(eData) ? eData : []);
    } catch (err) {
      showSnackbar('Błąd pobierania użytkowników', { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const createConversation = async () => {
    if (selectedUserIds.length === 0) return;
    setCreating(true);
    try {
      // Obsługa czatów grupowych i pojedynczych przez recipient_ids
      const payload = { recipient_ids: selectedUserIds };
      const res = await api.post('/api/chat/conversations', payload);
      
      setShowNewChatModal(false);
      setSelectedUserIds([]);
      
      const convId = res?.id || res?.conversation_id;
      if (convId) {
        navigation.navigate('ChatDetails', { conversationId: convId, title: res.title || 'Rozmowa' });
      } else {
        fetchConversations();
      }
    } catch (err) {
      showSnackbar('Nie udało się utworzyć rozmowy', { type: 'error' });
      console.log(err);
    } finally {
      setCreating(false);
    }
  };

  const toggleUserSelection = (id) => {
    if (selectedUserIds.includes(id)) {
      setSelectedUserIds(prev => prev.filter(uid => uid !== id));
    } else {
      setSelectedUserIds(prev => [...prev, id]);
    }
  };

  const handleLongPress = (item) => {
    setSelectedConversation(item);
    setOptionsModalVisible(true);
  };

  const handleMarkUnread = async () => {
    if (!selectedConversation) return;
    try {
      await api.post(`/api/chat/conversations/${selectedConversation.id}/unread`);
      showSnackbar('Oznaczono jako nieprzeczytane', { type: 'success' });
      fetchConversations();
    } catch (e) {
      showSnackbar('Błąd', { type: 'error' });
    } finally {
      setOptionsModalVisible(false);
    }
  };

  const handleBlock = async () => {
    if (!selectedConversation) return;
    try {
      await api.post(`/api/chat/conversations/${selectedConversation.id}/block`);
      showSnackbar('Zablokowano', { type: 'success' });
    } catch (e) {
      showSnackbar('Błąd blokowania', { type: 'error' });
    } finally {
      setOptionsModalVisible(false);
    }
  };

  const handleDelete = () => {
    if (!selectedConversation) return;
    Alert.alert(
      "Usuń konwersację",
      "Czy na pewno chcesz usunąć tę konwersację?",
      [
        { text: "Anuluj", style: "cancel" },
        { 
          text: "Usuń", 
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/api/chat/conversations/${selectedConversation.id}`);
              setConversations(prev => prev.filter(c => c.id !== selectedConversation.id));
              showSnackbar('Usunięto konwersację', { type: 'success' });
            } catch (e) {
              showSnackbar('Nie udało się usunąć', { type: 'error' });
            } finally {
              setOptionsModalVisible(false);
            }
          }
        }
      ]
    );
  };

  const renderConversationItem = ({ item }) => {
    const isUnread = (item.unread_count || 0) > 0;

    // Determine last message display
    const lastContent = item.last_message_preview || item.last_message_content;
    let displayContent = '(Brak wiadomości)';
    
    if (lastContent) {
        const myId = currentUser ? Number(currentUser.id) : 0;
        const senderId = item.last_sender_id ? Number(item.last_sender_id) : 0;
        const isMine = myId > 0 && senderId > 0 && myId === senderId;
        
        if (isMine) {
            displayContent = `Ty: ${lastContent}`;
        } else {
            displayContent = lastContent;
        }
    }

    return (
      <TouchableOpacity
        style={[styles.item, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => navigation.navigate('ChatDetails', { conversationId: item.id, title: item.title })}
        onLongPress={() => handleLongPress(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>
            {item.title ? item.title.charAt(0).toUpperCase() : '?'}
          </Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[styles.itemTitle, { color: colors.text, fontWeight: isUnread ? '700' : '600' }]} numberOfLines={1}>
              {item.title || 'Bez tytułu'}
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>
              {item.last_message_at ? formatDateTime(item.last_message_at) : ''}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={[styles.lastMessage, { color: colors.muted }]} numberOfLines={1}>
              {displayContent}
            </Text>
            {isUnread && (
              <View style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{item.unread_count}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderUserItem = ({ item }) => {
    const isSelected = selectedUserIds.includes(item.id);
    const name = item.fullName || item.full_name || item.username || item.name || 'Użytkownik';
    return (
      <TouchableOpacity
        style={[styles.userItem, isSelected && { backgroundColor: '#eef2ff', borderColor: colors.primary }]}
        onPress={() => toggleUserSelection(item.id)}
      >
        <View style={[styles.avatarSmall, { backgroundColor: '#94a3b8' }]}>
           <Text style={{ color: '#fff', fontSize: 12 }}>{name.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={{ marginLeft: 10, color: '#0f172a', fontWeight: '500' }}>{name}</Text>
        {isSelected && <Ionicons name="checkmark-circle" size={20} color={colors.primary} style={{ marginLeft: 'auto' }} />}
      </TouchableOpacity>
    );
  };

  const filteredUsers = users.filter(u => {
    const name = u.fullName || u.full_name || u.username || u.name || '';
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header handled by Navigation usually, but we can add custom if needed */}
      
      {loading && !refreshing && conversations.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderConversationItem}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ color: colors.muted, marginTop: 20 }}>Brak konwersacji</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={openNewChatModal}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>

      <Modal
        visible={showNewChatModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowNewChatModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Nowa wiadomość</Text>
            <TouchableOpacity onPress={() => setShowNewChatModal(false)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.searchBox}>
            <Ionicons name="search" size={20} color="#999" />
            <TextInput
              style={styles.searchInput}
              placeholder="Szukaj użytkownika..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          <FlatList
            data={filteredUsers}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderUserItem}
            contentContainerStyle={{ padding: 16 }}
          />

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.createBtn, { opacity: selectedUserIds.length > 0 ? 1 : 0.5 }]}
              disabled={selectedUserIds.length === 0 || creating}
              onPress={createConversation}
            >
              {creating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Rozpocznij czat</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
             <Text style={[styles.modalTitle, { marginBottom: 16, color: colors.text }]}>Opcje konwersacji</Text>
             
             <TouchableOpacity style={styles.optionItem} onPress={handleMarkUnread}>
               <Ionicons name="mail-unread" size={20} color={colors.text} />
               <Text style={[styles.optionText, { color: colors.text }]}>Oznacz jako nieprzeczytane</Text>
             </TouchableOpacity>

             <TouchableOpacity style={styles.optionItem} onPress={handleBlock}>
               <Ionicons name="ban" size={20} color="#f59e0b" />
               <Text style={[styles.optionText, { color: '#f59e0b' }]}>Zablokuj</Text>
             </TouchableOpacity>

             <TouchableOpacity style={styles.optionItem} onPress={handleDelete}>
               <Ionicons name="trash" size={20} color="#ef4444" />
               <Text style={[styles.optionText, { color: '#ef4444' }]}>Usuń konwersację</Text>
             </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  item: {
    flexDirection: 'row',
    padding: 12,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center'
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: { fontSize: 16 },
  lastMessage: { fontSize: 14, flex: 1 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    height: 44
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 16 },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    borderRadius: 8,
    marginBottom: 4
  },
  avatarSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee'
  },
  createBtn: {
    backgroundColor: '#4f46e5',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center'
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
  }
});
