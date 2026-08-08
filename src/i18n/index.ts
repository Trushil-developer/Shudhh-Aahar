import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './locales/en.json';

const LOCALE_STORAGE_KEY = 'shuddhaahar_locale';

i18next.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

AsyncStorage.getItem(LOCALE_STORAGE_KEY).then(saved => {
  if (saved && saved !== i18next.language) {
    i18next.changeLanguage(saved);
  }
});

export async function changeLanguage(lang: string): Promise<void> {
  await i18next.changeLanguage(lang);
  await AsyncStorage.setItem(LOCALE_STORAGE_KEY, lang);
}

export default i18next;
