/** Invite codes are 4 groups of 4 (convex/lib/tokens.ts newInviteCode); accept any case and spacing. */
const CODE = /^[A-Za-z0-9]{4}(-?[A-Za-z0-9]{4}){3}$/;

const normalise = (code: string) => {
  const flat = code.replace(/[\s-]/g, '').toUpperCase();
  return flat.match(/.{1,4}/g)!.join('-');
};

/**
 * Where a pasted invite goes. A full link says its own kind (/join/… is a study session,
 * /play/join/… a playground); a bare code goes to `kind`. Null when it is neither.
 */
export function inviteTarget(input: string, kind: 'session' | 'playground'): string | null {
  const text = input.trim();
  const link = text.match(/\/(play\/)?join\/([A-Za-z0-9-]+)\/?(?:[?#].*)?$/);
  if (link) {
    const code = link[2];
    return CODE.test(code) ? `${link[1] ? '/play' : ''}/join/${normalise(code)}` : null;
  }
  const bare = text.replace(/\s/g, '');
  return CODE.test(bare) ? `${kind === 'playground' ? '/play' : ''}/join/${normalise(bare)}` : null;
}
