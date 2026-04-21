export type PokemonState = 'idle' | 'walking-left' | 'walking-right' | 'bouncing';

export interface ActivePokemon {
  uid: number;
  id: number;
  name: string;
  state: PokemonState;
  x: number;
  y: number;
  facingLeft: boolean;
}
