/**
 * Encoding utilities for base64 and byte array conversions
 */

/**
 * Convert Uint8Array to base64 string
 */
export function toBase64(bytes: Uint8Array): string {
  const binString = Array.from(bytes, (byte) =>
    String.fromCharCode(byte)
  ).join('');
  return btoa(binString);
}

/**
 * Convert base64 string to Uint8Array
 */
export function fromBase64(base64: string): Uint8Array {
  const binString = atob(base64);
  return Uint8Array.from(binString, (char) => char.charCodeAt(0));
}

/**
 * Convert string to Uint8Array (UTF-8 encoding)
 */
export function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Convert Uint8Array to string (UTF-8 decoding)
 */
export function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
