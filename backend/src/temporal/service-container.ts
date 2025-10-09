/**
 * Service container for dependency injection into components
 * This allows components to access NestJS services during execution
 */

import { FilesService } from '../storage/files.service';
import { StorageService } from '../storage/storage.service';

let globalServicesContainer: Record<string, unknown> | undefined;

export function initializeServiceContainer(services: {
  filesService: FilesService;
  storageService: StorageService;
}): void {
  globalServicesContainer = services;
  console.log('✅ Service container initialized with:', Object.keys(services));
}

export function getServiceContainer(): Record<string, unknown> {
  if (!globalServicesContainer) {
    console.warn('⚠️  Service container not initialized, returning empty object');
    return {};
  }
  return globalServicesContainer;
}

