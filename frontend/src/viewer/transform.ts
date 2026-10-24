import { Matrix4 } from 'three';

export type Vec3 = [number, number, number];

// SPEC §5.2: p_scene = R_yup · T_center · p_ras ; R_yup = −90° about X: (x, y, z) → (x, z, −y)
export function rasToScene(p: Vec3, c: Vec3): Vec3 {
  const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
  return [x, z, -y];
}

export function sceneToRas(q: Vec3, c: Vec3): Vec3 {
  return [q[0] + c[0], -q[2] + c[1], q[1] + c[2]];
}

export function worldMatrix(c: Vec3): Matrix4 {
  return new Matrix4().makeRotationX(-Math.PI / 2).multiply(new Matrix4().makeTranslation(-c[0], -c[1], -c[2]));
}
