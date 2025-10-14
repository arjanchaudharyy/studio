// encryption-browser.ts

export interface SecretEncryptionMaterial {
  ciphertext: string;
  iv: string;
  keyId: string;
}

export class SecretEncryption {
  constructor(private readonly masterKey: CryptoKey, private readonly keyId: string = 'primary') {}

  get keyIdentifier(): string {
    return this.keyId;
  }

  static async importKey(rawKey: ArrayBuffer): Promise<CryptoKey> {
    return await crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async encrypt(plaintext: string): Promise<SecretEncryptionMaterial> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const encoded = encoder.encode(plaintext);

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.masterKey,
      encoded
    );

    return {
      ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
      iv: btoa(String.fromCharCode(...iv)),
      keyId: this.keyId,
    };
  }

  async decrypt(material: SecretEncryptionMaterial): Promise<string> {
    const iv = Uint8Array.from(atob(material.iv), c => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(material.ciphertext), c => c.charCodeAt(0));

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      this.masterKey,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  }
}

// Helper to prepare a 32-byte master key
export function parseMasterKey(raw: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(raw);
  if (bytes.byteLength !== 32) {
    throw new Error('Key must be exactly 32 bytes.');
  }
  return bytes.buffer;
}
