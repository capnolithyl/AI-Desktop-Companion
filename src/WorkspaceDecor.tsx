/** Local, alpha-channel UI illustrations; CSS frames them at their intended display sizes. */
const assetRoot=import.meta.env.BASE_URL+"mikan-ui/";
export function WorkspaceBrandArtwork(){
  return <img className="workspace-brand-art" src={assetRoot+"logo/mikan-badge.png"} alt="Mikan — Your Anime Catgirl Companion" draggable={false}/>;
}
export function WorkspaceHeaderFlourish(){
  return <img className="workspace-header-flourish" src={assetRoot+"decor/header-flourish.png"} alt="" aria-hidden="true" draggable={false}/>;
}
export function WorkspacePeekCat(){
  return <img className="workspace-peek-cat" src={assetRoot+"decor/peek-cat.png"} alt="" aria-hidden="true" draggable={false}/>;
}
export function WorkspacePawSeal(){
  return <img className="workspace-paw-seal" src={assetRoot+"icons/paw-badge.png"} alt="" aria-hidden="true" draggable={false}/>;
}
export function WorkspaceAvatarRays(){
  return <img className="workspace-avatar-rays" src={assetRoot+"icons/accent-rays.png"} alt="" aria-hidden="true" draggable={false}/>;
}
export function WorkspaceSendPaw(){
  return <img className="workspace-send-art" src={assetRoot+"icons/send-paw.png"} alt="" aria-hidden="true" draggable={false}/>;
}
