export type GamePlatform = 'steam';

export type FrameFormat = 'png' | 'rgb565';

export type SelectionMode =
  | 'random'
  | 'backlog'
  | 'favorites'
  | 'most_played'
  | 'never_played';

export type GamesPerFrame = 1 | 2 | 3;

export type SyncRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export type SpineStyle = 'image' | 'gradient';
