import type { CharacterContext } from "./types";
import { createConcierge } from "./concierge";
import { createRollingEye } from "./rolling-eye";
import { createSparky } from "./sparky";
import { createHumman } from "./humman";
import { createBats } from "./bats";

export function createCharacters(ctx: CharacterContext) {
  const monster = createConcierge(ctx);
  const eye = createRollingEye(ctx, monster);
  const sparkyState = createSparky(ctx, monster, eye);
  const humman = createHumman(ctx, monster, eye);
  const bats = createBats(ctx.scene, ctx.player);

  return {
    monster,
    sparky: sparkyState.sparky,
    humman,
    bats,
    eyeState: eye.eyeState,
    eyeUpdate: eye.eyeUpdate,
    askEye: eye.askEye,
    eyeSay: eye.eyeSay,
    get zapT() { return sparkyState.zapT; },
    set zapT(value: number) { sparkyState.zapT = value; },
    get freezeHint() { return sparkyState.freezeHint; },
  };
}
