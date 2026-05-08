import { DEFAULT_EXTENSION_INSTALL_URL } from '@rewrite/shared';

export function getExtensionInstallUrl(): string {
  return process.env.NEXT_PUBLIC_EXTENSION_INSTALL_URL || DEFAULT_EXTENSION_INSTALL_URL;
}
