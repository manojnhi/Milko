import * as Crypto from 'expo-crypto';
export const randomBytes = (n) => Crypto.getRandomBytes(n);
