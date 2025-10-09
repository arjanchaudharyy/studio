/**
 * Component Registration
 * Import all component implementations to register them in the registry
 */

// Core components
import './core/trigger-manual';
import './core/file-loader';
import './core/webhook';

// Security components
import './security/subfinder';

// Export registry for external use
export { componentRegistry } from '@shipsec/component-sdk';

