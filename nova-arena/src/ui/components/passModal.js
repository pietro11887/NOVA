// Season pass: free + premium reward tracks, unlocked by crowns.

import { h, mount, countdown, fmtNum } from '../dom.js';
import { openModal, confirmDialog } from './modal.js';
import { toast } from './toast.js';
import { openRewardReveal } from './rewardReveal.js';
import { PASS, CHESTS, seasonEndsAt } from '../../data/catalog.js';
import { RARITIES } from '../../data/cards.js';
import { playerState, update, subscribe } from '../../state/playerState.js';
import { passTier, claimPassReward, spend } from '../../state/economy.js';

export function rewardLabel(spec) {
  if (spec.chest) return { icon: CHESTS[spec.chest].icon, text: CHESTS[spec.chest].name };
  if (spec.gems) return { icon: '💎', text: `${spec.gems} gemme` };
  if (spec.gold) return { icon: '🪙', text: `${fmtNum(spec.gold)} oro` };
  if (spec.cardsRarity) return { icon: '🃏', text: `${spec.count} carte ${RARITIES[spec.cardsRarity].name.toLowerCase()}` };
  return { icon: '❔', text: '' };
}

export function openPassModal() {
  const container = h('div', { class: 'pass' });

  const draw = () => {
    const tier = passTier();
    const { crowns, premium, claimed } = playerState.pass;
    const inTier = crowns % PASS.crownsPerTier;
    const maxed = tier >= PASS.tiers.length;

    mount(container, 
      h('div', { class: 'pass-head' },
        h('div', {}, h('b', {}, `Livello pass ${tier}/${PASS.tiers.length}`),
          h('small', { class: 'muted' }, ' · finisce tra ', countdown(seasonEndsAt()))),
        h('div', { class: 'progress' },
          h('div', { class: 'bar', style: { width: (maxed ? 100 : (inTier / PASS.crownsPerTier) * 100) + '%' } }),
          h('span', {}, maxed ? 'Completato!' : `👑 ${inTier}/${PASS.crownsPerTier}`)),
        !premium && h('button', {
          class: 'btn btn-gold small',
          onClick: async () => {
            if (!await confirmDialog({ title: 'Nova Pass Premium', message: `Sblocca la traccia premium per ${PASS.premiumGems} gemme?` })) return;
            if (!spend({ gems: PASS.premiumGems }, 'pass')) return toast('Gemme insufficienti', 'error');
            update((s) => { s.pass.premium = true; }, 'pass');
            toast('Pass Premium attivato!', 'ok');
          },
        }, `Sblocca Premium 💎 ${PASS.premiumGems}`),
      ),
      h('div', { class: 'pass-cols' }, h('span', {}, 'Gratis'), h('span', {}, ''), h('span', {}, premium ? 'Premium ✔' : 'Premium 🔒')),
      h('ol', { class: 'pass-track' },
        PASS.tiers.map((t) => {
          const reached = t.tier <= tier;
          return h('li', { class: ['pass-row', reached && 'reached'] },
            rewardCell(t, 'free', reached, claimed.free.includes(t.tier), true),
            h('span', { class: 'pass-tier' }, String(t.tier)),
            rewardCell(t, 'premium', reached, claimed.premium.includes(t.tier), premium),
          );
        }),
      ),
    );
  };

  const rewardCell = (t, track, reached, isClaimed, available) => {
    const { icon, text } = rewardLabel(t[track]);
    const claimable = reached && !isClaimed && available;
    return h('button', {
      class: ['pass-reward', track, claimable && 'claimable', isClaimed && 'claimed', !available && 'locked'],
      disabled: !claimable,
      onClick: async () => {
        const bundle = claimPassReward(t.tier, track);
        if (bundle) await openRewardReveal(bundle, { title: `Pass · livello ${t.tier}` });
      },
    }, h('span', { class: 'ico' }, isClaimed ? '✔' : icon), h('small', {}, text));
  };

  draw();
  const unsub = subscribe((_, reason) => { if (reason === 'pass' || reason === 'battle') draw(); });
  openModal({ title: `${PASS.name} · Stagione`, body: container, className: 'modal-pass', onClose: unsub });
}
