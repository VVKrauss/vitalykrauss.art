import { authClient } from './auth-client.js';

const $ = selector => document.querySelector(selector);
let busy = false;
let signedIn = false;

function message(text = '', error = false) {
  const node = $('#message');
  node.textContent = text;
  node.hidden = !text;
  node.dataset.error = String(error);
}

function setSession(user) {
  signedIn = Boolean(user);
  $('#initial-state').hidden = true;
  $('#login').hidden = signedIn;
  $('#studio').hidden = !signedIn;
  $('#sign-out').hidden = !signedIn;
  $('#private-label').hidden = signedIn;
  $('#owner').textContent = user?.email || '';
  if (!user) {
    $('#passkeys').replaceChildren();
    $('#change-password-form').reset();
    $('#login-form').reset();
  }
}

async function protectedRequest(path) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store' });
  if (response.status === 401 || response.status === 403) {
    setSession(null);
    throw new Error('Время входа истекло. Войдите снова.');
  }
  if (!response.ok) throw new Error('Студия временно недоступна. Попробуйте ещё раз.');
  return response.json();
}

async function loadPasskeys() {
  const keys = await protectedRequest('/api/auth/passkey/list-user-passkeys');
  const list = $('#passkeys');
  list.replaceChildren();
  if (!keys.length) {
    const item = document.createElement('li');
    item.className = 'empty';
    item.textContent = 'Ключи доступа ещё не добавлены.';
    list.append(item);
  }
  for (const key of keys) {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = key.name || 'Ключ доступа';
    const remove = document.createElement('button');
    remove.className = 'text-button';
    remove.type = 'button';
    remove.textContent = 'Удалить';
    remove.setAttribute('aria-label', `Удалить ${key.name || 'ключ доступа'}`);
    remove.addEventListener('click', () => action(async () => {
      checkResult(await authClient.passkey.deletePasskey({ id: key.id }));
      await loadPasskeys();
      message('Ключ доступа удалён.');
    }));
    item.append(name, remove);
    list.append(item);
  }
}

async function refreshSession() {
  const response = await fetch('/api/studio/session', { credentials: 'same-origin', cache: 'no-store' });
  if (response.status === 401 || response.status === 403) { setSession(null); return; }
  if (!response.ok) throw new Error('Не удалось проверить вход. Обновите страницу.');
  const { user } = await response.json();
  setSession(user);
  await loadPasskeys();
}

function checkResult(result) {
  if (!result?.error) return;
  if (result.error.status === 429) throw new Error('Слишком много попыток. Подождите минуту и попробуйте снова.');
  if (result.error.status === 401) {
    if (signedIn) { setSession(null); throw new Error('Время входа истекло. Войдите снова.'); }
    throw new Error('Не удалось войти. Проверьте почту и пароль.');
  }
  if (result.error.status === 403) throw new Error('Действие недоступно. Выйдите и войдите снова.');
  throw new Error('Не удалось выполнить действие. Попробуйте снова.');
}

async function action(callback, pendingButton, pendingText) {
  if (busy) return;
  busy = true;
  message();
  const label = pendingButton?.textContent;
  document.querySelectorAll('button').forEach(node => { node.disabled = true; });
  if (pendingButton && pendingText) pendingButton.textContent = pendingText;
  try { await callback(); }
  catch (error) { message(error.message || 'Не удалось выполнить действие. Попробуйте снова.', true); }
  finally {
    document.querySelectorAll('button').forEach(node => { node.disabled = false; });
    if (pendingButton && label) pendingButton.textContent = label;
    busy = false;
  }
}

$('#login-form').addEventListener('submit', event => {
  event.preventDefault();
  action(async () => {
    checkResult(await authClient.signIn.email({ email: $('#email').value.trim(), password: $('#password').value, rememberMe: false }));
    $('#password').value = '';
    await refreshSession();
    if (signedIn) $('#studio-title').setAttribute('tabindex', '-1');
    if (signedIn) $('#studio-title').focus();
  }, $('#password-login'), 'Входим…');
});

$('#passkey-login').addEventListener('click', () => action(async () => {
  checkResult(await authClient.signIn.passkey());
  await refreshSession();
}, $('#passkey-login'), 'Ожидаем ключ…'));

$('#add-passkey').addEventListener('click', () => action(async () => {
  checkResult(await authClient.passkey.addPasskey({ name: `Ключ от ${new Intl.DateTimeFormat('ru').format(new Date())}` }));
  await loadPasskeys();
  message('Ключ доступа добавлен. Теперь можно входить с этого устройства.');
}, $('#add-passkey'), 'Ожидаем устройство…'));

$('#sign-out').addEventListener('click', () => action(async () => {
  checkResult(await authClient.signOut());
  setSession(null);
  $('#email').focus();
}, $('#sign-out'), 'Выходим…'));

$('#change-password-form').addEventListener('submit', event => {
  event.preventDefault();
  action(async () => {
    if ($('#new-password').value !== $('#repeat-password').value) throw new Error('Новые пароли не совпадают.');
    checkResult(await authClient.changePassword({
      currentPassword: $('#current-password').value,
      newPassword: $('#new-password').value,
      revokeOtherSessions: true,
    }));
    $('#change-password-form').reset();
    message('Пароль изменён. Вход на остальных устройствах завершён.');
  }, $('#change-password-form button'), 'Сохраняем…');
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && signedIn && !busy) action(refreshSession);
});

refreshSession().catch(error => {
  setSession(null);
  message(error.message, true);
});
