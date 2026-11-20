import assert from 'node:assert/strict';
import { signedVolumeOf, mirrorTris } from './tri';
import { extrudeTris, ngon, boxTris, footTris, handTris, earTris, eyeTris, noseTris, sleeveTris, twoBoneIK, bipedRest, loftTris, frameFrom } from './biped';
import { tubeTris } from './organic';

const closed: Record<string, number[]> = {
  extrudeX: extrudeTris(ngon(6, 0.3), [0, 0, 0], [1, 0, 0], 1, { taper: 0.5, bevel: 0.2 }),
  extrudeDown: extrudeTris(ngon(5, 0.3), [0, 1, 0], [0, -1, 0], 1),
  extrudeAny: extrudeTris(ngon(7, 0.3, 0.2), [1, 2, 3], [0.3, 0.5, -0.8], 2, { taper: [0.4, 0.8], bevel: 0.1 }),
  box: boxTris([0, 0, 0], [0, 0, 1], [0, 1, 0], [1, 2, 3]),
  foot: footTris([0, 0, 0], [0, 0, 1], 0.4, 0.2, 0.15),
  hand: handTris([0, 1, 0], [0.4, -1, 0], 0.2, 0.1, 0.05),
  eye: eyeTris([0, 0, 0], [0, 0, 1], 0.05),
  nose: noseTris([0, 0, 0], [0, 0, 1], 0.1, 0.06),
  earShell: earTris([0, 0, 0], [1, 0, 0], 0.3, 0.12).shell,
  earInner: earTris([0, 0, 0], [1, 0, 0], 0.3, 0.12).inner,
  sleeve: sleeveTris([[0, 2, 0], [0.3, 1.5, 0], [0.5, 1, 0.1]], (t) => 0.1 - 0.04 * t, 0.1, 0.7, 0.02, 8, (a) => 1 + 0.2 * Math.cos(a * 4)),
  ribbed: tubeTris([[0, 0, 0], [0, 1, 0], [0, 2, 0]], [0.2, 0.2, 0.2], 12, true, (a) => 1 + 0.15 * Math.cos(a * 6)),
};
for (const [k, t] of Object.entries(closed)) {
  const v = signedVolumeOf(t);
  assert.ok(v > 0, `${k} inside-out or open: ${v}`);
  assert.ok(Math.abs(signedVolumeOf(mirrorTris(t)) - v) < 1e-9, `${k} mirror`);
}
// analytic check: unit square prism 1x1x2 -> volume 2*... box 1x2x3 = 6
assert.ok(Math.abs(signedVolumeOf(closed.box) - 6) < 1e-9, 'box volume');
// frame is right-handed and orthonormal
for (const d of [[0, 0, 1], [0, 1, 0], [0, -1, 0], [1, 1, 1]] as const) {
  const f = frameFrom([...d] as any), c = [f.u[1] * f.v[2] - f.u[2] * f.v[1], f.u[2] * f.v[0] - f.u[0] * f.v[2], f.u[0] * f.v[1] - f.u[1] * f.v[0]];
  c.forEach((x, i) => assert.ok(Math.abs(x - f.d[i]) < 1e-9));
}
// IK keeps bone lengths
const root: [number, number, number] = [0, 1, 0], tgt: [number, number, number] = [0.2, 0.2, 0.4];
const knee = twoBoneIK(root, tgt, 0.5, 0.5, [0, 0, 1]);
const L = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
assert.ok(Math.abs(L(root, knee) - 0.5) < 1e-9 && Math.abs(L(knee, tgt) - 0.5) < 1e-9 && knee[2] > 0.1, 'ik');
const far = twoBoneIK(root, [0, -5, 0], 0.5, 0.5, [0, 0, 1]);
assert.ok(Math.abs(L(root, far) - 0.5) < 1e-6, 'ik clamp');
const rest = bipedRest({ height: 1.1, legRatio: 0.38, armRatio: 0.4, headRatio: 0.3, bulk: 1 });
assert.ok(rest.footL[1] === 0 && rest.head[1] > rest.neck[1] && rest.handL[0] > rest.shoulderL[0]);
assert.deepEqual(rest, bipedRest({ height: 1.1, legRatio: 0.38, armRatio: 0.4, headRatio: 0.3, bulk: 1 }));
console.log('ok', Object.keys(closed).length, 'closed kernels');

// shape param of tubeTris must change the geometry (v3 silently ignored it)
{
  const path: [number, number, number][] = [[0, 0, 0], [0, 1, 0], [0, 2, 0]];
  const plain = tubeTris(path, [0.2, 0.2, 0.2], 12, true);
  const ribbed = tubeTris(path, [0.2, 0.2, 0.2], 12, true, (a) => 1 + 0.15 * Math.cos(a * 6));
  assert(JSON.stringify(plain) !== JSON.stringify(ribbed), 'shape ignored');
  assert(signedVolumeOf(ribbed) > 0, 'ribbed tube inside-out');
}
console.log('shape OK');
