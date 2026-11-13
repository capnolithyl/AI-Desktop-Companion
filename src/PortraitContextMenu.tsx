import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Check, ChevronRight } from "lucide-react";
import { fitPortraitMenuPosition, type MenuPoint } from "./portrait-context-menu";

/** Append actions or nested groups in App.tsx without changing the menu renderer. */
export type PortraitMenuAction = {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  children?: PortraitMenuAction[];
};
export type PortraitMenuItem = PortraitMenuAction | { id: string; separator: true };

function isSeparator(item: PortraitMenuItem): item is { id: string; separator: true } {
  return "separator" in item && item.separator === true;
}

function MenuRow({ item, depth, expanded, toggle, select }: {
  item: PortraitMenuAction;
  depth: number;
  expanded: ReadonlySet<string>;
  toggle: (id: string) => void;
  select: (item: PortraitMenuAction) => void;
}) {
  const hasChildren = !!item.children?.length;
  const isExpanded = expanded.has(item.id);
  return <>
    <button type="button"
      role={item.selected === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={item.selected}
      aria-expanded={hasChildren ? isExpanded : undefined}
      className={"portrait-menu-action" + (item.selected ? " selected" : "")}
      style={{ paddingLeft: 12 + depth * 14 }}
      title={item.label} disabled={item.disabled}
      onClick={() => hasChildren ? toggle(item.id) : select(item)}>
      <span className="portrait-menu-icon" aria-hidden="true">{item.icon}</span>
      <span className="portrait-menu-label">{item.label}</span>
      {item.selected && <Check className="portrait-menu-check" size={15} aria-hidden="true"/>}
      {hasChildren && <ChevronRight className={isExpanded ? "portrait-menu-chevron expanded" : "portrait-menu-chevron"} size={15} aria-hidden="true"/>}
    </button>
    {hasChildren && isExpanded && <div role="group" aria-label={item.label} className="portrait-menu-submenu">
      {item.children!.map(child => <MenuRow key={child.id} item={child}
        depth={depth + 1} expanded={expanded} toggle={toggle} select={select}/>)}
    </div>}
  </>;
}

export function PortraitContextMenu({ position, items, onClose }: {
  position: MenuPoint;
  items: PortraitMenuItem[];
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [placed, setPlaced] = useState<MenuPoint>(position);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const bounds = menu.getBoundingClientRect();
    const next = fitPortraitMenuPosition(position,
      { width: window.innerWidth, height: window.innerHeight },
      { width: bounds.width, height: bounds.height });
    setPlaced(previous => previous.x === next.x && previous.y === next.y ? previous : next);
  }, [position, expandedIds]);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [position]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
    };
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const toggle = (id: string) => {
    setExpandedIds(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const select = (item: PortraitMenuAction) => {
    if (item.disabled) return;
    onClose();
    item.onSelect?.();
  };
  const moveFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])]
      .filter(button => button.getClientRects().length > 0);
    if (!buttons.length) return;
    event.preventDefault();
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
      : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return <div ref={menuRef} className="portrait-context-menu" role="menu"
    aria-label="Mikan quick actions" onKeyDown={moveFocus}
    onContextMenu={event => event.preventDefault()}
    style={{ left: placed.x, top: placed.y }}>
    <div className="portrait-menu-heading">MIKAN <span>QUICK ACTIONS</span></div>
    {items.map(item => isSeparator(item)
      ? <div key={item.id} role="separator" className="portrait-menu-separator"/>
      : <MenuRow key={item.id} item={item} depth={0}
          expanded={expandedIds} toggle={toggle} select={select}/>)}
  </div>;
}
