export const AVATAR_BACKGROUNDS = [
  {id:"reading-nook",label:"Reading nook"},
  {id:"study-nook",label:"Study nook"},
  {id:"plain",label:"Plain"},
] as const;
export type AvatarBackground=typeof AVATAR_BACKGROUNDS[number]["id"];
export const AVATAR_BACKGROUND_KEY="mikan.workspace.avatarBackground";
export const AVATAR_BACKGROUND_EVENT="mikan://avatar-background-changed";
export function readAvatarBackground(value:unknown):AvatarBackground {
  return AVATAR_BACKGROUNDS.find(item=>item.id===value)?.id??"reading-nook";
}
export function loadAvatarBackground():AvatarBackground {
  try{return readAvatarBackground(window.localStorage.getItem(AVATAR_BACKGROUND_KEY));}
  catch{return "reading-nook";}
}
export function saveAvatarBackground(value:AvatarBackground) {
  try{window.localStorage.setItem(AVATAR_BACKGROUND_KEY,value);}catch{ /* Session-only fallback. */ }
}
