import React, { useState, useEffect } from 'react';
import { Send, X, MessageSquare, Minimize2, Maximize2 } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';

interface Message {
  id: number;
  sender_id: number;
  receiver_id: number;
  content: string;
  created_at: string;
}

interface ChatProps {
  currentUser: { id: number; name: string };
  otherUser: { id: number; name: string };
  marketId: number;
  onClose: () => void;
}

export default function Chat({ currentUser, otherUser, marketId, onClose }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    const room = `chat_${marketId}_${currentUser.id}_${otherUser.id}`;
    newSocket.emit('join_chat', room);

    // Initial load
    fetch(`/api/messages?market_id=${marketId}&other_user_id=${otherUser.id}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => res.json())
      .then(data => setMessages(data));

    newSocket.on('receive_message', (message: Message) => {
      setMessages(prev => [...prev, message]);
    });

    return () => {
      newSocket.disconnect();
    };
  }, [marketId, otherUser.id]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !socket) return;

    socket.emit('send_message', {
      sender_id: currentUser.id,
      receiver_id: otherUser.id,
      market_id: marketId,
      content: input
    });
    setInput('');
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`fixed bottom-6 right-6 w-[calc(100%-3rem)] sm:w-96 bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 flex flex-col z-[100] transition-all overflow-hidden overlay-content ${isMinimized ? 'h-16' : 'h-[550px]'}`}
    >
      <div className="p-5 flex justify-between items-center bg-slate-900 text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center font-black text-lg">
            {otherUser.name[0]}
          </div>
          <div>
            <span className="font-black text-sm block leading-none">{otherUser.name}</span>
            <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">En ligne</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsMinimized(!isMinimized)} className="p-2 hover:bg-white/10 rounded-xl transition-all">
            {isMinimized ? <Maximize2 className="w-5 h-5" /> : <Minimize2 className="w-5 h-5" />}
          </button>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50 scrollbar-hide">
            {messages.map((msg) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={msg.id} 
                className={`flex ${msg.sender_id === currentUser.id ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] px-5 py-3 rounded-3xl text-sm font-medium shadow-sm ${
                  msg.sender_id === currentUser.id 
                    ? 'bg-blue-600 text-white rounded-tr-none' 
                    : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'
                }`}>
                  {msg.content}
                </div>
              </motion.div>
            ))}
          </div>

          <form onSubmit={sendMessage} className="p-5 border-t border-slate-100 bg-white flex gap-3">
            <input 
              type="text" 
              placeholder="Négocier le prix..."
              className="flex-1 px-5 py-3 rounded-2xl bg-slate-50 text-sm font-bold outline-none focus:ring-4 focus:ring-blue-50 focus:border-blue-500 transition-all"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit" className="p-3 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100">
              <Send className="w-5 h-5" />
            </button>
          </form>
        </>
      )}
    </motion.div>
  );
}
