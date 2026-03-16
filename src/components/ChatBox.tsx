import React, { useState, useEffect, useRef } from 'react';
import { Send, X, MessageSquare, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../firebase';
import { 
  collection, 
  doc, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  setDoc,
  getDoc,
  updateDoc,
  increment
} from 'firebase/firestore';

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  market_id: string;
  content: string;
  created_at: any;
}

interface ChatBoxProps {
  currentUser: any;
  otherUser: any;
  marketId: string;
  onClose: () => void;
}

export default function ChatBox({ currentUser, otherUser, marketId, onClose }: ChatBoxProps) {
  if (!currentUser || !otherUser) return null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!currentUser || !otherUser) return;

    const participants = [currentUser.id, otherUser.id].sort();
    const conversationId = `${marketId}_${participants[0]}_${participants[1]}`;

    // Ensure conversation document exists
    const ensureConversation = async () => {
      const convRef = doc(db, 'conversations', conversationId);
      const convDoc = await getDoc(convRef);
      if (!convDoc.exists()) {
        await setDoc(convRef, {
          participants,
          market_id: marketId,
          last_message: '',
          last_message_at: serverTimestamp(),
          unread_counts: {
            [currentUser.id]: 0,
            [otherUser.id]: 0
          }
        });
      } else {
        // Reset unread count for current user
        await updateDoc(convRef, {
          [`unread_counts.${currentUser.id}`]: 0
        });
      }
    };
    ensureConversation();

    const q = query(
      collection(db, 'messages'),
      where('conversation_id', '==', conversationId),
      orderBy('created_at', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [marketId, otherUser.id, currentUser.id]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const participants = [currentUser.id, otherUser.id].sort();
    const conversationId = `${marketId}_${participants[0]}_${participants[1]}`;

    try {
      const messageData = {
        conversation_id: conversationId,
        sender_id: currentUser.id,
        receiver_id: otherUser.id,
        market_id: marketId,
        content: newMessage,
        created_at: serverTimestamp()
      };

      await addDoc(collection(db, 'messages'), messageData);
      
      // Update conversation summary
      await updateDoc(doc(db, 'conversations', conversationId), {
        last_message: newMessage,
        last_message_at: serverTimestamp(),
        [`unread_counts.${otherUser.id}`]: increment(1)
      });

      setNewMessage('');
    } catch (e) {
      console.error("Error sending message", e);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="fixed bottom-4 right-4 w-80 sm:w-96 h-[500px] bg-white rounded-[2rem] shadow-2xl border border-slate-100 flex flex-col z-[1000] overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-black text-lg">
            {otherUser.shop_name ? otherUser.shop_name[0] : otherUser.name[0]}
          </div>
          <div>
            <h3 className="font-bold text-sm truncate w-40">
              {otherUser.shop_name || otherUser.name}
            </h3>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">En ligne</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
        {messages.map((msg, idx) => (
          <div 
            key={msg.id || idx} 
            className={`flex ${msg.sender_id === currentUser.id ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[80%] p-3 rounded-2xl text-sm font-medium shadow-sm ${
              msg.sender_id === currentUser.id 
                ? 'bg-blue-600 text-white rounded-tr-none' 
                : 'bg-white text-slate-900 border border-slate-100 rounded-tl-none'
            }`}>
              {msg.content}
              <div className={`text-[8px] mt-1 opacity-50 ${msg.sender_id === currentUser.id ? 'text-right' : 'text-left'}`}>
                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      <div className="px-4 py-2 flex gap-2 overflow-x-auto scrollbar-hide border-t border-slate-100 bg-white">
        <button 
          onClick={() => setNewMessage("Quel est le prix ?")}
          className="whitespace-nowrap px-3 py-1.5 rounded-full bg-slate-50 text-[10px] font-bold text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-all border border-slate-100"
        >
          Prix ?
        </button>
        <button 
          onClick={() => setNewMessage("Est-ce disponible ?")}
          className="whitespace-nowrap px-3 py-1.5 rounded-full bg-slate-50 text-[10px] font-bold text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-all border border-slate-100"
        >
          Disponible ?
        </button>
        <button 
          onClick={() => setNewMessage("Où êtes-vous exactement ?")}
          className="whitespace-nowrap px-3 py-1.5 rounded-full bg-slate-50 text-[10px] font-bold text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-all border border-slate-100"
        >
          Position ?
        </button>
      </div>

      {/* Input Area */}
      <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-slate-100 flex gap-2">
        <input 
          type="text" 
          placeholder="Écrivez votre message..."
          className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-100 transition-all"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
        />
        <button 
          type="submit"
          className="bg-blue-600 text-white p-2 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
        >
          <Send className="w-5 h-5" />
        </button>
      </form>
    </motion.div>
  );
}
