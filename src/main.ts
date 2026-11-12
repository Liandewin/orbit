import { Game } from './game';
import { loadFonts } from './theme';

loadFonts();

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvas) throw new Error('#game canvas missing');

const game = new Game(canvas);
game.start();

// Handy for poking at state from the dev console.
if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
