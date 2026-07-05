export type SteamErrorCode =
  | 'STEAM_API_ERROR'
  | 'STEAM_PRIVATE_LIBRARY'
  | 'STEAM_RATE_LIMITED'
  | 'STEAM_APP_NOT_FOUND';

export class SteamError extends Error {
  readonly code: SteamErrorCode;

  constructor(code: SteamErrorCode, message: string) {
    super(message);
    this.name = 'SteamError';
    this.code = code;
  }
}
