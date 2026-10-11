/* JIZURA の つなぎ（動画工房の S・toast の かわり）。 */
import { S as AS } from '../state.js?v=367';
export const S = {
  get W(){ return (AS.proj && AS.proj.w) || 1080; },
  get H(){ return (AS.proj && AS.proj.h) || 1920; },
  get fps(){ return (AS.proj && AS.proj.fps) || 30; }
};
let note = () => {};
export const setJzToast = (fn) => { note = fn; };
export const toast = (m) => note(m);
