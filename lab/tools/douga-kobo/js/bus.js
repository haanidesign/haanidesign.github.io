/* 画面の 描き直しを 頼む ための 窓口。
   これを はさむ ことで モジュールが おたがいを 呼び合わずに すむ。 */
export const bus = {
  all(){}, tl(){}, stage(){}, panel(){}, beat(){}
};
export function wire(fns){ Object.assign(bus, fns); }
