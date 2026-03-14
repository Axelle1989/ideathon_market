import React from 'react';
import { ShoppingCart, Trash2, Send, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CartItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
  seller_id: number;
}

interface CartProps {
  items: CartItem[];
  userBalance: number;
  onRemove: (id: number) => void;
  onUpdateQuantity: (id: number, delta: number) => void;
  onCheckout: (sellerId: number, options: { payOnline: boolean; deliveryType: 'pickup' | 'delivery' }) => void;
  onClose: () => void;
}

export default function Cart({ items, userBalance, onRemove, onUpdateQuantity, onCheckout, onClose }: CartProps) {
  const [checkoutOptions, setCheckoutOptions] = React.useState<Record<number, { payOnline: boolean; deliveryType: 'pickup' | 'delivery' }>>({});

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  
  // Group items by seller
  const itemsBySeller = items.reduce((acc, item) => {
    if (!acc[item.seller_id]) {
      acc[item.seller_id] = [];
      // Initialize options for this seller if not exists
      if (!checkoutOptions[item.seller_id]) {
        setCheckoutOptions(prev => ({
          ...prev,
          [item.seller_id]: { payOnline: false, deliveryType: 'pickup' }
        }));
      }
    }
    acc[item.seller_id].push(item);
    return acc;
  }, {} as Record<number, CartItem[]>);

  const updateOption = (sellerId: number, key: 'payOnline' | 'deliveryType', value: any) => {
    setCheckoutOptions(prev => ({
      ...prev,
      [sellerId]: { ...prev[sellerId], [key]: value }
    }));
  };

  return (
    <motion.div 
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-[100] flex flex-col border-l border-slate-100 overlay-content"
    >
      <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-white">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center shadow-inner">
            <ShoppingCart className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900">Votre Panier</h2>
            <p className="text-slate-400 text-xs font-medium">{items.length} articles sélectionnés</p>
          </div>
        </div>
        <button onClick={onClose} className="p-3 hover:bg-slate-100 rounded-2xl transition-all text-slate-400">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-10 scrollbar-hide">
        {Object.keys(itemsBySeller).length === 0 ? (
          <div className="text-center py-32">
            <div className="w-24 h-24 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-inner">
              <ShoppingCart className="w-10 h-10 text-slate-200" />
            </div>
            <p className="text-slate-300 font-bold text-lg">Votre panier est vide.</p>
          </div>
        ) : (
          Object.entries(itemsBySeller).map(([sellerId, sellerItems]) => (
            <div key={sellerId} className="space-y-6">
              <div className="flex flex-col gap-4 border-b border-slate-50 pb-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-slate-300 text-[10px] uppercase tracking-[0.2em]">Vendeur #{sellerId}</h3>
                  <button 
                    onClick={() => {
                      const options = checkoutOptions[Number(sellerId)] || { payOnline: false, deliveryType: 'pickup' };
                      const sellerTotal = sellerItems.reduce((s, i) => s + i.price * i.quantity, 0);
                      
                      if (options.payOnline && userBalance < sellerTotal) {
                        alert("Solde insuffisant pour le paiement en ligne.");
                        return;
                      }
                      
                      onCheckout(Number(sellerId), options);
                    }}
                    className="bg-blue-600 text-white text-[10px] font-black px-6 py-3 rounded-2xl hover:bg-blue-700 flex items-center gap-2 shadow-lg shadow-blue-100 transition-all uppercase tracking-widest"
                  >
                    Commander <Send className="w-3 h-3" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mode</label>
                    <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100">
                      <button 
                        onClick={() => updateOption(Number(sellerId), 'deliveryType', 'pickup')}
                        className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${checkoutOptions[Number(sellerId)]?.deliveryType === 'pickup' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
                      >
                        Retrait
                      </button>
                      <button 
                        onClick={() => updateOption(Number(sellerId), 'deliveryType', 'delivery')}
                        className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${checkoutOptions[Number(sellerId)]?.deliveryType === 'delivery' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
                      >
                        Livraison
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Paiement</label>
                    <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100">
                      <button 
                        onClick={() => updateOption(Number(sellerId), 'payOnline', false)}
                        className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${!checkoutOptions[Number(sellerId)]?.payOnline ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
                      >
                        Cash
                      </button>
                      <button 
                        onClick={() => updateOption(Number(sellerId), 'payOnline', true)}
                        className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${checkoutOptions[Number(sellerId)]?.payOnline ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
                      >
                        En ligne
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-6">
                {sellerItems.map((item) => (
                  <motion.div 
                    layout
                    key={item.id} 
                    className="flex gap-6 items-center group"
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="font-black text-slate-900 truncate group-hover:text-blue-600 transition-colors">{item.name}</h4>
                      <p className="text-blue-600 text-sm font-black mt-1">{item.price.toLocaleString()} FCFA</p>
                    </div>
                    <div className="flex items-center gap-3 bg-slate-50 rounded-2xl p-1.5 border border-slate-100">
                      <button 
                        onClick={() => onUpdateQuantity(item.id, -1)} 
                        className="w-8 h-8 flex items-center justify-center hover:bg-white rounded-xl transition-all font-black text-slate-400 hover:text-slate-900"
                      >
                        -
                      </button>
                      <span className="text-sm font-black w-6 text-center text-slate-900">{item.quantity}</span>
                      <button 
                        onClick={() => onUpdateQuantity(item.id, 1)} 
                        className="w-8 h-8 flex items-center justify-center hover:bg-white rounded-xl transition-all font-black text-slate-400 hover:text-slate-900"
                      >
                        +
                      </button>
                    </div>
                    <button 
                      onClick={() => onRemove(item.id)} 
                      className="p-2 text-slate-200 hover:text-red-500 transition-all"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </motion.div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-8 bg-slate-50 border-t border-slate-100">
        <div className="flex justify-between items-center mb-4">
          <span className="text-slate-400 font-bold uppercase tracking-widest text-xs">Total à régler</span>
          <span className="text-3xl font-black text-slate-900">{total.toLocaleString()} FCFA</span>
        </div>
        <p className="text-[10px] text-slate-300 font-medium text-center">
          Les commandes sont envoyées directement par email aux vendeurs.
        </p>
      </div>
    </motion.div>
  );
}
