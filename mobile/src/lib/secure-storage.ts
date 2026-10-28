/**
 * Small key-value storage for the sign-in token and device settings.
 * On Android and iOS this is the phone's encrypted storage (expo-secure-store).
 * The web build uses secure-storage.web.ts instead, because expo-secure-store has no web support.
 */
export { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';