import { Injectable } from '@nestjs/common';

import { SecretsEncryptionService } from './secrets.encryption';
import { SecretsRepository, type SecretSummary } from './secrets.repository';

export interface CreateSecretInput {
  name: string;
  description?: string | null;
  tags?: string[] | null;
  value: string;
  createdBy?: string | null;
}

export interface RotateSecretInput {
  value: string;
  createdBy?: string | null;
}

export interface SecretValue {
  secretId: string;
  version: number;
  value: string;
}

@Injectable()
export class SecretsService {
  constructor(
    private readonly repository: SecretsRepository,
    private readonly encryption: SecretsEncryptionService,
  ) {}

  async listSecrets(): Promise<SecretSummary[]> {
    return this.repository.listSecrets();
  }

  async getSecret(secretId: string): Promise<SecretSummary> {
    return this.repository.findById(secretId);
  }

  async createSecret(input: CreateSecretInput): Promise<SecretSummary> {
    const material = this.encryption.encrypt(input.value);

    return this.repository.createSecret(
      {
        name: input.name,
        description: input.description ?? null,
        tags: input.tags ?? null,
      },
      {
        encryptedValue: material.ciphertext,
        iv: material.iv,
        authTag: material.authTag,
        encryptionKeyId: material.keyId,
        createdBy: input.createdBy ?? null,
      },
    );
  }

  async rotateSecret(secretId: string, input: RotateSecretInput): Promise<SecretSummary> {
    const material = this.encryption.encrypt(input.value);

    return this.repository.rotateSecret(secretId, {
      encryptedValue: material.ciphertext,
      iv: material.iv,
      authTag: material.authTag,
      encryptionKeyId: material.keyId,
      createdBy: input.createdBy ?? null,
    });
  }

  async getSecretValue(secretId: string, version?: number): Promise<SecretValue> {
    const record = await this.repository.findValueBySecretId(secretId, version);
    const value = this.encryption.decrypt({
      ciphertext: record.encryptedValue,
      iv: record.iv,
      authTag: record.authTag,
      keyId: record.encryptionKeyId,
    });

    return {
      secretId: record.secretId,
      version: record.version,
      value,
    };
  }
}
