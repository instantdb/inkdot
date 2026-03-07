'use client';

import { db } from '@/lib/db';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { id } from '@instantdb/react';

type Theme = 'system' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContext {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContext>({
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = db.useAuth();
  const userId = user?.id;

  const { data: settingsData } = db.useQuery(
    userId ? { userSettings: { $: { where: { 'owner.id': userId } } } } : null,
  );
  const userSettings = settingsData?.userSettings?.[0];

  // Derive stored preference: from DB if signed in, localStorage otherwise
  const dbDarkMode = userSettings?.darkMode as Theme | undefined;

  const [localTheme, setLocalTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system';
    return (localStorage.getItem('theme') as Theme) || 'system';
  });

  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  // The effective theme preference
  const theme: Theme = userId
    ? dbDarkMode === 'light' || dbDarkMode === 'dark'
      ? dbDarkMode
      : 'system'
    : localTheme;

  const resolvedTheme: ResolvedTheme = theme === 'system' ? systemTheme : theme;

  // Listen for system theme changes
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Apply theme to DOM whenever resolved theme changes
  useEffect(() => {
    applyTheme(resolvedTheme);
    // Keep localStorage in sync as a cache for the anti-flash script
    localStorage.setItem('theme', theme);
  }, [resolvedTheme, theme]);

  const setTheme = useCallback(
    (newTheme: Theme) => {
      localStorage.setItem('theme', newTheme);
      setLocalTheme(newTheme);

      if (userId) {
        const settingsId = userSettings?.id || id();
        const darkModeValue = newTheme === 'system' ? '' : newTheme;
        if (userSettings) {
          db.transact(
            db.tx.userSettings[settingsId].update({
              darkMode: darkModeValue,
            }),
          );
        } else {
          db.transact(
            db.tx.userSettings[settingsId]
              .create({ darkMode: darkModeValue })
              .link({ owner: userId }),
          );
        }
      }
    },
    [userId, userSettings],
  );

  return (
    <ThemeContext value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext>
  );
}
