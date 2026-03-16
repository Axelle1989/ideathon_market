import React, { useState, useEffect } from 'react';
import { 
  ShoppingBag, 
  Store, 
  Plus, 
  LogOut, 
  User, 
  Search, 
  Filter, 
  Edit, 
  ChevronRight,
  MapPin,
  Tag,
  Package,
  Info,
  ShoppingCart,
  MessageSquare,
  ChevronLeft,
  ArrowRight,
  X,
  Wallet,
  CheckCircle2,
  Navigation,
  Map as MapIcon,
  Trash2,
  Palette,
  Settings,
  ClipboardList,
  Clock,
  CheckCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from './firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp, 
  orderBy,
  increment,
  Timestamp
} from 'firebase/firestore';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  deleteUser
} from 'firebase/auth';
import Map from './components/Map.tsx';
import Cart from './components/Cart.tsx';
import ChatBox from './components/ChatBox.tsx';

// --- Types ---
interface User {
  id: string;
  email: string;
  role: 'buyer' | 'seller' | 'both';
  name: string;
  balance: number;
  welcome_code?: string;
  shop_name?: string;
  phone?: string;
  lat?: number;
  lng?: number;
  bank_info?: string;
  seller_type?: 'boutique' | 'market';
  theme?: 'default' | 'noir-vert' | 'bleu-noir';
}

interface Market {
  id: string;
  name: string;
  location: string;
  lat: number;
  lng: number;
  type?: 'market' | 'boutique';
}

interface Item {
  id: string;
  seller_id: string;
  market_id: string;
  name: string;
  description: string;
  price: number;
  photo: string;
  category: string;
  seller_name?: string;
  market_name?: string;
}

interface Seller {
  id: string;
  name: string;
  email: string;
  shop_name?: string;
  phone?: string;
  lat?: number;
  lng?: number;
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  seller_id: string;
}

// --- API Helpers ---
const API_BASE = '/api';
const STANDARD_PHONE = "+229 01 00 00 00"; // Numéro standard centralisé

