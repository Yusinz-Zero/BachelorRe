// Trainer service — thin wrapper around the C game process's interactive prompt.
// Commands are the same word list OpenBachelorC exposes through its `>` prompt.
import { sendTrainerCommand, isGameRunning } from "./game-service.js";

// Mirrors CommandLst in OpenBachelorC main.py — used for completion/validation.
export const TRAINER_COMMANDS = [
  "zero_cost",
  "zero_deploy_cnt",
  "deploy_everywhere",
  "zero_cooldown",
  "unlimited_token",
  "no_sp",
  "withdraw_everything",
  "heal_everyone",
  "unlimited_ammo",
  "eat_enemy",
  "global_range",
  "anti_air",
  "true_aoe",
  "no_ban_card",
  "cloner_assist",
  "allow_dup_char",
  "auto_skill",
];

export function send(text) {
  return sendTrainerCommand(text);
}

export function trainerStatus() {
  const running = isGameRunning();
  return {
    attached: running,
    commands: TRAINER_COMMANDS,
    hint: running ? "send: enable|disable <cmd> [all]" : "game not attached yet — run Play first",
  };
}
