const ENCRYPTION_KEY_LENGTH = 256;
const ENCRYPTION_IV_BYTE_LENGTH = 12;
const ENCRYPTION_ALGORITHM = "AES-GCM";
const BASE64_URL_CHARACTERS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export async function generateKey() {
  if (!crypto || !crypto.subtle) {
    throw new Error(`SubtleCrypto API is required to generate key`);
  }

  return crypto.subtle.generateKey(
    {
      name: ENCRYPTION_ALGORITHM,
      length: ENCRYPTION_KEY_LENGTH,
    },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function exportKey(key: CryptoKey) {
  const buffer = await crypto.subtle.exportKey("raw", key);
  return encodeBase64Url(buffer);
}

export async function importKey(key: string) {
  const buffer = decodeBase64Url(key);
  return crypto.subtle.importKey("raw", buffer, ENCRYPTION_ALGORITHM, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encrypt(encryptionKey: CryptoKey, message: any) {
  if (typeof message === "object") {
    message = JSON.stringify(message);
  }
  const buffer = new TextEncoder().encode(message);
  const iv = crypto.getRandomValues(new Uint8Array(ENCRYPTION_IV_BYTE_LENGTH));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
      },
      encryptionKey,
      buffer,
    ),
  );
  const payload = new Uint8Array(
    ciphertext.byteLength + ENCRYPTION_IV_BYTE_LENGTH,
  );
  payload.set(ciphertext, 0);
  payload.set(iv, ciphertext.byteLength);
  return payload;
}

export async function decrypt<T>(
  encryptionKey: CryptoKey,
  arrayBuffer: ArrayBuffer,
): Promise<T> {
  const payload = new Uint8Array(arrayBuffer);
  const ciphertext = payload.slice(0, 0 - ENCRYPTION_IV_BYTE_LENGTH);
  const iv = payload.slice(0 - ENCRYPTION_IV_BYTE_LENGTH);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    encryptionKey,
    ciphertext,
  );
  const string = new TextDecoder().decode(plaintext);
  return JSON.parse(string);
}

export function randomId(byteLength: number) {
  const array = new Uint8Array(byteLength);
  crypto.getRandomValues(array);
  return [...array].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Based on https://github.com/herrjemand/Base64URL-ArrayBuffer/blob/master/lib/base64url-arraybuffer.js
function encodeBase64Url(arraybuffer: ArrayBuffer) {
  const bytes = new Uint8Array(arraybuffer);
  let base64 = "";

  for (let i = 0; i < bytes.length; i += 3) {
    base64 += BASE64_URL_CHARACTERS[bytes[i] >> 2];
    base64 +=
      BASE64_URL_CHARACTERS[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
    base64 +=
      BASE64_URL_CHARACTERS[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
    base64 += BASE64_URL_CHARACTERS[bytes[i + 2] & 63];
  }

  if (bytes.length % 3 === 2) {
    base64 = base64.substring(0, base64.length - 1);
  } else if (bytes.length % 3 === 1) {
    base64 = base64.substring(0, base64.length - 2);
  }

  return base64;
}

function decodeBase64Url(base64: string) {
  const bufferLength = base64.length * 0.75;
  const bytes = new Uint8Array(bufferLength);

  for (let i = 0, p = 0; i < base64.length; i += 4) {
    const encoded1 = BASE64_URL_CHARACTERS.indexOf(base64[i]);
    const encoded2 = BASE64_URL_CHARACTERS.indexOf(base64[i + 1]);
    const encoded3 = BASE64_URL_CHARACTERS.indexOf(base64[i + 2]);
    const encoded4 = BASE64_URL_CHARACTERS.indexOf(base64[i + 3]);

    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
  }

  return bytes.buffer;
}
