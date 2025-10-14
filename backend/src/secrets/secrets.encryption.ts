import { Injectable, Logger } from '@nestjs/common';
import { SecretEncryption, parseMasterKey, SecretEncryptionMaterial } from '@shipsec/shared';

const FALLBACK_DEV_KEY = '0123456789abcdef0123456789abcdef';

@Injectable()
export class SecretsEncryptionService {
  private readonly logger = new Logger(SecretsEncryptionService.name);
  private readonly encryptor: SecretEncryption;

  constructor() {
    const rawKey = process.env.SECRET_STORE_MASTER_KEY ?? FALLBACK_DEV_KEY;
    if (!process.env.SECRET_STORE_MASTER_KEY) {
      this.logger.warn(
        'SECRET_STORE_MASTER_KEY is not set. Using insecure default key for development purposes only.',
      );
    }

    const masterKey = parseMasterKey(rawKey);
    this.encryptor = new SecretEncryption(masterKey);
  }

  encrypt(value: string): SecretEncryptionMaterial {
    return this.encryptor.encrypt(value);
  }

  decrypt(material: SecretEncryptionMaterial): string {
    return this.encryptor.decrypt(material);
  }

  get keyId(): string {
    return this.encryptor.keyIdentifier;
  }
}
