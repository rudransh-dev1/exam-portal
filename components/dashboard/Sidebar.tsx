import { useState, ReactNode } from "react";
import styles from "./Sidebar.module.css";
import { motion, AnimatePresence } from "framer-motion";

interface NavItem {
  id: string;
  icon: ReactNode;
  label: string;
}

interface SidebarProps {
  items: NavItem[];
  activeItem: string;
  onItemClick: (id: string) => void;
  onLogout: () => void;
}

export default function Sidebar({ items, activeItem, onItemClick, onLogout }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleItemClick = (id: string) => {
    onItemClick(id);
    setIsOpen(false);
  };

  return (
    <>
      <button 
        className={styles.hamburger} 
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle Menu"
      >
        {isOpen ? "✕" : "☰"}
      </button>

      <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.logo}>
          <motion.div 
            className={styles.logoIcon}
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          >⚛</motion.div>
          <div className={styles.logoText}>
            <span className={styles.brand}>NEXUS</span>
            <span className={styles.sub}>Candidate Portal</span>
          </div>
        </div>
        
        <nav className={styles.nav}>
          {items.map((item, idx) => (
            <motion.button
              key={item.id}
              className={`${styles.navBtn} ${activeItem === item.id ? styles.navBtnActive : ""}`}
              onClick={() => handleItemClick(item.id)}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              whileHover={{ x: 4 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
              <AnimatePresence>
                {activeItem === item.id && (
                  <motion.span 
                    className={styles.navArrow}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                  >›</motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          ))}
        </nav>

        <div className={styles.footer}>
          <motion.div 
            className={styles.atomIcon}
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 4, repeat: Infinity }}
          >⚛</motion.div>
          <button className={styles.signOut} onClick={onLogout}>Sign Out</button>
        </div>
      </aside>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            className={styles.overlay} 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)} 
          />
        )}
      </AnimatePresence>
    </>
  );
}
