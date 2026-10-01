"use client";
import {useEffect,useRef,type ReactNode} from "react";
import { X, Inbox, ArrowUpRight } from "lucide-react";
import type { State } from "@/lib/types";
export type Run = (action: string, input: unknown) => Promise<unknown>;
export function time(value: string, zone: string, full = true) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    ...(full ? { day: "numeric", month: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}
export function Badge({ value }: { value: string }) {
  return (
    <span className={`badge ${value.toLowerCase()}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}
export function Empty({
  title = "Nothing here yet",
  detail = "Your activity will appear here as you use QueueFlow.",
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <div className="empty">
      <Inbox size={30} />
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}
export function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog=useRef<HTMLElement>(null);
  const closeRef=useRef(onClose);closeRef.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const root=dialog.current;
    root?.querySelector<HTMLElement>('button,input,select,a[href]')?.focus();
    function keys(event:KeyboardEvent){
      if(event.key==='Escape'){event.preventDefault();closeRef.current();}
      if(event.key==='Tab'&&root){const elements=Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href]'));const first=elements[0],last=elements.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
    }
    document.addEventListener('keydown',keys);const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    return()=>{document.removeEventListener('keydown',keys);document.body.style.overflow=overflow;previous?.focus();};
  },[]);
  return (
    <div className="modal-shade" onClick={onClose}>
      <section
        ref={dialog}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function Stat({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span>{label}</span>
        {icon ?? <ArrowUpRight size={17} />}
      </div>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
export function deptName(state: State, id: string) {
  return state.departments.find((d) => d.id === id)?.name ?? "Department";
}
export function serviceName(state: State, id: string) {
  return state.services.find((s) => s.id === id)?.name ?? "Service";
}
