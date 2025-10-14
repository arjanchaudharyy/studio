import { beforeEach, describe, expect, it, vi } from 'bun:test';

import { SecretsService } from '../secrets.service';
import type { SecretsRepository, SecretSummary, SecretValueRecord } from '../secrets.repository';
import type { SecretsEncryptionService } from '../secrets.encryption';

const sampleSummary: SecretSummary = {
  id: 'secret-1',
  name: 'database-password',
  description: 'Primary database credentials',
  tags: ['prod'],
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  activeVersion: {
    id: 'version-1',
    version: 1,
    createdAt: new Date('2024-01-02T00:00:00.000Z'),
    createdBy: 'alice@example.com',
  },
};

describe('SecretsService', () => {
  let repository: {
    listSecrets: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    createSecret: ReturnType<typeof vi.fn>;
    rotateSecret: ReturnType<typeof vi.fn>;
    findValueBySecretId: ReturnType<typeof vi.fn>;
  };
  let encryption: {
    encrypt: ReturnType<typeof vi.fn>;
    decrypt: ReturnType<typeof vi.fn>;
  };
  let service: SecretsService;

  beforeEach(() => {
    repository = {
      listSecrets: vi.fn(),
      findById: vi.fn(),
      createSecret: vi.fn(),
      rotateSecret: vi.fn(),
      findValueBySecretId: vi.fn(),
    };

    encryption = {
      encrypt: vi.fn(),
      decrypt: vi.fn(),
    };

    service = new SecretsService(
      repository as unknown as SecretsRepository,
      encryption as unknown as SecretsEncryptionService,
    );
  });

  it('lists secrets via the repository', async () => {
    repository.listSecrets.mockResolvedValue([sampleSummary]);

    const result = await service.listSecrets();

    expect(result).toEqual([sampleSummary]);
    expect(repository.listSecrets).toHaveBeenCalledTimes(1);
  });

  it('returns a single secret via the repository', async () => {
    repository.findById.mockResolvedValue(sampleSummary);

    const result = await service.getSecret('secret-1');

    expect(result).toBe(sampleSummary);
    expect(repository.findById).toHaveBeenCalledWith('secret-1');
  });

  it('encrypts and stores a new secret with optional metadata', async () => {
    encryption.encrypt.mockReturnValue({
      ciphertext: 'ciphertext',
      iv: 'iv',
      authTag: 'tag',
      keyId: 'master-key',
    });
    repository.createSecret.mockResolvedValue(sampleSummary);

    const result = await service.createSecret({
      name: 'database-password',
      description: 'Primary database credentials',
      tags: ['prod'],
      value: 'super-secret-value',
      createdBy: 'alice@example.com',
    });

    expect(result).toBe(sampleSummary);
    expect(encryption.encrypt).toHaveBeenCalledWith('super-secret-value');
    expect(repository.createSecret).toHaveBeenCalledWith(
      {
        name: 'database-password',
        description: 'Primary database credentials',
        tags: ['prod'],
      },
      {
        encryptedValue: 'ciphertext',
        iv: 'iv',
        authTag: 'tag',
        encryptionKeyId: 'master-key',
        createdBy: 'alice@example.com',
      },
    );
  });

  it('fills optional fields with nulls when creating a secret', async () => {
    encryption.encrypt.mockReturnValue({
      ciphertext: 'ciphertext',
      iv: 'iv',
      authTag: 'tag',
      keyId: 'master-key',
    });
    repository.createSecret.mockResolvedValue(sampleSummary);

    await service.createSecret({ name: 'api-key', value: 'value' });

    expect(repository.createSecret).toHaveBeenCalledWith(
      {
        name: 'api-key',
        description: null,
        tags: null,
      },
      expect.objectContaining({
        createdBy: null,
      }),
    );
  });

  it('rotates a secret using encrypted material', async () => {
    encryption.encrypt.mockReturnValue({
      ciphertext: 'newcipher',
      iv: 'newiv',
      authTag: 'newtag',
      keyId: 'master-key',
    });
    repository.rotateSecret.mockResolvedValue(sampleSummary);

    const result = await service.rotateSecret('secret-1', {
      value: 'another-secret',
      createdBy: 'bob@example.com',
    });

    expect(result).toBe(sampleSummary);
    expect(encryption.encrypt).toHaveBeenCalledWith('another-secret');
    expect(repository.rotateSecret).toHaveBeenCalledWith('secret-1', {
      encryptedValue: 'newcipher',
      iv: 'newiv',
      authTag: 'newtag',
      encryptionKeyId: 'master-key',
      createdBy: 'bob@example.com',
    });
  });

  it('defaults rotate metadata when not provided', async () => {
    encryption.encrypt.mockReturnValue({
      ciphertext: 'cipher',
      iv: 'iv',
      authTag: 'tag',
      keyId: 'master-key',
    });
    repository.rotateSecret.mockResolvedValue(sampleSummary);

    await service.rotateSecret('secret-1', { value: 'value' });

    expect(repository.rotateSecret).toHaveBeenCalledWith('secret-1', {
      encryptedValue: 'cipher',
      iv: 'iv',
      authTag: 'tag',
      encryptionKeyId: 'master-key',
      createdBy: null,
    });
  });

  it('decrypts secret values returned from the repository', async () => {
    const record: SecretValueRecord = {
      secretId: 'secret-1',
      version: 2,
      encryptedValue: 'encrypted',
      iv: 'iv',
      authTag: 'tag',
      encryptionKeyId: 'master-key',
    };
    repository.findValueBySecretId.mockResolvedValue(record);
    encryption.decrypt.mockReturnValue('decrypted-value');

    const result = await service.getSecretValue('secret-1');

    expect(repository.findValueBySecretId).toHaveBeenCalledWith('secret-1', undefined);
    expect(encryption.decrypt).toHaveBeenCalledWith({
      ciphertext: 'encrypted',
      iv: 'iv',
      authTag: 'tag',
      keyId: 'master-key',
    });
    expect(result).toEqual({
      secretId: 'secret-1',
      version: 2,
      value: 'decrypted-value',
    });
  });

  it('requests a specific version when provided', async () => {
    const record: SecretValueRecord = {
      secretId: 'secret-1',
      version: 1,
      encryptedValue: 'enc',
      iv: 'iv',
      authTag: 'tag',
      encryptionKeyId: 'master-key',
    };
    repository.findValueBySecretId.mockResolvedValue(record);
    encryption.decrypt.mockReturnValue('v1');

    await service.getSecretValue('secret-1', 1);

    expect(repository.findValueBySecretId).toHaveBeenCalledWith('secret-1', 1);
  });
});
