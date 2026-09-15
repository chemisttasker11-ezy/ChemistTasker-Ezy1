declare module 'react-native-ssl-public-key-pinning' {
  export type SslPinningDomainConfig = {
    includeSubdomains?: boolean;
    publicKeyHashes: string[];
  };

  export function initializeSslPinning(config: Record<string, SslPinningDomainConfig>): Promise<void>;
  export function disableSslPinning(): Promise<void>;
}
