import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children, defaultTheme = 'light', storageKey = 'hipozero-ui-theme' }) => {
  	const [theme, setTheme] = useState('light');

	useEffect(() => {
		const root = window.document.documentElement;
		root.classList.remove('dark', 'system');
		root.classList.add('light');
        try { localStorage.setItem(storageKey, 'light'); } catch (e) {}
    }, []);

  const value = {
    theme,
    setTheme: (newTheme) => {
      try {
        localStorage.setItem(storageKey, newTheme);
      } catch (e) {
        console.error('Failed to save theme to localStorage', e);
      }
      setTheme(newTheme);
    },
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
