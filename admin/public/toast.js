let host, timer;
export function dismissToast() {
  clearTimeout(timer);
  if (host?.matches(':popover-open')) host.hidePopover();
  host?.remove(); host = null;
}
export function showToast(message, {error = false, progress = false} = {}) {
  dismissToast();
  if (!message) return;
  const parent = [...document.querySelectorAll('dialog[open]')].at(-1) || document.body;
  host = document.createElement('aside');
  host.className = 'studio-toast'; host.dataset.kind = error ? 'error' : progress ? 'progress' : 'success';
  host.setAttribute('popover','manual');
  host.setAttribute('role',error ? 'alert' : 'status'); host.setAttribute('aria-live',error ? 'assertive' : 'polite'); host.setAttribute('aria-atomic','true');
  const icon=document.createElement('span'); icon.className='toast-icon'; icon.setAttribute('aria-hidden','true');icon.textContent=error ? '!' : progress ? '…' : '✓';
  const content=document.createElement('div');
  const label=document.createElement('strong');label.textContent=error ? 'Не удалось выполнить действие' : progress ? 'Выполняется' : 'Готово';
  const text=document.createElement('p');text.textContent=message;content.append(label,text);
  const close=document.createElement('button');close.type='button';close.className='toast-close';close.setAttribute('aria-label','Закрыть уведомление');close.textContent='×';close.onclick=dismissToast;
  host.append(icon,content,close);parent.append(host);
  if(host.showPopover)host.showPopover();else host.removeAttribute('popover');
  const schedule=()=>{clearTimeout(timer);if(!error && !progress)timer=setTimeout(dismissToast,6500);};
  host.onpointerenter=()=>clearTimeout(timer);host.onpointerleave=schedule;
  host.onfocusin=()=>clearTimeout(timer);host.onfocusout=schedule;
  schedule();
}
