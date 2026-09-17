import { C } from '../../art/palette';
import { getEnemy } from '../../data/enemies';
import { goldReward, xpReward } from '../progression';
import { computeStats } from './StatsSystem';
import { bus } from '../events';
import { state } from '../GameState';

/**
 * Turns combat outcomes into progression.
 *
 * Subscribes to the event bus rather than being called by the combat code, so
 * XP, gold and loot can change independently of how a kill happened — a trap
 * kill and a sword kill pay the same way for free.
 */
export class RewardSystem {
  private unsubscribes: Array<() => void> = [];
  /** Set by the scene so drops can be spawned in the world. */
  onLoot: ((enemyId: string, level: number, x: number, y: number) => void) | null = null;

  attach(): void {
    this.unsubscribes.push(
      bus.on('enemyKilled', ({ enemyId, level, x, y }) => {
        const def = getEnemy(enemyId);
        state.kills++;

        const xp = Math.round(
          xpReward(def.xp, level, state.level) * (1 + this.xpBonus()),
        );
        state.addXp(xp, 'combat');

        const gold = Math.round(goldReward(def.gold, level) * (1 + this.goldBonus()));
        if (gold > 0) state.addGold(gold);

        this.onLoot?.(enemyId, level, x, y);
      }),
    );

    this.unsubscribes.push(
      bus.on('levelUp', ({ level, skillPoints }) => {
        bus.emit('toast', {
          text: `Level ${level} — ${skillPoints} skill point${skillPoints === 1 ? '' : 's'}`,
          color: C.gold,
          icon: '★',
        });
      }),
    );

    this.unsubscribes.push(
      bus.on('bossDefeated', ({ bossId }) => {
        if (!state.bossesDefeated.includes(bossId)) state.bossesDefeated.push(bossId);
      }),
    );
  }

  detach(): void {
    for (const off of this.unsubscribes) off();
    this.unsubscribes.length = 0;
  }

  /**
   * Passive bonuses are read at the moment of the kill rather than cached,
   * because the player can change gear between one kill and the next.
   */
  private xpBonus(): number {
    return computeStats().passives.xpBonus;
  }

  private goldBonus(): number {
    return computeStats().passives.goldBonus;
  }
}