const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };
  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.reload();
  }
  return res;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [view, setView] = useState<'buyer' | 'seller' | 'auth'>('auth');
  const [buyerStep, setBuyerStep] = useState<'map' | 'sellers' | 'items' | 'search' | 'nearby' | 'boutiques' | 'messages'>('map');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [markets, setMarkets] = useState<Market[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [boutiques, setBoutiques] = useState<any[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [marketSearch, setMarketSearch] = useState<string>('');
  const [globalSearch, setGlobalSearch] = useState<string>('');
  const [isExpandedMap, setIsExpandedMap] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [savingLocation, setSavingLocation] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationSuccess, setLocationSuccess] = useState<boolean>(false);
  const watchId = React.useRef<number | null>(null);

  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('onboarding_completed');
  });
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');

  // Cart, Chat & Wallet state
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [activeChat, setActiveChat] = useState<Seller | null>(null);
  const [showWallet, setShowWallet] = useState(false);
  const [addAmount, setAddAmount] = useState<string>('');
  const [lastInvoice, setLastInvoice] = useState<any>(null);
  const [showWelcome, setShowWelcome] = useState<string | null>(null);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [theme, setTheme] = useState<'default' | 'noir-vert' | 'bleu-noir'>('default');
  const [orders, setOrders] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'items' | 'orders' | 'messages'>('items');
  const [conversations, setConversations] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [buyerTab, setBuyerTab] = useState<'shop' | 'orders'>('shop');

  const categories = [
    "Vivrier",
    "Céréales",
    "Tubercules",
    "Légumes",
    "Fruits",
    "Vêtements & Pagnes",
    "Artisanat",
    "Autre"
  ];

  // Auth form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'buyer' | 'seller' | 'both'>('buyer');
  const [sellerType, setSellerType] = useState<'boutique' | 'market'>('boutique');
  const [shopName, setShopName] = useState('');
  const [phone, setPhone] = useState('');
  const [bankInfo, setBankInfo] = useState('');
  const [sellerLat, setSellerLat] = useState<number | null>(null);
  const [sellerLng, setSellerLng] = useState<number | null>(null);

  // Item form state
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [newItem, setNewItem] = useState<Partial<Item>>({
    name: '',
    description: '',
    price: 0,
    photo: '',
    category: '',
    market_id: 0
  });

  // --- Firebase Auth & Real-time Listeners ---
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          setUser({ id: firebaseUser.uid, ...userDoc.data() } as User);
        }
      } else {
        setUser(null);
      }
      setIsAuthReady(true);
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    const unsubscribeUser = onSnapshot(doc(db, 'users', user.id), (doc) => {
      if (doc.exists()) {
        setUser(prev => prev ? { ...prev, ...doc.data() } : null);
      }
    });

    const unsubscribeMarkets = onSnapshot(collection(db, 'markets'), (snapshot) => {
      setMarkets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Market)));
    });

    const unsubscribeItems = onSnapshot(collection(db, 'items'), (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Item)));
    });

    const unsubscribeSellers = onSnapshot(
      query(collection(db, 'users'), where('role', 'in', ['seller', 'both'])),
      (snapshot) => {
        setSellers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Seller)));
      }
    );

    const qOrders = view === 'buyer' 
      ? query(collection(db, 'orders'), where('buyer_id', '==', user.id), orderBy('created_at', 'desc'))
      : query(collection(db, 'orders'), where('seller_id', '==', user.id), orderBy('created_at', 'desc'));
    
    const unsubscribeOrders = onSnapshot(qOrders, (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qConversations = query(
      collection(db, 'conversations'), 
      where('participants', 'array-contains', user.id),
      orderBy('last_message_at', 'desc')
    );
    const unsubscribeConversations = onSnapshot(qConversations, (snapshot) => {
      const convs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setConversations(convs);
      const totalUnread = convs.reduce((sum: number, conv: any) => {
        const unread = conv.unread_counts?.[user.id] || 0;
        return sum + unread;
      }, 0);
      setUnreadCount(totalUnread);
    });

    return () => {
      unsubscribeUser();
      unsubscribeMarkets();
      unsubscribeItems();
      unsubscribeSellers();
      unsubscribeOrders();
      unsubscribeConversations();
    };
  }, [user?.id, user?.role, view]);

  useEffect(() => {
    if (user) {
      if (user.role === 'both') {
        setView('buyer');
      } else {
        setView(user.role);
      }
      if (user.theme) setTheme(user.theme);
    } else {
      setView('auth');
    }
    
    const timer = setTimeout(() => setLoading(false), 2000);

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => console.error("Error getting location", error)
      );
    }

    return () => {
      clearTimeout(timer);
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, [user?.id]);

  const updateOrderStatus = async (orderId: string, status: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status });
    } catch (e) {
      console.error("Failed to update order status", e);
    }
  };

  const loadItems = async (searchQuery?: string) => {
    // Firestore listeners handle this automatically, but we can filter here if needed
    // or use a separate query for global search
  };

  const saveCurrentLocation = () => {
    if (!("geolocation" in navigator)) {
      setLocationError("La géolocalisation n'est pas supportée par votre navigateur.");
      return;
    }

    setSavingLocation(true);
    setLocationError(null);
    setLocationSuccess(false);

    const attemptPosition = (highAccuracy: boolean) => {
      const options: PositionOptions = {
        enableHighAccuracy: highAccuracy,
        timeout: highAccuracy ? 5000 : 10000,
        maximumAge: 0
      };

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          
          try {
            const res = await fetchWithAuth('/user/location', {
              method: 'POST',
              body: JSON.stringify(coords)
            });
            
            if (res.ok) {
              setUserLocation(coords);
              // Update local user object
              const updatedUser = { ...user!, ...coords };
              setUser(updatedUser);
              localStorage.setItem('user', JSON.stringify(updatedUser));
              setLocationSuccess(true);
              setTimeout(() => setLocationSuccess(false), 3000);
              if (view === 'buyer') setBuyerStep('nearby');
            } else {
              throw new Error("Failed to save");
            }
          } catch (e) {
            console.error(e);
            setLocationError("Erreur lors de l'enregistrement de la position sur le serveur.");
          } finally {
            setSavingLocation(false);
          }
        },
        (error) => {
          if (highAccuracy && error.code === error.TIMEOUT) {
            console.warn("GPS Timeout, falling back to network location...");
            attemptPosition(false);
            return;
          }

          console.error("Error getting location", error);
          let message = "Impossible d'obtenir votre position.";
          switch (error.code) {
            case error.PERMISSION_DENIED:
              message = "Permission refusée. Veuillez autoriser l'accès au GPS.";
              break;
            case error.POSITION_UNAVAILABLE:
              message = "Position indisponible. Vérifiez que votre GPS est activé.";
              break;
            case error.TIMEOUT:
              message = "Délai d'attente dépassé. Essayez à nouveau dans un endroit plus dégagé.";
              break;
          }
          setLocationError(message);
          setSavingLocation(false);
        },
        options
      );
    };

    attemptPosition(true);
  };

  const toggleTracking = () => {
    if (isTracking) {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      setIsTracking(false);
    } else {
      if (!("geolocation" in navigator)) {
        alert("Géolocalisation non supportée.");
        return;
      }
      
      setIsTracking(true);
      watchId.current = navigator.geolocation.watchPosition(
        async (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserLocation(coords);
          
          // Sync to server for both roles to allow proximity features
          if (user) {
            try {
              await fetchWithAuth('/user/location', {
                method: 'POST',
                body: JSON.stringify(coords)
              });
              // Update local user object
              const updatedUser = { ...user, ...coords };
              setUser(updatedUser);
              localStorage.setItem('user', JSON.stringify(updatedUser));
            } catch (e) {
              console.error("Failed to sync user location", e);
            }
          }
        },
        (error) => {
          console.error("Tracking error", error);
          setIsTracking(false);
          if (watchId.current !== null) {
            navigator.geolocation.clearWatch(watchId.current);
            watchId.current = null;
          }
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  };

  const allNearbyMarkets = markets
    .map(m => ({
      ...m,
      distance: userLocation ? calculateDistance(userLocation.lat, userLocation.lng, m.lat, m.lng) : Infinity
    }))
    .sort((a, b) => a.distance - b.distance);

  const nearbyMarkets5km = allNearbyMarkets.filter(m => m.distance <= 5);
  const nearbyMarkets = allNearbyMarkets.slice(0, 3);

  const highlightedMarketIds = Array.from(new Set(items.map(i => i.market_id))).filter(id => id !== 0 && id !== null);

  const handleGlobalSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!globalSearch.trim()) return;
    
    setSelectedMarket(null);
    setSelectedSeller(null);
    setBuyerStep('search');
    setIsExpandedMap(true);
    loadItems(globalSearch);
  };

  const addToCart = (item: Item) => {
    setCartItems(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { 
        id: item.id, 
        name: item.name, 
        price: item.price, 
        quantity: 1, 
        seller_id: item.seller_id,
        seller_name: item.seller_name || 'Vendeur'
      }];
    });
    setShowCart(true);
  };

  const updateCartQuantity = (id: string, delta: number) => {
    setCartItems(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i));
  };

  const removeFromCart = (id: string) => {
    setCartItems(prev => prev.filter(i => i.id !== id));
  };

  const handleCheckout = async (sellerId: string, options: { payOnline: boolean; deliveryType: 'pickup' | 'delivery' }) => {
    if (!user) return;
    const sellerItems = cartItems.filter(i => i.seller_id === sellerId);
    const total = sellerItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const seller = sellers.find(s => s.id === sellerId);
    
    try {
      if (options.payOnline) {
        if (user.balance < total) {
          alert("Solde insuffisant.");
          return;
        }
        // Deduct balance
        await updateDoc(doc(db, 'users', user.id), {
          balance: increment(-total)
        });
        // Add to seller balance
        await updateDoc(doc(db, 'users', sellerId), {
          balance: increment(total)
        });
      }

      await addDoc(collection(db, 'orders'), {
        buyer_id: user.id,
        seller_id: sellerId,
        total,
        items: sellerItems,
        pay_online: options.payOnline,
        delivery_type: options.deliveryType,
        status: 'pending',
        created_at: serverTimestamp(),
        buyer_name: user.name,
        buyer_email: user.email,
        buyer_phone: user.phone || '',
        seller_name: seller?.name || '',
        seller_shop_name: seller?.shop_name || '',
        seller_phone: seller?.phone || ''
      });

      setCartItems(prev => prev.filter(i => i.seller_id !== sellerId));
      alert("Commande envoyée avec succès !");
    } catch (e) {
      console.error("Checkout error", e);
      alert("Erreur lors de la commande.");
    }
  };

  const handleAddFunds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !addAmount) return;
    const amount = parseInt(addAmount);
    if (isNaN(amount) || amount <= 0) return;

    try {
      await updateDoc(doc(db, 'users', user.id), {
        balance: increment(amount)
      });
      setAddAmount('');
      setShowWallet(false);
      alert("Fonds ajoutés avec succès !");
    } catch (e) {
      console.error("Add funds error", e);
      alert("Erreur lors de l'ajout des fonds.");
    }
  };

  const filteredMarkets = markets.filter(m => 
    m.name.toLowerCase().includes(marketSearch.toLowerCase()) || 
    m.location.toLowerCase().includes(marketSearch.toLowerCase())
  );

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const firebaseUser = userCredential.user;
        
        const welcomeCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const userData = {
          email,
          name,
          role,
          balance: 0,
          welcome_code: welcomeCode,
          shop_name: shopName,
          seller_type: sellerType,
          phone,
          bank_info: bankInfo,
          lat: sellerLat,
          lng: sellerLng,
          created_at: serverTimestamp(),
          theme: 'default'
        };
        
        await setDoc(doc(db, 'users', firebaseUser.uid), userData);
        setUser({ id: firebaseUser.uid, ...userData } as User);
        setShowWelcome(welcomeCode);
      }
    } catch (error: any) {
      console.error("Auth error", error);
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setView('auth');
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.id), { 
        name, 
        shop_name: shopName, 
        seller_type: sellerType, 
        phone, 
        bank_info: bankInfo, 
        theme 
      });
      setShowProfileSettings(false);
      alert("Profil mis à jour avec succès !");
    } catch (e) {
      console.error("Profile update error", e);
      alert("Erreur lors de la mise à jour du profil");
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    try {
      const firebaseUser = auth.currentUser;
      if (firebaseUser) {
        await deleteDoc(doc(db, 'users', user.id));
        await deleteUser(firebaseUser);
        handleLogout();
        alert("Votre compte a été supprimé.");
      }
    } catch (e) {
      console.error("Delete account error", e);
      alert("Erreur lors de la suppression du compte. Veuillez vous reconnecter et réessayer.");
    }
    setShowDeleteConfirm(false);
  };


  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    try {
      const itemData = {
        ...newItem,
        category: newItem.category || categories[0],
        market_id: newItem.market_id || '',
        seller_id: user.id,
        seller_name: user.shop_name || user.name,
        updated_at: serverTimestamp()
      };

      if (editingItem) {
        await updateDoc(doc(db, 'items', editingItem.id), itemData);
      } else {
        await addDoc(collection(db, 'items'), {
          ...itemData,
          created_at: serverTimestamp()
        });
      }
      setShowItemForm(false);
      setEditingItem(null);
      setNewItem({ name: '', description: '', price: 0, photo: '', category: '', market_id: '' });
      alert(editingItem ? "Article modifié avec succès !" : "Article ajouté avec succès !");
    } catch (e) {
      console.error("Save item error", e);
      alert("Erreur lors de l'enregistrement de l'article.");
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm("Supprimer cet article ?")) return;
    try {
      await deleteDoc(doc(db, 'items', id));
    } catch (e) {
      console.error("Delete item error", e);
      alert("Erreur lors de la suppression.");
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen">Chargement...</div>;

  return (
    <div className={`min-h-screen font-sans selection:bg-blue-100 selection:text-blue-900 theme-${theme}`}>
      {/* Debug Marker */}
      <div className="sr-only">Net Market Active</div>
      {/* Navigation */}
      {user && (
        <nav className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50 overlay-content">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16 items-center">
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2"
              >
                <div className="bg-slate-900 p-1.5 rounded-xl shadow-lg shadow-slate-200">
                  <Store className="w-6 h-6 text-white" />
                </div>
                <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-blue-700">
                  Net Market
                </span>
              </motion.div>
              <div className="flex items-center gap-2 sm:gap-3 md:gap-6">
                {user.role === 'both' && (
                  <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setView(view === 'buyer' ? 'seller' : 'buyer')}
                    className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-[9px] sm:text-sm hover:bg-slate-200 transition-all border border-slate-200"
                  >
                    <ArrowRight className="w-3 h-3 sm:w-4 h-4" />
                    <span className="hidden xs:inline">{view === 'buyer' ? 'Vendeur' : 'Acheteur'}</span>
                  </motion.button>
                )}
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowWallet(true)}
                  className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 font-bold text-[9px] sm:text-sm hover:bg-blue-100 transition-all border border-blue-200"
                >
                  <ShoppingBag className="w-3 h-3 sm:w-4 h-4" />
                  <span>{(user.balance || 0).toLocaleString()} <span className="hidden xs:inline">FCFA</span></span>
                </motion.button>
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowCart(true)}
                  className="relative p-1.5 sm:p-2 text-slate-500 hover:text-blue-600 transition-colors"
                >
                  <ShoppingCart className="w-5 h-5 sm:w-6 h-6" />
                  {cartItems.length > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-blue-600 text-white text-[8px] sm:text-[10px] font-bold w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center ring-2 ring-white">
                      {cartItems.reduce((sum, i) => sum + i.quantity, 0)}
                    </span>
                  )}
                </motion.button>
                <div 
                  onClick={() => {
                    setName(user.name);
                    setShopName(user.shop_name || '');
                    setSellerType(user.seller_type || 'boutique');
                    setPhone(user.phone || '');
                    setBankInfo(user.bank_info || '');
                    setShowProfileSettings(true);
                  }}
                  className="hidden md:flex items-center gap-3 pl-4 border-l border-slate-200 cursor-pointer hover:bg-slate-50 p-1 rounded-xl transition-all"
                >
                  <div className="text-right">
                    <div className="text-sm font-bold text-slate-900">{user.name}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {view === 'seller' ? 'Espace Vendeur' : 'Espace Acheteur'}
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 border border-slate-200">
                    <Settings className="w-5 h-5" />
                  </div>
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                  title="Déconnexion"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </nav>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence>
          {view === 'auth' && (
            <motion.div 
              key="auth"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-md mx-auto mt-4 sm:mt-12"
            >
              <div className="bg-white p-6 sm:p-10 rounded-[1.5rem] sm:rounded-[2rem] shadow-2xl shadow-slate-100 border border-slate-100">
                <div className="text-center mb-10">
                  <div className="w-20 h-20 bg-slate-900 rounded-3xl shadow-xl shadow-slate-200 flex items-center justify-center mx-auto mb-6 transform rotate-3">
                    <Store className="w-10 h-10 text-white" />
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">{authMode === 'login' ? 'Ravi de vous voir !' : 'Bienvenue'}</h1>
                  <p className="text-slate-400 font-medium mt-2 text-sm sm:text-base">Accédez à votre marché local préféré</p>
                </div>

                <form onSubmit={handleAuth} className="space-y-5">
                  {authMode === 'register' && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Nom complet</label>
                        <input 
                          type="text" 
                          required 
                          placeholder="Jean Dupont"
                          className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all bg-slate-50/50"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </div>
                      {(role === 'seller' || role === 'both') && (
                        <>
                          <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 ml-1">Type de vendeur</label>
                            <div className="flex gap-6 mb-4 ml-1">
                              <label className="flex items-center gap-2 cursor-pointer group">
                                <div className="relative flex items-center justify-center">
                                  <input 
                                    type="radio" 
                                    name="sellerType"
                                    className="peer appearance-none w-5 h-5 border-2 border-slate-200 rounded-full checked:border-blue-500 transition-all"
                                    checked={sellerType === 'boutique'}
                                    onChange={() => {
                                      setSellerType('boutique');
                                      setShopName('');
                                    }}
                                  />
                                  <div className="absolute w-2.5 h-2.5 bg-blue-500 rounded-full opacity-0 peer-checked:opacity-100 transition-all" />
                                </div>
                                <span className="text-sm font-bold text-slate-600 group-hover:text-blue-600 transition-colors">Boutique</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer group">
                                <div className="relative flex items-center justify-center">
                                  <input 
                                    type="radio" 
                                    name="sellerType"
                                    className="peer appearance-none w-5 h-5 border-2 border-slate-200 rounded-full checked:border-blue-500 transition-all"
                                    checked={sellerType === 'market'}
                                    onChange={() => {
                                      setSellerType('market');
                                      setShopName('');
                                    }}
                                  />
                                  <div className="absolute w-2.5 h-2.5 bg-blue-500 rounded-full opacity-0 peer-checked:opacity-100 transition-all" />
                                </div>
                                <span className="text-sm font-bold text-slate-600 group-hover:text-blue-600 transition-colors">Marché</span>
                              </label>
                            </div>
                          </div>
                          
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            key={sellerType}
                          >
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">
                              {sellerType === 'boutique' ? 'Nom de la boutique' : 'Nom du marché'}
                            </label>
                            <input 
                              type="text" 
                              required 
                              placeholder={sellerType === 'boutique' ? "Ma Boutique" : "Nom du Marché"}
                              className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all bg-slate-50/50"
                              value={shopName}
                              onChange={(e) => setShopName(e.target.value)}
                            />
                          </motion.div>
                          
                          <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Numéro de téléphone</label>
                            <input 
                              type="tel" 
                              required 
                              placeholder="+229 00 00 00 00"
                              className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all bg-slate-50/50"
                              value={phone}
                              onChange={(e) => setPhone(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Coordonnées bancaires / Mobile Money</label>
                            <input 
                              type="text" 
                              required 
                              placeholder="RIB ou Numéro MoMo/Flooz"
                              className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all bg-slate-50/50"
                              value={bankInfo}
                              onChange={(e) => setBankInfo(e.target.value)}
                            />
                          </div>
                          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                            <div className="flex items-center justify-between mb-2 ml-1">
                              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Localisation de vente (Product Location)</label>
                              <button 
                                type="button"
                                onClick={() => {
                                  if ("geolocation" in navigator) {
                                    navigator.geolocation.getCurrentPosition((pos) => {
                                      setSellerLat(pos.coords.latitude);
                                      setSellerLng(pos.coords.longitude);
                                    });
                                  }
                                }}
                                className="text-[10px] font-black text-blue-600 hover:underline"
                              >
                                Utiliser mon GPS
                              </button>
                            </div>
                            <p className="text-[10px] text-slate-400 mb-4">Cliquez sur la carte pour définir votre emplacement exact</p>
                            <div className="h-48 rounded-2xl overflow-hidden border border-slate-200">
                              <Map 
                                markets={markets} 
                                onSelectMarket={() => {}} 
                                selectedMarketId={null}
                                onMapClick={(lat, lng) => {
                                  setSellerLat(lat);
                                  setSellerLng(lng);
                                }}
                                sellerLocation={sellerLat && sellerLng ? { lat: sellerLat, lng: sellerLng } : null}
                                userLocation={userLocation}
                              />
                            </div>
                            {sellerLat && (
                              <div className="mt-3 flex items-center gap-2 text-blue-600 font-bold text-[10px]">
                                <CheckCircle2 className="w-3 h-3" /> Position enregistrée
                              </div>
                            )}
                          </div>
                        </>
                      )}
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Type de compte</label>
                        <div className="grid grid-cols-3 gap-3">
                          <button 
                            type="button"
                            onClick={() => setRole('buyer')}
                            className={`py-3 rounded-2xl border-2 font-bold transition-all text-xs ${role === 'buyer' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
                          >
                            Acheteur
                          </button>
                          <button 
                            type="button"
                            onClick={() => setRole('seller')}
                            className={`py-3 rounded-2xl border-2 font-bold transition-all text-xs ${role === 'seller' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
                          >
                            Vendeur
                          </button>
                          <button 
                            type="button"
                            onClick={() => setRole('both')}
                            className={`py-3 rounded-2xl border-2 font-bold transition-all text-xs ${role === 'both' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
                          >
                            Les deux
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Email</label>
                        <input 
                          type="email" 
                          required 
                          placeholder="votre@email.com"
                          className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all bg-slate-50/50"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Mot de passe</label>
                        <input 
                          type="password" 
                          required 
                          placeholder="••••••••"
                          className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all bg-slate-50/50"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                  </div>
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 mt-4"
                  >
                    {authMode === 'login' ? 'Se connecter' : 'Créer mon compte'}
                  </motion.button>
                </form>

                <div className="mt-8 text-center">
                  <button 
                    onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                    className="text-sm text-blue-600 font-bold hover:text-blue-700 transition-colors"
                  >
                    {authMode === 'login' ? 'Nouveau ici ? Rejoignez-nous' : 'Déjà membre ? Connectez-vous'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'buyer' && (
            <motion.div 
              key="buyer"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-10 overlay-content"
            >
              {/* Global Search Bar */}
              <div className="max-w-2xl mx-auto px-2 sm:px-0">
                <form onSubmit={handleGlobalSearch} className="relative group">
                  <div className="absolute inset-0 bg-blue-600/10 blur-2xl group-focus-within:bg-blue-600/20 transition-all rounded-[2.5rem]" />
                  <div className="relative flex flex-col sm:flex-row items-stretch sm:items-center bg-white rounded-[1.5rem] sm:rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden p-2 gap-2">
                    <div className="flex items-center flex-1 px-4 sm:px-0">
                      <Search className="w-5 h-5 sm:w-6 h-6 text-slate-400 sm:ml-6" />
                      <input 
                        type="text" 
                        placeholder="Que cherchez-vous ?"
                        className="flex-1 px-3 sm:px-6 py-3 sm:py-4 outline-none text-base sm:text-lg font-bold text-slate-900 placeholder:text-slate-300"
                        value={globalSearch}
                        onChange={(e) => setGlobalSearch(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-2 pr-0 sm:pr-2">
                      <button 
                        type="button"
                        onClick={saveCurrentLocation}
                        className={`flex-1 sm:flex-none p-3 sm:p-4 rounded-xl sm:rounded-2xl transition-all flex items-center justify-center ${userLocation ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                        title="Ma position actuelle"
                      >
                        <Navigation className={`w-4 h-4 sm:w-5 sm:h-5 ${savingLocation ? 'animate-spin' : ''}`} />
                        <span className="sm:hidden ml-2 font-bold text-xs">Ma position</span>
                      </button>
                      <button 
                        type="submit"
                        className="flex-[2] sm:flex-none bg-slate-900 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-black hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 uppercase tracking-widest text-[10px] sm:text-xs"
                      >
                        Chercher
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
                <button 
                  onClick={() => setBuyerStep('map')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${buyerStep === 'map' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-white text-slate-400 hover:text-slate-600 border border-slate-100'}`}
                >
                  <MapPin className="w-4 h-4" />
                  Marchés
                </button>
                <button 
                  onClick={() => setBuyerStep('nearby')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${buyerStep === 'nearby' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-white text-slate-400 hover:text-slate-600 border border-slate-100'}`}
                >
                  <Navigation className="w-4 h-4" />
                  À proximité
                </button>
                <button 
                  onClick={() => {
                    setBuyerStep('boutiques');
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${buyerStep === 'boutiques' ? 'bg-orange-600 text-white shadow-lg shadow-orange-100' : 'bg-white text-slate-400 hover:text-slate-600 border border-slate-100'}`}
                >
                  <Store className="w-4 h-4" />
                  Boutiques
                </button>
                <button 
                  onClick={() => {
                    setBuyerStep('messages');
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all whitespace-nowrap relative ${buyerStep === 'messages' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-white text-slate-400 hover:text-slate-600 border border-slate-100'}`}
                >
                  <MessageSquare className="w-4 h-4" />
                  Messages
                  {unreadCount > 0 && (
                    <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white font-black">
                      {unreadCount}
                    </span>
                  )}
                </button>
                <button 
                  onClick={() => setBuyerStep('orders')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${buyerStep === 'orders' ? 'bg-purple-600 text-white shadow-lg shadow-purple-100' : 'bg-white text-slate-400 hover:text-slate-600 border border-slate-100'}`}
                >
                  <ClipboardList className="w-4 h-4" />
                  Mes Commandes
                </button>
                {selectedMarket && (
                  <>
                    <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                    <button 
                      onClick={() => setBuyerStep('sellers')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${buyerStep === 'sellers' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-white text-slate-400 hover:text-slate-600 border border-slate-100'}`}
                    >
                      <User className="w-4 h-4" />
                      {selectedMarket.name}
                    </button>
                  </>
                )}
                {selectedSeller && (
                  <>
                    <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                    <button 
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-sm shadow-lg shadow-blue-100 whitespace-nowrap"
                    >
                      <ShoppingBag className="w-4 h-4" />
                      {selectedSeller.name}
                    </button>
                  </>
                )}
              </div>

              {buyerStep === 'search' && (
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => {
                        setGlobalSearch('');
                        setBuyerStep('map');
                      }}
                      className="p-3 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </button>
                    <div>
                      <h2 className="text-3xl font-black tracking-tight text-slate-900">Résultats pour "{globalSearch}"</h2>
                      <p className="text-slate-400 font-medium">{items.length} articles trouvés dans tout le pays</p>
                    </div>
                  </div>

                  {items.length === 0 ? (
                    <div className="bg-white p-20 rounded-[3rem] text-center border border-slate-100 shadow-xl shadow-slate-200/50">
                      <div className="w-24 h-24 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                        <Search className="w-10 h-10 text-slate-200" />
                      </div>
                      <h3 className="text-2xl font-black text-slate-900 mb-2">Aucun résultat</h3>
                      <p className="text-slate-400 font-medium">Essayez avec un autre mot-clé ou explorez la carte.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-8">
                      {items.map((item) => (
                        <motion.div 
                          key={item.id}
                          whileHover={{ y: -10 }}
                          className="bg-white rounded-[1.5rem] sm:rounded-[2.5rem] overflow-hidden shadow-xl shadow-slate-200/50 border border-slate-100 group transition-all"
                        >
                          <div className="h-64 relative overflow-hidden">
                            <img 
                              src={item.photo || `https://picsum.photos/seed/${item.name}/800/600`} 
                              alt={item.name}
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-4 py-2 rounded-2xl font-black text-blue-600 shadow-lg">
                              {item.price.toLocaleString()} FCFA
                            </div>
                            <div className="absolute top-4 left-4 bg-blue-600 text-white px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg">
                              {item.category}
                            </div>
                          </div>
                          <div className="p-8">
                            <div className="flex items-center gap-2 text-blue-600 font-black text-[10px] uppercase tracking-widest mb-3">
                              <MapPin className="w-3 h-3" /> {item.market_name}
                            </div>
                            <h3 className="text-2xl font-black text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">{item.name}</h3>
                            <p className="text-slate-400 text-sm font-medium line-clamp-2 mb-6">{item.description}</p>
                            
                            <div className="flex items-center justify-between pt-6 border-t border-slate-50">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 font-black">
                                  {item.seller_name?.[0]}
                                </div>
                                <div>
                                  <div className="text-xs font-black text-slate-900">{item.seller_name}</div>
                                  <div className="text-[10px] text-slate-400 font-bold">Vendeur</div>
                                </div>
                              </div>
                              <div className="flex flex-col gap-2">
                                <button 
                                  onClick={() => {
                                    const market = markets.find(m => m.id === item.market_id);
                                    if (market) {
                                      setSelectedMarket(market);
                                      // Find seller info
                                      fetch(`${API_BASE}/markets/${market.id}/sellers`)
                                        .then(res => res.json())
                                        .then(data => {
                                          const seller = data.find((s: any) => s.id === item.seller_id);
                                          if (seller) {
                                            setSelectedSeller(seller);
                                            setBuyerStep('items');
                                          }
                                        });
                                    }
                                  }}
                                  className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold text-xs hover:bg-blue-600 transition-all shadow-lg"
                                >
                                  Commander
                                </button>
                                <button 
                                  onClick={() => {
                                    const market = markets.find(m => m.id === item.market_id);
                                    if (market) {
                                      setSelectedMarket(market);
                                      setBuyerStep('map');
                                      setIsExpandedMap(true);
                                    }
                                  }}
                                  className="text-[10px] font-black text-blue-600 hover:text-blue-700 transition-colors text-center"
                                >
                                  Voir sur la carte
                                </button>
                                <button 
                                  onClick={() => {
                                    const market = markets.find(m => m.id === item.market_id);
                                    if (market) {
                                      setSelectedMarket(market);
                                      setActiveChat({
                                        id: item.seller_id,
                                        name: item.seller_name,
                                        shop_name: item.seller_name
                                      });
                                    }
                                  }}
                                  className="text-[10px] font-black text-emerald-600 hover:text-emerald-700 transition-colors text-center flex items-center justify-center gap-1"
                                >
                                  <MessageSquare className="w-3 h-3" /> Chat avec vendeur
                                </button>
                                <a 
                                  href={`tel:${STANDARD_PHONE}`}
                                  className="text-[10px] font-black text-slate-400 hover:text-blue-600 transition-colors text-center"
                                >
                                  Standard
                                </a>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {buyerStep === 'nearby' && (
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setBuyerStep('map')}
                      className="p-3 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </button>
                    <div>
                      <h2 className="text-3xl font-black tracking-tight text-slate-900">Marchés à moins de 5km</h2>
                      <p className="text-slate-400 font-medium">Découvrez les marchés les plus proches de votre position actuelle</p>
                    </div>
                  </div>

                  {nearbyMarkets5km.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                      {nearbyMarkets5km.map(market => (
                        <motion.button
                          key={market.id}
                          whileHover={{ y: -5 }}
                          onClick={() => {
                            setSelectedMarket(market);
                            setBuyerStep('sellers');
                          }}
                          className="bg-white p-6 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col items-start text-left group relative overflow-hidden"
                        >
                          <div className="absolute top-0 right-0 p-4 opacity-5">
                            {market.type === 'boutique' ? <Store className="w-20 h-20" /> : <MapPin className="w-20 h-20" />}
                          </div>
                          
                          <div className={`p-4 rounded-2xl mb-6 ${market.type === 'boutique' ? 'bg-slate-900 text-white' : 'bg-blue-50 text-blue-600'}`}>
                            {market.type === 'boutique' ? <Store className="w-6 h-6" /> : <MapPin className="w-6 h-6" />}
                          </div>

                          <div className="space-y-2 relative z-10">
                            <div className="flex items-center gap-2">
                              <h3 className="text-2xl font-black text-slate-900 group-hover:text-blue-600 transition-colors">
                                {market.name}
                              </h3>
                              {market.type === 'boutique' && (
                                <span className="text-[10px] font-black bg-blue-600 text-white px-2 py-1 rounded-lg">BOUTIQUE</span>
                              )}
                            </div>
                            <p className="text-slate-400 font-medium">{market.location}</p>
                          </div>

                          <div className="mt-8 flex items-center justify-between w-full relative z-10">
                            <div className="flex items-center gap-2 text-blue-600 font-black">
                              <Navigation className="w-4 h-4" />
                              <span>{market.distance.toFixed(1)} km</span>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all">
                              <ChevronRight className="w-5 h-5" />
                            </div>
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-white p-12 rounded-[3rem] border border-slate-100 text-center space-y-4">
                      <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
                        <MapPin className="w-10 h-10" />
                      </div>
                      <h3 className="text-xl font-black text-slate-900">Aucun marché à proximité</h3>
                      <p className="text-slate-400 max-w-md mx-auto">Nous n'avons trouvé aucun marché dans un rayon de 5km. Essayez de vous déplacer ou de consulter la liste complète.</p>
                      <button 
                        onClick={() => setBuyerStep('map')}
                        className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-700 transition-all"
                      >
                        Retour à la carte
                      </button>
                    </div>
                  )}
                </div>
              )}

              {buyerStep === 'map' && (
                <div className="space-y-10">
                    {userLocation && nearbyMarkets.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Navigation className="w-5 h-5 text-blue-600" />
                            <h3 className="text-xl font-black text-slate-900">Marchés à proximité</h3>
                          </div>
                          <button 
                            onClick={() => setBuyerStep('nearby')}
                            className="text-blue-600 font-bold text-sm hover:underline flex items-center gap-1"
                          >
                            Voir tout <ArrowRight className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {nearbyMarkets.map(market => (
                            <motion.button
                              key={market.id}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => {
                                setSelectedMarket(market);
                                setBuyerStep('sellers');
                              }}
                              className="bg-white p-6 rounded-3xl border border-slate-100 shadow-lg shadow-slate-100/50 flex items-center justify-between group relative overflow-hidden"
                            >
                              <div className="absolute top-0 right-0 p-2 opacity-5">
                                {market.type === 'boutique' ? <Store className="w-12 h-12" /> : <MapPin className="w-12 h-12" />}
                              </div>
                              <div className="text-left relative z-10">
                                <div className="flex items-center gap-2">
                                  <div className={`p-2 rounded-xl ${market.type === 'boutique' ? 'bg-slate-900 text-white' : 'bg-blue-50 text-blue-600'}`}>
                                    {market.type === 'boutique' ? <Store className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
                                  </div>
                                  <div>
                                    <div className="font-black text-slate-900 group-hover:text-blue-600 transition-colors flex items-center gap-2">
                                      {market.name}
                                      {market.type === 'boutique' && <span className="text-[8px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded">BOUTIQUE</span>}
                                    </div>
                                    <div className="text-xs text-slate-400 font-medium">{market.location}</div>
                                  </div>
                                </div>
                              </div>
                              <div className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl text-[10px] font-black relative z-10">
                                {market.distance.toFixed(1)} km
                              </div>
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="w-full md:w-auto">
                        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">Trouver un marché</h2>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2">
                          <p className="text-slate-400 font-medium text-xs sm:text-sm w-full sm:w-auto">Sélectionnez un marché proche de chez vous</p>
                          <div className="flex flex-wrap gap-2">
                            <button 
                              onClick={() => {
                                saveCurrentLocation();
                                setIsExpandedMap(true);
                              }}
                              disabled={savingLocation}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] sm:text-[10px] font-black transition-all ${
                                savingLocation 
                                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                                  : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                              }`}
                            >
                              <MapPin className="w-3 h-3" />
                              {savingLocation ? 'Enregistrement...' : 'Enregistrer ma position'}
                            </button>
                            <button 
                              onClick={() => {
                                toggleTracking();
                                if (!isTracking) setIsExpandedMap(true);
                              }}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] sm:text-[10px] font-black transition-all ${
                                isTracking 
                                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-100' 
                                  : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                              }`}
                            >
                              <Navigation className={`w-3 h-3 ${isTracking ? 'animate-pulse' : ''}`} />
                              {isTracking ? 'Suivi actif' : 'Suivre ma position'}
                            </button>
                            <button 
                              onClick={() => {
                                setMarketSearch('');
                                setIsExpandedMap(true);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] sm:text-[10px] font-black bg-slate-50 text-slate-400 hover:bg-slate-100 transition-all"
                            >
                              <Navigation className="w-3 h-3" />
                              Marchés proches
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-1 max-w-xl">
                        {sellerLat && (
                          <button 
                            onClick={() => {
                              setSellerLat(null);
                              setSellerLng(null);
                            }}
                            className="px-4 py-3.5 rounded-2xl bg-blue-50 text-blue-600 font-bold text-xs border border-blue-100 flex items-center gap-2 whitespace-nowrap"
                          >
                            <X className="w-4 h-4" /> Effacer filtre vendeur
                          </button>
                        )}
                        <div className="relative flex-1">
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input 
                            type="text" 
                            placeholder="Filtrer par nom ou localisation..."
                            className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none bg-white transition-all"
                            value={marketSearch}
                            onChange={(e) => {
                              const val = e.target.value;
                              setMarketSearch(val);
                              if (val.toLowerCase().includes('marchés les plus proches')) {
                                setIsExpandedMap(true);
                              } else if (val === '') {
                                setIsExpandedMap(false);
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  <div 
                    onClick={() => !isExpandedMap && setIsExpandedMap(true)}
                    className={`bg-white p-1 sm:p-2 rounded-[2rem] sm:rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden transition-all duration-500 cursor-pointer ${isExpandedMap ? 'h-[500px] sm:h-[800px]' : 'h-[300px] sm:h-[500px]'}`}
                  >
                    <Map 
                      markets={filteredMarkets} 
                      onSelectMarket={(m) => {
                        setSelectedMarket(m);
                      }}
                      onViewSellers={(m) => {
                        setSelectedMarket(m);
                        setBuyerStep('sellers');
                        setIsExpandedMap(false);
                      }}
                      selectedMarketId={selectedMarket?.id || null}
                      sellerLocation={sellerLat && sellerLng ? { lat: sellerLat, lng: sellerLng } : null}
                      userLocation={userLocation}
                      isExpanded={isExpandedMap}
                      onToggleExpand={() => setIsExpandedMap(false)}
                      showItinerary={isExpandedMap && !!selectedMarket}
                      highlightedMarketIds={highlightedMarketIds as string[]}
                    />
                  </div>
                </div>
              )}

              {buyerStep === 'boutiques' && (
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setBuyerStep('map')}
                      className="p-3 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </button>
                    <div>
                      <h2 className="text-3xl font-black tracking-tight text-slate-900">Boutiques & Vendeurs</h2>
                      <p className="text-slate-400 font-medium">Découvrez les vendeurs individuels et leurs produits</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    {boutiques.map(boutique => {
                      const distance = userLocation ? calculateDistance(userLocation.lat, userLocation.lng, boutique.lat, boutique.lng) : null;
                      return (
                        <motion.div
                          key={boutique.id}
                          whileHover={{ y: -5 }}
                          className="bg-white p-6 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col items-start text-left group relative overflow-hidden"
                        >
                          <div className="absolute top-0 right-0 p-4 opacity-5">
                            <Store className="w-20 h-20" />
                          </div>
                          
                          <div className="p-4 rounded-2xl mb-6 bg-orange-50 text-orange-600">
                            <Store className="w-6 h-6" />
                          </div>

                          <div className="space-y-2 relative z-10 w-full">
                            <h3 className="text-2xl font-black text-slate-900 group-hover:text-orange-600 transition-colors">
                              {boutique.shop_name || boutique.name}
                            </h3>
                            <div className="flex items-center gap-2 text-slate-400 font-medium text-sm">
                              <MapPin className="w-3 h-3" /> {boutique.market_name}
                            </div>
                            <div className="mt-4 p-4 bg-slate-50 rounded-2xl">
                              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Produits phares</div>
                              <div className="text-xs text-slate-600 font-medium line-clamp-2">
                                {boutique.products || "Aucun produit listé"}
                              </div>
                            </div>
                          </div>

                          <div className="mt-8 flex items-center justify-between w-full relative z-10">
                            <div className="flex items-center gap-2 text-orange-600 font-black">
                              <Navigation className="w-4 h-4" />
                              <span>{distance ? `${distance.toFixed(1)} km` : 'Distance inconnue'}</span>
                            </div>
                            <button 
                              onClick={() => {
                                setSelectedSeller(boutique);
                                setBuyerStep('items');
                              }}
                              className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold text-xs hover:bg-orange-600 transition-all shadow-lg"
                            >
                              Visiter
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}

              {buyerStep === 'sellers' && selectedMarket && (
                <div className="space-y-8">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => setBuyerStep('map')}
                        className="p-3 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
                      >
                        <ChevronLeft className="w-6 h-6" />
                      </button>
                      <div>
                        <h2 className="text-3xl font-black tracking-tight text-slate-900">Vendeurs à {selectedMarket.name}</h2>
                        <p className="text-slate-400 font-medium">Découvrez les commerçants locaux et leur emplacement</p>
                      </div>
                    </div>
                    {selectedSeller && (
                      <button 
                        onClick={() => setSelectedSeller(null)}
                        className="px-6 py-3 rounded-2xl bg-blue-50 text-blue-600 font-bold text-sm border border-blue-100 flex items-center gap-2"
                      >
                        <X className="w-4 h-4" /> Effacer itinéraire
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    <div className="md:col-span-1 lg:col-span-2 space-y-6">
                      <div className="bg-white p-2 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden h-[300px] sm:h-[400px] md:h-[500px]">
                        <Map 
                          markets={[selectedMarket]} 
                          sellers={sellers}
                          onSelectMarket={() => {}} 
                          onSelectSeller={(s) => setSelectedSeller(s)}
                          selectedMarketId={selectedMarket.id}
                          selectedSellerId={selectedSeller?.id || null}
                          userLocation={userLocation}
                          showItinerary={!!selectedSeller}
                        />
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        {sellers.map((seller) => (
                          <motion.div 
                            key={seller.id}
                            whileHover={{ y: -8 }}
                            onClick={() => setSelectedSeller(seller)}
                            className={`bg-white p-8 rounded-[2rem] shadow-xl shadow-slate-200/50 border transition-all cursor-pointer ${
                              selectedSeller?.id === seller.id ? 'border-blue-500 ring-4 ring-blue-50' : 'border-slate-100'
                            }`}
                          >
                            <div className="flex items-center gap-4 mb-6">
                              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center font-black text-2xl transition-all duration-300 ${
                                selectedSeller?.id === seller.id ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600'
                              }`}>
                                {seller.name[0]}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="text-xl font-bold text-slate-900">{seller.shop_name || seller.name}</h3>
                                </div>
                                <p className="text-slate-400 text-sm font-medium">{seller.shop_name ? `Par ${seller.name}` : 'Vendeur vérifié'}</p>
                              </div>
                            </div>
                            <div className="flex flex-col gap-3">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedSeller(seller);
                                  setBuyerStep('items');
                                }}
                                className="w-full bg-blue-600 text-white py-3.5 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                              >
                                Voir articles
                              </button>
                              <div className="flex gap-3">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveChat(seller);
                                  }}
                                  className="flex-1 p-3.5 rounded-2xl bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-all border border-slate-100 flex items-center justify-center gap-2 font-bold text-xs"
                                >
                                  <MessageSquare className="w-5 h-5" /> Chat
                                </button>
                                <a 
                                  href={`tel:${seller.phone || STANDARD_PHONE}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex-1 bg-slate-900 text-white p-3.5 rounded-2xl font-bold text-center text-xs hover:bg-blue-600 transition-all flex items-center justify-center gap-2"
                                >
                                  <Info className="w-4 h-4" /> Appel
                                </a>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100">
                        <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
                          <Info className="w-5 h-5 text-blue-600" /> À propos du marché
                        </h3>
                        <div className="space-y-4">
                          <div className="p-4 bg-slate-50 rounded-2xl">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Localisation</div>
                            <div className="font-bold text-slate-900">{selectedMarket.location}</div>
                          </div>
                          <div className="p-4 bg-slate-50 rounded-2xl">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Vendeurs actifs</div>
                            <div className="font-bold text-slate-900">{sellers.length} commerçants</div>
                          </div>
                        </div>
                      </div>
                      
                      {selectedSeller && (
                        <motion.div 
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-2xl shadow-slate-200"
                        >
                          <h3 className="text-xl font-black mb-6 flex items-center gap-2">
                            <Navigation className="w-5 h-5 text-blue-400" /> Navigation
                          </h3>
                          <p className="text-slate-400 text-sm mb-8">Suivez l'itinéraire sur la carte pour rejoindre {selectedSeller.shop_name || selectedSeller.name}.</p>
                          <button 
                            onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&origin=${userLocation?.lat},${userLocation?.lng}&destination=${selectedSeller.lat},${selectedSeller.lng}&travelmode=walking`, '_blank')}
                            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                          >
                            <MapIcon className="w-5 h-5" /> Google Maps
                          </button>
                        </motion.div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {buyerStep === 'items' && selectedSeller && selectedMarket && (
                <div className="space-y-8">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-6">
                      <button 
                        onClick={() => setBuyerStep('sellers')}
                        className="p-3 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
                      >
                        <ChevronLeft className="w-6 h-6" />
                      </button>
                      <div className="w-20 h-20 rounded-3xl bg-slate-900 shadow-xl shadow-slate-200 flex items-center justify-center text-white font-black text-3xl transform -rotate-3">
                        {selectedSeller.name[0]}
                      </div>
                      <div>
                        <h2 className="text-3xl font-black tracking-tight text-slate-900">{selectedSeller.name}</h2>
                        <p className="text-slate-400 font-medium">Articles en vente à {selectedMarket.name}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setActiveChat(selectedSeller)}
                      className="flex items-center gap-2 bg-white border border-slate-200 px-6 py-3.5 rounded-2xl font-bold text-blue-600 hover:bg-blue-50 transition-all shadow-lg shadow-slate-100"
                    >
                      <MessageSquare className="w-5 h-5" /> Négocier le prix
                    </button>
                  </div>

                  {/* Filters */}
                  <div className="bg-white p-4 rounded-2xl shadow-lg shadow-slate-100 border border-slate-100 flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                      <select 
                        className="w-full px-4 py-3 rounded-xl border border-slate-100 focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none bg-slate-50/50 font-bold text-slate-600 text-sm"
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                      >
                        <option value="">Toutes les catégories</option>
                        {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center justify-between sm:justify-start gap-2 px-2">
                      <div className="relative flex-1 sm:w-28">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-400">MIN</span>
                        <input 
                          type="number" 
                          placeholder="0"
                          className="w-full pl-10 pr-2 py-2.5 rounded-xl border border-slate-100 focus:ring-2 focus:ring-blue-100 outline-none text-xs"
                          value={minPrice}
                          onChange={(e) => setMinPrice(e.target.value)}
                        />
                      </div>
                      <div className="relative flex-1 sm:w-28">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-400">MAX</span>
                        <input 
                          type="number" 
                          placeholder="∞"
                          className="w-full pl-10 pr-2 py-2.5 rounded-xl border border-slate-100 focus:ring-2 focus:ring-blue-100 outline-none text-xs"
                          value={maxPrice}
                          onChange={(e) => setMaxPrice(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Items Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                    {items.length > 0 ? items.map(item => (
                      <motion.div 
                        layout
                        key={item.id}
                        whileHover={{ y: -10 }}
                        className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden group"
                      >
                        <div className="aspect-square bg-slate-100 relative overflow-hidden">
                          <img 
                            src={item.photo || `https://picsum.photos/seed/${item.id}/400/400`} 
                            alt={item.name}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-4 py-2 rounded-2xl font-black text-blue-600 shadow-lg">
                            {item.price.toLocaleString()} FCFA
                          </div>
                          <div className="absolute top-4 left-4 bg-blue-600 text-white px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg">
                            {item.category}
                          </div>
                        </div>
                        <div className="p-8">
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="text-xl font-black text-slate-900">{item.name}</h3>
                          </div>
                          <p className="text-slate-400 text-sm font-medium line-clamp-2 mb-6 h-10">{item.description}</p>
                          <button 
                            onClick={() => addToCart(item)}
                            className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-blue-600 transition-all shadow-lg shadow-slate-100 flex items-center justify-center gap-2"
                          >
                            <Plus className="w-5 h-5" /> Ajouter au panier
                          </button>
                          <a 
                            href={`tel:${STANDARD_PHONE}`}
                            className="w-full mt-3 bg-slate-50 text-slate-400 py-3 rounded-2xl font-bold text-center text-[10px] hover:bg-blue-50 hover:text-blue-600 transition-all flex items-center justify-center gap-2 border border-slate-100"
                          >
                            <Info className="w-3 h-3" /> Commander via Standard
                          </a>
                        </div>
                      </motion.div>
                    )) : (
                      <div className="col-span-full py-20 text-center text-slate-400">
                        <Package className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        <p>Aucun article trouvé pour ce vendeur.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {buyerStep === 'messages' && (
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setBuyerStep('map')}
                      className="p-3 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </button>
                    <div>
                      <h2 className="text-3xl font-black tracking-tight text-slate-900">Mes Messages</h2>
                      <p className="text-slate-400 font-medium">Discutez avec les vendeurs et acheteurs</p>
                    </div>
                  </div>

                  {conversations.length === 0 ? (
                    <div className="bg-white p-20 rounded-[3rem] text-center border border-slate-100 shadow-xl shadow-slate-200/50">
                      <div className="w-24 h-24 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                        <MessageSquare className="w-10 h-10 text-slate-200" />
                      </div>
                      <h3 className="text-2xl font-black text-slate-900 mb-2">Aucun message</h3>
                      <p className="text-slate-400 font-medium">Commencez une discussion avec un vendeur sur la carte.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {conversations.map((conv, idx) => (
                        <motion.div 
                          key={idx}
                          whileHover={{ y: -5 }}
                          onClick={() => {
                            setActiveChat({
                              id: conv.other_user_id,
                              name: conv.other_user_name,
                              shop_name: conv.other_shop_name
                            });
                            // Mark as read locally
                            setConversations(prev => prev.map(c => 
                              (c.other_user_id === conv.other_user_id && c.market_id === conv.market_id) 
                                ? { ...c, unread_count: 0 } 
                                : c
                            ));
                          }}
                          className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex items-center gap-6 cursor-pointer relative overflow-hidden group"
                        >
                          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-black text-2xl flex-shrink-0">
                            {conv.other_shop_name ? conv.other_shop_name[0] : conv.other_user_name[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start mb-1">
                              <h4 className="font-black text-slate-900 truncate">{conv.other_shop_name || conv.other_user_name}</h4>
                              <span className="text-[10px] text-slate-400 font-bold">{new Date(conv.last_message_at).toLocaleDateString()}</span>
                            </div>
                            <p className="text-slate-400 text-sm font-medium truncate">{conv.last_message}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{conv.market_name || 'Boutique'}</span>
                            </div>
                          </div>
                          {conv.unread_count > 0 && (
                            <div className="w-6 h-6 bg-blue-600 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-lg shadow-blue-100">
                              {conv.unread_count}
                            </div>
                          )}
                          <div className="absolute right-0 top-0 bottom-0 w-1 bg-blue-600 transform translate-x-full group-hover:translate-x-0 transition-transform" />
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {buyerStep === 'messages' && (
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setBuyerStep('map')}
                      className="p-3 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </button>
                    <div>
                      <h2 className="text-3xl font-black tracking-tight text-slate-900">Mes Messages</h2>
                      <p className="text-slate-400 font-medium">Discutez avec les vendeurs et acheteurs</p>
                    </div>
                  </div>

                  {conversations.length === 0 ? (
                    <div className="bg-white p-20 rounded-[3rem] text-center border border-slate-100 shadow-xl shadow-slate-200/50">
                      <div className="w-24 h-24 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                        <MessageSquare className="w-10 h-10 text-slate-200" />
                      </div>
                      <h3 className="text-2xl font-black text-slate-900 mb-2">Aucun message</h3>
                      <p className="text-slate-400 font-medium">Commencez une discussion avec un vendeur sur la carte.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {conversations.map((conv, idx) => (
                        <motion.div 
                          key={idx}
                          whileHover={{ y: -5 }}
                          onClick={() => {
                            setActiveChat({
                              id: conv.other_user_id,
                              name: conv.other_user_name,
                              shop_name: conv.other_shop_name
                            });
                            // Mark as read locally
                            setConversations(prev => prev.map(c => 
                              (c.other_user_id === conv.other_user_id && c.market_id === conv.market_id) 
                                ? { ...c, unread_count: 0 } 
                                : c
                            ));
                          }}
                          className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex items-center gap-6 cursor-pointer relative overflow-hidden group"
                        >
                          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-black text-2xl flex-shrink-0">
                            {conv.other_shop_name ? conv.other_shop_name[0] : conv.other_user_name[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start mb-1">
                              <h4 className="font-black text-slate-900 truncate">{conv.other_shop_name || conv.other_user_name}</h4>
                              <span className="text-[10px] text-slate-400 font-bold">{new Date(conv.last_message_at).toLocaleDateString()}</span>
                            </div>
                            <p className="text-slate-400 text-sm font-medium truncate">{conv.last_message}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{conv.market_name || 'Boutique'}</span>
                            </div>
                          </div>
                          {conv.unread_count > 0 && (
                            <div className="w-6 h-6 bg-blue-600 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-lg shadow-blue-100">
                              {conv.unread_count}
                            </div>
                          )}
                          <div className="absolute right-0 top-0 bottom-0 w-1 bg-blue-600 transform translate-x-full group-hover:translate-x-0 transition-transform" />
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {buyerStep === 'orders' && (
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setBuyerStep('map')}
                      className="p-3 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </button>
                    <div>
                      <h2 className="text-3xl font-black tracking-tight text-slate-900">Mes Commandes</h2>
                      <p className="text-slate-400 font-medium">Suivez l'état de vos achats</p>
                    </div>
                  </div>

                  {orders.length === 0 ? (
                    <div className="bg-white p-20 rounded-[3rem] text-center border border-slate-100 shadow-xl shadow-slate-200/50">
                      <div className="w-24 h-24 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                        <ClipboardList className="w-10 h-10 text-slate-200" />
                      </div>
                      <h3 className="text-2xl font-black text-slate-900 mb-2">Aucune commande</h3>
                      <p className="text-slate-400 font-medium">Vous n'avez pas encore passé de commande.</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {orders.map((order) => (
                        <div key={order.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50">
                          <div className="flex flex-col md:flex-row justify-between gap-6 mb-8">
                            <div className="flex items-center gap-4">
                              <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                                <ShoppingBag className="w-7 h-7" />
                              </div>
                              <div>
                                <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Facture {order.invoice_id}</div>
                                <h4 className="text-xl font-black text-slate-900">{order.seller_shop_name || order.seller_name}</h4>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Total</div>
                                <div className="text-xl font-black text-blue-600">{order.total.toLocaleString()} FCFA</div>
                              </div>
                              <div className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                                order.status === 'paid' ? 'bg-emerald-50 text-emerald-600' :
                                order.status === 'delivered' ? 'bg-blue-50 text-blue-600' :
                                'bg-amber-50 text-amber-600'
                              }`}>
                                {order.status === 'paid' ? 'Payé' : 
                                 order.status === 'delivered' ? 'Livré' : 
                                 order.status === 'pending' ? 'En attente' : order.status}
                              </div>
                            </div>
                          </div>
                          
                          <div className="bg-slate-50 rounded-3xl p-6 space-y-3">
                            {(order.items || []).map((item: any, idx: number) => (
                              <div key={idx} className="flex justify-between items-center text-sm font-bold">
                                <span className="text-slate-600">{item.quantity}x {item.name}</span>
                                <span className="text-slate-900">{(item.price * item.quantity).toLocaleString()} FCFA</span>
                              </div>
                            ))}
                          </div>

                          <div className="mt-8 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-slate-400 text-xs font-medium">
                              <Clock className="w-4 h-4" />
                              { (order.created_at?.toDate?.() || new Date(order.created_at)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
                            </div>
                            <a 
                              href={`tel:${order.seller_phone}`}
                              className="flex items-center gap-2 text-blue-600 font-black text-xs hover:underline"
                            >
                              <Info className="w-4 h-4" /> Contacter le vendeur
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {view === 'seller' && user && (
            <motion.div 
              key="seller"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 overlay-content"
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
                <div className="lg:col-span-2 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div className="w-full md:w-auto">
                    <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900">Tableau de Bord</h2>
                    <p className="text-slate-400 font-medium text-sm sm:text-base">Gérez votre inventaire et vos ventes en direct</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4 w-full md:w-auto">
                    <div className="bg-white p-1 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-1 flex-1 sm:flex-none">
                      <button 
                        onClick={() => setActiveTab('items')}
                        className={`flex-1 sm:px-6 py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'items' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        Articles
                      </button>
                      <button 
                        onClick={() => setActiveTab('orders')}
                        className={`flex-1 sm:px-6 py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'orders' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        Commandes
                      </button>
                    </div>
                    <motion.button 
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setEditingItem(null);
                        setNewItem({ name: '', description: '', price: 0, photo: '', category: 'Vivrier', market_id: markets[0]?.id || 0 });
                        setShowItemForm(true);
                      }}
                      className="bg-blue-600 text-white px-6 sm:px-8 py-3.5 sm:py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 flex items-center justify-center gap-2 flex-1 sm:flex-none"
                    >
                      <Plus className="w-5 h-5 sm:w-6 h-6" /> <span className="text-sm sm:text-base">Ajouter</span>
                    </motion.button>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100">
                  <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
                    <Store className="w-5 h-5 text-blue-600" /> Ma Boutique
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Nom :</span>
                      <span className="font-bold text-slate-900">{user.shop_name || 'Non défini'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Tél :</span>
                      <span className="font-bold text-slate-900">{user.phone || 'Non défini'}</span>
                    </div>
                    {user.lat && (
                      <div className="flex items-center gap-2 text-blue-600 font-bold text-[10px] mt-4">
                        <MapPin className="w-3 h-3" /> Position configurée
                      </div>
                    )}
                    <div className="pt-4 space-y-4">
                      <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                        <h4 className="text-[10px] font-black text-blue-900 uppercase tracking-widest mb-2 flex items-center gap-2">
                          <MapPin className="w-3 h-3" /> Emplacement Fixe
                        </h4>
                        <button 
                          onClick={saveCurrentLocation}
                          disabled={savingLocation}
                          className={`w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                            savingLocation 
                              ? 'bg-blue-100 text-blue-400 cursor-not-allowed' 
                              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200'
                          }`}
                        >
                          <Navigation className={`w-3 h-3 ${savingLocation ? 'animate-spin' : ''}`} />
                          {savingLocation ? 'Enregistrement...' : 'Mettre à jour mon stand'}
                        </button>
                      </div>

                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-2 flex items-center gap-2">
                          <Navigation className="w-3 h-3 text-emerald-500" /> Mode Itinérant
                        </h4>
                        <button 
                          onClick={toggleTracking}
                          className={`w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                            isTracking 
                              ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-100' 
                              : 'bg-white text-slate-400 hover:bg-slate-50 border border-slate-200'
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full ${isTracking ? 'bg-white animate-ping' : 'bg-slate-300'}`} />
                          {isTracking ? 'Suivi GPS Actif' : 'Activer le suivi en direct'}
                        </button>
                      </div>

                      <button 
                        onClick={() => {
                          setRole('seller');
                          setAuthMode('register');
                          setView('auth');
                        }}
                        className="w-full py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600 transition-colors"
                      >
                        Mettre à jour mes infos
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {!showItemForm && activeTab === 'items' && (
                <div className="mb-8 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Filter className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-widest">Filtres de prix</span>
                  </div>
                  <div className="flex items-center gap-4 flex-1 w-full">
                    <div className="relative flex-1">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">MIN</span>
                      <input 
                        type="number" 
                        placeholder="Prix min"
                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
                        value={minPrice}
                        onChange={(e) => setMinPrice(e.target.value)}
                      />
                    </div>
                    <div className="relative flex-1">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">MAX</span>
                      <input 
                        type="number" 
                        placeholder="Prix max"
                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(e.target.value)}
                      />
                    </div>
                    {(minPrice || maxPrice) && (
                      <button 
                        onClick={() => { setMinPrice(''); setMaxPrice(''); }}
                        className="p-3 rounded-xl bg-slate-50 text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {showItemForm ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white p-10 rounded-[2.5rem] shadow-2xl shadow-slate-200/50 border border-slate-100 max-w-3xl mx-auto"
                >
                  <div className="flex justify-between items-center mb-8">
                    <h3 className="text-2xl font-black text-slate-900">{editingItem ? 'Modifier l\'article' : 'Nouvel article'}</h3>
                    <button onClick={() => setShowItemForm(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                      <X className="w-6 h-6 text-slate-400" />
                    </button>
                  </div>
                  <form onSubmit={handleSaveItem} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Nom de l'article</label>
                        <input 
                          type="text" 
                          required 
                          placeholder="Ex: Tomates fraîches"
                          className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all bg-slate-50/50"
                          value={newItem.name}
                          onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Prix (FCFA)</label>
                        <input 
                          type="number" 
                          step="0.01"
                          required 
                          placeholder="0.00"
                          className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all bg-slate-50/50"
                          value={newItem.price}
                          onChange={(e) => setNewItem({...newItem, price: Number(e.target.value)})}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Catégorie</label>
                        <select 
                          className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all bg-slate-50/50 font-bold text-slate-600"
                          value={newItem.category}
                          onChange={(e) => setNewItem({...newItem, category: e.target.value})}
                        >
                          {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Marché ou Boutique</label>
                        <select 
                          className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all bg-slate-50/50 font-bold text-slate-600"
                          value={newItem.market_id}
                          onChange={(e) => setNewItem({...newItem, market_id: Number(e.target.value)})}
                        >
                          <option value="0">Boutique Indépendante (Pas de marché)</option>
                          {markets.filter(m => m.type === 'market').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Description</label>
                        <textarea 
                          required 
                          placeholder="Décrivez votre produit..."
                          className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all bg-slate-50/50 h-32 resize-none"
                          value={newItem.description}
                          onChange={(e) => setNewItem({...newItem, description: e.target.value})}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">URL de la photo (optionnel)</label>
                        <input 
                          type="text" 
                          placeholder="https://..."
                          className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all bg-slate-50/50"
                          value={newItem.photo}
                          onChange={(e) => setNewItem({...newItem, photo: e.target.value})}
                        />
                      </div>

                      <div className="md:col-span-2">
                        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                          <div className="flex items-center justify-between mb-2 ml-1">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Ma Position Exacte</label>
                            <button 
                              type="button"
                              onClick={() => {
                                if ("geolocation" in navigator) {
                                  navigator.geolocation.getCurrentPosition((pos) => {
                                    setSellerLat(pos.coords.latitude);
                                    setSellerLng(pos.coords.longitude);
                                  });
                                }
                              }}
                              className="text-[10px] font-black text-blue-600 hover:underline"
                            >
                              Utiliser mon GPS
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-400 mb-4">Cliquez sur la carte pour définir votre emplacement exact de vente</p>
                          <div className="h-48 rounded-2xl overflow-hidden border border-slate-200">
                            <Map 
                              markets={markets} 
                              onSelectMarket={() => {}} 
                              selectedMarketId={null}
                              onMapClick={(lat, lng) => {
                                setSellerLat(lat);
                                setSellerLng(lng);
                              }}
                              sellerLocation={sellerLat && sellerLng ? { lat: sellerLat, lng: sellerLng } : null}
                              userLocation={userLocation}
                            />
                          </div>
                          {sellerLat && (
                            <div className="mt-3 flex items-center gap-2 text-blue-600 font-bold text-[10px]">
                              <CheckCircle2 className="w-3 h-3" /> Position configurée
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-4 mt-8">
                      <button 
                        type="button"
                        onClick={() => setShowItemForm(false)}
                        className="flex-1 px-6 py-4 rounded-2xl font-bold text-slate-400 hover:bg-slate-50 transition-all"
                      >
                        Annuler
                      </button>
                      <button 
                        type="submit"
                        className="flex-1 bg-blue-600 text-white px-6 py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                      >
                        Enregistrer
                      </button>
                    </div>
                  </form>
                </motion.div>
              ) : activeTab === 'orders' ? (
                <div className="space-y-6">
                  <h3 className="text-2xl font-black text-slate-900 mb-8">Commandes Reçues</h3>
                  {orders.length === 0 ? (
                    <div className="bg-white p-20 rounded-[3rem] text-center border border-slate-100 shadow-xl shadow-slate-200/50">
                      <div className="w-24 h-24 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                        <ClipboardList className="w-10 h-10 text-slate-200" />
                      </div>
                      <h3 className="text-2xl font-black text-slate-900 mb-2">Aucune commande</h3>
                      <p className="text-slate-400 font-medium">Vous n'avez pas encore reçu de commande.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-6">
                      {orders.map((order) => (
                        <div key={order.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50">
                          <div className="flex flex-col md:flex-row justify-between gap-6 mb-8">
                            <div className="flex items-center gap-4">
                              <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                                <User className="w-7 h-7" />
                              </div>
                              <div>
                                <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Client: {order.buyer_name}</div>
                                <h4 className="text-xl font-black text-slate-900">Facture {order.invoice_id}</h4>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Total</div>
                                <div className="text-xl font-black text-blue-600">{order.total.toLocaleString()} FCFA</div>
                              </div>
                              <select 
                                value={order.status}
                                onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none border-none cursor-pointer ${
                                  order.status === 'paid' ? 'bg-emerald-50 text-emerald-600' :
                                  order.status === 'delivered' ? 'bg-blue-50 text-blue-600' :
                                  'bg-amber-50 text-amber-600'
                                }`}
                              >
                                <option value="pending">En attente</option>
                                <option value="paid">Payé</option>
                                <option value="delivered">Livré</option>
                                <option value="cancelled">Annulé</option>
                              </select>
                            </div>
                          </div>
                          
                          <div className="bg-slate-50 rounded-3xl p-6 space-y-3">
                            {(order.items || []).map((item: any, idx: number) => (
                              <div key={idx} className="flex justify-between items-center text-sm font-bold">
                                <span className="text-slate-600">{item.quantity}x {item.name}</span>
                                <span className="text-slate-900">{(item.price * item.quantity).toLocaleString()} FCFA</span>
                              </div>
                            ))}
                          </div>

                          <div className="mt-8 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-slate-400 text-xs font-medium">
                              <Clock className="w-4 h-4" />
                              { (order.created_at?.toDate?.() || new Date(order.created_at)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
                            </div>
                            <a 
                              href={`tel:${order.buyer_phone}`}
                              className="flex items-center gap-2 text-blue-600 font-black text-xs hover:underline"
                            >
                              <Info className="w-4 h-4" /> Appeler le client
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {items.length > 0 ? items.map(item => (
                    <motion.div 
                      key={item.id}
                      whileHover={{ y: -10 }}
                      className="bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col sm:flex-row gap-6 group"
                    >
                      <div className="w-full sm:w-32 h-48 sm:h-32 rounded-3xl overflow-hidden bg-slate-100 flex-shrink-0">
                        <img 
                          src={item.photo || `https://picsum.photos/seed/${item.id}/200/200`} 
                          alt={item.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="text-xl font-black text-slate-900 truncate">{item.name}</h4>
                          <span className="text-blue-600 font-black text-lg">{item.price.toLocaleString()} FCFA</span>
                        </div>
                        <p className="text-sm text-slate-400 font-medium line-clamp-2 mb-4">{item.description}</p>
                        <div className="flex gap-3">
                          <button 
                            onClick={() => {
                              setEditingItem(item);
                              setNewItem(item);
                              setShowItemForm(true);
                            }}
                            className="p-3 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all border border-slate-100"
                          >
                            <Edit className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-3 rounded-xl bg-red-50 text-red-400 hover:text-white hover:bg-red-500 transition-all border border-red-100"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )) : (
                    <div className="col-span-full py-32 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
                      <Package className="w-20 h-20 mx-auto mb-6 text-slate-200" />
                      <h3 className="text-2xl font-bold text-slate-400">Aucun article en vente</h3>
                      <p className="text-slate-300 mt-2">Commencez par ajouter votre premier produit !</p>
                      <button 
                        onClick={() => setShowItemForm(true)}
                        className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-bold mt-8 hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                      >
                        Ajouter un article
                      </button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Overlays */}
      <AnimatePresence>
        {locationError && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 right-8 z-[10000] bg-red-500 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 font-bold"
          >
            <X className="w-5 h-5 cursor-pointer" onClick={() => setLocationError(null)} />
            <span>{locationError}</span>
          </motion.div>
        )}
        {locationSuccess && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 right-8 z-[10000] bg-emerald-500 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 font-bold"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>Position enregistrée !</span>
          </motion.div>
        )}
        {showWelcome && (
          <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWelcome(null)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl p-10 max-w-sm w-full relative z-10 border border-slate-100 text-center"
            >
              <div className="w-20 h-20 bg-blue-600 text-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-200">
                <Tag className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-black text-slate-900">Bienvenue !</h3>
              <p className="text-slate-400 font-medium mt-4">Voici votre code de bienvenue :</p>
              <div className="bg-slate-50 border-2 border-dashed border-blue-600 p-6 my-6 rounded-2xl">
                <span className="text-2xl font-black text-blue-600 tracking-widest">{showWelcome}</span>
              </div>
              <p className="text-xs text-slate-400 mb-8">Utilisez ce code pour votre première commande !</p>
              <button 
                onClick={() => setShowWelcome(null)}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
              >
                C'est parti !
              </button>
            </motion.div>
          </div>
        )}

        {showOnboarding && (
          <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-[3rem] shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-100"
            >
              <div className="grid grid-cols-1 md:grid-cols-2">
                <div className={`p-12 flex flex-col items-center justify-center text-center ${
                  onboardingStep === 0 ? 'bg-blue-50' : 
                  onboardingStep === 1 ? 'bg-emerald-50' : 
                  onboardingStep === 2 ? 'bg-amber-50' : 'bg-purple-50'
                } transition-colors duration-500`}>
                  <motion.div
                    key={onboardingStep}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="mb-8"
                  >
                    {onboardingStep === 0 && <ShoppingBag className="w-24 h-24 text-blue-600" />}
                    {onboardingStep === 1 && <MapPin className="w-24 h-24 text-emerald-600" />}
                    {onboardingStep === 2 && <Store className="w-24 h-24 text-amber-600" />}
                    {onboardingStep === 3 && <Navigation className="w-24 h-24 text-purple-600" />}
                  </motion.div>
                  <div className="flex gap-2">
                    {[0,1,2,3].map(i => (
                      <div key={i} className={`w-2 h-2 rounded-full transition-all ${onboardingStep === i ? 'w-6 bg-slate-900' : 'bg-slate-200'}`} />
                    ))}
                  </div>
                </div>
                <div className="p-12 flex flex-col justify-between">
                  <div>
                    <motion.h3 
                      key={`title-${onboardingStep}`}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="text-3xl font-black text-slate-900 mb-4"
                    >
                      {onboardingStep === 0 && "Bienvenue !"}
                      {onboardingStep === 1 && "Explorez les Marchés"}
                      {onboardingStep === 2 && "Boutiques Locales"}
                      {onboardingStep === 3 && "Services & Livraison"}
                    </motion.h3>
                    <motion.p 
                      key={`desc-${onboardingStep}`}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="text-slate-400 font-medium leading-relaxed"
                    >
                      {onboardingStep === 0 && "Marché Local connecte les acheteurs et les vendeurs des marchés du Bénin en un clic."}
                      {onboardingStep === 1 && "Trouvez les marchés les plus proches (Dantokpa, Ouando, Arzéké...) et découvrez leurs produits."}
                      {onboardingStep === 2 && "Découvrez des boutiques indépendantes partout autour de vous, même hors des grands marchés."}
                      {onboardingStep === 3 && "Commandez en direct, chattez avec les vendeurs et gérez votre portefeuille en toute sécurité."}
                    </motion.p>
                  </div>
                  <div className="mt-12 flex gap-4">
                    {onboardingStep > 0 && (
                      <button 
                        onClick={() => setOnboardingStep(s => s - 1)}
                        className="flex-1 py-4 rounded-2xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-all"
                      >
                        Retour
                      </button>
                    )}
                    <button 
                      onClick={() => {
                        if (onboardingStep < 3) {
                          setOnboardingStep(s => s + 1);
                        } else {
                          localStorage.setItem('onboarding_completed', 'true');
                          setShowOnboarding(false);
                        }
                      }}
                      className="flex-2 bg-slate-900 text-white py-4 px-8 rounded-2xl font-bold hover:bg-blue-600 transition-all shadow-xl shadow-slate-100"
                    >
                      {onboardingStep < 3 ? "Suivant" : "Commencer"}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProfileSettings && user && (
          <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowProfileSettings(false)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[3rem] shadow-2xl p-6 sm:p-10 max-w-xl w-full relative z-10 border border-slate-100 overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-2xl font-black text-slate-900">Paramètres du Profil</h3>
                <button onClick={() => setShowProfileSettings(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Nom complet</label>
                  <input 
                    type="text" 
                    required 
                    className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all bg-slate-50/50"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                
                {(user.role === 'seller' || user.role === 'both') && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 ml-1">Type de vendeur</label>
                      <div className="flex gap-6 mb-4 ml-1">
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <div className="relative flex items-center justify-center">
                            <input 
                              type="radio" 
                              name="sellerTypeProfile"
                              className="peer appearance-none w-5 h-5 border-2 border-slate-200 rounded-full checked:border-blue-500 transition-all"
                              checked={sellerType === 'boutique'}
                              onChange={() => setSellerType('boutique')}
                            />
                            <div className="absolute w-2.5 h-2.5 bg-blue-500 rounded-full opacity-0 peer-checked:opacity-100 transition-all" />
                          </div>
                          <span className="text-sm font-bold text-slate-600 group-hover:text-blue-600 transition-colors">Boutique</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <div className="relative flex items-center justify-center">
                            <input 
                              type="radio" 
                              name="sellerTypeProfile"
                              className="peer appearance-none w-5 h-5 border-2 border-slate-200 rounded-full checked:border-blue-500 transition-all"
                              checked={sellerType === 'market'}
                              onChange={() => setSellerType('market')}
                            />
                            <div className="absolute w-2.5 h-2.5 bg-blue-500 rounded-full opacity-0 peer-checked:opacity-100 transition-all" />
                          </div>
                          <span className="text-sm font-bold text-slate-600 group-hover:text-blue-600 transition-colors">Marché</span>
                        </label>
                      </div>
                    </div>

                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={sellerType}
                    >
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">
                        {sellerType === 'boutique' ? 'Nom de la boutique' : 'Nom du marché'}
                      </label>
                      <input 
                        type="text" 
                        required 
                        className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all bg-slate-50/50"
                        value={shopName}
                        onChange={(e) => setShopName(e.target.value)}
                      />
                    </motion.div>
                    
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Numéro de téléphone</label>
                      <input 
                        type="tel" 
                        required 
                        className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all bg-slate-50/50"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Infos Bancaires / MoMo</label>
                      <input 
                        type="text" 
                        required 
                        className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all bg-slate-50/50"
                        value={bankInfo}
                        onChange={(e) => setBankInfo(e.target.value)}
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 ml-1 flex items-center gap-2">
                    <Palette className="w-3 h-3" /> Thème de l'application
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setTheme('default')}
                      className={`p-3 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${theme === 'default' ? 'border-blue-600 bg-blue-50' : 'border-slate-100 hover:border-slate-200'}`}
                    >
                      <div className="w-full h-4 bg-slate-100 rounded-lg" />
                      <span className="text-[10px] font-bold">Clair</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme('noir-vert')}
                      className={`p-3 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${theme === 'noir-vert' ? 'border-emerald-500 bg-slate-900' : 'border-slate-100 hover:border-slate-200'}`}
                    >
                      <div className="w-full h-4 bg-emerald-500 rounded-lg" />
                      <span className={`text-[10px] font-bold ${theme === 'noir-vert' ? 'text-white' : 'text-slate-900'}`}>Noir/Vert</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme('bleu-noir')}
                      className={`p-3 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${theme === 'bleu-noir' ? 'border-blue-500 bg-slate-900' : 'border-slate-100 hover:border-slate-200'}`}
                    >
                      <div className="w-full h-4 bg-blue-500 rounded-lg" />
                      <span className={`text-[10px] font-bold ${theme === 'bleu-noir' ? 'text-white' : 'text-slate-900'}`}>Bleu/Noir</span>
                    </button>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <button 
                    type="submit"
                    className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
                  >
                    Enregistrer les modifications
                  </button>
                  
                  <button 
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full mt-4 flex items-center justify-center gap-2 text-red-500 font-bold text-sm hover:bg-red-50 py-3 rounded-2xl transition-all"
                  >
                    <Trash2 className="w-4 h-4" /> Supprimer mon compte
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {showWallet && user && (
          <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWallet(false)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[3rem] shadow-2xl p-10 max-w-sm w-full relative z-10 border border-slate-100"
            >
              <div className="text-center mb-8">
                <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                  <Wallet className="w-10 h-10 text-blue-600" />
                </div>
                <h3 className="text-2xl font-black text-slate-900">Votre Portefeuille</h3>
                <p className="text-slate-400 font-medium mt-2">Solde actuel : <span className="text-blue-600 font-black">{(user.balance || 0).toLocaleString()} FCFA</span></p>
              </div>

              <form onSubmit={handleAddFunds} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Montant à ajouter (FCFA)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    required
                    placeholder="0.00"
                    className="w-full px-6 py-4 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none text-center text-2xl font-black bg-slate-50/50 transition-all"
                    value={addAmount}
                    onChange={(e) => setAddAmount(e.target.value)}
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                >
                  Ajouter des fonds
                </button>
                <button 
                  type="button"
                  onClick={() => setShowWallet(false)}
                  className="w-full py-2 rounded-xl font-bold text-slate-400 hover:text-slate-600 transition-all"
                >
                  Fermer
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lastInvoice && (
          <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setLastInvoice(null)}
                className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
              />
              <motion.div 
                initial={{ scale: 0.8, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.8, opacity: 0, y: 20 }}
                className="bg-white rounded-[3rem] shadow-2xl p-10 max-w-md w-full relative z-10 border-4 border-blue-500"
              >
                <div className="text-center mb-8">
                  <div className="w-20 h-20 bg-blue-500 text-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-100">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <h3 className="text-3xl font-black text-slate-900">Facture de Paiement</h3>
                  <p className="text-blue-600 font-black text-sm mt-2 uppercase tracking-widest">Paiement Réussi</p>
                </div>

              <div className="bg-slate-50 rounded-3xl p-8 border border-slate-100 mb-8 font-mono text-sm shadow-inner">
                <div className="flex justify-between mb-3">
                  <span className="text-slate-400">N° Facture:</span>
                  <span className="font-black text-slate-900">{lastInvoice.invoice_id}</span>
                </div>
                <div className="flex justify-between mb-3">
                  <span className="text-slate-400">Date:</span>
                  <span className="font-black text-slate-900">{new Date().toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between mb-3">
                  <span className="text-slate-400">Mode:</span>
                  <span className="font-black text-slate-900 uppercase">{lastInvoice.delivery_type === 'pickup' ? 'Retrait' : 'Livraison'}</span>
                </div>
                <div className="border-t border-dashed border-slate-200 my-6" />
                <div className="text-center">
                  <p className="text-slate-400 font-medium mb-4">Présentez ce code au vendeur pour récupérer votre panier</p>
                  <div className="bg-white border-2 border-slate-900 p-6 inline-block rounded-2xl shadow-lg">
                    <span className="text-3xl font-black tracking-[0.2em] uppercase text-slate-900">{lastInvoice.invoice_id.split('-').pop()}</span>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setLastInvoice(null)}
                className="w-full bg-slate-900 text-white py-5 rounded-2xl font-bold hover:bg-blue-600 transition-all shadow-xl"
              >
                J'ai compris
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeChat && user && (
          <ChatBox 
            currentUser={user}
            otherUser={activeChat} 
            onClose={() => {
              setActiveChat(null);
            }} 
            marketId={selectedMarket?.id || ''}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCart && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCart(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9998]"
            />
            <Cart 
              items={cartItems}
              userBalance={user.balance}
              onClose={() => setShowCart(false)}
              onRemove={removeFromCart}
              onUpdateQuantity={updateCartQuantity}
              onCheckout={handleCheckout}
            />
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeleteConfirm(false)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[3rem] p-8 max-w-sm w-full relative z-10 shadow-2xl text-center"
            >
              <div className="w-20 h-20 bg-red-50 text-red-500 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-10 h-10" />
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-2">Supprimer le compte ?</h3>
              <p className="text-slate-500 text-sm mb-8">
                Cette action est irréversible. Toutes vos données (articles, commandes, messages) seront définitivement supprimées.
              </p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={handleDeleteAccount}
                  className="w-full bg-red-500 text-white py-4 rounded-2xl font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-100"
                >
                  Oui, supprimer définitivement
                </button>
                <button 
                  onClick={() => setShowDeleteConfirm(false)}
                  className="w-full bg-slate-100 text-slate-600 py-4 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                >
                  Annuler
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer Info */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 border-t border-slate-100 mt-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="space-y-6">
            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center shadow-inner">
              <ShoppingBag className="w-7 h-7 text-blue-600" />
            </div>
            <div>
              <h4 className="text-xl font-black text-slate-900 mb-3">Achetez Local</h4>
              <p className="text-slate-400 font-medium leading-relaxed">Soutenez les producteurs de votre région en achetant directement sur le marché.</p>
            </div>
          </div>
          <div className="space-y-6">
            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center shadow-inner">
              <Store className="w-7 h-7 text-blue-600" />
            </div>
            <div>
              <h4 className="text-xl font-black text-slate-900 mb-3">Vendez Facilement</h4>
              <p className="text-slate-400 font-medium leading-relaxed">Créez votre étal virtuel en quelques minutes et atteignez de nouveaux clients.</p>
            </div>
          </div>
          <div className="space-y-6">
            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center shadow-inner">
              <Info className="w-7 h-7 text-blue-600" />
            </div>
            <div>
              <h4 className="text-xl font-black text-slate-900 mb-3">Confiance & Sécurité</h4>
              <p className="text-slate-400 font-medium leading-relaxed">Une plateforme transparente pour favoriser les échanges de proximité.</p>
            </div>
          </div>
        </div>
        <div className="mt-20 pt-10 border-t border-slate-50 text-center">
          <p className="text-slate-300 font-bold text-sm">Net Market</p>
        </div>
      </footer>
    </div>
  );
}
